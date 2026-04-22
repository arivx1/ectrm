"""add trade credit approval decision history

Revision ID: 7a8b9c0d1e2f
Revises: 5e6f7a8b9c0d, 6f7a8b9c0d1e, c7d8e9f0a1b2
"""

from alembic import op
import sqlalchemy as sa

revision = "7a8b9c0d1e2f"
down_revision = ("5e6f7a8b9c0d", "6f7a8b9c0d1e", "c7d8e9f0a1b2")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trade_credit_approval_decisions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("workflow_item_id", sa.Integer(), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("decision_comment", sa.Text(), nullable=False),
        sa.Column("breach_snapshot", sa.JSON(), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_by", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workflow_item_id"], ["trade_workflow_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_trade_credit_approval_decisions_trade_id",
        "trade_credit_approval_decisions",
        ["trade_id"],
        unique=False,
    )
    op.create_index(
        "ix_trade_credit_approval_decisions_workflow_item_id",
        "trade_credit_approval_decisions",
        ["workflow_item_id"],
        unique=False,
    )
    op.create_index(
        "ix_trade_credit_approval_decisions_decided_at",
        "trade_credit_approval_decisions",
        ["decided_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_trade_credit_approval_decisions_decided_at", table_name="trade_credit_approval_decisions")
    op.drop_index("ix_trade_credit_approval_decisions_workflow_item_id", table_name="trade_credit_approval_decisions")
    op.drop_index("ix_trade_credit_approval_decisions_trade_id", table_name="trade_credit_approval_decisions")
    op.drop_table("trade_credit_approval_decisions")
