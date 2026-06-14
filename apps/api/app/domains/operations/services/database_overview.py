from __future__ import annotations

from pathlib import Path
from typing import Optional

from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session
from sqlalchemy.sql.schema import Table

from apps.api.app.models.event import Base
from apps.api.app.schemas.operations import DatabaseOverviewOut


def _database_dialect(db: Session) -> str:
    return db.get_bind().dialect.name


def _database_name(db: Session, *, dialect: str) -> str:
    bind = db.get_bind()
    url = getattr(bind, "url", None)
    if url is None and hasattr(bind, "engine"):
        url = bind.engine.url
    database_name = getattr(url, "database", None)

    if dialect == "postgresql":
        current_database = db.execute(select(func.current_database())).scalar_one_or_none()
        if current_database:
            return str(current_database)

    if dialect == "sqlite":
        if database_name in (None, "", ":memory:"):
            return "in-memory"
        return Path(str(database_name)).name

    return str(database_name or dialect)


def _database_size_bytes(db: Session, *, dialect: str) -> Optional[int]:
    if dialect == "postgresql":
        size_bytes = db.execute(select(func.pg_database_size(func.current_database()))).scalar_one_or_none()
        return int(size_bytes) if size_bytes is not None else None

    if dialect == "sqlite":
        page_count = db.execute(text("PRAGMA page_count")).scalar_one()
        page_size = db.execute(text("PRAGMA page_size")).scalar_one()
        return int(page_count) * int(page_size)

    return None


def _existing_model_tables(db: Session) -> list[Table]:
    inspector = inspect(db.get_bind())
    return [
        table
        for table in Base.metadata.sorted_tables
        if inspector.has_table(table.name, schema=table.schema)
    ]


def _database_record_count(db: Session, *, tables: list[Table]) -> int:
    total = 0
    for table in tables:
        total += int(db.execute(select(func.count()).select_from(table)).scalar_one())
    return total


def build_database_overview(db: Session) -> DatabaseOverviewOut:
    dialect = _database_dialect(db)
    tables = _existing_model_tables(db)
    return DatabaseOverviewOut(
        dialect=dialect,
        name=_database_name(db, dialect=dialect),
        size_bytes=_database_size_bytes(db, dialect=dialect),
        table_count=len(tables),
        record_count=_database_record_count(db, tables=tables),
    )
