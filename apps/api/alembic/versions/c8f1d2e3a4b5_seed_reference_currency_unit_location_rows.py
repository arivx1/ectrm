"""seed reference currency, unit, and location rows

Revision ID: c8f1d2e3a4b5
Revises: a7c9e1f4b2d3
"""

from alembic import op

revision = "c8f1d2e3a4b5"
down_revision = "a7c9e1f4b2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO reference_currencies (
            code, name, symbol, description, is_active,
            effective_from, effective_to, created_at, created_by, updated_at, updated_by, version
        )
        VALUES
            ('USD', 'US Dollar', '$', 'Primary settlement currency for current prototype flows', TRUE, NULL, NULL, NOW(), 'system', NOW(), 'system', 1),
            ('EUR', 'Euro', '€', 'Common cross-border pricing and settlement currency', TRUE, NULL, NULL, NOW(), 'system', NOW(), 'system', 1),
            ('GBP', 'British Pound', '£', 'Common EMEA market pricing currency', TRUE, NULL, NULL, NOW(), 'system', NOW(), 'system', 1)
        ON CONFLICT (code) DO NOTHING
        """
    )

    op.execute(
        """
        INSERT INTO reference_units (
            code, name, commodity_class, dimension, base_unit_code, conversion_factor, precision, description, is_active,
            effective_from, effective_to, created_at, created_by, updated_at, updated_by, version
        )
        VALUES
            ('BBL', 'Barrel', 'CRUDE_OIL', 'VOLUME', NULL, NULL, 3, 'Standard liquid hydrocarbon volume unit', TRUE, NULL, NULL, NOW(), 'system', NOW(), 'system', 1),
            ('GAL', 'Gallon', 'REFINED_PRODUCTS', 'VOLUME', 'BBL', 0.02380952, 3, 'Smaller liquid volume unit linked to barrel conversions', TRUE, NULL, NULL, NOW(), 'system', NOW(), 'system', 1),
            ('MMBTU', 'Million British Thermal Units', 'NATURAL_GAS', 'ENERGY', NULL, NULL, 3, 'Thermal energy unit for gas pricing and exposure', TRUE, NULL, NULL, NOW(), 'system', NOW(), 'system', 1),
            ('MWH', 'Megawatt Hour', 'POWER', 'POWER', NULL, NULL, 3, 'Electric power trading quantity unit', TRUE, NULL, NULL, NOW(), 'system', NOW(), 'system', 1)
        ON CONFLICT (code) DO NOTHING
        """
    )

    op.execute(
        """
        INSERT INTO reference_locations (
            code, name, location_type, market, country_code, region, timezone, description, is_active,
            effective_from, effective_to, created_at, created_by, updated_at, updated_by, version
        )
        VALUES
            ('CUSHING', 'Cushing Hub', 'HUB', 'NYMEX', 'US', 'Midcontinent', 'America/Chicago', 'WTI delivery hub and benchmark pricing location', TRUE, NULL, NULL, NOW(), 'system', NOW(), 'system', 1),
            ('HENRY_HUB', 'Henry Hub', 'HUB', 'NYMEX', 'US', 'Gulf Coast', 'America/Chicago', 'Natural gas benchmark hub', TRUE, NULL, NULL, NOW(), 'system', NOW(), 'system', 1),
            ('USGC', 'US Gulf Coast', 'REGION', 'PHYSICAL', 'US', 'Gulf Coast', 'America/Chicago', 'Physical refined products and crude pricing region', TRUE, NULL, NULL, NOW(), 'system', NOW(), 'system', 1)
        ON CONFLICT (code) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM reference_locations WHERE code IN ('CUSHING', 'HENRY_HUB', 'USGC')")
    op.execute("DELETE FROM reference_units WHERE code IN ('BBL', 'GAL', 'MMBTU', 'MWH')")
    op.execute("DELETE FROM reference_currencies WHERE code IN ('USD', 'EUR', 'GBP')")
