"""add trade credit exceptions

Revision ID: 8b9c0d1e2f3a
Revises: 7a8b9c0d1e2f
"""

from alembic import op
import sqlalchemy as sa

revision = "8b9c0d1e2f3a"
down_revision = "7a8b9c0d1e2f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trade_credit_exceptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("workflow_item_id", sa.Integer(), nullable=False),
        sa.Column("approval_decision_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ACTIVE"),
        sa.Column("limit_currency_code", sa.String(length=20), nullable=False),
        sa.Column("approved_limit_amount", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("approved_projected_exposure_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("approved_excess_amount", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("approval_comment", sa.Text(), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approved_by", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_by", sa.String(length=128), nullable=True),
        sa.Column("released_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["approval_decision_id"], ["trade_credit_approval_decisions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workflow_item_id"], ["trade_workflow_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_trade_credit_exceptions_trade_id", "trade_credit_exceptions", ["trade_id"], unique=False)
    op.create_index(
        "ix_trade_credit_exceptions_workflow_item_id",
        "trade_credit_exceptions",
        ["workflow_item_id"],
        unique=False,
    )
    op.create_index(
        "ix_trade_credit_exceptions_approval_decision_id",
        "trade_credit_exceptions",
        ["approval_decision_id"],
        unique=False,
    )
    op.create_index("ix_trade_credit_exceptions_expires_at", "trade_credit_exceptions", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_trade_credit_exceptions_expires_at", table_name="trade_credit_exceptions")
    op.drop_index("ix_trade_credit_exceptions_approval_decision_id", table_name="trade_credit_exceptions")
    op.drop_index("ix_trade_credit_exceptions_workflow_item_id", table_name="trade_credit_exceptions")
    op.drop_index("ix_trade_credit_exceptions_trade_id", table_name="trade_credit_exceptions")
    op.drop_table("trade_credit_exceptions")
