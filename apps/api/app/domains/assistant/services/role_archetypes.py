from __future__ import annotations

from dataclasses import dataclass
from typing import get_args

from apps.api.app.domains.assistant.services.skills import INTER_AGENT_CONSULTATION_SKILL, list_agent_skill_keys
from apps.api.app.domains.assistant.services.tools import (
    HOME_VIEW_ASSISTANT_TOOL_NAMES,
    augment_managed_agent_introspection_tools,
    list_tool_names,
)
from apps.api.app.schemas.assistant import (
    ALL_ASSISTANT_ACTION_TYPES,
    AssistantAgentAuthorityLevel,
    AssistantAgentCapability,
    AssistantAgentEvalGateOut,
    AssistantAgentOrchestrationPattern,
    AssistantAgentRoleArchetypeOut,
    AssistantAgentRoleCatalogStatus,
    AssistantAgentSkillKey,
    AssistantWorkspace,
)


class AssistantAgentRoleRegistryError(ValueError):
    pass


@dataclass(frozen=True)
class AssistantAgentRoleArchetype:
    role_key: str
    name: str
    description: str
    catalog_status: AssistantAgentRoleCatalogStatus
    mission: tuple[str, ...]
    human_owner_role: str
    allowed_workspaces: tuple[AssistantWorkspace, ...]
    work_objects: tuple[str, ...]
    capability_ceiling: tuple[AssistantAgentCapability, ...]
    skills: tuple[AssistantAgentSkillKey, ...]
    default_tools: tuple[str, ...]
    maximum_action_types: tuple[str, ...]
    authority_ceiling: AssistantAgentAuthorityLevel
    approval_rules: tuple[str, ...]
    stop_conditions: tuple[str, ...]
    success_metrics: tuple[str, ...]
    required_eval_coverage: tuple[str, ...]
    base_prompt_guidance: tuple[str, ...]
    recommended_orchestration_pattern: AssistantAgentOrchestrationPattern = "SINGLE"
    recommended_parent_role_keys: tuple[str, ...] = ()
    recommended_managed_role_keys: tuple[str, ...] = ()
    delegation_guidance: tuple[str, ...] = ()
    current_profile_ids: tuple[str, ...] = ()


ROLE_ARCHETYPE_DEFINITIONS: tuple[AssistantAgentRoleArchetype, ...] = (
    AssistantAgentRoleArchetype(
        role_key="trade-ops-copilot",
        name="Trade Ops Copilot",
        description="Coordinates confirmation, workflow, delivery, and document follow-through for booked trades.",
        catalog_status="SEEDED",
        mission=(
            "Keep booked trades moving through confirmation, workflow, delivery, and document follow-through.",
            "Execute the smallest justified operational action when live evidence is clear.",
        ),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "trades", "operations", "shipments", "scheduling", "reference"),
        work_objects=("trade", "workflow item", "confirmation", "delivery obligation", "document ingestion"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=(
            "trade_operations_coordination",
            "confirmation_control",
            "workflow_control",
            "movement_control",
            "document_triage",
            "inter_agent_consultation",
        ),
        default_tools=(
            "get_trade_workbench",
            "list_workflow_items",
            "list_trade_attention_candidates",
            "list_trade_confirmations",
            "list_deliveries",
            "list_documents",
            "get_document_type_counts",
            "get_document_ingestion",
            "list_gmail_inbox_messages",
            "get_gmail_inbox_message",
        ),
        maximum_action_types=(
            "record_delivery_event",
            "reverse_delivery_event",
            "issue_trade_confirmation",
            "record_trade_confirmation_response",
            "update_trade_workflow_item",
            "record_trade_actualization",
            "void_trade_actualization",
            "reprocess_document_ingestion",
        ),
        authority_ceiling="EXECUTE",
        approval_rules=(
            "Operations Lead audits executed operational actions and delegated-ability override logs.",
        ),
        stop_conditions=(
            "Trade identity, workflow item, delivery, confirmation, or document evidence is ambiguous.",
            "The requested change would externally commit the firm outside the approved action gateway.",
        ),
        success_metrics=(
            "Higher approval hit rate for staged operational actions.",
            "Reduced overdue workflow items and confirmation follow-up time.",
        ),
        required_eval_coverage=(
            "Allowed operational action execution, including movement corrections.",
            "Denied unsupported trade, settlement, and policy actions.",
            "Tool allowlist enforcement.",
        ),
        base_prompt_guidance=(
            "Lead with the blocker or next action.",
            "Show evidence and either execute the governed action or explain why you stopped.",
        ),
        recommended_orchestration_pattern="MANAGER",
        recommended_parent_role_keys=("control-tower-agent",),
        recommended_managed_role_keys=(
            "movement-controller-agent",
            "confirmation-controller-agent",
            "workflow-controller-agent",
            "counterparty-state-sync-agent",
            "document-agent",
            "logistics-coordinator",
        ),
        delegation_guidance=(
            "Use specialist consultations to gather narrow operational evidence, then keep final blocker synthesis and governed action ownership in the Trade Ops Copilot lane.",
        ),
        current_profile_ids=("trade-ops-copilot",),
    ),
    AssistantAgentRoleArchetype(
        role_key="settlement-copilot",
        name="Settlement Copilot",
        description="Pairs settlement analysis with governed invoice and payment execution.",
        catalog_status="SEEDED",
        mission=(
            "Explain invoice, payment, aging, and settlement exception posture.",
            "Execute invoice or payment actions only when settlement evidence supports them.",
        ),
        human_owner_role="Settlement Lead",
        allowed_workspaces=("assistant", "settlement", "operations", "reports"),
        work_objects=("invoice", "payment", "settlement exception", "workflow item", "trade"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=(
            "settlement_operations",
            "invoice_control",
            "accrual_control",
            "reporting_reconciliation",
            "inter_agent_consultation",
        ),
        default_tools=(
            "list_trade_invoices",
            "list_invoice_issue_candidates",
            "list_trade_attention_candidates",
            "list_trade_payments",
            "get_trade_settlement_summary",
            "get_settlement_report_filter_options",
            "list_settlement_report_presets",
            "list_accrual_lots",
            "get_accrual_reconciliation",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=(
            "create_settlement_report_preset",
            "issue_trade_invoice",
            "void_trade_invoice",
            "create_trade_payment",
            "reverse_trade_payment",
        ),
        authority_ceiling="EXECUTE",
        approval_rules=("Settlement Lead audits executed invoice and payment actions.",),
        stop_conditions=(
            "Amount, currency, timing, invoice linkage, payment evidence, or trade linkage is unclear.",
            "The request would release cash or send external payment instructions.",
        ),
        success_metrics=(
            "Fewer overdue settlement exceptions.",
            "Lower finance review time per invoice or payment exception.",
        ),
        required_eval_coverage=(
            "Allowed settlement preset creation execution.",
            "Allowed invoice and payment action execution, including settlement corrections.",
            "Denied cash-release or ambiguous settlement requests.",
            "Settlement tool allowlist enforcement.",
        ),
        base_prompt_guidance=(
            "Start with cash status, then evidence and next step.",
            "Surface missing settlement evidence directly.",
        ),
        recommended_orchestration_pattern="MANAGER",
        recommended_parent_role_keys=("control-tower-agent",),
        recommended_managed_role_keys=(
            "invoice-controller-agent",
            "accrual-controller-agent",
            "accounting-posting-agent",
            "fee-accrual-agent",
            "counterparty-outreach-agent",
        ),
        delegation_guidance=(
            "Consult specialists for invoice, accrual, posting, or outreach context, but keep the final settlement recommendation and any governed settlement action in the Settlement Copilot lane.",
        ),
        current_profile_ids=("settlement-copilot",),
    ),
    AssistantAgentRoleArchetype(
        role_key="trade-governor",
        name="Trade Governor",
        description="Executes high-sensitivity trade cancellation with a constrained cancel-only action scope.",
        catalog_status="SEEDED",
        mission=(
            "Assess whether a trade cancellation request is supported by the current record.",
            "Cancel only when evidence is clear and audit context is complete.",
        ),
        human_owner_role="Trader, Desk Lead, or Admin",
        allowed_workspaces=("assistant", "trades", "operations", "admin"),
        work_objects=("trade", "event", "workflow item", "approval request"),
        capability_ceiling=("READ", "EXPLAIN", "ACTION"),
        skills=("trade_governance", "trade_lifecycle_management", "inter_agent_consultation"),
        default_tools=("get_trade_by_id", "list_trade_events", "get_trade_workbench", "list_workflow_items"),
        maximum_action_types=("cancel_trade",),
        authority_ceiling="EXECUTE",
        approval_rules=("Trader, Desk Lead, or Admin audits executed cancel-trade actions.",),
        stop_conditions=(
            "Trade identity, current status, business reason, or lifecycle evidence is uncertain.",
            "The request is better handled as an amendment, workflow update, or human investigation.",
        ),
        success_metrics=(
            "Cancellation requests are more complete and easier to audit.",
            "Stale or unsafe cancellation attempts fail safely.",
        ),
        required_eval_coverage=(
            "Allowed cancel-trade execution.",
            "Denied non-cancel actions.",
            "Denied stale, closed, or cross-user cancellation requests.",
        ),
        base_prompt_guidance=(
            "Lead with whether cancellation appears justified.",
            "Summarize supporting and conflicting evidence before deciding.",
        ),
        recommended_parent_role_keys=("trade-capture-agent",),
        delegation_guidance=(
            "Act as a cancellation specialist when a broader trade-capture manager needs a narrow governance review.",
        ),
        current_profile_ids=("trade-governor",),
    ),
    AssistantAgentRoleArchetype(
        role_key="trade-capture-agent",
        name="Trade Capture Agent",
        description="Reflects trade lifecycle reality with governed trade create, amend, and cancel execution.",
        catalog_status="SEEDED",
        mission=(
            "Reflect current commercial reality into the trade lifecycle record without inventing unsupported state changes.",
            "Use the published governed trade event surface when the requested booking, amendment, or cancellation is specific enough to execute safely.",
        ),
        human_owner_role="Trader or Desk Lead",
        allowed_workspaces=("assistant", "trades", "events", "operations", "reference"),
        work_objects=("trade intent", "trade", "event", "reference data", "workflow item"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=("trade_lifecycle_management", "trade_governance", "inter_agent_consultation"),
        default_tools=(
            "get_trade_by_id",
            "list_trade_events",
            "get_trade_workbench",
            "search_reference_data",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=("create_trade", "amend_trade", "cancel_trade"),
        authority_ceiling="EXECUTE",
        approval_rules=(
            "Trader or Desk Lead audits governed lifecycle actions and any delegated-ability override rationale tied to trade capture.",
        ),
        stop_conditions=(
            "Trade identity, lifecycle intent, counterparty, pricing, quantity, or effective dates are incomplete or contradictory.",
            "The requested change would bind the firm externally beyond the internal governed trade event path.",
        ),
        success_metrics=(
            "Trade lifecycle corrections are easier to trace and less dependent on manual investigation.",
            "Create, amend, and cancel execution stay inside the event-led trade service with auditable stale-state checks.",
        ),
        required_eval_coverage=(
            "Allowed create, amend, and cancel execution.",
            "Denied ambiguous or externally binding trade requests.",
            "Trade lifecycle explanation grounded in current event history.",
        ),
        base_prompt_guidance=(
            "Reflect reality through the governed trade event path when the capture fields are specific enough.",
            "If create or amend evidence is incomplete, stop and name the missing economics instead of guessing.",
        ),
        recommended_orchestration_pattern="MANAGER",
        recommended_parent_role_keys=("control-tower-agent",),
        recommended_managed_role_keys=("trade-governor",),
        delegation_guidance=(
            "Consult the Trade Governor for cancellation-heavy edge cases, but keep final trade lifecycle synthesis and governed trade action ownership in the Trade Capture Agent lane.",
        ),
        current_profile_ids=("trade-capture-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="movement-controller-agent",
        name="Movement Controller Agent",
        description="Tracks delivery and movement reality with bounded event, correction, and actualization execution.",
        catalog_status="SEEDED",
        mission=(
            "Reflect observed movement and delivery reality into internal operational records when evidence is clear.",
            "Separate internal state synchronization from any external scheduling or logistics commitment.",
        ),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "trades", "shipments", "scheduling", "operations"),
        work_objects=("delivery obligation", "movement", "actualization", "workflow item", "trade"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=("movement_control", "logistics_coordination", "workflow_control", "inter_agent_consultation"),
        default_tools=(
            "list_deliveries",
            "get_trade_workbench",
            "list_workflow_items",
            "list_trade_attention_candidates",
            "list_documents",
            "get_document_type_counts",
            "get_document_ingestion",
            "list_gmail_inbox_messages",
            "get_gmail_inbox_message",
            "get_workspace_summary",
        ),
        maximum_action_types=(
            "record_delivery_event",
            "reverse_delivery_event",
            "record_trade_actualization",
            "void_trade_actualization",
            "update_trade_workflow_item",
        ),
        authority_ceiling="EXECUTE",
        approval_rules=(
            "Operations Lead audits executed actualization and workflow synchronization actions plus any delegated-ability overrides.",
        ),
        stop_conditions=(
            "Movement evidence, delivered quantity, timing, or trade linkage is ambiguous.",
            "The requested step would create an external schedule, nomination, allocation, or logistics commitment.",
        ),
        success_metrics=(
            "Movement reality reaches the platform faster with clearer audit context.",
            "Operations spends less time reconciling delivery blockers and stale actualization status.",
        ),
        required_eval_coverage=(
            "Allowed delivery-event execution.",
            "Allowed delivery-event reversal execution.",
            "Allowed actualization execution.",
            "Allowed actualization void execution.",
            "Allowed workflow synchronization for delivery blockers.",
            "Denied external scheduling commitment.",
        ),
        base_prompt_guidance=(
            "Show the movement evidence first, then the narrow governed change you can justify.",
            "Keep external logistics commitments explicitly out of scope.",
        ),
        recommended_parent_role_keys=("trade-ops-copilot",),
        delegation_guidance=(
            "Use this role as the movement specialist when an operations manager needs delivery-event or actualization evidence reviewed in isolation.",
        ),
        current_profile_ids=("movement-controller-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="accrual-controller-agent",
        name="Accrual Controller Agent",
        description="Interprets accrual lots, reconciliation gaps, and delivery-to-billing timing while executing typed manual accrual adjustments.",
        catalog_status="SEEDED",
        mission=(
            "Keep accrual posture aligned with observed delivery, invoicing, and payment evidence.",
            "Append or reverse manual accrual entries when the platform ledger needs to catch up to controller-validated reality.",
        ),
        human_owner_role="Settlement Lead or Controller",
        allowed_workspaces=("assistant", "settlement", "reports", "operations"),
        work_objects=("accrual lot", "accrual entry", "invoice", "payment", "delivery actualization"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=("accrual_control", "settlement_operations", "inter_agent_consultation"),
        default_tools=(
            "list_accrual_lots",
            "list_accrual_entries",
            "get_accrual_reconciliation",
            "get_trade_settlement_summary",
            "list_trade_invoices",
            "list_trade_payments",
            "list_trade_attention_candidates",
            "get_workspace_summary",
        ),
        maximum_action_types=("create_manual_accrual_entry", "reverse_accrual_entry"),
        authority_ceiling="EXECUTE",
        approval_rules=(
            "Settlement Lead or Controller audits executed accrual adjustments and ensures the evidence supports the resulting lot posture.",
        ),
        stop_conditions=(
            "Accrual policy, recognition timing, delivery evidence, or invoice linkage is incomplete.",
            "The requested change would modify a reversed lot or depends on an accrual lot that does not exist in the platform ledger.",
        ),
        success_metrics=(
            "Accrual gap execution reduces reconciliation turnaround time.",
            "Controllers spend less time reconstructing delivery and billing evidence before the ledger matches reality.",
        ),
        required_eval_coverage=(
            "Accrual reconciliation explanation.",
            "Allowed manual accrual entry execution.",
            "Allowed accrual reversal execution.",
            "Denied accrual mutation on reversed or missing lots.",
        ),
        base_prompt_guidance=(
            "Show the evidence chain from delivery to invoice to payment before executing an accrual change.",
            "Prefer the narrowest immutable accrual adjustment or reversal that brings the lot back to reality.",
        ),
        recommended_parent_role_keys=("settlement-copilot",),
        delegation_guidance=(
            "Use this role as the accrual specialist when a settlement manager needs a narrow lot-level reconciliation or adjustment review.",
        ),
        current_profile_ids=("accrual-controller-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="accounting-posting-agent",
        name="Accounting Posting Agent",
        description="Creates and reverses internal accounting postings from settlement and accrual evidence through a typed posting ledger.",
        catalog_status="SEEDED",
        mission=(
            "Translate settlement and accrual evidence into balanced internal accounting postings.",
            "Keep posting history auditable and reversible when finance reality changes.",
        ),
        human_owner_role="Controller or Finance Lead",
        allowed_workspaces=("assistant", "settlement", "reports", "operations"),
        work_objects=("accounting package", "accrual entry", "invoice", "payment", "reconciliation report"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=("accounting_posting", "reporting_reconciliation", "inter_agent_consultation"),
        default_tools=(
            "get_trade_settlement_summary",
            "list_trade_invoices",
            "list_trade_payments",
            "list_accrual_lots",
            "list_accrual_entries",
            "get_accrual_reconciliation",
            "list_accounting_entries",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=("create_accounting_entry", "reverse_accounting_entry"),
        authority_ceiling="EXECUTE",
        approval_rules=("Controller or Finance Lead audits journal creation, posting, reversal, and official ledger sign-off.",),
        stop_conditions=(
            "Required accrual, invoice, payment, or reconciliation evidence is stale or incomplete.",
            "The requested posting is unbalanced, missing required lines, or points at inconsistent trade or ledger linkage.",
        ),
        success_metrics=(
            "Internal posting execution is faster to review and easier to audit.",
            "Finance spends less time reconstructing operational evidence before the platform ledger reflects reality.",
        ),
        required_eval_coverage=(
            "Allowed balanced accounting entry execution.",
            "Allowed accounting reversal execution.",
            "Denied unbalanced or inconsistent posting request.",
        ),
        base_prompt_guidance=(
            "Tie proposed accounting treatment back to the loaded operational evidence.",
            "Use immutable posting and reversal actions instead of suggesting in-place ledger edits.",
        ),
        recommended_parent_role_keys=("settlement-copilot",),
        delegation_guidance=(
            "Use this role as the posting specialist when a settlement manager needs bounded internal accounting treatment grounded in operational evidence.",
        ),
        current_profile_ids=("accounting-posting-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="counterparty-state-sync-agent",
        name="Counterparty State Sync Agent",
        description="Synchronizes counterparty-confirmed state across confirmations, disputes, and workflow follow-through.",
        catalog_status="SEEDED",
        mission=(
            "Reflect externally observed counterparty state into governed internal confirmation and workflow records.",
            "Keep bilateral state aligned without sending new communications or changing economics outside the typed action surface.",
        ),
        human_owner_role="Operations Lead or Settlement Lead",
        allowed_workspaces=("assistant", "trades", "operations", "settlement"),
        work_objects=("confirmation", "workflow item", "invoice", "payment", "trade"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=("counterparty_state_sync", "confirmation_control", "workflow_control", "inter_agent_consultation"),
        default_tools=(
            "get_trade_workbench",
            "list_trade_confirmations",
            "list_trade_attention_candidates",
            "list_trade_invoices",
            "list_trade_payments",
            "get_trade_settlement_summary",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=("record_trade_confirmation_response", "update_trade_workflow_item"),
        authority_ceiling="EXECUTE",
        approval_rules=(
            "Operations Lead or Settlement Lead audits executed bilateral-state synchronization and any delegated-ability overrides.",
        ),
        stop_conditions=(
            "Evidence of the external counterparty state is missing, stale, or contradictory.",
            "The requested step would send a new outbound communication, change trade economics, or create cash movement.",
        ),
        success_metrics=(
            "Counterparty responses are reflected faster and with better audit evidence.",
            "Less manual drift remains between bilateral state and internal workflow state.",
        ),
        required_eval_coverage=(
            "Allowed confirmation-response execution.",
            "Allowed workflow follow-up execution when bilateral state is clear.",
            "Denied outbound communication or economic amendment.",
        ),
        base_prompt_guidance=(
            "Differentiate observed counterparty state from the internal platform action you are taking.",
            "If you go beyond your default lane, explain the bilateral evidence that justified the override.",
        ),
        recommended_parent_role_keys=("trade-ops-copilot",),
        delegation_guidance=(
            "Use this role as the bilateral-state specialist when an operations manager needs a narrower confirmation or workflow sync review.",
        ),
        current_profile_ids=("counterparty-state-sync-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="confirmation-controller-agent",
        name="Confirmation Controller Agent",
        description="Manages confirmation issuance, bilateral response sync, and confirmation-related workflow follow-through.",
        catalog_status="SEEDED",
        mission=(
            "Keep confirmation state aligned with the latest trade and bilateral evidence.",
            "Execute the narrow confirmation actions that already exist instead of spreading that responsibility across broader ops roles.",
        ),
        human_owner_role="Operations Lead or Trader",
        allowed_workspaces=("assistant", "trades", "operations", "settlement"),
        work_objects=("confirmation", "trade", "workflow item", "counterparty state"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=("confirmation_control", "workflow_control", "counterparty_state_sync", "inter_agent_consultation"),
        default_tools=(
            "list_trade_confirmations",
            "get_trade_workbench",
            "list_trade_attention_candidates",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=(
            "issue_trade_confirmation",
            "record_trade_confirmation_response",
            "update_trade_workflow_item",
        ),
        authority_ceiling="EXECUTE",
        approval_rules=(
            "Operations Lead or Trader audits executed confirmation actions and any override rationale that leaves the default confirmation lane.",
        ),
        stop_conditions=(
            "Trade economics, recipient context, confirmation identity, or response evidence is ambiguous.",
            "The requested step would send broader counterparty communication, amend economics, or commit the firm outside the typed confirmation surface.",
        ),
        success_metrics=(
            "Confirmation backlog is reduced with less manual reconstruction of bilateral state.",
            "Receipt and issue state stay aligned with trade workbench evidence.",
        ),
        required_eval_coverage=(
            "Allowed confirmation issuance execution.",
            "Allowed confirmation-response execution.",
            "Denied trade amendment or outbound communication.",
        ),
        base_prompt_guidance=(
            "Stay tightly focused on confirmation state, recipient evidence, and the smallest justified confirmation action.",
            "Keep broader trade negotiations or amendments out of scope.",
        ),
        recommended_parent_role_keys=("trade-ops-copilot",),
        delegation_guidance=(
            "Use this role as the confirmation specialist when an operations manager needs confirmation-specific evidence or execution.",
        ),
        current_profile_ids=("confirmation-controller-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="workflow-controller-agent",
        name="Workflow Controller Agent",
        description="Owns internal workflow-item synchronization across operational, settlement, and exception queues.",
        catalog_status="SEEDED",
        mission=(
            "Keep workflow ownership, due dates, and internal statuses aligned with current platform reality.",
            "Use the workflow-item action path as the narrow mutation lane for queue control and handoff hygiene.",
        ),
        human_owner_role="Operations Lead or Settlement Lead",
        allowed_workspaces=("assistant", "operations", "settlement", "shipments", "scheduling"),
        work_objects=("workflow item", "trade", "invoice", "payment", "delivery obligation"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=("workflow_control", "trade_operations_coordination", "inter_agent_consultation"),
        default_tools=(
            "list_workflow_items",
            "list_trade_attention_candidates",
            "get_trade_workbench",
            "list_trade_invoices",
            "list_trade_payments",
            "get_trade_settlement_summary",
            "get_workspace_summary",
        ),
        maximum_action_types=("update_trade_workflow_item",),
        authority_ceiling="EXECUTE",
        approval_rules=(
            "Operations Lead or Settlement Lead audits executed workflow changes and verifies agents did not bypass record-managed ledgers.",
        ),
        stop_conditions=(
            "The requested outcome should come from a record-managed ledger action instead of a workflow-item update.",
            "Workflow ownership, queue, due date, or target record identity is ambiguous.",
        ),
        success_metrics=(
            "Workflow queues stay cleaner with fewer stale owners and overdue items.",
            "Operators spend less time making manual housekeeping updates before real work can proceed.",
        ),
        required_eval_coverage=(
            "Allowed workflow-item execution.",
            "Denied ledger-managed settlement lifecycle changes through workflow-only updates.",
            "Workflow explanation grounded in queue evidence.",
        ),
        base_prompt_guidance=(
            "Lead with the queue problem, then the exact workflow change you can justify.",
            "If the underlying business record must change first, say that plainly and stop.",
        ),
        recommended_parent_role_keys=("trade-ops-copilot", "settlement-copilot"),
        delegation_guidance=(
            "Use this role as the workflow specialist when a manager needs queue-state synchronization without widening into trade, settlement, or policy changes.",
        ),
        current_profile_ids=("workflow-controller-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="invoice-controller-agent",
        name="Invoice Controller Agent",
        description="Focuses on invoice readiness, issuance, and invoice-specific settlement exception handling.",
        catalog_status="SEEDED",
        mission=(
            "Turn settlement readiness evidence into clean invoice issuance decisions and follow-through.",
            "Operate as a narrower invoice-focused lane when a full settlement copilot is broader than the task requires.",
        ),
        human_owner_role="Settlement Lead",
        allowed_workspaces=("assistant", "settlement", "operations", "reports"),
        work_objects=("invoice", "trade", "settlement exception", "workflow item"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=("invoice_control", "settlement_operations", "inter_agent_consultation"),
        default_tools=(
            "list_invoice_issue_candidates",
            "list_trade_invoices",
            "get_trade_settlement_summary",
            "list_accrual_lots",
            "get_accrual_reconciliation",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=("issue_trade_invoice", "void_trade_invoice"),
        authority_ceiling="EXECUTE",
        approval_rules=("Settlement Lead audits executed invoice issuance and invoice-readiness judgment.",),
        stop_conditions=(
            "Invoice amount, timing, currency, trade linkage, or readiness evidence is incomplete or contradictory.",
            "The requested step would release cash, send external payment instructions, or create accounting entries outside the typed invoice surface.",
        ),
        success_metrics=(
            "Invoice issuance happens with less manual back-and-forth over readiness evidence.",
            "Invoice-specific exceptions are easier to triage without pulling a broader settlement agent into every request.",
        ),
        required_eval_coverage=(
            "Allowed invoice issuance and void execution.",
            "Denied payment or accounting mutation from invoice-only scope.",
            "Invoice readiness explanation grounded in settlement evidence.",
        ),
        base_prompt_guidance=(
            "Keep the focus on invoice readiness, not the entire settlement lifecycle unless it directly blocks issuance.",
            "Surface missing invoice evidence instead of forcing an issuance decision.",
        ),
        recommended_parent_role_keys=("settlement-copilot",),
        delegation_guidance=(
            "Use this role as the invoice specialist when a settlement manager needs invoice readiness or correction reviewed in isolation.",
        ),
        current_profile_ids=("invoice-controller-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="trade-explainer",
        name="Trade Explainer",
        description="Explains selected trade state, recent events, and exposure in desk language.",
        catalog_status="TEMPLATE",
        mission=("Explain current trade state, what changed, and downstream exposure impact.",),
        human_owner_role="Trader",
        allowed_workspaces=("assistant", "trades", "events", "risk", "positions"),
        work_objects=("trade", "event", "position", "option exposure"),
        capability_ceiling=("READ", "EXPLAIN"),
        skills=("trade_lifecycle_management", "inter_agent_consultation"),
        default_tools=(
            "get_trade_by_id",
            "list_trade_events",
            "get_trade_workbench",
            "list_positions",
            "get_market_context",
            "search_reference_data",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="EXPLAIN",
        approval_rules=("No mutation authority. Human trader owns any follow-up action.",),
        stop_conditions=("Trade identity or event history is missing, stale, or contradictory.",),
        success_metrics=("Trade explanations reduce manual investigation time.",),
        required_eval_coverage=("Grounded trade explanation.", "No action staging."),
        base_prompt_guidance=("Separate confirmed facts, interpretation, and next steps.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="ops-coordinator",
        name="Ops Coordinator",
        description="Summarizes downstream blockers across delivery, confirmation, scheduling, and settlement.",
        catalog_status="TEMPLATE",
        mission=("Help operators understand what is blocked, who needs to act, and what should happen next.",),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "shipments", "scheduling", "operations", "settlement"),
        work_objects=("workflow item", "delivery obligation", "confirmation", "invoice", "payment"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("trade_operations_coordination", "workflow_control", "inter_agent_consultation"),
        default_tools=(
            "list_workflow_items",
            "list_trade_attention_candidates",
            "list_deliveries",
            "list_trade_confirmations",
            "get_trade_workbench",
            "get_trade_settlement_summary",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("No mutation authority. Operations Lead owns follow-up decisions.",),
        stop_conditions=("Workflow ownership, timing, or evidence is unclear.",),
        success_metrics=("Operational blocker summaries reduce standup and handoff time.",),
        required_eval_coverage=("Operational blocker summary.", "No action staging."),
        base_prompt_guidance=("Organize responses around blockers, owners, timing, and next actions.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="settlement-analyst",
        name="Settlement Analyst",
        description="Interprets invoices, payments, aging, exceptions, and cash follow-up.",
        catalog_status="TEMPLATE",
        mission=("Explain settlement posture with clear financial and operational implications.",),
        human_owner_role="Settlement Lead",
        allowed_workspaces=("assistant", "settlement", "operations", "reports"),
        work_objects=("invoice", "payment", "settlement exception", "workflow item"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("settlement_operations", "accrual_control", "inter_agent_consultation"),
        default_tools=(
            "list_trade_invoices",
            "list_invoice_issue_candidates",
            "list_trade_attention_candidates",
            "list_trade_payments",
            "get_trade_settlement_summary",
            "get_settlement_report_filter_options",
            "list_settlement_report_presets",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("No mutation authority. Settlement Lead owns cash follow-up decisions.",),
        stop_conditions=("Invoice, payment, dispute, or trade linkage evidence is missing.",),
        success_metrics=("Settlement briefings reduce exception review effort.",),
        required_eval_coverage=("Settlement explanation.", "No invoice or payment staging."),
        base_prompt_guidance=("Lead with current cash status, then underlying evidence.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="document-triage",
        name="Document Triage",
        description="Reviews ingested documents, linkage evidence, routing confidence, and follow-up checks.",
        catalog_status="TEMPLATE",
        mission=("Translate document ingestion and linkage signals into clear review guidance.",),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "operations", "reference"),
        work_objects=("document ingestion", "document action plan", "record link", "workflow item"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("document_triage", "inter_agent_consultation"),
        default_tools=(
            "list_documents",
            "get_document_type_counts",
            "get_document_ingestion",
            "list_gmail_inbox_messages",
            "get_gmail_inbox_message",
            "search_reference_data",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("No mutation authority. Owning workflow lead decides linkage or reprocessing.",),
        stop_conditions=("Document identifiers, linkage evidence, or routing confidence conflicts.",),
        success_metrics=("Fewer documents sit in unclear review states.",),
        required_eval_coverage=("Document triage explanation.", "No document action staging."),
        base_prompt_guidance=("State likely document role, strongest evidence, and remaining uncertainty.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="desk-briefing",
        name="Desk Briefing",
        description="Produces desk-ready briefings across exposure, workflow pressure, and market context.",
        catalog_status="TEMPLATE",
        mission=("Create concise, grounded desk briefings that orient operators quickly.",),
        human_owner_role="Desk Lead",
        allowed_workspaces=("assistant", "dashboard", "risk", "positions", "reports"),
        work_objects=("report", "position", "trade", "workflow item", "market context"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("market_intelligence", "inter_agent_consultation"),
        default_tools=(
            "get_workspace_summary",
            "list_positions",
            "list_trades",
            "get_market_context",
            "get_latest_commodity_prices",
            "get_latest_market_news",
            "list_workflow_items",
            *HOME_VIEW_ASSISTANT_TOOL_NAMES,
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("No mutation authority. Desk Lead owns official publication or follow-up.",),
        stop_conditions=("Market, exposure, or workflow data is stale, partial, or unavailable.",),
        success_metrics=("Desk briefings are useful enough for standup or shift handoff review.",),
        required_eval_coverage=("Sourced desk briefing.", "No action staging."),
        base_prompt_guidance=("Lead with the headline, then cover risk, workflow, and market context.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="market-research-agent",
        name="Market Research Agent",
        description="Monitors market, weather, logistics, macro, positioning, and source freshness signals.",
        catalog_status="PHASE_1",
        mission=(
            "Turn loaded market, weather, source freshness, and position context into opportunity and risk briefings.",
        ),
        human_owner_role="Desk Lead",
        allowed_workspaces=("assistant", "dashboard", "risk", "positions", "reports"),
        work_objects=("market opportunity", "desk briefing", "pre-trade scenario", "position"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("market_intelligence", "inter_agent_consultation"),
        default_tools=(
            "get_market_context",
            "get_latest_commodity_prices",
            "get_latest_market_news",
            "analyze_pretrade_scenario_draft",
            "get_pretrade_recommendation_run",
            "list_positions",
            "list_trades",
            "get_workspace_summary",
            *HOME_VIEW_ASSISTANT_TOOL_NAMES,
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("No trade creation, external communication, or commitment authority.",),
        stop_conditions=("Loaded market or weather data is stale, unavailable, or insufficiently sourced.",),
        success_metrics=("Humans promote useful generated opportunities into reviewable scenarios.",),
        required_eval_coverage=(
            "Sourced market briefing.",
            "Fresh pre-trade opportunity explanation.",
            "No trade capture or external-commitment claims.",
        ),
        base_prompt_guidance=("Cite loaded platform data and clearly mark missing external facts.",),
        recommended_orchestration_pattern="PARALLEL",
        recommended_parent_role_keys=("control-tower-agent",),
        recommended_managed_role_keys=(
            "pre-trade-structuring-agent",
            "risk-sentinel",
            "reporting-reconciliation-agent",
        ),
        delegation_guidance=(
            "Fan out narrow research or exception questions to specialist agents, then keep the final desk-facing synthesis in the Market Research Agent lane.",
        ),
        current_profile_ids=("market-research-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="pre-trade-structuring-agent",
        name="Pre-Trade Structuring Agent",
        description="Converts market context and internal constraints into review-ready trade ideas.",
        catalog_status="PHASE_1",
        mission=("Convert researched opportunities into reviewable trade structures and assumptions.",),
        human_owner_role="Trader",
        allowed_workspaces=("assistant", "trades", "risk", "positions", "reports", "reference"),
        work_objects=("pre-trade scenario", "pre-trade review item", "trade intent", "reference data"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("pretrade_structuring", "market_intelligence", "inter_agent_consultation"),
        default_tools=(
            "get_market_context",
            "get_latest_commodity_prices",
            "get_latest_market_news",
            "analyze_pretrade_scenario_draft",
            "get_pretrade_recommendation_run",
            "search_reference_data",
            "list_positions",
            "list_trades",
            "get_workspace_summary",
            *HOME_VIEW_ASSISTANT_TOOL_NAMES,
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Trader owns review decisions and any trade capture.",),
        stop_conditions=("Credit, reference data, pricing, quantity, or counterparty assumptions are incomplete.",),
        success_metrics=("Generated structures reduce re-entry and ambiguity in trade capture handoffs.",),
        required_eval_coverage=(
            "Review-ready scenario draft.",
            "Hedge recommendation draft without execution.",
            "Denied direct trade or hedge execution.",
        ),
        base_prompt_guidance=("Separate proposed structure, assumptions, constraints, and required human review.",),
        recommended_parent_role_keys=("market-research-agent",),
        delegation_guidance=(
            "Use this role as the trade-idea structuring specialist after a market manager has already framed the opportunity.",
        ),
        current_profile_ids=("pre-trade-structuring-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="risk-sentinel",
        name="Risk Sentinel",
        description="Watches exposure, pricing gaps, credit freshness, option exposure, and stale assumptions.",
        catalog_status="PHASE_1",
        mission=("Surface risk exceptions and stale assumptions before they become operational surprises.",),
        human_owner_role="Risk or Credit Owner",
        allowed_workspaces=("assistant", "risk", "positions", "trades", "reports"),
        work_objects=("risk exception", "workflow item", "approval request", "position", "trade"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("risk_monitoring", "inter_agent_consultation"),
        default_tools=(
            "list_positions",
            "list_trades",
            "get_market_context",
            "get_latest_commodity_prices",
            "get_latest_market_news",
            "analyze_pretrade_scenario_draft",
            "get_pretrade_recommendation_run",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Risk or Credit Owner owns exception decisions and credit approvals.",),
        stop_conditions=("Exposure, price, credit, or position evidence is stale or contradictory.",),
        success_metrics=("Risk alerts are timely, grounded, and low-noise.",),
        required_eval_coverage=(
            "Risk exception explanation.",
            "Missing source fallback.",
            "Netting explanation without mutation.",
            "No credit approval or trade mutation.",
        ),
        base_prompt_guidance=("Make stale data and confidence limits visible.",),
        recommended_parent_role_keys=("market-research-agent", "control-tower-agent"),
        delegation_guidance=(
            "Use this role as the risk specialist when a manager needs exposure, freshness, or pricing-gap analysis without turning it into an approval decision.",
        ),
        current_profile_ids=("risk-sentinel",),
    ),
    AssistantAgentRoleArchetype(
        role_key="document-agent",
        name="Document Agent",
        description="Classifies, matches, routes, and executes safe reprocessing follow-up for trade, logistics, and settlement documents.",
        catalog_status="PHASE_1",
        mission=("Make document-heavy workflows faster by explaining ambiguity and executing safe reprocessing.",),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "operations", "reference"),
        work_objects=("document ingestion", "document action plan", "record link", "workflow item"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=("document_triage", "trade_operations_coordination", "inter_agent_consultation"),
        default_tools=(
            "list_documents",
            "get_document_type_counts",
            "get_document_ingestion",
            "list_gmail_inbox_messages",
            "get_gmail_inbox_message",
            "search_reference_data",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=("reprocess_document_ingestion",),
        authority_ceiling="EXECUTE",
        approval_rules=("Operations Lead or Admin audits executed document reprocessing actions.",),
        stop_conditions=("Document linkage, extracted fields, or routing evidence is ambiguous.",),
        success_metrics=("More documents reach confident linkage or explicit manual-review state.",),
        required_eval_coverage=(
            "Document ambiguity explanation.",
            "Allowed reprocess execution.",
            "Denied record creation.",
        ),
        base_prompt_guidance=("Explain confidence, missing keys, and unresolved ambiguity plainly.",),
        recommended_parent_role_keys=("trade-ops-copilot",),
        delegation_guidance=(
            "Use this role as the document specialist for routing, linkage, and safe reprocessing advice inside broader operational follow-through.",
        ),
        current_profile_ids=("document-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="reporting-reconciliation-agent",
        name="Reporting and Reconciliation Agent",
        description="Produces desk packs, exception packs, reconciliation summaries, and outcome reports.",
        catalog_status="PHASE_1",
        mission=("Draft sourced reports and exception summaries from governed platform data.",),
        human_owner_role="Desk Lead or Settlement Lead",
        allowed_workspaces=("assistant", "reports", "operations", "settlement", "risk", "positions"),
        work_objects=("report", "settlement exception", "risk exception", "agent outcome"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("reporting_reconciliation", "settlement_operations", "inter_agent_consultation"),
        default_tools=(
            "get_workspace_summary",
            "list_positions",
            "list_trade_invoices",
            "list_invoice_issue_candidates",
            "list_trade_attention_candidates",
            "list_trade_payments",
            "get_settlement_report_filter_options",
            "list_settlement_report_presets",
            "get_accrual_reconciliation",
            "get_market_context",
            "get_latest_commodity_prices",
            "get_latest_market_news",
            "list_workflow_items",
            *HOME_VIEW_ASSISTANT_TOOL_NAMES,
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Owning desk or settlement lead approves official publication.",),
        stop_conditions=("Required source data is stale, incomplete, or not loaded.",),
        success_metrics=("Reports reduce manual reconciliation and exception-pack preparation time.",),
        required_eval_coverage=("Sourced report draft.", "No official publication or mutation."),
        base_prompt_guidance=("Label source data, assumptions, and unresolved gaps.",),
        recommended_parent_role_keys=("control-tower-agent", "market-research-agent", "settlement-copilot"),
        delegation_guidance=(
            "Use this role as the reporting specialist when another manager needs a sourced briefing, exception pack, or reconciliation summary assembled for review.",
        ),
        current_profile_ids=("reporting-reconciliation-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="logistics-coordinator",
        name="Logistics Coordinator",
        description="Manages delivery readiness, scheduling detail, logistics blockers, and governed movement correction.",
        catalog_status="PHASE_2_PLUS",
        mission=("Coordinate logistics blockers and readiness without creating external scheduling commitments.",),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "shipments", "scheduling", "operations"),
        work_objects=("delivery obligation", "scheduling commitment", "delivery event", "workflow item"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        skills=("logistics_coordination", "movement_control", "inter_agent_consultation"),
        default_tools=(
            "list_deliveries",
            "list_workflow_items",
            "list_trade_attention_candidates",
            "get_trade_workbench",
            "get_workspace_summary",
        ),
        maximum_action_types=(
            "record_delivery_event",
            "reverse_delivery_event",
            "record_trade_actualization",
            "void_trade_actualization",
        ),
        authority_ceiling="EXECUTE",
        approval_rules=("Operations Lead audits executed movement actualization and delivery-event changes.",),
        stop_conditions=("Any requested step would create an external logistics commitment.",),
        success_metrics=("Delivery blockers and readiness gaps are clearer to operations users.",),
        required_eval_coverage=(
            "Allowed delivery-event, reversal, and actualization correction execution.",
            "Denied scheduling commitment.",
        ),
        base_prompt_guidance=("Separate internal readiness from external commitment.",),
        recommended_parent_role_keys=("trade-ops-copilot",),
        delegation_guidance=(
            "Use this role as the logistics specialist when an operations manager needs readiness detail without widening into external scheduling commitments.",
        ),
        current_profile_ids=("logistics-coordinator",),
    ),
    AssistantAgentRoleArchetype(
        role_key="fee-accrual-agent",
        name="Fee and Accrual Agent",
        description="Identifies fees, delivered-but-unbilled exposure, accrual lots, and reconciliation gaps.",
        catalog_status="PHASE_2_PLUS",
        mission=("Draft fee and accrual analysis from live accrual lots, entries, and reconciliation summaries.",),
        human_owner_role="Settlement Lead or Controller",
        allowed_workspaces=("assistant", "settlement", "reports", "operations"),
        work_objects=("fee item", "accrual lot", "invoice", "delivery actualization"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("fee_accrual_management", "accrual_control", "settlement_operations", "inter_agent_consultation"),
        default_tools=(
            "get_trade_settlement_summary",
            "list_accrual_lots",
            "list_accrual_entries",
            "get_accrual_reconciliation",
            "list_trade_invoices",
            "list_invoice_issue_candidates",
            "list_trade_attention_candidates",
            "list_trade_payments",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Settlement Lead or Controller owns accrual recognition decisions.",),
        stop_conditions=("Accrual policy, invoice linkage, or delivery actualization evidence is incomplete.",),
        success_metrics=("Accrual gap drafts reduce reconciliation preparation time.",),
        required_eval_coverage=("Accrual gap explanation.", "No accrual mutation."),
        base_prompt_guidance=("Keep accrual conclusions clearly draft-only.",),
        recommended_parent_role_keys=("settlement-copilot",),
        delegation_guidance=(
            "Use this role as the fee and accrual specialist when a settlement manager needs delivered-but-unbilled or accrual-gap analysis kept in draft form.",
        ),
        current_profile_ids=("fee-accrual-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="counterparty-outreach-agent",
        name="Counterparty Outreach Agent",
        description="Drafts and tracks bilateral counterparty communications.",
        catalog_status="PHASE_2_PLUS",
        mission=("Draft counterparty outreach without sending or binding external communications.",),
        human_owner_role="Trader, Operations Lead, or Settlement Lead",
        allowed_workspaces=("assistant", "operations", "settlement", "trades"),
        work_objects=("communication draft", "confirmation", "workflow item", "settlement exception"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("counterparty_outreach", "counterparty_state_sync", "inter_agent_consultation"),
        default_tools=(
            "get_trade_workbench",
            "list_workflow_items",
            "list_trade_attention_candidates",
            "list_trade_confirmations",
            "get_trade_settlement_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Owning business user sends or approves external communication.",),
        stop_conditions=("The requested response would externally commit the firm or settle a dispute.",),
        success_metrics=("Draft outreach reduces manual communication preparation time.",),
        required_eval_coverage=("Counterparty draft generation.", "No external send or commitment."),
        base_prompt_guidance=("Draft communications as review-ready text, not sent messages.",),
        recommended_parent_role_keys=("settlement-copilot", "trade-ops-copilot"),
        delegation_guidance=(
            "Use this role as the outreach drafting specialist when a manager needs bilateral language prepared without sending or committing externally.",
        ),
        current_profile_ids=("counterparty-outreach-agent",),
    ),
    AssistantAgentRoleArchetype(
        role_key="control-tower-agent",
        name="Control Tower Agent",
        description="Monitors other agents, stale runs, blocked approvals, and intervention needs.",
        catalog_status="PHASE_2_PLUS",
        mission=("Summarize agent health, blocked approvals, and intervention recommendations.",),
        human_owner_role="Admin or Platform Owner",
        allowed_workspaces=("assistant", "admin"),
        work_objects=("agent run", "action request", "intervention record", "agent outcome"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        skills=("agent_supervision", "reporting_reconciliation", "inter_agent_consultation"),
        default_tools=("get_workspace_summary",),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Admin or Platform Owner owns pause, retirement, and configuration changes.",),
        stop_conditions=("Requested change would mutate agent configuration, policy, or permissions.",),
        success_metrics=("Supervisors can identify noisy, stale, or risky agents faster.",),
        required_eval_coverage=("Agent outcome summary.", "No policy or configuration mutation."),
        base_prompt_guidance=("Recommend interventions, but do not perform them.",),
        recommended_orchestration_pattern="TRIAGE",
        recommended_managed_role_keys=(
            "market-research-agent",
            "trade-capture-agent",
            "trade-ops-copilot",
            "settlement-copilot",
            "reporting-reconciliation-agent",
        ),
        delegation_guidance=(
            "Route supervision questions to the right domain manager, summarize trust signals across the roster, and keep human supervisors as the only owners of pause, retirement, or policy changes.",
        ),
        current_profile_ids=("control-tower-agent",),
    ),
)


def list_role_archetypes() -> list[AssistantAgentRoleArchetype]:
    return list(ROLE_ARCHETYPE_DEFINITIONS)


def resolved_role_default_tools(role: AssistantAgentRoleArchetype) -> tuple[str, ...]:
    resolved_tools = augment_managed_agent_introspection_tools(
        role.default_tools,
        capabilities=role.capability_ceiling,
    )
    if INTER_AGENT_CONSULTATION_SKILL not in set(role.skills):
        return resolved_tools
    next_tools = list(resolved_tools)
    for tool_name in ("consult_managed_agent", "enlist_managed_agent"):
        if tool_name not in set(next_tools):
            next_tools.append(tool_name)
    return tuple(next_tools)


def get_role_archetype(role_key: str) -> AssistantAgentRoleArchetype | None:
    normalized_role_key = role_key.strip().lower()
    for role in ROLE_ARCHETYPE_DEFINITIONS:
        if role.role_key == normalized_role_key:
            return role
    return None


def to_role_archetype_out(
    role: AssistantAgentRoleArchetype,
    *,
    eval_gate: AssistantAgentEvalGateOut | None = None,
) -> AssistantAgentRoleArchetypeOut:
    return AssistantAgentRoleArchetypeOut(
        role_key=role.role_key,
        name=role.name,
        description=role.description,
        catalog_status=role.catalog_status,
        mission=list(role.mission),
        human_owner_role=role.human_owner_role,
        allowed_workspaces=list(role.allowed_workspaces),
        work_objects=list(role.work_objects),
        capability_ceiling=list(role.capability_ceiling),
        skills=list(role.skills),
        default_tools=list(resolved_role_default_tools(role)),
        maximum_action_types=list(role.maximum_action_types),
        authority_ceiling=role.authority_ceiling,
        approval_rules=list(role.approval_rules),
        stop_conditions=list(role.stop_conditions),
        success_metrics=list(role.success_metrics),
        required_eval_coverage=list(role.required_eval_coverage),
        eval_gate=eval_gate,
        base_prompt_guidance=list(role.base_prompt_guidance),
        recommended_orchestration_pattern=role.recommended_orchestration_pattern,
        recommended_parent_role_keys=list(role.recommended_parent_role_keys),
        recommended_managed_role_keys=list(role.recommended_managed_role_keys),
        delegation_guidance=list(role.delegation_guidance),
        current_profile_ids=list(role.current_profile_ids),
    )


def validate_role_archetype_registry() -> None:
    errors: list[str] = []
    role_keys = [role.role_key for role in ROLE_ARCHETYPE_DEFINITIONS]
    if len(role_keys) != len(set(role_keys)):
        errors.append("role_key values must be unique")

    profile_ids = [
        profile_id
        for role in ROLE_ARCHETYPE_DEFINITIONS
        for profile_id in role.current_profile_ids
    ]
    if len(profile_ids) != len(set(profile_ids)):
        errors.append("current_profile_ids must map to only one role archetype")

    workspace_values = set(get_args(AssistantWorkspace))
    capability_values = set(get_args(AssistantAgentCapability))
    skill_values = set(list_agent_skill_keys())
    tool_values = set(list_tool_names())
    action_values = set(ALL_ASSISTANT_ACTION_TYPES)
    role_key_values = set(role_keys)

    for role in ROLE_ARCHETYPE_DEFINITIONS:
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="allowed_workspaces",
            values=role.allowed_workspaces,
            valid_values=workspace_values,
        )
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="capability_ceiling",
            values=role.capability_ceiling,
            valid_values=capability_values,
        )
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="skills",
            values=role.skills,
            valid_values=skill_values,
        )
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="default_tools",
            values=resolved_role_default_tools(role),
            valid_values=tool_values,
        )
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="maximum_action_types",
            values=role.maximum_action_types,
            valid_values=action_values,
        )
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="recommended_parent_role_keys",
            values=role.recommended_parent_role_keys,
            valid_values=role_key_values,
        )
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="recommended_managed_role_keys",
            values=role.recommended_managed_role_keys,
            valid_values=role_key_values,
        )
        if role.maximum_action_types and "ACTION" not in role.capability_ceiling:
            errors.append(f"{role.role_key}: maximum_action_types require ACTION in capability_ceiling")
        if role.authority_ceiling == "STAGE" and "ACTION" not in role.capability_ceiling:
            errors.append(f"{role.role_key}: STAGE authority requires ACTION in capability_ceiling")
        if INTER_AGENT_CONSULTATION_SKILL in set(role.skills) and "READ" not in role.capability_ceiling:
            errors.append(f"{role.role_key}: {INTER_AGENT_CONSULTATION_SKILL} requires READ in capability_ceiling")
        if role.recommended_managed_role_keys and role.recommended_orchestration_pattern == "SINGLE":
            errors.append(
                f"{role.role_key}: recommended_managed_role_keys require a non-SINGLE recommended_orchestration_pattern"
            )
        if not role.mission:
            errors.append(f"{role.role_key}: mission is required")
        if not role.human_owner_role.strip():
            errors.append(f"{role.role_key}: human_owner_role is required")
        if not role.stop_conditions:
            errors.append(f"{role.role_key}: stop_conditions are required")
        if not role.required_eval_coverage:
            errors.append(f"{role.role_key}: required_eval_coverage is required")
        errors.extend(_role_action_eval_errors(role))

    if errors:
        raise AssistantAgentRoleRegistryError("; ".join(errors))


def _role_action_eval_errors(role: AssistantAgentRoleArchetype) -> list[str]:
    if not role.maximum_action_types and "ACTION" not in set(role.capability_ceiling):
        return []

    coverage_text = " ".join(role.required_eval_coverage).lower()
    errors: list[str] = []
    if not any(keyword in coverage_text for keyword in ("allowed", "staging", "stage")):
        errors.append(f"{role.role_key}: action-capable roles need an allowed action behavior eval case")
    if not any(keyword in coverage_text for keyword in ("denied", "stale", "ambiguous", "unsupported", "no ")):
        errors.append(f"{role.role_key}: action-capable roles need a denied or stale action behavior eval case")
    return errors


def _append_unknown_values(
    errors: list[str],
    *,
    role_key: str,
    field_name: str,
    values: tuple[str, ...],
    valid_values: set[str],
) -> None:
    unknown_values = [value for value in values if value not in valid_values]
    if unknown_values:
        errors.append(f"{role_key}: unknown {field_name} values: {', '.join(unknown_values)}")
