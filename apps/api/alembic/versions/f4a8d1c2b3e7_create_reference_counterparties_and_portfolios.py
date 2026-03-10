"""create reference counterparties and portfolios

Revision ID: f4a8d1c2b3e7
Revises: 6f3a2b1c9d4e
"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "f4a8d1c2b3e7"
down_revision = "6f3a2b1c9d4e"
branch_labels = None
depends_on = None


def utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


PORTFOLIO_ROWS = [
    {
        "code": "REFINERY_FEEDSTOCK",
        "name": "Refinery Feedstock",
        "book_code": "CRUDE_PHYS",
        "owner": "Refinery Supply Desk",
        "strategy": "Physical feedstock coverage",
        "trader_persona": "Feedstock Procurer",
        "risk_archetype": "CONSUMPTION_HEDGE",
        "description": "Asset-backed crude procurement persona aligned to seeded refinery intake barrels such as TRD-10001.",
    },
    {
        "code": "GAS_HEDGE",
        "name": "Gas Hedge",
        "book_code": "GAS_OPT",
        "owner": "Gas Supply and Origination",
        "strategy": "Indexed supply hedge",
        "trader_persona": "Hedger",
        "risk_archetype": "DEFENSIVE_HEDGE",
        "description": "Protective natural gas hedge persona tied to the seeded indexed supply transaction TRD-10002.",
    },
    {
        "code": "RISK_OVERLAY",
        "name": "Risk Overlay",
        "book_code": "GAS_OPT",
        "owner": "Enterprise Risk Control",
        "strategy": "Exposure reduction overlay",
        "trader_persona": "Risk Manager",
        "risk_archetype": "RISK_REDUCTION",
        "description": "Central risk oversight persona used to monitor and offset concentrated supply exposure in seeded gas positions.",
    },
    {
        "code": "PRODUCTS_SPREAD_ARB",
        "name": "Products Spread Arbitrage",
        "book_code": "PRODUCTS_ARB",
        "owner": "Refined Products Desk",
        "strategy": "Location and crack spread capture",
        "trader_persona": "Arbitrager",
        "risk_archetype": "RELATIVE_VALUE",
        "description": "Spread trader persona mapped to the seeded diesel versus gasoline swap TRD-10003.",
    },
    {
        "code": "PROMPT_CRUDE_SPEC",
        "name": "Prompt Crude Spec",
        "book_code": "CRUDE_PHYS",
        "owner": "Discretionary Oil Trader",
        "strategy": "Prompt directional risk",
        "trader_persona": "Speculator",
        "risk_archetype": "DIRECTIONAL",
        "description": "Directional crude risk-taking persona attached to the same seeded crude flow environment as TRD-10001.",
    },
    {
        "code": "REFINERY_PRODUCT_MARKETING",
        "name": "Refinery Product Marketing",
        "book_code": "PRODUCTS_ARB",
        "owner": "Refinery Marketing Desk",
        "strategy": "Asset-backed product sales",
        "trader_persona": "Product Marketer",
        "risk_archetype": "ASSET_BACKED_SALES",
        "description": "Product marketing persona aligned to seeded refinery-style jet fuel sales activity such as TRD-10004.",
    },
]


def upgrade() -> None:
    op.create_table(
        "reference_counterparties",
        sa.Column("code", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("short_name", sa.String(length=80), nullable=True),
        sa.Column("legal_entity_name", sa.String(length=200), nullable=True),
        sa.Column("counterparty_type", sa.String(length=50), nullable=False),
        sa.Column("country_code", sa.String(length=10), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_reference_counterparties_name", "reference_counterparties", ["name"])
    op.create_index("ix_reference_counterparties_is_active", "reference_counterparties", ["is_active"])
    op.create_index(
        "ix_reference_counterparties_counterparty_type",
        "reference_counterparties",
        ["counterparty_type"],
    )

    op.create_table(
        "reference_portfolios",
        sa.Column("code", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("book_code", sa.String(length=50), nullable=False),
        sa.Column("owner", sa.String(length=120), nullable=True),
        sa.Column("strategy", sa.String(length=120), nullable=True),
        sa.Column("trader_persona", sa.String(length=120), nullable=True),
        sa.Column("risk_archetype", sa.String(length=60), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_reference_portfolios_name", "reference_portfolios", ["name"])
    op.create_index("ix_reference_portfolios_is_active", "reference_portfolios", ["is_active"])
    op.create_index("ix_reference_portfolios_book_code", "reference_portfolios", ["book_code"])
    op.create_index(
        "ix_reference_portfolios_trader_persona",
        "reference_portfolios",
        ["trader_persona"],
    )

    now = utc("2026-02-10T00:00:00Z")
    reference_portfolios = sa.table(
        "reference_portfolios",
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("book_code", sa.String()),
        sa.column("owner", sa.String()),
        sa.column("strategy", sa.String()),
        sa.column("trader_persona", sa.String()),
        sa.column("risk_archetype", sa.String()),
        sa.column("description", sa.Text()),
        sa.column("is_active", sa.Boolean()),
        sa.column("effective_from", sa.DateTime(timezone=True)),
        sa.column("effective_to", sa.DateTime(timezone=True)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("created_by", sa.String()),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("updated_by", sa.String()),
        sa.column("version", sa.Integer()),
    )
    op.bulk_insert(
        reference_portfolios,
        [
            {
                "code": row["code"],
                "name": row["name"],
                "book_code": row["book_code"],
                "owner": row["owner"],
                "strategy": row["strategy"],
                "trader_persona": row["trader_persona"],
                "risk_archetype": row["risk_archetype"],
                "description": row["description"],
                "is_active": True,
                "effective_from": None,
                "effective_to": None,
                "created_at": now,
                "created_by": "system-demo",
                "updated_at": now,
                "updated_by": "system-demo",
                "version": 1,
            }
            for row in PORTFOLIO_ROWS
        ],
    )


def downgrade() -> None:
    portfolio_codes = ", ".join(f"'{row['code']}'" for row in PORTFOLIO_ROWS)
    op.execute(
        f"""
        DELETE FROM reference_portfolios
        WHERE created_by = 'system-demo'
          AND code IN ({portfolio_codes})
        """
    )
    op.drop_index(
        "ix_reference_portfolios_trader_persona",
        table_name="reference_portfolios",
    )
    op.drop_index("ix_reference_portfolios_book_code", table_name="reference_portfolios")
    op.drop_index("ix_reference_portfolios_is_active", table_name="reference_portfolios")
    op.drop_index("ix_reference_portfolios_name", table_name="reference_portfolios")
    op.drop_table("reference_portfolios")

    op.drop_index(
        "ix_reference_counterparties_counterparty_type",
        table_name="reference_counterparties",
    )
    op.drop_index("ix_reference_counterparties_is_active", table_name="reference_counterparties")
    op.drop_index("ix_reference_counterparties_name", table_name="reference_counterparties")
    op.drop_table("reference_counterparties")
