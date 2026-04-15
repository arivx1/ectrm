"""backfill document action approval requests table

Revision ID: f9a0b1c2d3e5
Revises: f8a9b0c1d2e4
Create Date: 2026-04-15 00:15:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f9a0b1c2d3e5"
down_revision: Union[str, Sequence[str], None] = "f8a9b0c1d2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("document_action_approval_requests"):
        return

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
    # Forward-only corrective migration for databases that advanced past the
    # original document-action branch without creating this table.
    return None
