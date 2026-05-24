from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.documents.services.document_activity import append_document_activity_event
from apps.api.app.domains.documents.services.document_ingestion_common import clean_optional_text
from apps.api.app.domains.documents.services.document_record_links import create_document_record_link
from apps.api.app.domains.documents.services.document_ingestion_serialization import load_document_and_pages
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.schemas.document import DocumentWorkflowExecutionOut
from apps.api.app.schemas.document import DocumentWorkflowListOut
from apps.api.app.schemas.document import DocumentWorkflowOut
from apps.api.app.schemas.document import DocumentWorkflowPriceObservationOut


NO_WORKFLOWS_MESSAGE = "No workflows assigned to this document type."
PROCESS_PRICES_WORKFLOW_ID = "process_prices"
PRICE_PUBLICATION_KIND = "PRICE_PUBLICATION"
PRICE_PUBLICATION_TYPE_LABEL = "Price Publication Report"
WORKFLOW_SOURCE = "DOCUMENT_WORKFLOW"
PRICE_NUMBER_PATTERN = re.compile(r"[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?")


@dataclass(frozen=True)
class DocumentWorkflowDefinition:
    workflow_id: str
    label: str
    document_kind: str
    document_type_label: str
    description: str


@dataclass(frozen=True)
class _DocumentPriceRow:
    page_number: int
    row_number: int | None
    price_index_code: str
    observation_date: date
    value: Decimal
    currency_code: str | None
    unit_code: str | None
    source_provider: str | None
    source_series_id: str | None
    source_published_at: datetime | None
    source_revision: str | None
    raw_payload: dict[str, Any]


@dataclass(frozen=True)
class _PreparedPriceObservation:
    price_index_code: str
    observation_date: date
    value: Decimal
    unit_code: str
    currency_code: str | None
    source_provider: str
    source_series_id: str
    source_frequency: str
    source_published_at: datetime | None
    source_revision: str | None
    raw_payload: dict[str, Any]


WORKFLOW_DEFINITIONS: tuple[DocumentWorkflowDefinition, ...] = (
    DocumentWorkflowDefinition(
        workflow_id=PROCESS_PRICES_WORKFLOW_ID,
        label="Process Prices",
        document_kind=PRICE_PUBLICATION_KIND,
        document_type_label=PRICE_PUBLICATION_TYPE_LABEL,
        description="Load reviewed price lines from this document into the price-index observation table.",
    ),
)


def list_document_workflows(
    db: Session,
    *,
    document_id: str,
) -> DocumentWorkflowListOut:
    _document, pages = load_document_and_pages(db, document_id=document_id)
    document_kind = _resolved_document_kind(pages)
    workflows = [
        _to_workflow_out(definition)
        for definition in WORKFLOW_DEFINITIONS
        if definition.document_kind == document_kind
    ]
    return DocumentWorkflowListOut(
        document_id=document_id,
        document_kind=document_kind,
        document_type_label=_document_type_label(document_kind),
        workflows=workflows,
        empty_message=NO_WORKFLOWS_MESSAGE,
    )


def execute_document_workflow(
    db: Session,
    *,
    document_id: str,
    workflow_id: str,
    actor_id: str,
) -> DocumentWorkflowExecutionOut:
    document, pages = load_document_and_pages(db, document_id=document_id)
    document_kind = _resolved_document_kind(pages)
    definition = _workflow_definition(document_kind=document_kind, workflow_id=workflow_id)
    if definition is None:
        if any(item.workflow_id == workflow_id for item in WORKFLOW_DEFINITIONS):
            raise ValueError(NO_WORKFLOWS_MESSAGE)
        raise ValueError(f"Document workflow '{workflow_id}' is not supported.")

    if document.review_status != "VERIFIED":
        raise ValueError("Only verified documents can execute document workflows.")

    if definition.workflow_id == PROCESS_PRICES_WORKFLOW_ID:
        return _execute_process_prices(
            db,
            document=document,
            pages=pages,
            actor_id=actor_id,
            definition=definition,
        )

    raise ValueError(f"Document workflow '{workflow_id}' is not supported.")


def _execute_process_prices(
    db: Session,
    *,
    document: DocumentIngestion,
    pages: list[DocumentIngestionPage],
    actor_id: str,
    definition: DocumentWorkflowDefinition,
) -> DocumentWorkflowExecutionOut:
    price_rows = _extract_price_rows(pages)
    if not price_rows:
        raise ValueError("No price rows were found in this price publication document.")

    price_indices = _load_price_indices(db, price_rows)
    prepared_observations = _prepare_price_observations(price_rows, price_indices)
    now = datetime.now(timezone.utc)
    run = ExternalDataRun(
        provider="DOCUMENT",
        job_name="process_price_publication_document",
        status="RUNNING",
        started_at=now,
        finished_at=None,
        requested_by=actor_id,
        series_count=len({item.price_index_code for item in prepared_observations}),
        observation_count=0,
        error_summary=None,
        created_at=now,
    )
    db.add(run)
    db.flush()

    observations_out: list[DocumentWorkflowPriceObservationOut] = []
    created_count = 0
    updated_count = 0
    unchanged_count = 0
    linked_price_index_codes: set[str] = set()

    for item in prepared_observations:
        observation, action = _upsert_price_observation(db, item=item, run_id=run.id, now=now)
        db.flush()
        if action == "CREATED":
            created_count += 1
        elif action == "UPDATED":
            updated_count += 1
        else:
            unchanged_count += 1

        if observation.id is not None:
            create_document_record_link(
                db,
                document_id=document.document_id,
                record_type="PRICE_INDEX_OBSERVATION",
                record_id=str(observation.id),
                actor_id=actor_id,
                source=WORKFLOW_SOURCE,
            )
        if item.price_index_code not in linked_price_index_codes:
            create_document_record_link(
                db,
                document_id=document.document_id,
                record_type="PRICE_INDEX",
                record_id=item.price_index_code,
                actor_id=actor_id,
                role="SECONDARY",
                source=WORKFLOW_SOURCE,
            )
            linked_price_index_codes.add(item.price_index_code)

        observations_out.append(
            DocumentWorkflowPriceObservationOut(
                price_index_code=observation.price_index_code,
                observation_date=observation.observation_date,
                value=float(observation.value),
                unit_code=observation.unit_code,
                currency_code=observation.currency_code,
                source_provider=observation.source_provider,
                source_series_id=observation.source_series_id,
                action=action,
                observation_id=observation.id,
            )
        )

    run.status = "SUCCEEDED"
    run.finished_at = now
    run.series_count = len(linked_price_index_codes)
    run.observation_count = len(prepared_observations)
    document.updated_at = now
    document.updated_by = actor_id
    document.version += 1
    append_document_activity_event(
        db,
        document_id=document.document_id,
        actor_id=actor_id,
        event_type="DocumentWorkflowExecuted",
        occurred_at=now,
        payload={
            "workflow_id": definition.workflow_id,
            "label": definition.label,
            "run_id": run.id,
            "observation_count": len(prepared_observations),
            "created_count": created_count,
            "updated_count": updated_count,
            "unchanged_count": unchanged_count,
            "price_index_codes": sorted(linked_price_index_codes),
        },
    )
    db.flush()

    written_count = created_count + updated_count
    message = (
        f"Processed {len(prepared_observations)} price observation"
        f"{'' if len(prepared_observations) == 1 else 's'} from this document."
    )
    if written_count:
        message += f" Added or updated {written_count} price row{'' if written_count == 1 else 's'}."
    if unchanged_count:
        message += f" {unchanged_count} existing row{'' if unchanged_count == 1 else 's'} already matched."

    return DocumentWorkflowExecutionOut(
        document_id=document.document_id,
        workflow_id=definition.workflow_id,
        label=definition.label,
        message=message,
        run_id=run.id,
        observation_count=len(prepared_observations),
        created_count=created_count,
        updated_count=updated_count,
        unchanged_count=unchanged_count,
        price_index_codes=sorted(linked_price_index_codes),
        observations=observations_out,
    )


def _extract_price_rows(pages: list[DocumentIngestionPage]) -> list[_DocumentPriceRow]:
    rows: list[_DocumentPriceRow] = []
    errors: list[str] = []
    for page in sorted(pages, key=lambda item: item.page_number):
        if page.document_kind != PRICE_PUBLICATION_KIND:
            continue
        defaults = _field_map(page.header_fields or [])
        table_rows = _price_table_rows(page.table_blocks or [])
        if table_rows:
            for row_number, row in table_rows:
                candidate = _build_price_row(
                    page_number=page.page_number,
                    row_number=row_number,
                    row=row,
                    defaults=defaults,
                    errors=errors,
                )
                if candidate is not None:
                    rows.append(candidate)
            continue

        candidate = _build_price_row(
            page_number=page.page_number,
            row_number=None,
            row={},
            defaults=defaults,
            errors=errors,
        )
        if candidate is not None:
            rows.append(candidate)

    if errors:
        raise ValueError("Cannot process prices from this document: " + "; ".join(errors))
    return rows


def _build_price_row(
    *,
    page_number: int,
    row_number: int | None,
    row: dict[str, object],
    defaults: dict[str, str],
    errors: list[str],
) -> _DocumentPriceRow | None:
    location = f"page {page_number}" + (f" row {row_number}" if row_number is not None else "")
    raw_price = _first_value(row, defaults, "price", "published_price", "value")
    if not raw_price:
        if row:
            errors.append(f"{location} is missing price")
        return None

    price_index_code = _normalize_code(_first_value(row, defaults, "price_index_code"))
    observation_date = _parse_date(_first_value(row, defaults, "observation_date", "publication_date"))
    value = _parse_decimal(raw_price)
    currency_code = _normalize_code(_first_value(row, defaults, "currency")) or _infer_currency(raw_price)
    unit_code = _normalize_code(_first_value(row, defaults, "unit"))
    source_provider = _normalize_code(_first_value(row, defaults, "source_provider", "publisher"))
    source_series_id = clean_optional_text(_first_value(row, defaults, "source_series_id", "series_id"))
    publication_date = _parse_date(_first_value(row, defaults, "publication_date"))
    publication_reference = clean_optional_text(_first_value(row, defaults, "publication_reference"))

    if not price_index_code:
        errors.append(f"{location} is missing price index code")
    if observation_date is None:
        errors.append(f"{location} is missing observation date")
    if value is None:
        errors.append(f"{location} has an invalid price value")
    if not price_index_code or observation_date is None or value is None:
        return None

    raw_payload = {
        "source": "document_workflow:process_prices",
        "page_number": page_number,
        "row_number": row_number,
        "price_index_code": price_index_code,
        "observation_date": observation_date.isoformat(),
        "price": str(value),
        "publication_date": publication_date.isoformat() if publication_date else None,
        "publication_reference": publication_reference,
        "document_fields": {**defaults, **{key: str(value) for key, value in row.items() if value is not None}},
    }
    return _DocumentPriceRow(
        page_number=page_number,
        row_number=row_number,
        price_index_code=price_index_code,
        observation_date=observation_date,
        value=value,
        currency_code=currency_code,
        unit_code=unit_code,
        source_provider=source_provider,
        source_series_id=source_series_id,
        source_published_at=_date_to_datetime(publication_date),
        source_revision=publication_reference,
        raw_payload=raw_payload,
    )


def _price_table_rows(table_blocks: list[dict[str, object]]) -> list[tuple[int, dict[str, object]]]:
    rows: list[tuple[int, dict[str, object]]] = []
    for block in table_blocks:
        template_key = clean_optional_text(block.get("template_key"), lowercase=True)
        columns = {_normalize_key(str(column)) for column in block.get("columns") or []}
        if template_key != "price_lines" and not {"price_index_code", "price"}.issubset(columns):
            continue
        for row_index, raw_row in enumerate(block.get("rows") or [], start=1):
            if not isinstance(raw_row, dict):
                continue
            normalized_row = {
                _normalize_key(str(key)): value
                for key, value in raw_row.items()
                if _normalize_key(str(key)) and clean_optional_text(value) is not None
            }
            if normalized_row:
                rows.append((row_index, normalized_row))
    return rows


def _load_price_indices(
    db: Session,
    rows: list[_DocumentPriceRow],
) -> dict[str, ReferencePriceIndex]:
    requested_codes = sorted({row.price_index_code for row in rows})
    records = db.execute(
        select(ReferencePriceIndex).where(ReferencePriceIndex.code.in_(requested_codes))
    ).scalars().all()
    records_by_code = {record.code: record for record in records}
    missing_codes = [code for code in requested_codes if code not in records_by_code]
    if missing_codes:
        raise ValueError(
            "Cannot process prices because these price index codes are not configured: "
            + ", ".join(missing_codes)
        )

    inactive_codes = sorted(code for code, record in records_by_code.items() if not record.is_active)
    if inactive_codes:
        raise ValueError(
            "Cannot process prices because these price index codes are inactive: "
            + ", ".join(inactive_codes)
        )
    return records_by_code


def _prepare_price_observations(
    rows: list[_DocumentPriceRow],
    price_indices: dict[str, ReferencePriceIndex],
) -> list[_PreparedPriceObservation]:
    prepared: list[_PreparedPriceObservation] = []
    seen_keys: set[tuple[str, date, str, str]] = set()
    for row in rows:
        price_index = price_indices[row.price_index_code]
        source_provider = row.source_provider or _normalize_code(price_index.provider) or "DOCUMENT"
        source_series_id = row.source_series_id or price_index.code
        key = (row.price_index_code, row.observation_date, source_provider, source_series_id)
        if key in seen_keys:
            raise ValueError(
                "Cannot process prices because the document contains duplicate price rows for "
                f"{row.price_index_code} on {row.observation_date.isoformat()}."
            )
        seen_keys.add(key)
        prepared.append(
            _PreparedPriceObservation(
                price_index_code=row.price_index_code,
                observation_date=row.observation_date,
                value=row.value,
                unit_code=row.unit_code or price_index.unit_code,
                currency_code=row.currency_code or price_index.currency_code,
                source_provider=source_provider,
                source_series_id=source_series_id,
                source_frequency="DAILY",
                source_published_at=row.source_published_at,
                source_revision=row.source_revision,
                raw_payload={
                    **row.raw_payload,
                    "reference_price_index": {
                        "code": price_index.code,
                        "provider": price_index.provider,
                        "unit_code": price_index.unit_code,
                        "currency_code": price_index.currency_code,
                    },
                },
            )
        )
    return prepared


def _upsert_price_observation(
    db: Session,
    *,
    item: _PreparedPriceObservation,
    run_id: int,
    now: datetime,
) -> tuple[PriceIndexObservation, str]:
    existing = db.execute(
        select(PriceIndexObservation).where(
            PriceIndexObservation.price_index_code == item.price_index_code,
            PriceIndexObservation.observation_date == item.observation_date,
            PriceIndexObservation.source_provider == item.source_provider,
            PriceIndexObservation.source_series_id == item.source_series_id,
        )
    ).scalars().first()

    if existing is None:
        observation = PriceIndexObservation(
            price_index_code=item.price_index_code,
            observation_date=item.observation_date,
            value=item.value,
            unit_code=item.unit_code,
            currency_code=item.currency_code,
            source_provider=item.source_provider,
            source_series_id=item.source_series_id,
            source_frequency=item.source_frequency,
            source_published_at=item.source_published_at,
            source_revision=item.source_revision,
            downloaded_at=now,
            run_id=run_id,
            raw_payload=item.raw_payload,
            created_at=now,
            updated_at=now,
        )
        db.add(observation)
        return observation, "CREATED"

    if not _price_observation_changed(existing, item):
        return existing, "UNCHANGED"

    existing.value = item.value
    existing.unit_code = item.unit_code
    existing.currency_code = item.currency_code
    existing.source_frequency = item.source_frequency
    existing.source_published_at = item.source_published_at
    existing.source_revision = item.source_revision
    existing.downloaded_at = now
    existing.run_id = run_id
    existing.raw_payload = item.raw_payload
    existing.updated_at = now
    return existing, "UPDATED"


def _price_observation_changed(
    existing: PriceIndexObservation,
    item: _PreparedPriceObservation,
) -> bool:
    return any(
        (
            existing.value != item.value,
            existing.unit_code != item.unit_code,
            existing.currency_code != item.currency_code,
            existing.source_frequency != item.source_frequency,
            not _datetimes_match(existing.source_published_at, item.source_published_at),
            existing.source_revision != item.source_revision,
            existing.raw_payload != item.raw_payload,
        )
    )


def _workflow_definition(
    *,
    document_kind: str | None,
    workflow_id: str,
) -> DocumentWorkflowDefinition | None:
    normalized_workflow_id = str(workflow_id or "").strip().lower()
    for definition in WORKFLOW_DEFINITIONS:
        if definition.workflow_id == normalized_workflow_id and definition.document_kind == document_kind:
            return definition
    return None


def _to_workflow_out(definition: DocumentWorkflowDefinition) -> DocumentWorkflowOut:
    return DocumentWorkflowOut(
        workflow_id=definition.workflow_id,
        label=definition.label,
        document_kind=definition.document_kind,
        document_type_label=definition.document_type_label,
        description=definition.description,
    )


def _resolved_document_kind(pages: list[DocumentIngestionPage]) -> str | None:
    kinds = sorted(
        {
            str(page.document_kind).strip().upper()
            for page in pages
            if str(page.document_kind or "").strip().upper() not in {"", "UNKNOWN", "OTHER"}
        }
    )
    if len(kinds) == 1:
        return kinds[0]
    if len(kinds) > 1:
        return "MIXED"
    return None


def _document_type_label(document_kind: str | None) -> str | None:
    if document_kind == PRICE_PUBLICATION_KIND:
        return PRICE_PUBLICATION_TYPE_LABEL
    if not document_kind:
        return None
    return document_kind.replace("_", " ").title()


def _field_map(header_fields: list[dict[str, object]]) -> dict[str, str]:
    field_map: dict[str, str] = {}
    for field in header_fields:
        key = _normalize_key(str(field.get("field_key") or ""))
        value = clean_optional_text(field.get("value"))
        if key and value and key not in field_map:
            field_map[key] = value
    return field_map


def _first_value(
    row: dict[str, object],
    defaults: dict[str, str],
    *keys: str,
) -> str | None:
    for key in keys:
        normalized_key = _normalize_key(key)
        value = clean_optional_text(row.get(normalized_key))
        if value is not None:
            return value
    for key in keys:
        normalized_key = _normalize_key(key)
        value = clean_optional_text(defaults.get(normalized_key))
        if value is not None:
            return value
    return None


def _normalize_key(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9_]+", "_", value.strip().lower()).strip("_")
    if not normalized:
        return ""
    if not normalized[0].isalpha():
        normalized = f"field_{normalized}"
    return normalized[:64]


def _normalize_code(value: object | None) -> str | None:
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    return re.sub(r"\s+", "_", cleaned.strip().upper())


def _parse_date(value: object | None) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    candidate = cleaned.split("T", 1)[0].strip()
    for pattern in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d", "%m-%d-%Y"):
        try:
            return datetime.strptime(candidate, pattern).date()
        except ValueError:
            continue
    return None


def _parse_decimal(value: object | None) -> Decimal | None:
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    match = PRICE_NUMBER_PATTERN.search(cleaned)
    if match is None:
        return None
    try:
        return Decimal(match.group(0).replace(",", ""))
    except InvalidOperation:
        return None


def _infer_currency(value: object | None) -> str | None:
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    match = re.search(r"\b[A-Z]{3}\b", cleaned.upper())
    return match.group(0) if match else None


def _date_to_datetime(value: date | None) -> datetime | None:
    if value is None:
        return None
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _datetimes_match(left: datetime | None, right: datetime | None) -> bool:
    if left is None or right is None:
        return left is right
    return _normalize_datetime(left) == _normalize_datetime(right)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
