from __future__ import annotations

from dataclasses import dataclass

from apps.api.app.schemas.assistant import AssistantAgentSkillDefinitionOut, AssistantAgentSkillKey

INTER_AGENT_CONSULTATION_SKILL: AssistantAgentSkillKey = "inter_agent_consultation"


@dataclass(frozen=True)
class AssistantAgentSkillDefinition:
    skill_key: AssistantAgentSkillKey
    label: str
    description: str

    def to_out(self) -> AssistantAgentSkillDefinitionOut:
        return AssistantAgentSkillDefinitionOut(
            name=self.skill_key,
            label=self.label,
            description=self.description,
        )


ASSISTANT_AGENT_SKILL_DEFINITIONS: tuple[AssistantAgentSkillDefinition, ...] = (
    AssistantAgentSkillDefinition(
        skill_key="market_intelligence",
        label="Market Intelligence",
        description="Turn market, weather, and position context into grounded desk briefings.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="pretrade_structuring",
        label="Pre-Trade Structuring",
        description="Draft review-ready trade structures, assumptions, and scenario handoffs.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="risk_monitoring",
        label="Risk Monitoring",
        description="Watch for exposure, control, or freshness signals that warrant escalation.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="trade_lifecycle_management",
        label="Trade Lifecycle Management",
        description="Explain or govern trade lifecycle changes across create, amend, and cancel flows.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="trade_governance",
        label="Trade Governance",
        description="Assess whether sensitive trade changes are supported by the current record and policy.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="trade_operations_coordination",
        label="Trade Operations Coordination",
        description="Coordinate confirmations, workflow items, deliveries, and downstream trade follow-through.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="settlement_operations",
        label="Settlement Operations",
        description="Analyze settlement posture across invoices, payments, accruals, and exception queues.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="movement_control",
        label="Movement Control",
        description="Track delivery, scheduling, and actualization reality with bounded operational corrections.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="accrual_control",
        label="Accrual Control",
        description="Reconcile accrual posture and prepare governed manual accrual corrections.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="accounting_posting",
        label="Accounting Posting",
        description="Prepare or execute bounded internal accounting entries and reversals.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="counterparty_state_sync",
        label="Counterparty State Sync",
        description="Align bilateral state across confirmations, workflow, and settlement touchpoints.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="confirmation_control",
        label="Confirmation Control",
        description="Manage confirmation issuance, response tracking, and related confirmation workflow.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="workflow_control",
        label="Workflow Control",
        description="Coordinate internal workflow ownership, status, and next-step execution.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="invoice_control",
        label="Invoice Control",
        description="Assess invoice readiness and handle governed invoice issuance or correction flows.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="document_triage",
        label="Document Triage",
        description="Interpret document routing, linkage confidence, and reprocessing readiness.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="reporting_reconciliation",
        label="Reporting And Reconciliation",
        description="Build audit-friendly summaries, reconciliations, and control-oriented explanations.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="logistics_coordination",
        label="Logistics Coordination",
        description="Coordinate physical scheduling and logistics handoffs around movement evidence.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="fee_accrual_management",
        label="Fee And Accrual Management",
        description="Track fee, accrual, and settlement support work across finance-heavy workflows.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="counterparty_outreach",
        label="Counterparty Outreach",
        description="Draft bilateral outreach and follow-up language without sending external communications.",
    ),
    AssistantAgentSkillDefinition(
        skill_key="agent_supervision",
        label="Agent Supervision",
        description="Monitor managed agents, trust signals, and intervention candidates across the roster.",
    ),
    AssistantAgentSkillDefinition(
        skill_key=INTER_AGENT_CONSULTATION_SKILL,
        label="Inter-Agent Consultation",
        description="Request advisory input from another managed agent without delegating governed actions.",
    ),
)


def list_agent_skill_definitions() -> list[AssistantAgentSkillDefinition]:
    return list(ASSISTANT_AGENT_SKILL_DEFINITIONS)


def list_agent_skill_keys() -> tuple[AssistantAgentSkillKey, ...]:
    return tuple(definition.skill_key for definition in ASSISTANT_AGENT_SKILL_DEFINITIONS)
