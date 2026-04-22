"""create document action decisions

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b7
Create Date: 2026-04-14 18:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_action_decisions",
        sa.Column("decision_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("execution_mode", sa.String(length=16), nullable=False),
        sa.Column("execution_status", sa.String(length=24), nullable=False),
        sa.Column("decision_comment", sa.Text(), nullable=False),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("operation_type", sa.String(length=96), nullable=True),
        sa.Column("governance_status", sa.String(length=48), nullable=False),
        sa.Column("target_record_type", sa.String(length=64), nullable=True),
        sa.Column("target_record_id", sa.String(length=96), nullable=True),
        sa.Column("owner_record_type", sa.String(length=64), nullable=True),
        sa.Column("owner_record_id", sa.String(length=96), nullable=True),
        sa.Column("action_plan_snapshot", sa.JSON(), nullable=False),
        sa.Column("governance_snapshot", sa.JSON(), nullable=False),
        sa.Column("result_snapshot", sa.JSON(), nullable=False),
        sa.Column("document_event_id", sa.String(length=36), nullable=True),
        sa.Column("trade_event_id", sa.String(length=36), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_by", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["document_ingestions.document_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("decision_id"),
    )
    op.create_index(
        "ix_document_action_decisions_document_id",
        "document_action_decisions",
        ["document_id"],
        unique=False,
    )
    op.create_index(
        "ix_document_action_decisions_decided_at",
        "document_action_decisions",
        ["decided_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_document_action_decisions_decided_at", table_name="document_action_decisions")
    op.drop_index("ix_document_action_decisions_document_id", table_name="document_action_decisions")
    op.drop_table("document_action_decisions")
