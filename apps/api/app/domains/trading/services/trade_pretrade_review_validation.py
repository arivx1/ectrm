from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from apps.api.app.domains.reports.services.pretrade_review_drift import (
    ensure_pretrade_review_booking_alignment,
)
from apps.api.app.domains.reports.services.pretrade_reviews import parse_pretrade_review_id


def parse_booking_pretrade_review_id(value: object) -> str | None:
    try:
        return parse_pretrade_review_id(value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


def ensure_booking_pretrade_review_alignment(
    db: Session,
    *,
    pretrade_review_id: str | None,
    actor_id: str,
    checked_at: datetime,
) -> None:
    if pretrade_review_id is None:
        return
    try:
        ensure_pretrade_review_booking_alignment(
            db,
            review_id=pretrade_review_id,
            actor_id=actor_id,
            checked_at=checked_at,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
