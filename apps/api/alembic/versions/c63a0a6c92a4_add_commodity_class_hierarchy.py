"""add commodity class hierarchy"""

from alembic import op
import sqlalchemy as sa

revision = "c63a0a6c92a4"
down_revision = "ab9c4e21f5d8"
branch_labels = None
depends_on = None


COMMODITY_ROWS = [
    ("POWER", "POWER", "Power", "Electricity and power market exposure"),
    ("NATURAL_GAS", "NATURAL_GAS", "Natural Gas", "Pipeline natural gas"),
    ("LNG", "LNG", "LNG", "Liquefied natural gas"),
    ("NGL", "PROPANE", "Propane", "Propane and LPG markets"),
    ("NGL", "BUTANE", "Butane", "Normal butane NGL exposure"),
    ("NGL", "ISOBUTANE", "Isobutane", "Isobutane NGL exposure"),
    ("NGL", "ETHANE", "Ethane", "Ethane liquids exposure"),
    ("NGL", "NATURAL_GASOLINE", "Natural Gasoline", "Natural gasoline and pentanes plus"),
    ("CRUDE_OIL", "WTI", "WTI", "West Texas Intermediate crude benchmark"),
    ("CRUDE_OIL", "BRENT", "Brent", "North Sea crude benchmark"),
    ("CRUDE_OIL", "LLS", "LLS", "Light Louisiana Sweet crude"),
    ("CRUDE_OIL", "ANS", "ANS", "Alaska North Slope crude"),
    ("CRUDE_OIL", "DUBAI", "Dubai", "Dubai crude benchmark"),
    ("CHEMICAL", "METHANOL", "Methanol", "Methanol commodity exposure"),
    ("CHEMICAL", "AMMONIA", "Ammonia", "Ammonia commodity exposure"),
    ("CHEMICAL", "UREA", "Urea", "Urea fertilizer exposure"),
    ("BASE_METAL", "COPPER", "Copper", "Copper refined and concentrate markets"),
    ("BASE_METAL", "ALUMINUM", "Aluminum", "Primary aluminum exposure"),
    ("BASE_METAL", "NICKEL", "Nickel", "Nickel refined and matte markets"),
    ("BASE_METAL", "ZINC", "Zinc", "Zinc refined metal exposure"),
    ("PRECIOUS_METAL", "GOLD", "Gold", "Gold bullion and benchmark exposure"),
    ("PRECIOUS_METAL", "SILVER", "Silver", "Silver bullion and benchmark exposure"),
    ("PRECIOUS_METAL", "PLATINUM", "Platinum", "Platinum market exposure"),
    ("PRECIOUS_METAL", "PALLADIUM", "Palladium", "Palladium market exposure"),
    ("METAL_ORE", "IRON_ORE", "Iron Ore", "Iron ore benchmark and physical flows"),
    ("METAL_ORE", "BAUXITE", "Bauxite", "Bauxite and alumina feed exposure"),
    ("METAL_ORE", "SPODUMENE", "Spodumene", "Lithium spodumene concentrate"),
    ("AGRICULTURE", "WHEAT", "Wheat", "Wheat grain markets"),
    ("AGRICULTURE", "CORN", "Corn", "Corn grain markets"),
    ("AGRICULTURE", "SOYBEANS", "Soybeans", "Soybean and oilseed markets"),
    ("AGRICULTURE", "SUGAR", "Sugar", "Raw and white sugar markets"),
    ("AGRICULTURE", "COFFEE", "Coffee", "Arabica and robusta coffee markets"),
    ("AGRICULTURE", "COTTON", "Cotton", "Cotton fiber markets"),
    ("OTHER", "COAL", "Coal", "Thermal and metallurgical coal"),
    ("OTHER", "CARBON", "Carbon", "Carbon credits and emissions instruments"),
    ("OTHER", "GASOLINE", "Gasoline", "Refined gasoline products"),
    ("OTHER", "DIESEL", "Diesel", "Diesel and gasoil products"),
    ("OTHER", "JET_FUEL", "Jet Fuel", "Jet fuel and aviation distillates"),
    ("OTHER", "FUEL_OIL", "Fuel Oil", "Residual and bunker fuel oils"),
]


def upgrade() -> None:
    op.add_column("reference_commodities", sa.Column("commodity_class", sa.String(length=50), nullable=True))
    op.create_index("ix_reference_commodities_class", "reference_commodities", ["commodity_class"])

    op.add_column("trades", sa.Column("commodity_class", sa.String(length=50), nullable=True))
    op.create_index("ix_trades_commodity_class", "trades", ["commodity_class"])

    op.execute(
        """
        UPDATE trades
        SET commodity_class =
            CASE
                WHEN commodity IN ('POWER') THEN 'POWER'
                WHEN commodity IN ('NATURAL_GAS') THEN 'NATURAL_GAS'
                WHEN commodity IN ('LNG') THEN 'LNG'
                WHEN commodity IN ('PROPANE', 'BUTANE', 'ISOBUTANE', 'ETHANE', 'NATURAL_GASOLINE', 'NGL') THEN 'NGL'
                WHEN commodity IN ('WTI', 'BRENT', 'LLS', 'ANS', 'DUBAI', 'CRUDE_OIL') THEN 'CRUDE_OIL'
                WHEN commodity IN ('METHANOL', 'AMMONIA', 'UREA') THEN 'CHEMICAL'
                WHEN commodity IN ('COPPER', 'ALUMINUM', 'NICKEL', 'ZINC') THEN 'BASE_METAL'
                WHEN commodity IN ('GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM') THEN 'PRECIOUS_METAL'
                WHEN commodity IN ('IRON_ORE', 'BAUXITE', 'SPODUMENE') THEN 'METAL_ORE'
                WHEN commodity IN ('WHEAT', 'CORN', 'SOYBEANS', 'SUGAR', 'COFFEE', 'COTTON') THEN 'AGRICULTURE'
                ELSE 'OTHER'
            END
        """
    )
    op.execute("UPDATE trades SET commodity_class = 'OTHER' WHERE commodity_class IS NULL")

    op.execute("DELETE FROM reference_commodities WHERE created_by = 'system'")

    for commodity_class, code, name, description in COMMODITY_ROWS:
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
            """
        )

    op.alter_column("reference_commodities", "commodity_class", nullable=False)
    op.alter_column("trades", "commodity_class", nullable=False)


def downgrade() -> None:
    op.execute("DELETE FROM reference_commodities WHERE created_by = 'system'")
    op.drop_index("ix_trades_commodity_class", table_name="trades")
    op.drop_column("trades", "commodity_class")
    op.drop_index("ix_reference_commodities_class", table_name="reference_commodities")
    op.drop_column("reference_commodities", "commodity_class")
