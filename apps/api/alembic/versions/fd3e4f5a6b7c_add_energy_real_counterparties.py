"""add energy real counterparties

Revision ID: fd3e4f5a6b7c
Revises: fc2d3e4f5a6b
"""

from __future__ import annotations

import json
from pathlib import Path

from alembic import op

revision = "fd3e4f5a6b7c"
down_revision = "fc2d3e4f5a6b"
branch_labels = None
depends_on = None

ENERGY_REAL_COUNTERPARTY_ROW_COUNT = 500
ENERGY_REAL_COUNTERPARTY_DATA_PATH = (
    Path(__file__).resolve().parents[2]
    / "app"
    / "domains"
    / "reference_data"
    / "services"
    / "data"
    / "energy_real_counterparties.json"
)


def _load_counterparty_rows():
    with ENERGY_REAL_COUNTERPARTY_DATA_PATH.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)

    if len(rows) != ENERGY_REAL_COUNTERPARTY_ROW_COUNT:
        raise RuntimeError(
            "Energy real counterparty migration count drifted unexpectedly: "
            f"expected {ENERGY_REAL_COUNTERPARTY_ROW_COUNT}, got {len(rows)}"
        )

    return rows


ENERGY_REAL_COUNTERPARTY_ROWS = _load_counterparty_rows()


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
    for row in ENERGY_REAL_COUNTERPARTY_ROWS:
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
    for row in reversed(ENERGY_REAL_COUNTERPARTY_ROWS):
        op.execute(
            f"""
            DELETE FROM reference_counterparties
            WHERE code = {_sql_literal(row["code"])}
            """
        )
