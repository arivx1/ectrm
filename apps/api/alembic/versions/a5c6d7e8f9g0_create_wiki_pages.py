"""create wiki pages

Revision ID: a5c6d7e8f9g0
Revises: y4z5a6b7c8d9
Create Date: 2026-05-16 16:10:00.000000
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column


revision: str = "a5c6d7e8f9g0"
down_revision: Union[str, Sequence[str], None] = "y4z5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


wiki_pages_table = table(
    "wiki_pages",
    column("page_id", sa.String(length=36)),
    column("parent_page_id", sa.String(length=36)),
    column("title", sa.String(length=200)),
    column("content_markdown", sa.Text()),
    column("sort_order", sa.Integer()),
    column("created_at", sa.DateTime(timezone=True)),
    column("created_by", sa.String(length=128)),
    column("updated_at", sa.DateTime(timezone=True)),
    column("updated_by", sa.String(length=128)),
    column("version", sa.Integer()),
)

wiki_page_revisions_table = table(
    "wiki_page_revisions",
    column("page_id", sa.String(length=36)),
    column("version", sa.Integer()),
    column("parent_page_id", sa.String(length=36)),
    column("title", sa.String(length=200)),
    column("content_markdown", sa.Text()),
    column("sort_order", sa.Integer()),
    column("change_summary", sa.JSON()),
    column("created_at", sa.DateTime(timezone=True)),
    column("created_by", sa.String(length=128)),
    column("restored_from_revision_id", sa.Integer()),
)


def upgrade() -> None:
    op.create_table(
        "wiki_pages",
        sa.Column("page_id", sa.String(length=36), nullable=False),
        sa.Column("parent_page_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content_markdown", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["parent_page_id"], ["wiki_pages.page_id"]),
        sa.PrimaryKeyConstraint("page_id"),
    )
    op.create_index("ix_wiki_pages_parent_page_id", "wiki_pages", ["parent_page_id"])
    op.create_index("ix_wiki_pages_updated_at", "wiki_pages", ["updated_at"])

    op.create_table(
        "wiki_page_revisions",
        sa.Column("revision_id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("page_id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("parent_page_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content_markdown", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("change_summary", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("restored_from_revision_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["page_id"], ["wiki_pages.page_id"]),
        sa.PrimaryKeyConstraint("revision_id"),
    )
    op.create_index("ix_wiki_page_revisions_page_id", "wiki_page_revisions", ["page_id"])
    op.create_index("ix_wiki_page_revisions_created_at", "wiki_page_revisions", ["created_at"])

    connection = op.get_bind()
    starter_timestamp = datetime(2026, 5, 16, 16, 0, 0, tzinfo=timezone.utc)
    starter_pages = [
        {
            "page_id": "wiki-root-desk-handbook",
            "parent_page_id": None,
            "title": "Desk Handbook",
            "content_markdown": (
                "# Desk Handbook\n\n"
                "Use this wiki as the shared desk operating memory for workflows, handoffs, and exceptions.\n\n"
                "- Keep pages short enough to scan during live work.\n"
                "- Prefer step-by-step runbooks for repeatable tasks.\n"
                "- Update the relevant child page before the workaround becomes tribal knowledge."
            ),
            "sort_order": 100,
            "created_by": "system",
            "updated_by": "system",
        },
        {
            "page_id": "wiki-trade-capture",
            "parent_page_id": "wiki-root-desk-handbook",
            "title": "Trade Capture",
            "content_markdown": (
                "# Trade Capture\n\n"
                "Open Trade Capture when the job is booking a new deal, amending economics, or confirming the saved live state.\n\n"
                "## Checklist\n\n"
                "- Confirm the correct book, commodity, and counterparty first.\n"
                "- Capture pricing, quantity, and delivery fields completely enough that downstream teams do not need to reconstruct intent.\n"
                "- Verify the resulting event history after submit."
            ),
            "sort_order": 100,
            "created_by": "system",
            "updated_by": "system",
        },
        {
            "page_id": "wiki-confirmations",
            "parent_page_id": "wiki-root-desk-handbook",
            "title": "Confirmations",
            "content_markdown": (
                "# Confirmations\n\n"
                "Use this page for the desk confirmation runbook when the queue starts to drift.\n\n"
                "## First pass\n\n"
                "- Open the Operations queue and find the blocking trade.\n"
                "- Compare the source document to the booked trade before escalating.\n"
                "- Log mismatches explicitly so the next reviewer does not restart the investigation."
            ),
            "sort_order": 200,
            "created_by": "system",
            "updated_by": "system",
        },
        {
            "page_id": "wiki-settlement",
            "parent_page_id": "wiki-root-desk-handbook",
            "title": "Settlement",
            "content_markdown": (
                "# Settlement\n\n"
                "Keep invoice, payment, and aging guidance here so cash follow-through is easy to audit.\n\n"
                "## Triage\n\n"
                "- Confirm whether the blocker is issuance, due-date follow-up, or payment posting.\n"
                "- Capture the exact invoice or payment identifier before escalating.\n"
                "- Hand issues into Operations only when ownership or approval is the blocker."
            ),
            "sort_order": 300,
            "created_by": "system",
            "updated_by": "system",
        },
        {
            "page_id": "wiki-shift-handoffs",
            "parent_page_id": "wiki-root-desk-handbook",
            "title": "Shift Handoffs",
            "content_markdown": (
                "# Shift Handoffs\n\n"
                "Use this page for the minimum handoff standard between operators.\n\n"
                "## Include\n\n"
                "- What changed.\n"
                "- Which trades or workflow items still need attention.\n"
                "- What the next operator should not have to rediscover."
            ),
            "sort_order": 400,
            "created_by": "system",
            "updated_by": "system",
        },
    ]

    connection.execute(
        wiki_pages_table.insert(),
        [
            {
                **page,
                "created_at": starter_timestamp,
                "updated_at": starter_timestamp,
                "version": 1,
            }
            for page in starter_pages
        ],
    )
    connection.execute(
        wiki_page_revisions_table.insert(),
        [
            {
                "page_id": page["page_id"],
                "version": 1,
                "parent_page_id": page["parent_page_id"],
                "title": page["title"],
                "content_markdown": page["content_markdown"],
                "sort_order": page["sort_order"],
                "change_summary": ["Created starter wiki page."],
                "created_at": starter_timestamp,
                "created_by": "system",
                "restored_from_revision_id": None,
            }
            for page in starter_pages
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_wiki_page_revisions_created_at", table_name="wiki_page_revisions")
    op.drop_index("ix_wiki_page_revisions_page_id", table_name="wiki_page_revisions")
    op.drop_table("wiki_page_revisions")

    op.drop_index("ix_wiki_pages_updated_at", table_name="wiki_pages")
    op.drop_index("ix_wiki_pages_parent_page_id", table_name="wiki_pages")
    op.drop_table("wiki_pages")
