"""backfill and require trade units

Revision ID: m4n5o6p7q8r9
Revises: l4m5n6o7p8q9
Create Date: 2026-05-25 00:00:00.000000
"""

from alembic import op

revision = "m4n5o6p7q8r9"
down_revision = "l4m5n6o7p8q9"
branch_labels = None
depends_on = None


QUANTITY_UNIT_CASE_BY_COMMODITY = """
CASE UPPER(COALESCE({commodity_column}, ''))
    WHEN 'BRENT' THEN 'BBL'
    WHEN 'DIESEL' THEN 'BBL'
    WHEN 'FUEL_OIL' THEN 'BBL'
    WHEN 'GASOLINE' THEN 'BBL'
    WHEN 'JET_FUEL' THEN 'BBL'
    WHEN 'LNG' THEN 'MMBTU'
    WHEN 'NATURAL_GAS' THEN 'MMBTU'
    WHEN 'NGL' THEN 'BBL'
    WHEN 'POWER' THEN 'MWH'
    WHEN 'WTI' THEN 'BBL'
    ELSE CASE UPPER(COALESCE({class_column}, ''))
        WHEN 'CRUDE_OIL' THEN 'BBL'
        WHEN 'NATURAL_GAS' THEN 'MMBTU'
        WHEN 'POWER' THEN 'MWH'
        WHEN 'REFINED_PRODUCTS' THEN 'BBL'
    END
END
"""

PRICE_UNIT_CASE_BY_COMMODITY = """
CASE UPPER(COALESCE({commodity_column}, ''))
    WHEN 'BRENT' THEN 'BBL'
    WHEN 'DIESEL' THEN 'GAL'
    WHEN 'FUEL_OIL' THEN 'GAL'
    WHEN 'GASOLINE' THEN 'GAL'
    WHEN 'JET_FUEL' THEN 'GAL'
    WHEN 'LNG' THEN 'MMBTU'
    WHEN 'NATURAL_GAS' THEN 'MMBTU'
    WHEN 'NGL' THEN 'GAL'
    WHEN 'POWER' THEN 'MWH'
    WHEN 'WTI' THEN 'BBL'
    ELSE CASE UPPER(COALESCE({class_column}, ''))
        WHEN 'CRUDE_OIL' THEN 'BBL'
        WHEN 'NATURAL_GAS' THEN 'MMBTU'
        WHEN 'POWER' THEN 'MWH'
        WHEN 'REFINED_PRODUCTS' THEN 'GAL'
    END
END
"""


def upgrade() -> None:
    trade_quantity_case = QUANTITY_UNIT_CASE_BY_COMMODITY.format(
        commodity_column="trades.commodity",
        class_column="trades.commodity_class",
    )
    trade_price_case = PRICE_UNIT_CASE_BY_COMMODITY.format(
        commodity_column="trades.commodity",
        class_column="trades.commodity_class",
    )
    leg_quantity_case = QUANTITY_UNIT_CASE_BY_COMMODITY.format(
        commodity_column="trade_legs.commodity_code",
        class_column="trade_legs.commodity_class",
    )

    op.execute(
        f"""
        UPDATE trades
        SET unit_of_measure = COALESCE(
            {trade_quantity_case},
            (
                SELECT reference_price_indices.unit_code
                FROM reference_price_indices
                WHERE reference_price_indices.code = trades.price_index_code
                  AND reference_price_indices.is_active IS TRUE
            )
        )
        WHERE NULLIF(BTRIM(unit_of_measure), '') IS NULL
        """
    )
    op.execute(
        f"""
        UPDATE trades
        SET price_unit_code = COALESCE(
            (
                SELECT reference_price_indices.unit_code
                FROM reference_price_indices
                WHERE reference_price_indices.code = trades.price_index_code
                  AND reference_price_indices.is_active IS TRUE
            ),
            {trade_price_case}
        )
        WHERE NULLIF(BTRIM(price_unit_code), '') IS NULL
        """
    )
    op.execute(
        f"""
        UPDATE trade_legs
        SET quantity_unit_code = {leg_quantity_case}
        WHERE NULLIF(BTRIM(quantity_unit_code), '') IS NULL
        """
    )
    op.execute(
        f"""
        UPDATE trade_price_terms
        SET price_unit_code = COALESCE(
            (
                SELECT reference_price_indices.unit_code
                FROM reference_price_indices
                WHERE reference_price_indices.code = trade_price_terms.price_index_code
                  AND reference_price_indices.is_active IS TRUE
            ),
            {PRICE_UNIT_CASE_BY_COMMODITY.format(
                commodity_column="trades.commodity",
                class_column="trades.commodity_class",
            )}
        )
        FROM trades
        WHERE trade_price_terms.trade_id = trades.trade_id
          AND NULLIF(BTRIM(trade_price_terms.price_unit_code), '') IS NULL
        """
    )
    op.execute(
        """
        UPDATE events
        SET payload = (
            events.payload::jsonb
            || jsonb_build_object(
                'unit_of_measure', trades.unit_of_measure,
                'price_unit_code', trades.price_unit_code
            )
        )::json
        FROM trades
        WHERE events.aggregate_type = 'trade'
          AND events.event_type = 'TradeCreated'
          AND events.aggregate_id = trades.trade_id
          AND (
              events.payload->>'unit_of_measure' IS NULL
              OR BTRIM(events.payload->>'unit_of_measure') = ''
              OR events.payload->>'price_unit_code' IS NULL
              OR BTRIM(events.payload->>'price_unit_code') = ''
          )
          AND NULLIF(BTRIM(trades.unit_of_measure), '') IS NOT NULL
          AND NULLIF(BTRIM(trades.price_unit_code), '') IS NOT NULL
        """
    )

    op.create_check_constraint(
        "ck_trades_unit_of_measure_present",
        "trades",
        "unit_of_measure IS NOT NULL AND BTRIM(unit_of_measure) <> ''",
    )
    op.create_check_constraint(
        "ck_trades_price_unit_code_present",
        "trades",
        "price_unit_code IS NOT NULL AND BTRIM(price_unit_code) <> ''",
    )
    op.create_check_constraint(
        "ck_trade_legs_quantity_unit_code_present",
        "trade_legs",
        "quantity_unit_code IS NOT NULL AND BTRIM(quantity_unit_code) <> ''",
    )
    op.create_check_constraint(
        "ck_trade_price_terms_price_unit_code_present",
        "trade_price_terms",
        "price_unit_code IS NOT NULL AND BTRIM(price_unit_code) <> ''",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_trade_price_terms_price_unit_code_present",
        "trade_price_terms",
        type_="check",
    )
    op.drop_constraint(
        "ck_trade_legs_quantity_unit_code_present",
        "trade_legs",
        type_="check",
    )
    op.drop_constraint("ck_trades_price_unit_code_present", "trades", type_="check")
    op.drop_constraint("ck_trades_unit_of_measure_present", "trades", type_="check")
