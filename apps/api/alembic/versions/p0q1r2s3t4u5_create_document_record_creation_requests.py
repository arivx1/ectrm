"""create document record creation requests

Revision ID: p0q1r2s3t4u5
Revises: o6p7q8r9s0t1
Create Date: 2026-05-29 11:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "p0q1r2s3t4u5"
down_revision: Union[str, Sequence[str], None] = "o6p7q8r9s0t1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_record_creation_requests",
        sa.Column("request_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("document_kind", sa.String(length=64), nullable=True),
        sa.Column("target_record_type", sa.String(length=64), nullable=False),
        sa.Column("target_record_label", sa.String(length=200), nullable=False),
        sa.Column("owner_record_type", sa.String(length=64), nullable=True),
        sa.Column("owner_record_id", sa.String(length=96), nullable=True),
        sa.Column("required_owner_record_types", sa.JSON(), nullable=False),
        sa.Column("matched_keys", sa.JSON(), nullable=False),
        sa.Column("missing_evidence", sa.JSON(), nullable=False),
        sa.Column("captured_fields", sa.JSON(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("request_comment", sa.Text(), nullable=True),
        sa.Column("resolution_comment", sa.Text(), nullable=True),
        sa.Column("linkage_snapshot", sa.JSON(), nullable=False),
        sa.Column("action_plan_snapshot", sa.JSON(), nullable=False),
        sa.Column("resolved_record_type", sa.String(length=64), nullable=True),
        sa.Column("resolved_record_id", sa.String(length=96), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("requested_by", sa.String(length=128), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.String(length=128), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["document_ingestions.document_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("request_id"),
    )
    op.create_index(
        "ix_document_record_creation_requests_document_id",
        "document_record_creation_requests",
        ["document_id"],
        unique=False,
    )
    op.create_index(
        "ix_document_record_creation_requests_requested_at",
        "document_record_creation_requests",
        ["requested_at"],
        unique=False,
    )
    op.create_index(
        "ix_document_record_creation_requests_status",
        "document_record_creation_requests",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_document_record_creation_requests_target_record_type",
        "document_record_creation_requests",
        ["target_record_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_record_creation_requests_target_record_type",
        table_name="document_record_creation_requests",
    )
    op.drop_index(
        "ix_document_record_creation_requests_status",
        table_name="document_record_creation_requests",
    )
    op.drop_index(
        "ix_document_record_creation_requests_requested_at",
        table_name="document_record_creation_requests",
    )
    op.drop_index(
        "ix_document_record_creation_requests_document_id",
        table_name="document_record_creation_requests",
    )
    op.drop_table("document_record_creation_requests")
