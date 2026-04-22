"""create document action approval requests

Revision ID: e5f6a7b8c9d1
Revises: d4e5f6a7b8c9
Create Date: 2026-04-14 20:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d1"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_action_approval_requests",
        sa.Column("request_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("operation_type", sa.String(length=96), nullable=True),
        sa.Column("governance_status", sa.String(length=48), nullable=False),
        sa.Column("target_record_type", sa.String(length=64), nullable=True),
        sa.Column("target_record_id", sa.String(length=96), nullable=True),
        sa.Column("owner_record_type", sa.String(length=64), nullable=True),
        sa.Column("owner_record_id", sa.String(length=96), nullable=True),
        sa.Column("request_comment", sa.Text(), nullable=True),
        sa.Column("decision_comment", sa.Text(), nullable=True),
        sa.Column("action_plan_snapshot", sa.JSON(), nullable=False),
        sa.Column("governance_snapshot", sa.JSON(), nullable=False),
        sa.Column("result_snapshot", sa.JSON(), nullable=False),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("execution_decision_id", sa.Integer(), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("requested_by", sa.String(length=128), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by", sa.String(length=128), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["document_ingestions.document_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("request_id"),
    )
    op.create_index(
        "ix_document_action_approval_requests_document_id",
        "document_action_approval_requests",
        ["document_id"],
        unique=False,
    )
    op.create_index(
        "ix_document_action_approval_requests_requested_at",
        "document_action_approval_requests",
        ["requested_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_action_approval_requests_requested_at",
        table_name="document_action_approval_requests",
    )
    op.drop_index(
        "ix_document_action_approval_requests_document_id",
        table_name="document_action_approval_requests",
    )
    op.drop_table("document_action_approval_requests")
