from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AssistantActionCatalogEntry:
    name: str
    label: str
    description: str
    policy_key: str
    risk_level: str
    max_scope: str
    reviewer_roles: tuple[str, ...]
    workspaces: tuple[str, ...]
    planner_priority: int
    approval_required: bool = True


ASSISTANT_ACTION_CATALOG: tuple[AssistantActionCatalogEntry, ...] = (
    AssistantActionCatalogEntry(
        name="create_trade",
        label="Create trade",
        description=(
            "Create a new trade through the canonical event-led trade service when the user is reflecting a "
            "real-world booking with sufficiently structured economics."
        ),
        policy_key="assistant.actions.trade_create.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("TRADER", "DESK_LEAD", "ADMIN"),
        workspaces=("assistant", "trades", "events", "admin"),
        planner_priority=12,
    ),
    AssistantActionCatalogEntry(
        name="amend_trade",
        label="Amend trade",
        description=(
            "Amend an existing trade through the canonical event-led trade service when the requested economics "
            "or lifecycle fields are specific and grounded in current state."
        ),
        policy_key="assistant.actions.trade_amend.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("TRADER", "DESK_LEAD", "ADMIN"),
        workspaces=("assistant", "trades", "events", "admin"),
        planner_priority=14,
    ),
    AssistantActionCatalogEntry(
        name="cancel_trade",
        label="Cancel trade",
        description=(
            "Cancel a trade through the approval queue when the user explicitly requests an unwind or void "
            "and the live trade evidence supports it."
        ),
        policy_key="assistant.actions.cancel_trade.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "trades", "admin"),
        planner_priority=10,
    ),
    AssistantActionCatalogEntry(
        name="record_delivery_event",
        label="Record delivery event",
        description=(
            "Log a governed delivery movement event when the user is synchronizing the internal record to match "
            "observed logistics execution."
        ),
        policy_key="assistant.actions.delivery_event.v1",
        risk_level="MEDIUM",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "operations", "shipments", "scheduling", "admin"),
        planner_priority=34,
    ),
    AssistantActionCatalogEntry(
        name="reverse_delivery_event",
        label="Reverse delivery event",
        description=(
            "Reverse a previously logged delivery movement event through an append-only correction record when the "
            "existing event no longer reflects reality."
        ),
        policy_key="assistant.actions.delivery_event_reverse.v1",
        risk_level="MEDIUM",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "operations", "shipments", "scheduling", "admin"),
        planner_priority=35,
    ),
    AssistantActionCatalogEntry(
        name="create_manual_accrual_entry",
        label="Create manual accrual entry",
        description=(
            "Append a manual accrual adjustment entry on an existing accrual lot when the controller needs the "
            "ledger to reflect delivered or billing evidence that the system-managed accrual sync does not cover."
        ),
        policy_key="assistant.actions.accrual_manual_create.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "settlement", "reports", "operations", "admin"),
        planner_priority=44,
    ),
    AssistantActionCatalogEntry(
        name="reverse_accrual_entry",
        label="Reverse accrual entry",
        description=(
            "Reverse a prior manual accrual entry through an immutable offsetting ledger entry when the recorded "
            "accrual adjustment no longer reflects reality."
        ),
        policy_key="assistant.actions.accrual_manual_reverse.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "settlement", "reports", "operations", "admin"),
        planner_priority=46,
    ),
    AssistantActionCatalogEntry(
        name="issue_trade_confirmation",
        label="Issue confirmation",
        description=(
            "Issue a trade confirmation for a selected trade when operations is ready to send it for review "
            "or acknowledgement."
        ),
        policy_key="assistant.actions.trade_confirmation.v1",
        risk_level="MEDIUM",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "operations", "admin"),
        planner_priority=20,
    ),
    AssistantActionCatalogEntry(
        name="record_trade_confirmation_response",
        label="Record confirmation response",
        description=(
            "Capture a received confirmation response such as agreed, disputed, or acknowledged when the "
            "outcome is supported by the current workflow context."
        ),
        policy_key="assistant.actions.confirmation_response.v1",
        risk_level="MEDIUM",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "operations", "admin"),
        planner_priority=40,
    ),
    AssistantActionCatalogEntry(
        name="update_trade_workflow_item",
        label="Update workflow item",
        description=(
            "Reassign, reprioritize, close, or otherwise update a workflow item when the requested change is "
            "specific and grounded in the open queue state."
        ),
        policy_key="assistant.actions.workflow_update.v1",
        risk_level="MEDIUM",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "operations", "settlement", "admin"),
        planner_priority=30,
    ),
    AssistantActionCatalogEntry(
        name="record_trade_actualization",
        label="Record trade actualization",
        description=(
            "Record or update executed physical-delivery actualization quantities when the user is reflecting "
            "real-world movement completion in the system of record."
        ),
        policy_key="assistant.actions.trade_actualization.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "operations", "shipments", "admin"),
        planner_priority=36,
    ),
    AssistantActionCatalogEntry(
        name="void_trade_actualization",
        label="Void trade actualization",
        description=(
            "Void a mistaken physical-delivery actualization through the governed actualization service when the "
            "platform should stop treating that recorded quantity as live execution state."
        ),
        policy_key="assistant.actions.trade_actualization_void.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "operations", "shipments", "admin"),
        planner_priority=37,
    ),
    AssistantActionCatalogEntry(
        name="issue_trade_invoice",
        label="Issue invoice",
        description=(
            "Create or issue a trade invoice through approval when settlement evidence supports the amount, "
            "timing, and trade linkage."
        ),
        policy_key="assistant.actions.invoice_issue.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "settlement", "admin"),
        planner_priority=50,
    ),
    AssistantActionCatalogEntry(
        name="void_trade_invoice",
        label="Void invoice",
        description=(
            "Void an existing invoice through the governed settlement service when the internal record should no "
            "longer claim that invoice as a live settlement obligation."
        ),
        policy_key="assistant.actions.invoice_void.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "settlement", "admin"),
        planner_priority=55,
    ),
    AssistantActionCatalogEntry(
        name="create_trade_payment",
        label="Create payment",
        description=(
            "Record a trade payment through approval when the payment details are sufficiently specified and "
            "tied to the correct trade or invoice."
        ),
        policy_key="assistant.actions.payment_create.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "settlement", "admin"),
        planner_priority=60,
    ),
    AssistantActionCatalogEntry(
        name="reverse_trade_payment",
        label="Reverse payment",
        description=(
            "Reverse an applied payment through an offsetting payment ledger entry when the recorded cash receipt "
            "no longer reflects reality."
        ),
        policy_key="assistant.actions.payment_reverse.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "settlement", "admin"),
        planner_priority=62,
    ),
    AssistantActionCatalogEntry(
        name="create_accounting_entry",
        label="Create accounting entry",
        description=(
            "Create a balanced internal accounting posting tied to the relevant trade, accrual, invoice, or "
            "payment evidence when the platform needs to reflect controller-approved ledger reality."
        ),
        policy_key="assistant.actions.accounting_entry_create.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "settlement", "reports", "operations", "admin"),
        planner_priority=64,
    ),
    AssistantActionCatalogEntry(
        name="reverse_accounting_entry",
        label="Reverse accounting entry",
        description=(
            "Reverse an existing internal accounting posting with an offsetting balanced entry when the original "
            "posting no longer matches the intended accounting state."
        ),
        policy_key="assistant.actions.accounting_entry_reverse.v1",
        risk_level="HIGH",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "settlement", "reports", "operations", "admin"),
        planner_priority=66,
    ),
    AssistantActionCatalogEntry(
        name="reprocess_document_ingestion",
        label="Reprocess document ingestion",
        description=(
            "Re-run document ingestion and extraction when a document needs another pass because routing, "
            "classification, or linkage signals look incomplete."
        ),
        policy_key="assistant.actions.document_reprocess.v1",
        risk_level="MEDIUM",
        max_scope="TEAM",
        reviewer_roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "admin"),
        planner_priority=70,
    ),
)

ASSISTANT_ACTION_CATALOG_BY_NAME: dict[str, AssistantActionCatalogEntry] = {
    entry.name: entry for entry in ASSISTANT_ACTION_CATALOG
}
ALL_CATALOG_ACTION_TYPES: tuple[str, ...] = tuple(entry.name for entry in ASSISTANT_ACTION_CATALOG)
