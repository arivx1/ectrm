"""add real counterparty catalog

Revision ID: fb1c2d3e4f5a
Revises: fa0b1c2d3e4f
"""

from __future__ import annotations

import json
from pathlib import Path

from alembic import op

revision = "fb1c2d3e4f5a"
down_revision = "fa0b1c2d3e4f"
branch_labels = None
depends_on = None

REAL_COUNTERPARTY_ROW_COUNT = 500
REAL_COUNTERPARTY_DATA_PATH = (
    Path(__file__).resolve().parents[2]
    / "app"
    / "domains"
    / "reference_data"
    / "services"
    / "data"
    / "real_counterparties.json"
)


def _load_real_counterparty_rows():
    with REAL_COUNTERPARTY_DATA_PATH.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)

    if len(rows) != REAL_COUNTERPARTY_ROW_COUNT:
        raise RuntimeError(
            "Real counterparty migration count drifted unexpectedly: "
            f"expected {REAL_COUNTERPARTY_ROW_COUNT}, got {len(rows)}"
        )

    return rows


REAL_COUNTERPARTY_ROWS = _load_real_counterparty_rows()


def _sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def upgrade() -> None:
    for row in REAL_COUNTERPARTY_ROWS:
        op.execute(
            f"""
            INSERT INTO reference_counterparties (
                code,
                name,
                short_name,
                legal_entity_name,
                counterparty_type,
                country_code,
                description,
                is_active,
                effective_from,
                effective_to,
                created_at,
                created_by,
                updated_at,
                updated_by,
                version
            )
            VALUES (
                {_sql_literal(row["code"])},
                {_sql_literal(row["name"])},
                {_sql_literal(row["short_name"])},
                {_sql_literal(row["legal_entity_name"])},
                {_sql_literal(row["counterparty_type"])},
                {_sql_literal(row["country_code"])},
                {_sql_literal(row["description"])},
                TRUE,
                NULL,
                NULL,
                NOW(),
                'system',
                NOW(),
                'system',
                1
            )
            ON CONFLICT (code) DO UPDATE
            SET
                name = EXCLUDED.name,
                short_name = EXCLUDED.short_name,
                legal_entity_name = EXCLUDED.legal_entity_name,
                counterparty_type = EXCLUDED.counterparty_type,
                country_code = EXCLUDED.country_code,
                description = EXCLUDED.description,
                is_active = TRUE,
                effective_from = NULL,
                effective_to = NULL,
                updated_at = NOW(),
                updated_by = 'system',
                version = reference_counterparties.version + 1
            """
        )


def downgrade() -> None:
    for row in reversed(REAL_COUNTERPARTY_ROWS):
        op.execute(
            f"""
            DELETE FROM reference_counterparties
            WHERE code = {_sql_literal(row["code"])}
            """
        )
