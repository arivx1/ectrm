"""seed reference commodities"""

from alembic import op

revision = "ab9c4e21f5d8"
down_revision = "8df0f4f7c2ab"
branch_labels = None
depends_on = None


COMMODITY_ROWS = [
    ("CRUDE_OIL", "Crude Oil", "Global crude oil benchmark and physical crude exposure"),
    ("BRENT", "Brent", "North Sea crude benchmark"),
    ("WTI", "WTI", "West Texas Intermediate crude benchmark"),
    ("NATURAL_GAS", "Natural Gas", "Pipeline natural gas"),
    ("LNG", "LNG", "Liquefied natural gas"),
    ("NGL", "NGL", "Natural gas liquids"),
    ("POWER", "Power", "Electricity and power market exposure"),
    ("COAL", "Coal", "Thermal and metallurgical coal"),
    ("CARBON", "Carbon", "Carbon credits and emissions instruments"),
    ("GASOLINE", "Gasoline", "Refined gasoline products"),
    ("DIESEL", "Diesel", "Diesel and gasoil products"),
    ("JET_FUEL", "Jet Fuel", "Jet fuel and aviation distillates"),
    ("FUEL_OIL", "Fuel Oil", "Residual and bunker fuel oils"),
    ("PROPANE", "Propane", "Propane and LPG markets"),
    ("ETHANE", "Ethane", "Ethane liquids exposure"),
    ("METHANOL", "Methanol", "Methanol commodity exposure"),
    ("COPPER", "Copper", "Copper refined and concentrate markets"),
    ("ALUMINUM", "Aluminum", "Primary aluminum exposure"),
    ("NICKEL", "Nickel", "Nickel refined and matte markets"),
    ("IRON_ORE", "Iron Ore", "Iron ore benchmark and physical flows"),
    ("STEEL", "Steel", "Flat and long steel products"),
    ("GOLD", "Gold", "Gold bullion and benchmark exposure"),
    ("SILVER", "Silver", "Silver bullion and benchmark exposure"),
    ("WHEAT", "Wheat", "Wheat grain markets"),
    ("CORN", "Corn", "Corn grain markets"),
    ("SOYBEANS", "Soybeans", "Soybean and oilseed markets"),
    ("SUGAR", "Sugar", "Raw and white sugar markets"),
    ("COFFEE", "Coffee", "Arabica and robusta coffee markets"),
    ("COTTON", "Cotton", "Cotton fiber markets"),
]


def upgrade() -> None:
    for code, name, description in COMMODITY_ROWS:
        escaped_name = name.replace("'", "''")
        escaped_description = description.replace("'", "''")
        op.execute(
            f"""
            INSERT INTO reference_commodities (
                code,
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
            ON CONFLICT (code) DO NOTHING
            """
        )


def downgrade() -> None:
    commodity_codes = ", ".join(f"'{code}'" for code, _, _ in COMMODITY_ROWS)
    op.execute(
        f"DELETE FROM reference_commodities WHERE created_by = 'system' AND code IN ({commodity_codes})"
    )
