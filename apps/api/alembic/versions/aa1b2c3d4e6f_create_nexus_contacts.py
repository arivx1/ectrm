"""create nexus contacts

Revision ID: aa1b2c3d4e6f
Revises: q1r2s3t4u5v6
Create Date: 2026-06-06 15:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "aa1b2c3d4e6f"
down_revision: Union[str, Sequence[str], None] = "q1r2s3t4u5v6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("nexus_contacts"):
        return

    op.create_table(
        "nexus_contacts",
        sa.Column("contact_id", sa.String(length=96), nullable=False),
        sa.Column("client_name", sa.String(length=256), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("phone", sa.String(length=80), nullable=True),
        sa.Column("web_url", sa.String(length=1024), nullable=True),
        sa.Column("source", sa.String(length=24), nullable=False),
        sa.Column("external_provider", sa.String(length=32), nullable=True),
        sa.Column("external_record_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.PrimaryKeyConstraint("contact_id"),
        sa.UniqueConstraint(
            "external_provider",
            "external_record_id",
            name="uq_nexus_contacts_external_record",
        ),
    )
    op.create_index("ix_nexus_contacts_client_name", "nexus_contacts", ["client_name"])
    op.create_index("ix_nexus_contacts_email", "nexus_contacts", ["email"])
    op.create_index("ix_nexus_contacts_source", "nexus_contacts", ["source"])


def downgrade() -> None:
    op.drop_index("ix_nexus_contacts_source", table_name="nexus_contacts")
    op.drop_index("ix_nexus_contacts_email", table_name="nexus_contacts")
    op.drop_index("ix_nexus_contacts_client_name", table_name="nexus_contacts")
    op.drop_table("nexus_contacts")
