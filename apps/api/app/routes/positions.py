from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.models.position import Position
from apps.api.app.schemas.position import PositionOut

router = APIRouter(prefix="/positions", tags=["positions"])


@router.get("", response_model=List[PositionOut])
def list_positions(db: Session = Depends(get_db)) -> List[PositionOut]:
    rows = db.execute(
        select(Position).order_by(Position.commodity.asc())
    ).scalars().all()

    return [
        PositionOut(
            commodity=r.commodity,
            net_volume=float(r.net_volume),
            updated_at=r.updated_at,
        )
        for r in rows
    ]
