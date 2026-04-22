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
