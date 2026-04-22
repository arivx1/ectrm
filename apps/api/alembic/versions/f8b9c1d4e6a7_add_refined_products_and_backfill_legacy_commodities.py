"""add refined products and backfill legacy commodities"""

from alembic import op

revision = "f8b9c1d4e6a7"
down_revision = "c63a0a6c92a4"
branch_labels = None
depends_on = None


REFINED_PRODUCT_ROWS = [
    ("REFINED_PRODUCTS", "GASOLINE", "Gasoline", "Refined gasoline products"),
    ("REFINED_PRODUCTS", "DIESEL", "Diesel", "Diesel and gasoil products"),
    ("REFINED_PRODUCTS", "JET_FUEL", "Jet Fuel", "Jet fuel and aviation distillates"),
    ("REFINED_PRODUCTS", "FUEL_OIL", "Fuel Oil", "Residual and bunker fuel oils"),
    ("REFINED_PRODUCTS", "NAPHTHA", "Naphtha", "Light refined product and petrochemical feedstock"),
]


def upgrade() -> None:
    op.execute(
        """
        UPDATE reference_commodities
        SET commodity_class = 'REFINED_PRODUCTS',
            updated_at = NOW(),
            updated_by = 'system',
            version = version + 1
        WHERE code IN ('GASOLINE', 'DIESEL', 'JET_FUEL', 'FUEL_OIL')
        """
    )

    for commodity_class, code, name, description in REFINED_PRODUCT_ROWS:
        escaped_name = name.replace("'", "''")
        escaped_description = description.replace("'", "''")
        op.execute(
            f"""
            INSERT INTO reference_commodities (
                code,
                commodity_class,
                name,
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
                '{code}',
                '{commodity_class}',
                '{escaped_name}',
                '{escaped_description}',
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
            SET commodity_class = EXCLUDED.commodity_class,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                is_active = TRUE,
                updated_at = NOW(),
                updated_by = 'system',
                version = reference_commodities.version + 1
            """
        )

    op.execute(
        """
        UPDATE trades
        SET commodity_class = 'CRUDE_OIL',
            commodity = 'WTI'
        WHERE UPPER(TRIM(COALESCE(commodity, ''))) IN ('CRUDE', 'CRUDE_OIL')
        """
    )
    op.execute(
        """
        UPDATE trades
        SET commodity_class = 'REFINED_PRODUCTS'
        WHERE UPPER(TRIM(COALESCE(commodity, ''))) IN ('GASOLINE', 'DIESEL', 'JET_FUEL', 'FUEL_OIL', 'NAPHTHA')
        """
    )

    op.execute(
        """
        UPDATE events
        SET payload = jsonb_set(
                jsonb_set(payload::jsonb, '{commodity}', to_jsonb('WTI'::text), true),
                '{commodity_class}',
                to_jsonb('CRUDE_OIL'::text),
                true
            )::json
        WHERE aggregate_type = 'trade'
          AND event_type IN ('TradeCreated', 'TradeAmended')
          AND UPPER(TRIM(COALESCE(payload->>'commodity', ''))) IN ('CRUDE', 'CRUDE_OIL')
        """
    )
    op.execute(
        """
        UPDATE events
        SET payload = jsonb_set(
                payload::jsonb,
                '{commodity_class}',
                to_jsonb('REFINED_PRODUCTS'::text),
                true
            )::json
        WHERE aggregate_type = 'trade'
          AND event_type IN ('TradeCreated', 'TradeAmended')
          AND UPPER(TRIM(COALESCE(payload->>'commodity', ''))) IN ('GASOLINE', 'DIESEL', 'JET_FUEL', 'FUEL_OIL', 'NAPHTHA')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE events
        SET payload = (payload::jsonb - 'commodity_class')::json
        WHERE aggregate_type = 'trade'
          AND event_type IN ('TradeCreated', 'TradeAmended')
          AND UPPER(TRIM(COALESCE(payload->>'commodity', ''))) IN ('WTI', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'FUEL_OIL', 'NAPHTHA')
        """
    )
    op.execute(
        """
        UPDATE events
        SET payload = jsonb_set(payload::jsonb, '{commodity}', to_jsonb('crude'::text), true)::json
        WHERE aggregate_type = 'trade'
          AND event_type IN ('TradeCreated', 'TradeAmended')
          AND UPPER(TRIM(COALESCE(payload->>'commodity', ''))) = 'WTI'
        """
    )

    op.execute(
        """
        UPDATE trades
        SET commodity_class = 'OTHER',
            commodity = 'crude'
        WHERE commodity_class = 'CRUDE_OIL' AND commodity = 'WTI'
        """
    )
    op.execute(
        """
        UPDATE trades
        SET commodity_class = 'OTHER'
        WHERE commodity IN ('GASOLINE', 'DIESEL', 'JET_FUEL', 'FUEL_OIL', 'NAPHTHA')
        """
    )

    op.execute(
        """
        UPDATE reference_commodities
        SET commodity_class = 'OTHER',
            updated_at = NOW(),
            updated_by = 'system',
            version = version + 1
        WHERE code IN ('GASOLINE', 'DIESEL', 'JET_FUEL', 'FUEL_OIL')
        """
    )
    op.execute("DELETE FROM reference_commodities WHERE code = 'NAPHTHA'")
