"""add skills to assistant agents

Revision ID: h1i2j3k4l5m6
Revises: d7e8f9g0h1i2
Create Date: 2026-05-07 16:20:00.000000
"""

from __future__ import annotations

from typing import Any
from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "h1i2j3k4l5m6"
down_revision: Union[str, Sequence[str], None] = "d7e8f9g0h1i2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSULT_TOOL = "consult_managed_agent"
INTER_AGENT_CONSULTATION_SKILL = "inter_agent_consultation"
ROLE_DERIVED_PROFILE_KIND = "ROLE_DERIVED"
ROLE_SKILLS_BY_KEY: dict[str, tuple[str, ...]] = {
    "trade-ops-copilot": (
        "trade_operations_coordination",
        "confirmation_control",
        "workflow_control",
        "movement_control",
        "document_triage",
        "inter_agent_consultation",
    ),
    "settlement-copilot": (
        "settlement_operations",
        "invoice_control",
        "accrual_control",
        "reporting_reconciliation",
        "inter_agent_consultation",
    ),
    "trade-governor": (
        "trade_governance",
        "trade_lifecycle_management",
        "inter_agent_consultation",
    ),
    "trade-capture-agent": (
        "trade_lifecycle_management",
        "trade_governance",
        "inter_agent_consultation",
    ),
    "movement-controller-agent": (
        "movement_control",
        "logistics_coordination",
        "workflow_control",
        "inter_agent_consultation",
    ),
    "accrual-controller-agent": (
        "accrual_control",
        "settlement_operations",
        "inter_agent_consultation",
    ),
    "accounting-posting-agent": (
        "accounting_posting",
        "reporting_reconciliation",
        "inter_agent_consultation",
    ),
    "counterparty-state-sync-agent": (
        "counterparty_state_sync",
        "confirmation_control",
        "workflow_control",
        "inter_agent_consultation",
    ),
    "confirmation-controller-agent": (
        "confirmation_control",
        "workflow_control",
        "counterparty_state_sync",
        "inter_agent_consultation",
    ),
    "workflow-controller-agent": (
        "workflow_control",
        "trade_operations_coordination",
        "inter_agent_consultation",
    ),
    "invoice-controller-agent": (
        "invoice_control",
        "settlement_operations",
        "inter_agent_consultation",
    ),
    "trade-explainer": (
        "trade_lifecycle_management",
        "inter_agent_consultation",
    ),
    "ops-coordinator": (
        "trade_operations_coordination",
        "workflow_control",
        "inter_agent_consultation",
    ),
    "settlement-analyst": (
        "settlement_operations",
        "accrual_control",
        "inter_agent_consultation",
    ),
    "document-triage": (
        "document_triage",
        "inter_agent_consultation",
    ),
    "desk-briefing": (
        "market_intelligence",
        "inter_agent_consultation",
    ),
    "market-research-agent": (
        "market_intelligence",
        "inter_agent_consultation",
    ),
    "pre-trade-structuring-agent": (
        "pretrade_structuring",
        "market_intelligence",
        "inter_agent_consultation",
    ),
    "risk-sentinel": (
        "risk_monitoring",
        "inter_agent_consultation",
    ),
    "document-agent": (
        "document_triage",
        "trade_operations_coordination",
        "inter_agent_consultation",
    ),
    "reporting-reconciliation-agent": (
        "reporting_reconciliation",
        "settlement_operations",
        "inter_agent_consultation",
    ),
    "logistics-coordinator": (
        "logistics_coordination",
        "movement_control",
        "inter_agent_consultation",
    ),
    "fee-accrual-agent": (
        "fee_accrual_management",
        "accrual_control",
        "settlement_operations",
        "inter_agent_consultation",
    ),
    "counterparty-outreach-agent": (
        "counterparty_outreach",
        "counterparty_state_sync",
        "inter_agent_consultation",
    ),
    "control-tower-agent": (
        "agent_supervision",
        "reporting_reconciliation",
        "inter_agent_consultation",
    ),
}


def _normalize_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item)]


def _append_unique(values: list[str], extra: str) -> list[str]:
    if extra in set(values):
        return list(values)
    return [*values, extra]


def upgrade() -> None:
    op.add_column(
        "assistant_agents",
        sa.Column("skills", sa.JSON(), nullable=False, server_default="[]"),
    )

    bind = op.get_bind()
    assistant_agents = sa.table(
        "assistant_agents",
        sa.column("agent_id", sa.String(length=64)),
        sa.column("role_key", sa.String(length=80)),
        sa.column("profile_kind", sa.String(length=32)),
        sa.column("skills", sa.JSON()),
        sa.column("allowed_tools", sa.JSON()),
        sa.column("published_snapshot", sa.JSON()),
    )
    rows = bind.execute(
        sa.select(
            assistant_agents.c.agent_id,
            assistant_agents.c.role_key,
            assistant_agents.c.profile_kind,
            assistant_agents.c.skills,
            assistant_agents.c.allowed_tools,
            assistant_agents.c.published_snapshot,
        )
    ).mappings()
    for row in rows:
        role_key = str(row["role_key"] or "")
        role_skills = ROLE_SKILLS_BY_KEY.get(role_key)
        if role_skills is None:
            continue

        next_skills = _normalize_list(row["skills"]) or list(role_skills)
        next_allowed_tools = _normalize_list(row["allowed_tools"])
        is_role_derived = str(row["profile_kind"] or "").upper() == ROLE_DERIVED_PROFILE_KIND
        if is_role_derived and INTER_AGENT_CONSULTATION_SKILL in set(next_skills):
            next_allowed_tools = _append_unique(next_allowed_tools, CONSULT_TOOL)

        next_published_snapshot = row["published_snapshot"]
        if isinstance(next_published_snapshot, dict):
            snapshot = dict(next_published_snapshot)
            snapshot_skills = _normalize_list(snapshot.get("skills")) or list(role_skills)
            if is_role_derived:
                snapshot["skills"] = snapshot_skills
                snapshot_tools = _normalize_list(snapshot.get("allowed_tools"))
                if INTER_AGENT_CONSULTATION_SKILL in set(snapshot_skills):
                    snapshot["allowed_tools"] = _append_unique(snapshot_tools, CONSULT_TOOL)
            next_published_snapshot = snapshot

        bind.execute(
            assistant_agents.update()
            .where(assistant_agents.c.agent_id == row["agent_id"])
            .values(
                skills=next_skills,
                allowed_tools=next_allowed_tools,
                published_snapshot=next_published_snapshot,
            )
        )

    op.alter_column("assistant_agents", "skills", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    assistant_agents = sa.table(
        "assistant_agents",
        sa.column("agent_id", sa.String(length=64)),
        sa.column("allowed_tools", sa.JSON()),
        sa.column("published_snapshot", sa.JSON()),
    )
    rows = bind.execute(
        sa.select(
            assistant_agents.c.agent_id,
            assistant_agents.c.allowed_tools,
            assistant_agents.c.published_snapshot,
        )
    ).mappings()
    for row in rows:
        next_allowed_tools = [tool for tool in _normalize_list(row["allowed_tools"]) if tool != CONSULT_TOOL]
        next_published_snapshot = row["published_snapshot"]
        if isinstance(next_published_snapshot, dict):
            snapshot = dict(next_published_snapshot)
            snapshot["allowed_tools"] = [
                tool for tool in _normalize_list(snapshot.get("allowed_tools")) if tool != CONSULT_TOOL
            ]
            snapshot.pop("skills", None)
            next_published_snapshot = snapshot
        bind.execute(
            assistant_agents.update()
            .where(assistant_agents.c.agent_id == row["agent_id"])
            .values(
                allowed_tools=next_allowed_tools,
                published_snapshot=next_published_snapshot,
            )
        )

    op.drop_column("assistant_agents", "skills")
