"""add trade operations workflow statuses

Revision ID: 1a2b3c4d5e6f
Revises: 0f7e6d5c4b3a
"""

from alembic import op
import sqlalchemy as sa

revision = "1a2b3c4d5e6f"
down_revision = "0f7e6d5c4b3a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trades",
        sa.Column("confirmation_status", sa.String(length=30), nullable=False, server_default="PENDING"),
    )
    op.add_column(
        "trades",
        sa.Column("nomination_status", sa.String(length=30), nullable=False, server_default="PENDING"),
    )
    op.add_column(
        "trades",
        sa.Column("allocation_status", sa.String(length=30), nullable=False, server_default="PENDING"),
    )
    op.add_column(
        "trades",
        sa.Column("invoice_status", sa.String(length=30), nullable=False, server_default="PENDING"),
    )
    op.add_column(
        "trades",
        sa.Column("payment_status", sa.String(length=30), nullable=False, server_default="PENDING"),
    )

    op.execute(
        """
        UPDATE trades
        SET
            confirmation_status = 'PENDING',
            nomination_status = CASE
                WHEN trade_nature = 'PHYSICAL' THEN 'PENDING'
                ELSE 'NOT_REQUIRED'
            END,
            allocation_status = CASE
                WHEN trade_nature = 'PHYSICAL' THEN 'PENDING'
                ELSE 'NOT_REQUIRED'
            END,
            invoice_status = CASE
                WHEN trade_nature = 'PHYSICAL' THEN 'PENDING'
                ELSE 'NOT_REQUIRED'
            END,
            payment_status = 'PENDING'
        """
    )

    op.alter_column("trades", "confirmation_status", server_default=None)
    op.alter_column("trades", "nomination_status", server_default=None)
    op.alter_column("trades", "allocation_status", server_default=None)
    op.alter_column("trades", "invoice_status", server_default=None)
    op.alter_column("trades", "payment_status", server_default=None)


def downgrade() -> None:
    op.drop_column("trades", "payment_status")
    op.drop_column("trades", "invoice_status")
    op.drop_column("trades", "allocation_status")
    op.drop_column("trades", "nomination_status")
    op.drop_column("trades", "confirmation_status")
