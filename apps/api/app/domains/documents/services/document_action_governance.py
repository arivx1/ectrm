from __future__ import annotations

from dataclasses import asdict, dataclass

from apps.api.app.schemas.document import (
    DocumentActionPlanOut,
    DocumentLinkageAssessmentOut,
    DocumentRecordLinkOut,
)

FINANCIAL_OPERATIONS = {
    "create_trade_confirmation",
    "issue_trade_invoice",
    "create_trade_payment",
}

OPERATIONAL_MUTATION_OPERATIONS = {
    "create_delivery_from_document",
    "record_delivery_event_from_document",
}


@dataclass(frozen=True)
class DocumentActionGovernance:
    status: str
    recommended_execution_mode: str
    manual_execution_allowed: bool
    auto_execution_allowed: bool
    approval_required: bool
    risk_flags: list[str]
    reasons: list[str]

    def to_snapshot(self) -> dict[str, object]:
        return asdict(self)


def build_document_action_governance(
    *,
    action_plan: DocumentActionPlanOut,
    linkage_assessment: DocumentLinkageAssessmentOut,
    record_links: list[DocumentRecordLinkOut] | None = None,
) -> DocumentActionGovernance:
    existing_links = record_links or []
    risk_flags: list[str] = []
    reasons: list[str] = []

    if _already_applied(action_plan, existing_links):
        return DocumentActionGovernance(
            status="ALREADY_APPLIED",
            recommended_execution_mode="NONE",
            manual_execution_allowed=False,
            auto_execution_allowed=False,
            approval_required=False,
            risk_flags=["ALREADY_APPLIED"],
            reasons=["The document is already linked to the planned target record."],
        )

    if action_plan.status == "BLOCKED" or action_plan.action_type == "MANUAL_REVIEW":
        return DocumentActionGovernance(
            status="MANUAL_REVIEW_REQUIRED",
            recommended_execution_mode="NONE",
            manual_execution_allowed=False,
            auto_execution_allowed=False,
            approval_required=False,
            risk_flags=["PLAN_BLOCKED"],
            reasons=action_plan.reasons or linkage_assessment.reasons,
        )

    if action_plan.action_type == "CREATE_RECORD_FROM_DOCUMENT":
        risk_flags.append("CREATES_NEW_RECORD")
    if action_plan.operation_type in FINANCIAL_OPERATIONS:
        risk_flags.append("FINANCIAL_MUTATION")
    if action_plan.operation_type in OPERATIONAL_MUTATION_OPERATIONS:
        risk_flags.append("OPERATIONAL_MUTATION")

    if risk_flags:
        return DocumentActionGovernance(
            status="HUMAN_CONFIRMATION_REQUIRED",
            recommended_execution_mode="MANUAL",
            manual_execution_allowed=True,
            auto_execution_allowed=False,
            approval_required=True,
            risk_flags=risk_flags,
            reasons=[
                "The action creates or mutates operational records and should be confirmed by a human.",
                *action_plan.reasons[:3],
            ],
        )

    if action_plan.status == "READY" and linkage_assessment.confidence >= 0.9:
        return DocumentActionGovernance(
            status="AUTO_EXECUTION_ELIGIBLE",
            recommended_execution_mode="AUTO",
            manual_execution_allowed=True,
            auto_execution_allowed=True,
            approval_required=False,
            risk_flags=[],
            reasons=[
                "The document is verified and linked to a high-confidence existing record.",
                *action_plan.reasons[:3],
            ],
        )

    return DocumentActionGovernance(
        status="HUMAN_CONFIRMATION_REQUIRED",
        recommended_execution_mode="MANUAL",
        manual_execution_allowed=True,
        auto_execution_allowed=False,
        approval_required=True,
        risk_flags=["LOW_CONFIDENCE"],
        reasons=[
            "The planned action is available, but confidence is not high enough for unattended execution.",
            *action_plan.reasons[:3],
        ],
    )


def _already_applied(
    action_plan: DocumentActionPlanOut,
    record_links: list[DocumentRecordLinkOut],
) -> bool:
    target = action_plan.target
    if target is None or target.record_id is None:
        return False
    return any(
        link.record_type == target.record_type and link.record_id == target.record_id
        for link in record_links
    )
