"""create reference calendars and holidays

Revision ID: u1v2w3x4y5z6
Revises: d7e8f9g0h1i2
Create Date: 2026-05-08 10:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "u1v2w3x4y5z6"
down_revision: Union[str, Sequence[str], None] = "d7e8f9g0h1i2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reference_calendars",
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("calendar_type", sa.String(length=50), nullable=False),
        sa.Column("market", sa.String(length=80), nullable=True),
        sa.Column("timezone", sa.String(length=60), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("code"),
    )
    op.create_index("ix_reference_calendars_name", "reference_calendars", ["name"])
    op.create_index("ix_reference_calendars_is_active", "reference_calendars", ["is_active"])
    op.create_index("ix_reference_calendars_calendar_type", "reference_calendars", ["calendar_type"])

    op.create_table(
        "reference_calendar_overlays",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("calendar_code", sa.String(length=50), nullable=False),
        sa.Column("overlay_calendar_code", sa.String(length=50), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["calendar_code"], ["reference_calendars.code"]),
        sa.ForeignKeyConstraint(["overlay_calendar_code"], ["reference_calendars.code"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "calendar_code",
            "overlay_calendar_code",
            name="uq_reference_calendar_overlays_calendar_overlay",
        ),
    )
    op.create_index(
        "ix_reference_calendar_overlays_calendar_code",
        "reference_calendar_overlays",
        ["calendar_code"],
    )
    op.create_index(
        "ix_reference_calendar_overlays_overlay_calendar_code",
        "reference_calendar_overlays",
        ["overlay_calendar_code"],
    )
    op.create_index(
        "ix_reference_calendar_overlays_is_active",
        "reference_calendar_overlays",
        ["is_active"],
    )

    op.create_table(
        "reference_calendar_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("calendar_code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("rule_type", sa.String(length=32), nullable=False),
        sa.Column("closure_type", sa.String(length=32), nullable=False, server_default="FULL_CLOSED"),
        sa.Column("month", sa.Integer(), nullable=True),
        sa.Column("day", sa.Integer(), nullable=True),
        sa.Column("weekday", sa.Integer(), nullable=True),
        sa.Column("occurrence", sa.Integer(), nullable=True),
        sa.Column("offset_days", sa.Integer(), nullable=True),
        sa.Column("observance_shift", sa.String(length=32), nullable=True),
        sa.Column("is_provisional", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["calendar_code"], ["reference_calendars.code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reference_calendar_rules_calendar_code",
        "reference_calendar_rules",
        ["calendar_code"],
    )
    op.create_index(
        "ix_reference_calendar_rules_rule_type",
        "reference_calendar_rules",
        ["rule_type"],
    )
    op.create_index(
        "ix_reference_calendar_rules_is_active",
        "reference_calendar_rules",
        ["is_active"],
    )

    op.create_table(
        "reference_calendar_holidays",
        sa.Column("calendar_code", sa.String(length=50), nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("closure_type", sa.String(length=32), nullable=False, server_default="FULL_CLOSED"),
        sa.Column("is_provisional", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["calendar_code"], ["reference_calendars.code"]),
        sa.PrimaryKeyConstraint("calendar_code", "holiday_date"),
    )
    op.create_index(
        "ix_reference_calendar_holidays_calendar_code",
        "reference_calendar_holidays",
        ["calendar_code"],
    )
    op.create_index(
        "ix_reference_calendar_holidays_holiday_date",
        "reference_calendar_holidays",
        ["holiday_date"],
    )
    op.create_index(
        "ix_reference_calendar_holidays_is_active",
        "reference_calendar_holidays",
        ["is_active"],
    )


def downgrade() -> None:
    op.drop_index("ix_reference_calendar_holidays_is_active", table_name="reference_calendar_holidays")
    op.drop_index("ix_reference_calendar_holidays_holiday_date", table_name="reference_calendar_holidays")
    op.drop_index("ix_reference_calendar_holidays_calendar_code", table_name="reference_calendar_holidays")
    op.drop_table("reference_calendar_holidays")

    op.drop_index("ix_reference_calendar_rules_is_active", table_name="reference_calendar_rules")
    op.drop_index("ix_reference_calendar_rules_rule_type", table_name="reference_calendar_rules")
    op.drop_index("ix_reference_calendar_rules_calendar_code", table_name="reference_calendar_rules")
    op.drop_table("reference_calendar_rules")

    op.drop_index("ix_reference_calendar_overlays_is_active", table_name="reference_calendar_overlays")
    op.drop_index(
        "ix_reference_calendar_overlays_overlay_calendar_code",
        table_name="reference_calendar_overlays",
    )
    op.drop_index("ix_reference_calendar_overlays_calendar_code", table_name="reference_calendar_overlays")
    op.drop_table("reference_calendar_overlays")

    op.drop_index("ix_reference_calendars_calendar_type", table_name="reference_calendars")
    op.drop_index("ix_reference_calendars_is_active", table_name="reference_calendars")
    op.drop_index("ix_reference_calendars_name", table_name="reference_calendars")
    op.drop_table("reference_calendars")
