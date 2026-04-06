from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    create_run,
    mark_run_failed,
)
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_counterparty_external_credit_snapshot import (
    ReferenceCounterpartyExternalCreditSnapshot,
)
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.schemas.external_data import CounterpartyCreditSnapshotImport


class CounterpartyCreditImportError(RuntimeError):
    pass


def import_counterparty_credit_snapshots(
    db: Session,
    *,
    provider: str,
    snapshots: list[CounterpartyCreditSnapshotImport],
    requested_by: Optional[str] = None,
) -> ExternalDataRun:
    normalized_provider = provider.strip().upper()
    run = create_run(
        db,
        provider=normalized_provider,
        job_name="import_counterparty_credit_snapshots",
        requested_by=requested_by,
    )

    try:
        distinct_counterparty_codes = {
            normalize_code(snapshot.counterparty_code)
            for snapshot in snapshots
        }
        run.series_count = len(distinct_counterparty_codes)
        db.commit()

        written = 0
        for snapshot in snapshots:
            written += _upsert_snapshot(
                db,
                run_id=run.id,
                provider=normalized_provider,
                snapshot=snapshot,
            )

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise CounterpartyCreditImportError("Counterparty credit import run disappeared before completion")

        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = written
        db.commit()
        db.refresh(run)
        return run
    except CounterpartyCreditImportError as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)


def _upsert_snapshot(
    db: Session,
    *,
    run_id: int,
    provider: str,
    snapshot: CounterpartyCreditSnapshotImport,
) -> int:
    normalized_counterparty_code = normalize_code(snapshot.counterparty_code)
    counterparty = db.execute(
        select(ReferenceCounterparty).where(ReferenceCounterparty.code == normalized_counterparty_code)
    ).scalars().first()
    if counterparty is None:
        raise CounterpartyCreditImportError(
            f"Counterparty '{normalized_counterparty_code}' does not exist in reference data"
        )

    recommended_limit_currency_code = _normalize_optional_code(snapshot.recommended_limit_currency_code)
    if (recommended_limit_currency_code is None) != (snapshot.recommended_limit_amount is None):
        raise CounterpartyCreditImportError(
            "recommended_limit_currency_code and recommended_limit_amount must be provided together"
        )

    if recommended_limit_currency_code is not None:
        currency = db.execute(
            select(ReferenceCurrency).where(
                ReferenceCurrency.code == recommended_limit_currency_code,
                ReferenceCurrency.is_active.is_(True),
            )
        ).scalars().first()
        if currency is None:
            raise CounterpartyCreditImportError(
                f"Recommended limit currency '{recommended_limit_currency_code}' must be an active currency"
            )

    downloaded_at = _coerce_downloaded_at(snapshot.downloaded_at)
    payload = snapshot.model_dump(mode="json", exclude_none=True)
    if "counterparty_code" in payload:
        payload["counterparty_code"] = normalized_counterparty_code
    if recommended_limit_currency_code is not None:
        payload["recommended_limit_currency_code"] = recommended_limit_currency_code

    existing = db.execute(
        select(ReferenceCounterpartyExternalCreditSnapshot).where(
            ReferenceCounterpartyExternalCreditSnapshot.counterparty_code == normalized_counterparty_code,
            ReferenceCounterpartyExternalCreditSnapshot.provider == provider,
            ReferenceCounterpartyExternalCreditSnapshot.as_of_date == snapshot.as_of_date,
        )
    ).scalars().first()

    if existing is None:
        db.add(
            ReferenceCounterpartyExternalCreditSnapshot(
                counterparty_code=normalized_counterparty_code,
                provider=provider,
                source_entity_id=_clean_optional_text(snapshot.source_entity_id),
                source_entity_name=_clean_optional_text(snapshot.source_entity_name),
                match_basis=_normalize_optional_code(snapshot.match_basis),
                matched_identifier_value=_clean_optional_text(snapshot.matched_identifier_value),
                as_of_date=snapshot.as_of_date,
                rating_scale=_clean_optional_text(snapshot.rating_scale),
                rating_value=_clean_optional_text(snapshot.rating_value),
                rating_outlook=_clean_optional_text(snapshot.rating_outlook),
                credit_score=snapshot.credit_score,
                probability_of_default=snapshot.probability_of_default,
                recommended_limit_currency_code=recommended_limit_currency_code,
                recommended_limit_amount=snapshot.recommended_limit_amount,
                commentary=_clean_optional_text(snapshot.commentary),
                downloaded_at=downloaded_at,
                run_id=run_id,
                raw_payload=snapshot.raw_payload or payload,
                created_at=downloaded_at,
                updated_at=downloaded_at,
                version=1,
            )
        )
        return 1

    existing.source_entity_id = _clean_optional_text(snapshot.source_entity_id)
    existing.source_entity_name = _clean_optional_text(snapshot.source_entity_name)
    existing.match_basis = _normalize_optional_code(snapshot.match_basis)
    existing.matched_identifier_value = _clean_optional_text(snapshot.matched_identifier_value)
    existing.rating_scale = _clean_optional_text(snapshot.rating_scale)
    existing.rating_value = _clean_optional_text(snapshot.rating_value)
    existing.rating_outlook = _clean_optional_text(snapshot.rating_outlook)
    existing.credit_score = snapshot.credit_score
    existing.probability_of_default = snapshot.probability_of_default
    existing.recommended_limit_currency_code = recommended_limit_currency_code
    existing.recommended_limit_amount = snapshot.recommended_limit_amount
    existing.commentary = _clean_optional_text(snapshot.commentary)
    existing.downloaded_at = downloaded_at
    existing.run_id = run_id
    existing.raw_payload = snapshot.raw_payload or payload
    existing.updated_at = downloaded_at
    existing.version += 1
    return 1


def _clean_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _normalize_optional_code(value: Optional[str]) -> Optional[str]:
    cleaned = _clean_optional_text(value)
    return normalize_code(cleaned) if cleaned is not None else None


def _coerce_downloaded_at(value: Optional[datetime]) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
