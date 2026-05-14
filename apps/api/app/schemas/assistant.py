from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal, Optional, get_args

from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_serializer, model_validator

from apps.api.app.schemas._validation import normalize_optional_text, normalize_required_text

AssistantProvider = Literal["openai", "anthropic", "google"]
AssistantMessageRole = Literal["user", "assistant"]
AssistantToolEvidenceKind = Literal[
    "application",
    "route_group",
    "documentation",
    "schema",
    "table",
    "code_search_hit",
    "code_file",
    "agent",
    "agent_hierarchy",
]
AssistantPromptSectionSource = Literal[
    "system",
    "organization",
    "user",
    "business",
    "data",
    "tool",
    "world",
    "workspace",
    "application",
    "agent",
]
AssistantPromptSectionScope = Literal["SYSTEM", "GLOBAL", "USER", "AGENT", "REQUEST", "RUNTIME"]
AssistantPromptSectionKind = Literal["IMMUTABLE", "GENERATED", "CONFIGURABLE"]
AssistantPromptSectionFreshness = Literal["STATIC", "SESSION", "REQUEST", "LIVE"]
AssistantPromptSectionMergeStrategy = Literal["APPEND", "APPEND_IF_PRESENT"]
AssistantWorkspace = Literal[
    "dashboard",
    "guide",
    "demo",
    "trades",
    "events",
    "risk",
    "positions",
    "shipments",
    "scheduling",
    "operations",
    "settlement",
    "reports",
    "reference",
    "admin",
    "settings",
    "assistant",
]
AssistantWorkspaceSummaryTarget = Literal[
    "dashboard.attention.confirmation_backlog_count",
    "dashboard.attention.nomination_backlog_count",
    "dashboard.attention.allocation_backlog_count",
    "dashboard.attention.invoice_backlog_count",
    "dashboard.attention.overdue_payment_count",
    "dashboard.attention.stale_pricing_count",
    "dashboard.attention.incomplete_ops_data_count",
    "settlement.invoice_pending_count",
    "settlement.payment_due_count",
    "settlement.trade_exception_count",
    "trades.pending_settlement_count",
]
AssistantAgentStatus = Literal["DRAFT", "ACTIVE", "PAUSED", "RETIRED"]
AssistantAgentScope = Literal["PERSONAL", "TEAM", "ORGANIZATION"]
AssistantAgentCapability = Literal["READ", "EXPLAIN", "DRAFT", "ACTION"]
AssistantAgentSkillKey = Literal[
    "market_intelligence",
    "pretrade_structuring",
    "risk_monitoring",
    "trade_lifecycle_management",
    "trade_governance",
    "trade_operations_coordination",
    "settlement_operations",
    "movement_control",
    "accrual_control",
    "accounting_posting",
    "counterparty_state_sync",
    "confirmation_control",
    "workflow_control",
    "invoice_control",
    "document_triage",
    "reporting_reconciliation",
    "logistics_coordination",
    "fee_accrual_management",
    "counterparty_outreach",
    "agent_supervision",
    "inter_agent_consultation",
]
AssistantAgentTokenBudgetStatus = Literal["GREEN", "AMBER", "RED"]
AssistantAgentTokenAllocationSource = Literal["AGENT", "DEFAULT"]
AssistantAgentRoleCatalogStatus = Literal["SEEDED", "TEMPLATE", "PHASE_1", "PHASE_2_PLUS"]
AssistantAgentProfileKind = Literal["CURATED", "ROLE_DERIVED", "CUSTOM"]
AssistantAgentOrchestrationPattern = Literal["SINGLE", "MANAGER", "TRIAGE", "PARALLEL", "EVALUATOR"]
AssistantAgentProfileRequestStatus = Literal["REQUESTED", "APPROVED", "REJECTED", "ACTIVATED"]
AssistantAgentEvalRunStatus = Literal["PASS", "FAIL", "ERROR"]
AssistantAgentAuthorityLevel = Literal["OBSERVE", "EXPLAIN", "DRAFT", "STAGE", "EXECUTE", "EXTERNAL_COMMIT"]
AssistantAgentEvalGateStatus = Literal["PASS", "BLOCKED", "NOT_REQUIRED"]
AssistantPolicyResourceType = Literal["tool", "action"]
AssistantPolicyRiskLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
AssistantActionType = Literal[
    "create_trade",
    "amend_trade",
    "cancel_trade",
    "create_settlement_report_preset",
    "record_delivery_event",
    "reverse_delivery_event",
    "create_manual_accrual_entry",
    "reverse_accrual_entry",
    "issue_trade_confirmation",
    "record_trade_confirmation_response",
    "update_trade_workflow_item",
    "record_trade_actualization",
    "void_trade_actualization",
    "issue_trade_invoice",
    "void_trade_invoice",
    "create_trade_payment",
    "reverse_trade_payment",
    "create_accounting_entry",
    "reverse_accounting_entry",
    "reprocess_document_ingestion",
]
AssistantActionRequestStatus = Literal["PENDING", "REJECTED", "EXECUTED", "FAILED"]
AssistantActionRequestLifecycleStage = Literal["AWAITING_REVIEW", "EXECUTED", "REJECTED", "FAILED"]
AssistantActionRequestLifecycleTone = Literal["attention", "success", "neutral", "danger"]
AssistantActionReviewOutcome = Literal["APPROVED_AS_IS", "APPROVED_WITH_CORRECTIONS", "REJECTED"]
AssistantOutcomeMetricRecommendationAction = Literal[
    "INSUFFICIENT_DATA",
    "KEEP_STAGED",
    "ELIGIBLE_FOR_BOUNDED_REVIEW",
    "RECOMMEND_PAUSE",
]
AssistantAutonomyReviewRecommendationAction = Literal[
    "KEEP_STAGED",
    "NARROW",
    "PAUSE",
    "ELIGIBLE_FOR_BOUNDED_REVIEW",
]
AssistantAutonomyReviewEvalStatus = Literal[
    "MISSING_EVAL_PLAN",
    "DECLARED",
    "ACTIONABLE",
]
AssistantAgentHealthWorkPackageType = Literal["POLICY", "SERVICE", "EVAL", "KNOWLEDGE_BASE"]
AssistantAgentHealthWorkPackagePriority = Literal["P1", "P2", "P3", "P4"]
AssistantAgentHealthWorkPackageStatus = Literal["CANDIDATE"]
AssistantAgentWorkPackageStatus = Literal["CANDIDATE", "ACCEPTED", "IN_PROGRESS", "IMPLEMENTED", "DISMISSED"]
AssistantRunStatus = Literal["COMPLETED", "FAILED"]
AssistantRunFeedbackRating = Literal["HELPFUL", "NEEDS_WORK"]
AssistantPromptNavigationOutcomeStatus = Literal["ACCEPTED", "DISMISSED", "FAILED"]
AssistantPromptNavigationSurface = Literal["PROMPT_HOME"]
AssistantPromptNavigationFocusType = Literal[
    "trade",
    "workflow_item",
    "document",
    "invoice",
    "payment",
    "reference_record",
    "report",
]
AssistantPromptNavigationSignal = Literal["OBSERVE", "CANDIDATE_FOR_RULE", "NARROW", "RETIRE"]
AssistantOrganizationContextSectionKey = Literal[
    "organization",
    "business-model",
    "organization-glossary",
    "organization-guardrails",
]
AssistantOrganizationContextContentKind = Literal[
    "COMPANY_PROFILE",
    "OPERATING_MODEL",
    "GLOSSARY",
    "GUARDRAIL",
    "PRINCIPLE",
    "PRODUCT_SURFACE",
]
AssistantOrganizationContextStatus = Literal["DRAFT", "PUBLISHED", "RETIRED"]
AssistantControlTowerTrustSignalType = Literal[
    "MISSING_EVAL_COVERAGE",
    "POLICY_WARNING",
    "RUN_WARNING",
    "ACTION_BACKLOG",
    "FAILED_ACTIONS",
    "STALE_WORK_PACKAGE",
]
AssistantControlTowerTrustSignalSeverity = Literal["info", "warning", "danger"]
ALL_ASSISTANT_ACTION_TYPES: tuple[str, ...] = get_args(AssistantActionType)

AGENT_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{1,63}$")
ORGANIZATION_CONTEXT_DEFINITION_KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{1,79}$")
ORGANIZATION_CONTEXT_SECTION_KIND_RULES: dict[str, tuple[str, ...]] = {
    "organization": ("COMPANY_PROFILE", "PRODUCT_SURFACE"),
    "business-model": ("OPERATING_MODEL",),
    "organization-glossary": ("GLOSSARY",),
    "organization-guardrails": ("GUARDRAIL", "PRINCIPLE"),
}


class AssistantProviderStatusOut(BaseModel):
    provider: AssistantProvider
    label: str
    enabled: bool
    configured: bool
    is_default: bool
    default_model: str
    base_url: str
    setup_env_var: str


class AssistantToolDefinitionOut(BaseModel):
    name: str
    description: str


class AssistantAgentSkillDefinitionOut(BaseModel):
    name: AssistantAgentSkillKey
    label: str
    description: str


class AssistantActionDefinitionOut(BaseModel):
    name: AssistantActionType
    label: str
    description: str


class AssistantPolicyDecisionOut(BaseModel):
    resource_type: AssistantPolicyResourceType
    resource_id: str
    policy_key: str
    allowed: bool
    reason: str
    risk_level: AssistantPolicyRiskLevel
    approval_required: bool
    max_scope: AssistantAgentScope
    roles: list[str] = Field(default_factory=list)
    workspaces: list[AssistantWorkspace] = Field(default_factory=list)


class AssistantAgentEffectivePolicyOut(BaseModel):
    allowed_tools: list[AssistantPolicyDecisionOut] = Field(default_factory=list)
    blocked_tools: list[AssistantPolicyDecisionOut] = Field(default_factory=list)
    allowed_actions: list[AssistantPolicyDecisionOut] = Field(default_factory=list)
    blocked_actions: list[AssistantPolicyDecisionOut] = Field(default_factory=list)
    policy_notes: list[str] = Field(default_factory=list)


class AssistantPolicySimulationRequest(BaseModel):
    workspace: AssistantWorkspace = "assistant"
    prompt: Optional[str] = Field(default=None, max_length=20_000)
    context: Optional[str] = Field(default=None, max_length=20_000)
    actor_role: Optional[str] = Field(default=None, max_length=64)
    phase: Literal["stage", "execute"] = "stage"

    @field_validator("prompt")
    @classmethod
    def normalize_prompt(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="prompt")

    @field_validator("context")
    @classmethod
    def normalize_context(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="context")

    @field_validator("actor_role")
    @classmethod
    def normalize_actor_role(cls, value: Optional[str]) -> Optional[str]:
        normalized = normalize_optional_text(value, field_name="actor_role")
        return normalized.upper() if normalized is not None else None


class AssistantPolicySimulationActionProposalOut(BaseModel):
    action_type: AssistantActionType
    summary: str
    description: str
    payload: dict[str, Any]
    decision: AssistantPolicyDecisionOut


class AssistantPolicySimulationOut(BaseModel):
    agent_id: str
    agent_name: str
    workspace: AssistantWorkspace
    actor_role: Optional[str]
    phase: Literal["stage", "execute"]
    effective_policy: AssistantAgentEffectivePolicyOut
    allowed_tools: list[AssistantPolicyDecisionOut] = Field(default_factory=list)
    blocked_tools: list[AssistantPolicyDecisionOut] = Field(default_factory=list)
    allowed_actions: list[AssistantPolicyDecisionOut] = Field(default_factory=list)
    blocked_actions: list[AssistantPolicyDecisionOut] = Field(default_factory=list)
    staged_action_proposals: list[AssistantPolicySimulationActionProposalOut] = Field(default_factory=list)
    staging_warnings: list[str] = Field(default_factory=list)
    simulation_notes: list[str] = Field(default_factory=list)


class AssistantVoiceTranscriptionSettingsOut(BaseModel):
    enabled: bool
    provider: AssistantProvider
    model: str
    max_upload_bytes: int
    requires_authentication: bool = True
    supported_content_types: list[str] = Field(default_factory=list)


class AssistantVoiceTranscriptionOut(BaseModel):
    provider: AssistantProvider
    model: str
    text: str


class AssistantVoiceGenerationSettingsOut(BaseModel):
    enabled: bool
    provider: AssistantProvider
    model: str
    default_voice: str
    response_format: str
    max_input_chars: int
    requires_authentication: bool = True


class AssistantVoiceSpeechRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096)

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return normalize_required_text(value, field_name="text")


class AssistantRuntimeSettingsOut(BaseModel):
    enabled: bool
    default_provider: AssistantProvider
    effective_default_provider: Optional[AssistantProvider]
    configured_provider_count: int
    default_daily_token_allocation: int
    providers: list[AssistantProviderStatusOut]
    voice_transcription: AssistantVoiceTranscriptionSettingsOut
    voice_generation: AssistantVoiceGenerationSettingsOut
    available_skills: list[AssistantAgentSkillDefinitionOut]
    available_tools: list[AssistantToolDefinitionOut]
    available_action_types: list[AssistantActionDefinitionOut]


class AssistantMessageIn(BaseModel):
    role: AssistantMessageRole
    content: str = Field(..., min_length=1, max_length=20_000)

    @field_validator("content")
    @classmethod
    def normalize_content(cls, value: str) -> str:
        return normalize_required_text(value, field_name="content")


class AssistantMessageOut(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str


class AssistantPromptContextRequest(BaseModel):
    agent_id: Optional[str] = Field(default=None, max_length=64)
    provider: Optional[AssistantProvider] = None
    workspace: Optional[AssistantWorkspace] = None
    context: Optional[str] = Field(default=None, max_length=20_000)
    summary_targets: list[AssistantWorkspaceSummaryTarget] = Field(default_factory=list, max_length=12)
    use_live_tools: bool = True

    @field_validator("agent_id")
    @classmethod
    def normalize_agent_id(cls, value: Optional[str]) -> Optional[str]:
        normalized = normalize_optional_text(value, field_name="agent_id", lowercase=True)
        if normalized is None:
            return None
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("agent_id must use lowercase letters, numbers, hyphens, or underscores")
        return normalized

    @field_validator("context")
    @classmethod
    def normalize_context(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="context")

    @field_validator("summary_targets")
    @classmethod
    def normalize_summary_targets(
        cls,
        value: list[AssistantWorkspaceSummaryTarget],
    ) -> list[AssistantWorkspaceSummaryTarget]:
        normalized = [
            normalize_required_text(target, field_name="summary_targets")
            for target in value
        ]
        return _ensure_distinct_values(normalized, field_name="summary_targets")


class AssistantPromptRequest(AssistantPromptContextRequest):
    conversation_id: Optional[int] = Field(default=None, ge=1)
    messages: list[AssistantMessageIn] = Field(..., min_length=1, max_length=40)


class AssistantUsageOut(BaseModel):
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None


class AssistantToolEvidenceOut(BaseModel):
    kind: AssistantToolEvidenceKind
    title: str
    summary: str
    locator: Optional[str] = None
    excerpt: Optional[str] = None
    badges: list[str] = Field(default_factory=list)
    metadata: dict[str, object] = Field(default_factory=dict)


class AssistantToolCallOut(BaseModel):
    tool_name: str
    summary: str
    arguments: dict[str, object] = Field(default_factory=dict)
    record_count: Optional[int] = None
    output_preview: dict[str, object] = Field(default_factory=dict)
    evidence_items: list[AssistantToolEvidenceOut] = Field(default_factory=list)


class AssistantRunFeedbackCreate(BaseModel):
    rating: AssistantRunFeedbackRating
    comment: Optional[str] = Field(default=None, max_length=2_000)

    @field_validator("comment")
    @classmethod
    def normalize_comment(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="comment")


class AssistantRunFeedbackOut(BaseModel):
    feedback_id: int
    run_id: int
    conversation_id: Optional[int] = None
    user_id: str
    user_role: str
    rating: AssistantRunFeedbackRating
    comment: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssistantPromptNavigationOutcomeCreate(BaseModel):
    surface: AssistantPromptNavigationSurface = "PROMPT_HOME"
    outcome: AssistantPromptNavigationOutcomeStatus
    intent_key: str = Field(..., min_length=1, max_length=255)
    target_view: Optional[AssistantWorkspace] = None
    target_label: Optional[str] = Field(default=None, max_length=160)
    target_rationale: Optional[str] = Field(default=None, max_length=4_000)
    focus_type: Optional[AssistantPromptNavigationFocusType] = None
    focus_id: Optional[str] = Field(default=None, max_length=128)
    focus_label: Optional[str] = Field(default=None, max_length=160)
    detail: Optional[str] = Field(default=None, max_length=2_000)

    @field_validator("intent_key")
    @classmethod
    def normalize_intent_key(cls, value: str) -> str:
        return normalize_required_text(value, field_name="intent_key")

    @field_validator("target_label")
    @classmethod
    def normalize_target_label(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="target_label")

    @field_validator("target_rationale")
    @classmethod
    def normalize_target_rationale(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="target_rationale")

    @field_validator("focus_id")
    @classmethod
    def normalize_focus_id(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="focus_id")

    @field_validator("focus_label")
    @classmethod
    def normalize_focus_label(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="focus_label")

    @field_validator("detail")
    @classmethod
    def normalize_detail(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="detail")


class AssistantPromptNavigationOutcomeOut(BaseModel):
    outcome_id: int
    run_id: Optional[int] = None
    conversation_id: Optional[int] = None
    user_id: str
    user_role: str
    surface: AssistantPromptNavigationSurface
    outcome: AssistantPromptNavigationOutcomeStatus
    intent_key: str
    target_view: Optional[AssistantWorkspace] = None
    target_label: Optional[str] = None
    target_rationale: Optional[str] = None
    focus_type: Optional[AssistantPromptNavigationFocusType] = None
    focus_id: Optional[str] = None
    focus_label: Optional[str] = None
    detail: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssistantActionReviewObjectRefOut(BaseModel):
    type: str
    id: str
    label: Optional[str] = None


class AssistantActionReviewSupportingRecordOut(AssistantActionReviewObjectRefOut):
    summary: str


class AssistantActionPreviewFieldChangeOut(BaseModel):
    field: str
    current_value: Optional[object] = None
    proposed_value: Optional[object] = None


class AssistantActionPreviewOut(BaseModel):
    preview_type: str
    status: str
    summary: str
    affected_records: list[AssistantActionReviewSupportingRecordOut] = Field(default_factory=list)
    field_changes: list[AssistantActionPreviewFieldChangeOut] = Field(default_factory=list)
    expected_side_effects: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    blocking_reasons: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    existing_invoice_count: Optional[int] = None


class AssistantActionReviewContextOut(BaseModel):
    owning_work_object: AssistantActionReviewObjectRefOut
    required_reviewer_role: str
    business_rationale: str
    proposed_mutation: dict[str, object] = Field(default_factory=dict)
    supporting_records: list[AssistantActionReviewSupportingRecordOut] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    expected_downstream_effects: list[str] = Field(default_factory=list)
    stale_state_basis: dict[str, object] = Field(default_factory=dict)
    idempotency_key: Optional[str] = None
    execution_mode: Optional[str] = None
    autonomous_execution_reason: Optional[str] = None
    delegated_ability_override_reason: Optional[str] = None
    action_preview: Optional[AssistantActionPreviewOut] = None

    @model_serializer(mode="wrap")
    def serialize_model(self, handler):
        payload = handler(self)
        if payload.get("action_preview") is None:
            payload.pop("action_preview", None)
        if payload.get("autonomous_execution_reason") is None:
            payload.pop("autonomous_execution_reason", None)
        if payload.get("delegated_ability_override_reason") is None:
            payload.pop("delegated_ability_override_reason", None)
        return payload


class AssistantActionRequestLifecycleOut(BaseModel):
    stage: AssistantActionRequestLifecycleStage
    label: str
    tone: AssistantActionRequestLifecycleTone
    is_terminal: bool
    can_approve: bool
    can_reject: bool
    reviewer_action_label: Optional[str] = None
    decided_label: Optional[str] = None
    review_risk_flags: list[str] = Field(default_factory=list)


class AssistantActionDecisionRequest(BaseModel):
    review_outcome: Optional[AssistantActionReviewOutcome] = None
    decision_note: Optional[str] = None
    correction_summary: Optional[str] = None
    correction_fields: list[str] = Field(default_factory=list)

    @field_validator("decision_note", "correction_summary")
    @classmethod
    def normalize_optional_decision_text(cls, value: Optional[str], info) -> Optional[str]:
        return normalize_optional_text(value, field_name=info.field_name)

    @field_validator("correction_fields")
    @classmethod
    def normalize_correction_fields(cls, value: list[str]) -> list[str]:
        fields: list[str] = []
        seen: set[str] = set()
        for item in value:
            normalized = normalize_optional_text(item, field_name="correction_fields")
            if normalized is None or normalized in seen:
                continue
            fields.append(normalized)
            seen.add(normalized)
        return fields


class AssistantActionRequestOut(BaseModel):
    action_request_id: int
    run_id: int
    user_id: str
    status: AssistantActionRequestStatus
    workspace: Optional[AssistantWorkspace] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    action_type: AssistantActionType
    summary: str
    description: str
    payload: dict[str, object] = Field(default_factory=dict)
    review_context: Optional[AssistantActionReviewContextOut] = None
    lifecycle: AssistantActionRequestLifecycleOut
    result: Optional[dict[str, object]] = None
    error_detail: Optional[str] = None
    review_outcome: Optional[AssistantActionReviewOutcome] = None
    decision_note: Optional[str] = None
    correction_summary: Optional[str] = None
    correction_fields: list[str] = Field(default_factory=list)
    created_at: datetime
    decided_at: Optional[datetime] = None
    decided_by: Optional[str] = None


class AssistantActionRequestAdminSummaryOut(BaseModel):
    total_count: int
    pending_count: int
    executed_count: int
    rejected_count: int
    failed_count: int
    correction_count: int = 0
    avg_decision_seconds: Optional[float] = None


class AssistantActionRequestAdminPageOut(BaseModel):
    items: list[AssistantActionRequestOut] = Field(default_factory=list)
    total_count: int
    limit: int
    offset: int
    has_more: bool
    summary: AssistantActionRequestAdminSummaryOut


class AssistantOutcomeMetricThresholdsOut(BaseModel):
    min_decided_actions_for_promotion: int
    max_rejection_rate_for_promotion: float
    max_failed_execution_rate_for_promotion: float
    max_stale_action_rate_for_promotion: float
    max_correction_rate_for_promotion: float
    max_pending_actions_for_promotion: int
    min_decided_actions_for_pause_signal: int
    rejection_rate_pause_threshold: float
    failed_execution_rate_pause_threshold: float
    stale_action_rate_pause_threshold: float
    oldest_pending_hours_pause_threshold: int
    repeated_failed_actions_pause_threshold: int
    unsupported_attempt_pause_threshold: int
    policy_drift_pause_threshold: int


class AssistantOutcomeMetricRecommendationOut(BaseModel):
    recommended_action: AssistantOutcomeMetricRecommendationAction
    promotion_candidate: bool
    pause_recommended: bool
    reasons: list[str] = Field(default_factory=list)


class AssistantOutcomeMetricCountersOut(BaseModel):
    staged_action_count: int
    pending_action_count: int
    executed_action_count: int
    rejected_action_count: int
    failed_action_count: int
    correction_count: int
    decided_action_count: int
    stale_action_count: int
    unsupported_attempt_count: int
    policy_drift_count: int
    approval_rate: Optional[float] = None
    rejection_rate: Optional[float] = None
    failed_execution_rate: Optional[float] = None
    correction_rate: Optional[float] = None
    stale_action_rate: Optional[float] = None
    avg_decision_seconds: Optional[float] = None
    oldest_pending_age_seconds: Optional[float] = None


class AssistantAgentOutcomeMetricRowOut(AssistantOutcomeMetricCountersOut):
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    agent_role_key: Optional[str] = None
    agent_profile_kind: Optional[AssistantAgentProfileKind] = None
    run_count: int
    completed_run_count: int
    failed_run_count: int
    warning_count: int
    warning_rate: Optional[float] = None
    tool_call_count: int
    tool_error_count: int
    tool_error_rate: Optional[float] = None
    helpful_feedback_count: int
    needs_work_feedback_count: int
    feedback_helpful_rate: Optional[float] = None
    recommendation: AssistantOutcomeMetricRecommendationOut


class AssistantRoleOutcomeMetricRowOut(AssistantOutcomeMetricCountersOut):
    agent_role_key: Optional[str] = None
    run_count: int
    completed_run_count: int
    failed_run_count: int
    warning_count: int
    warning_rate: Optional[float] = None
    tool_call_count: int
    tool_error_count: int
    tool_error_rate: Optional[float] = None
    recommendation: AssistantOutcomeMetricRecommendationOut


class AssistantProfileOutcomeMetricRowOut(AssistantOutcomeMetricCountersOut):
    agent_profile_kind: Optional[AssistantAgentProfileKind] = None
    run_count: int
    completed_run_count: int
    failed_run_count: int
    warning_count: int
    warning_rate: Optional[float] = None
    tool_call_count: int
    tool_error_count: int
    tool_error_rate: Optional[float] = None
    recommendation: AssistantOutcomeMetricRecommendationOut


class AssistantWorkspaceFeedbackMetricRowOut(BaseModel):
    workspace: Optional[AssistantWorkspace] = None
    run_count: int
    helpful_feedback_count: int
    needs_work_feedback_count: int
    feedback_count: int
    feedback_helpful_rate: Optional[float] = None


class AssistantRunFeedbackInsightOut(BaseModel):
    feedback_id: int
    run_id: int
    conversation_id: Optional[int] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    workspace: Optional[AssistantWorkspace] = None
    user_id: str
    user_role: str
    rating: AssistantRunFeedbackRating
    comment: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssistantPromptNavigationSummaryOut(BaseModel):
    total_outcome_count: int = 0
    accepted_count: int = 0
    dismissed_count: int = 0
    failed_count: int = 0
    acceptance_rate: Optional[float] = None
    dismiss_rate: Optional[float] = None
    failure_rate: Optional[float] = None


class AssistantPromptNavigationTargetMetricRowOut(BaseModel):
    target_view: Optional[AssistantWorkspace] = None
    target_label: Optional[str] = None
    focus_type: Optional[AssistantPromptNavigationFocusType] = None
    outcome_count: int
    accepted_count: int
    dismissed_count: int
    failed_count: int
    acceptance_rate: Optional[float] = None
    dismiss_rate: Optional[float] = None
    failure_rate: Optional[float] = None
    signal: AssistantPromptNavigationSignal
    signal_reasons: list[str] = Field(default_factory=list)
    recent_prompt_examples: list[str] = Field(default_factory=list)


class AssistantPromptNavigationOutcomeInsightOut(BaseModel):
    outcome_id: int
    run_id: Optional[int] = None
    conversation_id: Optional[int] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    source_workspace: Optional[AssistantWorkspace] = None
    user_id: str
    user_role: str
    surface: AssistantPromptNavigationSurface
    outcome: AssistantPromptNavigationOutcomeStatus
    target_view: Optional[AssistantWorkspace] = None
    target_label: Optional[str] = None
    focus_type: Optional[AssistantPromptNavigationFocusType] = None
    focus_id: Optional[str] = None
    focus_label: Optional[str] = None
    detail: Optional[str] = None
    latest_user_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssistantPromptRouteRecommendationOut(BaseModel):
    target_view: AssistantWorkspace
    target_label: Optional[str] = None
    target_rationale: Optional[str] = None
    focus_type: Optional[AssistantPromptNavigationFocusType] = None
    last_accepted_at: Optional[datetime] = None
    accepted_count: int
    outcome_count: int
    acceptance_rate: Optional[float] = None
    signal: AssistantPromptNavigationSignal
    signal_reasons: list[str] = Field(default_factory=list)


class AssistantActionTypeOutcomeMetricRowOut(AssistantOutcomeMetricCountersOut):
    action_type: AssistantActionType
    recommendation: AssistantOutcomeMetricRecommendationOut


class AssistantOutcomeMetricsOut(BaseModel):
    generated_at: datetime
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    thresholds: AssistantOutcomeMetricThresholdsOut
    total_feedback_count: int = 0
    helpful_feedback_count: int = 0
    needs_work_feedback_count: int = 0
    feedback_helpful_rate: Optional[float] = None
    by_agent: list[AssistantAgentOutcomeMetricRowOut] = Field(default_factory=list)
    by_role: list[AssistantRoleOutcomeMetricRowOut] = Field(default_factory=list)
    by_profile: list[AssistantProfileOutcomeMetricRowOut] = Field(default_factory=list)
    by_workspace: list[AssistantWorkspaceFeedbackMetricRowOut] = Field(default_factory=list)
    by_action_type: list[AssistantActionTypeOutcomeMetricRowOut] = Field(default_factory=list)
    recent_feedback: list[AssistantRunFeedbackInsightOut] = Field(default_factory=list)
    prompt_navigation_summary: AssistantPromptNavigationSummaryOut = Field(
        default_factory=AssistantPromptNavigationSummaryOut
    )
    by_prompt_target: list[AssistantPromptNavigationTargetMetricRowOut] = Field(default_factory=list)
    recent_prompt_navigation_outcomes: list[AssistantPromptNavigationOutcomeInsightOut] = Field(
        default_factory=list
    )


class AssistantControlTowerAgentRosterSummaryOut(BaseModel):
    total_count: int = 0
    active_count: int = 0
    draft_count: int = 0
    paused_count: int = 0
    retired_count: int = 0
    action_capable_count: int = 0
    missing_eval_coverage_count: int = 0
    policy_warning_count: int = 0


class AssistantControlTowerRunSummaryOut(BaseModel):
    total_count: int = 0
    completed_count: int = 0
    failed_count: int = 0
    warning_count: int = 0
    tool_call_count: int = 0
    latest_run_at: Optional[datetime] = None


class AssistantControlTowerOldestPendingActionOut(BaseModel):
    action_request_id: int
    action_type: str
    summary: str
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    user_id: str
    created_at: datetime
    age_seconds: float


class AssistantControlTowerActionSummaryOut(BaseModel):
    total_count: int = 0
    pending_count: int = 0
    failed_count: int = 0
    rejected_count: int = 0
    executed_count: int = 0
    preview_blocked_count: int = 0
    oldest_pending_action: Optional[AssistantControlTowerOldestPendingActionOut] = None


class AssistantControlTowerWorkPackageSummaryOut(BaseModel):
    total_count: int = 0
    accepted_count: int = 0
    in_progress_count: int = 0
    implemented_count: int = 0
    dismissed_count: int = 0
    stale_count: int = 0
    stale_accepted_count: int = 0
    stale_in_progress_count: int = 0
    implemented_with_pr_count: int = 0
    implemented_with_commit_count: int = 0
    implemented_with_eval_count: int = 0
    implemented_with_tests_count: int = 0
    implemented_with_docs_count: int = 0
    implemented_missing_evidence_count: int = 0


class AssistantControlTowerAgentTrustSignalOut(BaseModel):
    agent_id: str
    agent_name: str
    status: AssistantAgentStatus
    role_key: Optional[str] = None
    profile_kind: Optional[AssistantAgentProfileKind] = None
    signal_type: AssistantControlTowerTrustSignalType
    severity: AssistantControlTowerTrustSignalSeverity
    summary: str
    details: list[str] = Field(default_factory=list)
    pending_action_count: int = 0
    failed_action_count: int = 0
    warning_run_count: int = 0
    eval_status: Optional[AssistantAgentEvalGateStatus] = None


class AssistantControlTowerSummaryOut(BaseModel):
    generated_at: datetime
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    roster: AssistantControlTowerAgentRosterSummaryOut
    runs: AssistantControlTowerRunSummaryOut
    actions: AssistantControlTowerActionSummaryOut
    work_packages: AssistantControlTowerWorkPackageSummaryOut
    trust_signals: list[AssistantControlTowerAgentTrustSignalOut] = Field(default_factory=list)


class AssistantAutonomyKnowledgeEntryOut(BaseModel):
    title: str
    entry_type: Optional[str] = None
    domain: Optional[str] = None
    applies_to: Optional[str] = None
    status: Optional[str] = None
    lesson: Optional[str] = None
    deterministic_opportunity: Optional[str] = None
    agent_autonomy_impact: Optional[str] = None


class AssistantAutonomyEvalSignalOut(BaseModel):
    status: AssistantAutonomyReviewEvalStatus
    required_cases: list[str] = Field(default_factory=list)
    proposed_cases: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class AssistantAutonomyReviewBriefOut(BaseModel):
    generated_at: datetime
    agent_id: str
    agent_name: str
    current_status: AssistantAgentStatus
    current_authority: Optional[AssistantAgentAuthorityLevel] = None
    recommended_next_authority: AssistantAutonomyReviewRecommendationAction
    recommendation_reasons: list[str] = Field(default_factory=list)
    human_owner_role: Optional[str] = None
    allowed_action_types: list[AssistantActionType] = Field(default_factory=list)
    outcome_window_created_after: Optional[datetime] = None
    outcome_window_created_before: Optional[datetime] = None
    outcome_metrics: Optional[AssistantAgentOutcomeMetricRowOut] = None
    action_type_metrics: list[AssistantActionTypeOutcomeMetricRowOut] = Field(default_factory=list)
    eval_signal: AssistantAutonomyEvalSignalOut
    stop_conditions: list[str] = Field(default_factory=list)
    knowledge_base_entries: list[AssistantAutonomyKnowledgeEntryOut] = Field(default_factory=list)
    deterministic_algorithm_candidates: list[str] = Field(default_factory=list)
    review_checklist: list[str] = Field(default_factory=list)


class AssistantAgentHealthReviewItemOut(BaseModel):
    agent_id: str
    agent_name: str
    current_status: AssistantAgentStatus
    current_authority: Optional[AssistantAgentAuthorityLevel] = None
    recommended_next_authority: AssistantAutonomyReviewRecommendationAction
    recommendation_reasons: list[str] = Field(default_factory=list)
    eval_status: AssistantAutonomyReviewEvalStatus
    decided_action_count: int
    pending_action_count: int
    failed_action_count: int
    deterministic_candidate_count: int
    stop_condition_count: int
    work_package_ids: list[str] = Field(default_factory=list)


class AssistantAgentHealthWorkPackageOut(BaseModel):
    work_package_id: str
    title: str
    package_type: AssistantAgentHealthWorkPackageType
    priority: AssistantAgentHealthWorkPackagePriority
    status: AssistantAgentHealthWorkPackageStatus
    source_agent_ids: list[str] = Field(default_factory=list)
    source_agent_names: list[str] = Field(default_factory=list)
    source_recommendations: list[AssistantAutonomyReviewRecommendationAction] = Field(default_factory=list)
    source_candidates: list[str] = Field(default_factory=list)
    recommended_owner_role: Optional[str] = None
    rationale: str
    acceptance_checks: list[str] = Field(default_factory=list)
    knowledge_base_titles: list[str] = Field(default_factory=list)


class AssistantAgentHealthReviewOut(BaseModel):
    generated_at: datetime
    outcome_window_created_after: Optional[datetime] = None
    outcome_window_created_before: Optional[datetime] = None
    agent_count: int
    pause_count: int
    narrow_count: int
    bounded_review_candidate_count: int
    keep_staged_count: int
    work_package_count: int
    review_items: list[AssistantAgentHealthReviewItemOut] = Field(default_factory=list)
    work_packages: list[AssistantAgentHealthWorkPackageOut] = Field(default_factory=list)


class AssistantAgentWorkPackageOut(BaseModel):
    id: int
    work_package_id: str
    title: str
    package_type: AssistantAgentHealthWorkPackageType
    priority: AssistantAgentHealthWorkPackagePriority
    status: AssistantAgentWorkPackageStatus
    source_agent_ids: list[str] = Field(default_factory=list)
    source_agent_names: list[str] = Field(default_factory=list)
    source_recommendations: list[AssistantAutonomyReviewRecommendationAction] = Field(default_factory=list)
    source_candidates: list[str] = Field(default_factory=list)
    recommended_owner_role: Optional[str] = None
    rationale: str
    acceptance_checks: list[str] = Field(default_factory=list)
    knowledge_base_titles: list[str] = Field(default_factory=list)
    implementation_evidence: "AssistantAgentWorkPackageImplementationEvidenceOut" = Field(
        default_factory=lambda: AssistantAgentWorkPackageImplementationEvidenceOut()
    )
    accepted_at: Optional[datetime] = None
    accepted_by: Optional[str] = None
    implemented_at: Optional[datetime] = None
    implemented_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class AssistantAgentWorkPackageImplementationEvidenceOut(BaseModel):
    pr_url: Optional[str] = None
    commit_sha: Optional[str] = None
    eval_ids: list[int] = Field(default_factory=list)
    test_names: list[str] = Field(default_factory=list)
    doc_paths: list[str] = Field(default_factory=list)
    owner: Optional[str] = None


class AssistantAgentWorkPackageAcceptRequest(BaseModel):
    accepted_by: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("accepted_by", "notes")
    @classmethod
    def normalize_optional_accept_text(cls, value: Optional[str], info) -> Optional[str]:
        return normalize_optional_text(value, field_name=info.field_name)


class AssistantAgentWorkPackageUpdateRequest(BaseModel):
    status: AssistantAgentWorkPackageStatus
    updated_by: Optional[str] = None
    notes: Optional[str] = None
    implementation_evidence: Optional["AssistantAgentWorkPackageImplementationEvidenceUpdate"] = None

    @field_validator("updated_by", "notes")
    @classmethod
    def normalize_optional_update_text(cls, value: Optional[str], info) -> Optional[str]:
        return normalize_optional_text(value, field_name=info.field_name)


class AssistantAgentWorkPackageImplementationEvidenceUpdate(BaseModel):
    pr_url: Optional[str] = None
    commit_sha: Optional[str] = None
    eval_ids: Optional[list[int]] = None
    test_names: Optional[list[str]] = None
    doc_paths: Optional[list[str]] = None
    owner: Optional[str] = None

    @field_validator("pr_url", "commit_sha", "owner")
    @classmethod
    def normalize_optional_evidence_text(cls, value: Optional[str], info) -> Optional[str]:
        lowercase = info.field_name == "commit_sha"
        return normalize_optional_text(value, field_name=info.field_name, lowercase=lowercase)

    @field_validator("eval_ids")
    @classmethod
    def normalize_eval_ids(cls, value: Optional[list[int]]) -> Optional[list[int]]:
        if value is None:
            return None
        normalized: list[int] = []
        seen: set[int] = set()
        for item in value:
            resolved = int(item)
            if resolved <= 0 or resolved in seen:
                continue
            normalized.append(resolved)
            seen.add(resolved)
        return normalized

    @field_validator("test_names")
    @classmethod
    def normalize_test_names(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return None
        return _normalize_text_list(value, field_name="test_names")

    @field_validator("doc_paths")
    @classmethod
    def normalize_doc_paths(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return None
        return _normalize_text_list(value, field_name="doc_paths")


class AssistantPromptResponse(BaseModel):
    conversation_id: Optional[int] = None
    conversation_updated_at: Optional[datetime] = None
    run_id: Optional[int] = None
    run_recorded_at: Optional[datetime] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    agent_role_key: Optional[str] = None
    agent_profile_kind: Optional[AssistantAgentProfileKind] = None
    provider: AssistantProvider
    model: str
    message: AssistantMessageOut
    usage: AssistantUsageOut
    warnings: list[str] = Field(default_factory=list)
    tool_calls: list[AssistantToolCallOut] = Field(default_factory=list)
    action_requests: list[AssistantActionRequestOut] = Field(default_factory=list)


class AssistantPromptSectionOut(BaseModel):
    contract_key: Optional[str] = None
    contract_version: int = 1
    key: str
    title: str
    source: AssistantPromptSectionSource
    scope: AssistantPromptSectionScope = "RUNTIME"
    kind: AssistantPromptSectionKind = "GENERATED"
    owner: str = "unknown"
    owner_reference: Optional[str] = None
    freshness: AssistantPromptSectionFreshness = "STATIC"
    merge_strategy: AssistantPromptSectionMergeStrategy = "APPEND"
    uses_fallback: bool = False
    content: str


class AssistantPromptContextOut(BaseModel):
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    agent_role_key: Optional[str] = None
    agent_profile_kind: Optional[AssistantAgentProfileKind] = None
    provider: AssistantProvider
    model: str
    generated_at: datetime
    warnings: list[str] = Field(default_factory=list)
    sections: list[AssistantPromptSectionOut]
    rendered_system_prompt: str


class AssistantOrganizationContextDefinitionBase(BaseModel):
    definition_key: str = Field(..., min_length=2, max_length=80)
    section_key: AssistantOrganizationContextSectionKey
    content_kind: AssistantOrganizationContextContentKind
    title: str = Field(..., min_length=1, max_length=160)
    summary: Optional[str] = Field(default=None, max_length=500)
    body: str = Field(..., min_length=1, max_length=20_000)
    display_order: int = Field(default=100, ge=0, le=10_000)

    @field_validator("definition_key")
    @classmethod
    def normalize_organization_context_definition_key(cls, value: str) -> str:
        normalized = normalize_required_text(value, field_name="definition_key", lowercase=True)
        if not ORGANIZATION_CONTEXT_DEFINITION_KEY_PATTERN.fullmatch(normalized):
            raise ValueError(
                "definition_key must use lowercase letters, numbers, hyphens, or underscores"
            )
        return normalized

    @field_validator("title")
    @classmethod
    def normalize_organization_context_title(cls, value: str) -> str:
        return normalize_required_text(value, field_name="title")

    @field_validator("summary")
    @classmethod
    def normalize_organization_context_summary(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="summary")

    @field_validator("body")
    @classmethod
    def normalize_organization_context_body(cls, value: str) -> str:
        return normalize_required_text(value, field_name="body")

    @model_validator(mode="after")
    def validate_organization_context_section_kind_alignment(
        self,
    ) -> "AssistantOrganizationContextDefinitionBase":
        allowed_kinds = ORGANIZATION_CONTEXT_SECTION_KIND_RULES.get(self.section_key, ())
        if self.content_kind not in allowed_kinds:
            raise ValueError(
                f"content_kind {self.content_kind} is not allowed for section_key {self.section_key}"
            )
        return self


class AssistantOrganizationContextDefinitionCreate(AssistantOrganizationContextDefinitionBase):
    created_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("created_by")
    @classmethod
    def normalize_organization_context_created_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="created_by")


class AssistantOrganizationContextDefinitionUpdate(AssistantOrganizationContextDefinitionBase):
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("updated_by")
    @classmethod
    def normalize_organization_context_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class AssistantOrganizationContextDefinitionOut(BaseModel):
    id: int
    definition_key: str
    section_key: AssistantOrganizationContextSectionKey
    content_kind: AssistantOrganizationContextContentKind
    title: str
    summary: Optional[str] = None
    body: str
    scope: Literal["GLOBAL"] = "GLOBAL"
    status: AssistantOrganizationContextStatus
    version: int
    display_order: int
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    published_at: Optional[datetime] = None
    published_by: Optional[str] = None
    retired_at: Optional[datetime] = None
    retired_by: Optional[str] = None
    is_editable: bool = False


def _ensure_distinct_values(values: list[str], *, field_name: str) -> list[str]:
    if len(values) != len(set(values)):
        raise ValueError(f"{field_name} must not contain duplicates")
    return values


class AssistantAgentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: str = Field(..., min_length=1, max_length=500)
    status: AssistantAgentStatus
    scope: AssistantAgentScope
    provider: Optional[AssistantProvider] = None
    model: Optional[str] = Field(default=None, max_length=160)
    role_key: Optional[str] = Field(default=None, max_length=80)
    profile_kind: AssistantAgentProfileKind = "CUSTOM"
    specialization_summary: Optional[str] = Field(default=None, max_length=500)
    human_owner_role: Optional[str] = Field(default=None, max_length=128)
    authority_ceiling: Optional[AssistantAgentAuthorityLevel] = None
    activation_notes: Optional[str] = Field(default=None, max_length=2_000)
    orchestration_pattern: AssistantAgentOrchestrationPattern = "SINGLE"
    parent_agent_id: Optional[str] = Field(default=None, max_length=64)
    managed_agent_ids: list[str] = Field(default_factory=list, max_length=12)
    delegation_guidance: Optional[str] = Field(default=None, max_length=2_000)
    profile_request_id: Optional[int] = Field(default=None, ge=1)
    allowed_workspaces: list[AssistantWorkspace] = Field(..., min_length=1, max_length=16)
    capabilities: list[AssistantAgentCapability] = Field(..., min_length=1, max_length=4)
    skills: list[AssistantAgentSkillKey] = Field(default_factory=list, max_length=24)
    allowed_tools: list[str] = Field(default_factory=list, max_length=16)
    allowed_action_types: list[AssistantActionType] = Field(default_factory=list, max_length=16)
    daily_token_allocation: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    system_prompt: str = Field(..., min_length=1, max_length=20_000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return normalize_required_text(value, field_name="description")

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="model")

    @field_validator("role_key")
    @classmethod
    def normalize_role_key(cls, value: Optional[str]) -> Optional[str]:
        normalized = normalize_optional_text(value, field_name="role_key", lowercase=True)
        if normalized is None:
            return None
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("role_key must use lowercase letters, numbers, hyphens, or underscores")
        return normalized

    @field_validator("specialization_summary")
    @classmethod
    def normalize_specialization_summary(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="specialization_summary")

    @field_validator("human_owner_role")
    @classmethod
    def normalize_human_owner_role(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="human_owner_role")

    @field_validator("activation_notes")
    @classmethod
    def normalize_activation_notes(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="activation_notes")

    @field_validator("parent_agent_id")
    @classmethod
    def normalize_parent_agent_id(cls, value: Optional[str]) -> Optional[str]:
        normalized = normalize_optional_text(value, field_name="parent_agent_id", lowercase=True)
        if normalized is None:
            return None
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("parent_agent_id must use lowercase letters, numbers, hyphens, or underscores")
        return normalized

    @field_validator("managed_agent_ids")
    @classmethod
    def normalize_managed_agent_ids(cls, value: list[str]) -> list[str]:
        normalized = [
            normalize_required_text(agent_id, field_name="managed_agent_ids", lowercase=True)
            for agent_id in value
        ]
        for agent_id in normalized:
            if not AGENT_ID_PATTERN.fullmatch(agent_id):
                raise ValueError("managed_agent_ids must use lowercase letters, numbers, hyphens, or underscores")
        return _ensure_distinct_values(normalized, field_name="managed_agent_ids")

    @field_validator("delegation_guidance")
    @classmethod
    def normalize_delegation_guidance(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="delegation_guidance")

    @field_validator("system_prompt")
    @classmethod
    def normalize_system_prompt(cls, value: str) -> str:
        return normalize_required_text(value, field_name="system_prompt")

    @field_validator("allowed_workspaces")
    @classmethod
    def validate_allowed_workspaces(cls, value: list[AssistantWorkspace]) -> list[AssistantWorkspace]:
        return _ensure_distinct_values(value, field_name="allowed_workspaces")

    @field_validator("capabilities")
    @classmethod
    def validate_capabilities(cls, value: list[AssistantAgentCapability]) -> list[AssistantAgentCapability]:
        return _ensure_distinct_values(value, field_name="capabilities")

    @field_validator("skills")
    @classmethod
    def validate_skills(cls, value: list[AssistantAgentSkillKey]) -> list[AssistantAgentSkillKey]:
        return _ensure_distinct_values(value, field_name="skills")

    @field_validator("allowed_tools")
    @classmethod
    def normalize_allowed_tools(cls, value: list[str]) -> list[str]:
        normalized = [normalize_required_text(tool_name, field_name="allowed_tools").lower() for tool_name in value]
        return _ensure_distinct_values(normalized, field_name="allowed_tools")

    @field_validator("allowed_action_types")
    @classmethod
    def normalize_allowed_action_types(cls, value: list[AssistantActionType]) -> list[AssistantActionType]:
        normalized = [
            normalize_required_text(action_type, field_name="allowed_action_types", lowercase=True)
            for action_type in value
        ]
        return _ensure_distinct_values(normalized, field_name="allowed_action_types")

    @field_validator("model")
    @classmethod
    def validate_model_requires_provider(cls, value: Optional[str], info: ValidationInfo) -> Optional[str]:
        provider = info.data.get("provider")
        if value is not None and provider is None:
            raise ValueError("provider is required when model is set")
        return value

    @model_validator(mode="after")
    def validate_orchestration_configuration(self) -> "AssistantAgentBase":
        if self.managed_agent_ids and self.orchestration_pattern == "SINGLE":
            raise ValueError("managed_agent_ids require a non-SINGLE orchestration_pattern")
        if self.parent_agent_id is not None and self.parent_agent_id in set(self.managed_agent_ids):
            raise ValueError("parent_agent_id cannot also appear in managed_agent_ids")
        return self


class AssistantAgentCreate(AssistantAgentBase):
    agent_id: str = Field(..., min_length=2, max_length=64)
    created_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("agent_id")
    @classmethod
    def normalize_agent_id(cls, value: str) -> str:
        normalized = normalize_required_text(value, field_name="agent_id", lowercase=True)
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("agent_id must use lowercase letters, numbers, hyphens, or underscores")
        return normalized

    @field_validator("created_by")
    @classmethod
    def normalize_created_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="created_by")

    @model_validator(mode="after")
    def validate_agent_hierarchy(self) -> "AssistantAgentCreate":
        if self.parent_agent_id == self.agent_id:
            raise ValueError("parent_agent_id cannot match agent_id")
        if self.agent_id in set(self.managed_agent_ids):
            raise ValueError("managed_agent_ids cannot include agent_id")
        return self


class AssistantAgentUpdate(AssistantAgentBase):
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


def _normalize_text_list(
    value: list[str],
    *,
    field_name: str,
    lowercase: bool = False,
) -> list[str]:
    normalized = [
        normalize_required_text(entry, field_name=field_name, lowercase=lowercase)
        for entry in value
    ]
    return _ensure_distinct_values(normalized, field_name=field_name)


class AssistantAgentProfileRequestCreate(BaseModel):
    requested_agent_id: Optional[str] = Field(default=None, max_length=64)
    business_problem: str = Field(..., min_length=1, max_length=4_000)
    proposed_mission: str = Field(..., min_length=1, max_length=4_000)
    human_owner_role: str = Field(..., min_length=1, max_length=128)
    requested_workspaces: list[AssistantWorkspace] = Field(..., min_length=1, max_length=16)
    work_objects: list[str] = Field(..., min_length=1, max_length=16)
    requested_inputs_tools: list[str] = Field(default_factory=list, max_length=16)
    expected_outputs: list[str] = Field(..., min_length=1, max_length=16)
    requested_authority_ceiling: AssistantAgentAuthorityLevel = "DRAFT"
    stop_conditions: list[str] = Field(..., min_length=1, max_length=16)
    success_metrics: list[str] = Field(..., min_length=1, max_length=16)
    proposed_eval_cases: list[str] = Field(..., min_length=1, max_length=24)
    requested_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("requested_agent_id")
    @classmethod
    def normalize_requested_agent_id(cls, value: Optional[str]) -> Optional[str]:
        normalized = normalize_optional_text(value, field_name="requested_agent_id", lowercase=True)
        if normalized is None:
            return None
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("requested_agent_id must use lowercase letters, numbers, hyphens, or underscores")
        return normalized

    @field_validator("business_problem")
    @classmethod
    def normalize_business_problem(cls, value: str) -> str:
        return normalize_required_text(value, field_name="business_problem")

    @field_validator("proposed_mission")
    @classmethod
    def normalize_proposed_mission(cls, value: str) -> str:
        return normalize_required_text(value, field_name="proposed_mission")

    @field_validator("human_owner_role")
    @classmethod
    def normalize_profile_request_owner(cls, value: str) -> str:
        return normalize_required_text(value, field_name="human_owner_role")

    @field_validator("requested_workspaces")
    @classmethod
    def validate_requested_workspaces(cls, value: list[AssistantWorkspace]) -> list[AssistantWorkspace]:
        return _ensure_distinct_values(value, field_name="requested_workspaces")

    @field_validator("work_objects")
    @classmethod
    def normalize_work_objects(cls, value: list[str]) -> list[str]:
        return _normalize_text_list(value, field_name="work_objects")

    @field_validator("requested_inputs_tools")
    @classmethod
    def normalize_requested_inputs_tools(cls, value: list[str]) -> list[str]:
        return _normalize_text_list(value, field_name="requested_inputs_tools", lowercase=True)

    @field_validator("expected_outputs")
    @classmethod
    def normalize_expected_outputs(cls, value: list[str]) -> list[str]:
        return _normalize_text_list(value, field_name="expected_outputs")

    @field_validator("stop_conditions")
    @classmethod
    def normalize_request_stop_conditions(cls, value: list[str]) -> list[str]:
        return _normalize_text_list(value, field_name="stop_conditions")

    @field_validator("success_metrics")
    @classmethod
    def normalize_request_success_metrics(cls, value: list[str]) -> list[str]:
        return _normalize_text_list(value, field_name="success_metrics")

    @field_validator("proposed_eval_cases")
    @classmethod
    def normalize_proposed_eval_cases(cls, value: list[str]) -> list[str]:
        return _normalize_text_list(value, field_name="proposed_eval_cases")

    @field_validator("requested_by")
    @classmethod
    def normalize_profile_request_requested_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="requested_by")


class AssistantAgentProfileRequestDecision(BaseModel):
    reviewed_by: str = Field(..., min_length=1, max_length=128)
    approval_notes: Optional[str] = Field(default=None, max_length=4_000)
    rejection_reason: Optional[str] = Field(default=None, max_length=4_000)

    @field_validator("reviewed_by")
    @classmethod
    def normalize_reviewed_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="reviewed_by")

    @field_validator("approval_notes")
    @classmethod
    def normalize_approval_notes(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="approval_notes")

    @field_validator("rejection_reason")
    @classmethod
    def normalize_rejection_reason(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="rejection_reason")


class AssistantAgentProfileRequestActivation(BaseModel):
    activated_by: str = Field(..., min_length=1, max_length=128)
    linked_agent_id: str = Field(..., min_length=2, max_length=64)

    @field_validator("activated_by")
    @classmethod
    def normalize_activated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="activated_by")

    @field_validator("linked_agent_id")
    @classmethod
    def normalize_linked_agent_id(cls, value: str) -> str:
        normalized = normalize_required_text(value, field_name="linked_agent_id", lowercase=True)
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("linked_agent_id must use lowercase letters, numbers, hyphens, or underscores")
        return normalized


class AssistantAgentProfileRequestOut(BaseModel):
    request_id: int
    status: AssistantAgentProfileRequestStatus
    requested_agent_id: Optional[str]
    business_problem: str
    proposed_mission: str
    human_owner_role: str
    requested_workspaces: list[AssistantWorkspace]
    work_objects: list[str]
    requested_inputs_tools: list[str]
    expected_outputs: list[str]
    requested_authority_ceiling: AssistantAgentAuthorityLevel
    stop_conditions: list[str]
    success_metrics: list[str]
    proposed_eval_cases: list[str]
    approval_notes: Optional[str]
    rejection_reason: Optional[str]
    linked_agent_id: Optional[str]
    requested_at: datetime
    requested_by: str
    reviewed_at: Optional[datetime]
    reviewed_by: Optional[str]
    activated_at: Optional[datetime]
    activated_by: Optional[str]
    updated_at: datetime


class AssistantAgentEvalRunOut(BaseModel):
    eval_run_id: int
    eval_id: int
    agent_id: str
    run_id: Optional[int]
    status: AssistantAgentEvalRunStatus
    failure_reasons: list[str]
    observed_tool_names: list[str]
    observed_action_types: list[AssistantActionType]
    response_message: Optional[str]
    started_at: datetime
    completed_at: datetime
    run_by: str


class AssistantAgentEvalBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    workspace: AssistantWorkspace = "assistant"
    prompt: str = Field(..., min_length=1, max_length=20_000)
    context: Optional[str] = Field(default=None, max_length=20_000)
    use_live_tools: bool = True
    expected_substrings: list[str] = Field(default_factory=list, max_length=24)
    expected_tool_names: list[str] = Field(default_factory=list, max_length=16)
    expected_action_types: list[AssistantActionType] = Field(default_factory=list, max_length=16)

    @field_validator("name")
    @classmethod
    def normalize_eval_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator("prompt")
    @classmethod
    def normalize_eval_prompt(cls, value: str) -> str:
        return normalize_required_text(value, field_name="prompt")

    @field_validator("context")
    @classmethod
    def normalize_eval_context(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="context")

    @field_validator("expected_substrings")
    @classmethod
    def normalize_expected_substrings(cls, value: list[str]) -> list[str]:
        return _normalize_text_list(value, field_name="expected_substrings")

    @field_validator("expected_tool_names")
    @classmethod
    def normalize_expected_tool_names(cls, value: list[str]) -> list[str]:
        return _normalize_text_list(value, field_name="expected_tool_names", lowercase=True)

    @field_validator("expected_action_types")
    @classmethod
    def normalize_expected_action_types(cls, value: list[AssistantActionType]) -> list[AssistantActionType]:
        normalized = [
            normalize_required_text(action_type, field_name="expected_action_types", lowercase=True)
            for action_type in value
        ]
        return _ensure_distinct_values(normalized, field_name="expected_action_types")


class AssistantAgentEvalCreate(AssistantAgentEvalBase):
    agent_id: str = Field(..., min_length=2, max_length=64)
    created_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("agent_id")
    @classmethod
    def normalize_eval_agent_id(cls, value: str) -> str:
        normalized = normalize_required_text(value, field_name="agent_id", lowercase=True)
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("agent_id must use lowercase letters, numbers, hyphens, or underscores")
        return normalized

    @field_validator("created_by")
    @classmethod
    def normalize_eval_created_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="created_by")


class AssistantAgentEvalUpdate(AssistantAgentEvalBase):
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("updated_by")
    @classmethod
    def normalize_eval_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class AssistantAgentEvalOut(BaseModel):
    eval_id: int
    agent_id: str
    name: str
    workspace: AssistantWorkspace
    prompt: str
    context: Optional[str]
    use_live_tools: bool
    expected_substrings: list[str]
    expected_tool_names: list[str]
    expected_action_types: list[AssistantActionType]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    latest_run: Optional[AssistantAgentEvalRunOut] = None


class AssistantAgentTokenBudgetOut(BaseModel):
    status: AssistantAgentTokenBudgetStatus
    allocated_tokens: int
    used_tokens: int
    remaining_tokens: int
    percent_used: float
    warning_threshold_percent: float
    allocation_source: AssistantAgentTokenAllocationSource
    window_started_at: datetime
    reset_at: datetime


class AssistantAgentEvalGateOut(BaseModel):
    status: AssistantAgentEvalGateStatus
    role_key: Optional[str] = None
    required_cases: list[str] = Field(default_factory=list)
    covered_cases: list[str] = Field(default_factory=list)
    missing_cases: list[str] = Field(default_factory=list)
    custom_case_count: int = 0
    notes: list[str] = Field(default_factory=list)


class AssistantAgentOut(BaseModel):
    agent_id: str
    name: str
    description: str
    status: AssistantAgentStatus
    scope: AssistantAgentScope
    provider: Optional[AssistantProvider]
    model: Optional[str]
    role_key: Optional[str]
    profile_kind: AssistantAgentProfileKind
    specialization_summary: Optional[str]
    human_owner_role: Optional[str]
    authority_ceiling: Optional[AssistantAgentAuthorityLevel]
    activation_notes: Optional[str]
    orchestration_pattern: AssistantAgentOrchestrationPattern = "SINGLE"
    parent_agent_id: Optional[str] = None
    managed_agent_ids: list[str] = Field(default_factory=list)
    delegation_guidance: Optional[str] = None
    profile_request_id: Optional[int]
    allowed_workspaces: list[AssistantWorkspace]
    capabilities: list[AssistantAgentCapability]
    skills: list[AssistantAgentSkillKey]
    allowed_tools: list[str]
    allowed_action_types: list[AssistantActionType]
    daily_token_allocation: Optional[int]
    token_budget: AssistantAgentTokenBudgetOut
    effective_policy: AssistantAgentEffectivePolicyOut
    eval_gate: Optional[AssistantAgentEvalGateOut] = None


class AssistantAgentAdminOut(AssistantAgentOut):
    system_prompt: str
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    latest_revision_id: Optional[int] = None
    published_revision_id: Optional[int] = None
    published_at: Optional[datetime] = None
    published_by: Optional[str] = None
    has_unpublished_revision: bool = False


class AssistantAgentRevisionPayloadOut(AssistantAgentBase):
    pass


class AssistantAgentRevisionDiffOut(BaseModel):
    field_key: str
    label: str
    current_value: str
    next_value: str


class AssistantAgentRevisionOut(BaseModel):
    revision_id: int
    agent_id: str
    version: int
    change_summary: list[str] = Field(default_factory=list)
    diff_summary: list[AssistantAgentRevisionDiffOut] = Field(default_factory=list)
    payload: AssistantAgentRevisionPayloadOut
    created_at: datetime
    created_by: str
    published_at: Optional[datetime] = None
    published_by: Optional[str] = None
    restored_from_revision_id: Optional[int] = None
    is_published: bool = False


class AssistantAgentRoleArchetypeOut(BaseModel):
    role_key: str
    name: str
    description: str
    catalog_status: AssistantAgentRoleCatalogStatus
    mission: list[str]
    human_owner_role: str
    allowed_workspaces: list[AssistantWorkspace]
    work_objects: list[str]
    capability_ceiling: list[AssistantAgentCapability]
    skills: list[AssistantAgentSkillKey]
    default_tools: list[str]
    maximum_action_types: list[AssistantActionType]
    authority_ceiling: AssistantAgentAuthorityLevel
    approval_rules: list[str]
    stop_conditions: list[str]
    success_metrics: list[str]
    required_eval_coverage: list[str]
    eval_gate: Optional[AssistantAgentEvalGateOut] = None
    base_prompt_guidance: list[str]
    recommended_orchestration_pattern: AssistantAgentOrchestrationPattern = "SINGLE"
    recommended_parent_role_keys: list[str] = Field(default_factory=list)
    recommended_managed_role_keys: list[str] = Field(default_factory=list)
    delegation_guidance: list[str] = Field(default_factory=list)
    current_profile_ids: list[str]


class AssistantAgentBuildDraftIn(BaseModel):
    agent_id: Optional[str] = Field(default=None, max_length=64)
    name: Optional[str] = Field(default=None, max_length=160)
    description: Optional[str] = Field(default=None, max_length=500)
    status: Optional[AssistantAgentStatus] = None
    scope: Optional[AssistantAgentScope] = None
    provider: Optional[AssistantProvider] = None
    model: Optional[str] = Field(default=None, max_length=160)
    allowed_workspaces: list[AssistantWorkspace] = Field(default_factory=list, max_length=16)
    capabilities: list[AssistantAgentCapability] = Field(default_factory=list, max_length=4)
    skills: list[AssistantAgentSkillKey] = Field(default_factory=list, max_length=24)
    allowed_tools: list[str] = Field(default_factory=list, max_length=16)
    allowed_action_types: list[AssistantActionType] = Field(default_factory=list, max_length=16)
    system_prompt: Optional[str] = Field(default=None, max_length=20_000)

    @field_validator("agent_id")
    @classmethod
    def normalize_optional_agent_id(cls, value: Optional[str]) -> Optional[str]:
        normalized = normalize_optional_text(value, field_name="agent_id", lowercase=True)
        if normalized is None:
            return None
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("agent_id must use lowercase letters, numbers, hyphens, or underscores")
        return normalized

    @field_validator("name")
    @classmethod
    def normalize_optional_name(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="name")

    @field_validator("description")
    @classmethod
    def normalize_optional_description(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="description")

    @field_validator("model")
    @classmethod
    def normalize_optional_model(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="model")

    @field_validator("system_prompt")
    @classmethod
    def normalize_optional_system_prompt(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="system_prompt")

    @field_validator("allowed_workspaces")
    @classmethod
    def validate_optional_allowed_workspaces(cls, value: list[AssistantWorkspace]) -> list[AssistantWorkspace]:
        return _ensure_distinct_values(value, field_name="allowed_workspaces")

    @field_validator("capabilities")
    @classmethod
    def validate_optional_capabilities(cls, value: list[AssistantAgentCapability]) -> list[AssistantAgentCapability]:
        return _ensure_distinct_values(value, field_name="capabilities")

    @field_validator("skills")
    @classmethod
    def validate_optional_skills(cls, value: list[AssistantAgentSkillKey]) -> list[AssistantAgentSkillKey]:
        return _ensure_distinct_values(value, field_name="skills")

    @field_validator("allowed_tools")
    @classmethod
    def normalize_optional_allowed_tools(cls, value: list[str]) -> list[str]:
        normalized = [normalize_required_text(tool_name, field_name="allowed_tools").lower() for tool_name in value]
        return _ensure_distinct_values(normalized, field_name="allowed_tools")

    @field_validator("allowed_action_types")
    @classmethod
    def normalize_optional_allowed_action_types(cls, value: list[AssistantActionType]) -> list[AssistantActionType]:
        normalized = [
            normalize_required_text(action_type, field_name="allowed_action_types", lowercase=True)
            for action_type in value
        ]
        return _ensure_distinct_values(normalized, field_name="allowed_action_types")


class AssistantAgentBuildRequest(BaseModel):
    brief: str = Field(..., min_length=1, max_length=4_000)
    current_draft: Optional[AssistantAgentBuildDraftIn] = None

    @field_validator("brief")
    @classmethod
    def normalize_brief(cls, value: str) -> str:
        return normalize_required_text(value, field_name="brief")


class AssistantAgentSelfUpdateRequest(BaseModel):
    brief: Optional[str] = Field(default=None, max_length=4_000)

    @field_validator("brief")
    @classmethod
    def normalize_self_update_brief(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="brief")


class AssistantAgentBuildSuggestionOut(BaseModel):
    agent_id: str = Field(..., min_length=2, max_length=64)
    name: str = Field(..., min_length=1, max_length=160)
    description: str = Field(..., min_length=1, max_length=500)
    status: AssistantAgentStatus
    scope: AssistantAgentScope
    provider: AssistantProvider
    model: str = Field(..., min_length=1, max_length=160)
    allowed_workspaces: list[AssistantWorkspace] = Field(..., min_length=1, max_length=16)
    capabilities: list[AssistantAgentCapability] = Field(..., min_length=1, max_length=4)
    skills: list[AssistantAgentSkillKey] = Field(default_factory=list, max_length=24)
    allowed_tools: list[str] = Field(default_factory=list, max_length=16)
    allowed_action_types: list[AssistantActionType] = Field(default_factory=list, max_length=16)
    system_prompt: str = Field(..., min_length=1, max_length=20_000)
    builder_provider: AssistantProvider
    builder_model: str = Field(..., min_length=1, max_length=160)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("agent_id")
    @classmethod
    def normalize_build_agent_id(cls, value: str) -> str:
        normalized = normalize_required_text(value, field_name="agent_id", lowercase=True)
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("agent_id must use lowercase letters, numbers, hyphens, or underscores")
        return normalized

    @field_validator("name")
    @classmethod
    def normalize_build_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator("description")
    @classmethod
    def normalize_build_description(cls, value: str) -> str:
        return normalize_required_text(value, field_name="description")

    @field_validator("model", "builder_model")
    @classmethod
    def normalize_build_model(cls, value: str) -> str:
        return normalize_required_text(value, field_name="model")

    @field_validator("system_prompt")
    @classmethod
    def normalize_build_system_prompt(cls, value: str) -> str:
        return normalize_required_text(value, field_name="system_prompt")

    @field_validator("allowed_workspaces")
    @classmethod
    def validate_build_allowed_workspaces(cls, value: list[AssistantWorkspace]) -> list[AssistantWorkspace]:
        return _ensure_distinct_values(value, field_name="allowed_workspaces")

    @field_validator("capabilities")
    @classmethod
    def validate_build_capabilities(cls, value: list[AssistantAgentCapability]) -> list[AssistantAgentCapability]:
        return _ensure_distinct_values(value, field_name="capabilities")

    @field_validator("skills")
    @classmethod
    def validate_build_skills(cls, value: list[AssistantAgentSkillKey]) -> list[AssistantAgentSkillKey]:
        return _ensure_distinct_values(value, field_name="skills")

    @field_validator("allowed_tools")
    @classmethod
    def normalize_build_allowed_tools(cls, value: list[str]) -> list[str]:
        normalized = [normalize_required_text(tool_name, field_name="allowed_tools").lower() for tool_name in value]
        return _ensure_distinct_values(normalized, field_name="allowed_tools")

    @field_validator("allowed_action_types")
    @classmethod
    def normalize_build_allowed_action_types(cls, value: list[AssistantActionType]) -> list[AssistantActionType]:
        normalized = [
            normalize_required_text(action_type, field_name="allowed_action_types", lowercase=True)
            for action_type in value
        ]
        return _ensure_distinct_values(normalized, field_name="allowed_action_types")


class AssistantAgentSelfUpdateSuggestionOut(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    allowed_workspaces: list[AssistantWorkspace] = Field(..., min_length=1, max_length=16)
    capabilities: list[AssistantAgentCapability] = Field(..., min_length=1, max_length=4)
    skills: list[AssistantAgentSkillKey] = Field(default_factory=list, max_length=24)
    allowed_tools: list[str] = Field(default_factory=list, max_length=16)
    allowed_action_types: list[AssistantActionType] = Field(default_factory=list, max_length=16)
    system_prompt: str = Field(..., min_length=1, max_length=20_000)
    change_summary: list[str] = Field(..., min_length=1, max_length=6)
    builder_provider: AssistantProvider
    builder_model: str = Field(..., min_length=1, max_length=160)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("description")
    @classmethod
    def normalize_self_update_description(cls, value: str) -> str:
        return normalize_required_text(value, field_name="description")

    @field_validator("allowed_workspaces")
    @classmethod
    def validate_self_update_allowed_workspaces(cls, value: list[AssistantWorkspace]) -> list[AssistantWorkspace]:
        return _ensure_distinct_values(value, field_name="allowed_workspaces")

    @field_validator("capabilities")
    @classmethod
    def validate_self_update_capabilities(cls, value: list[AssistantAgentCapability]) -> list[AssistantAgentCapability]:
        return _ensure_distinct_values(value, field_name="capabilities")

    @field_validator("skills")
    @classmethod
    def validate_self_update_skills(cls, value: list[AssistantAgentSkillKey]) -> list[AssistantAgentSkillKey]:
        return _ensure_distinct_values(value, field_name="skills")

    @field_validator("allowed_tools")
    @classmethod
    def normalize_self_update_allowed_tools(cls, value: list[str]) -> list[str]:
        normalized = [normalize_required_text(tool_name, field_name="allowed_tools").lower() for tool_name in value]
        return _ensure_distinct_values(normalized, field_name="allowed_tools")

    @field_validator("allowed_action_types")
    @classmethod
    def normalize_self_update_allowed_action_types(cls, value: list[AssistantActionType]) -> list[AssistantActionType]:
        normalized = [
            normalize_required_text(action_type, field_name="allowed_action_types", lowercase=True)
            for action_type in value
        ]
        return _ensure_distinct_values(normalized, field_name="allowed_action_types")

    @field_validator("system_prompt")
    @classmethod
    def normalize_self_update_system_prompt(cls, value: str) -> str:
        return normalize_required_text(value, field_name="system_prompt")

    @field_validator("change_summary")
    @classmethod
    def normalize_self_update_change_summary(cls, value: list[str]) -> list[str]:
        return _normalize_text_list(value, field_name="change_summary")

    @field_validator("builder_model")
    @classmethod
    def normalize_self_update_builder_model(cls, value: str) -> str:
        return normalize_required_text(value, field_name="builder_model")

    @field_validator("warnings")
    @classmethod
    def normalize_self_update_warnings(cls, value: list[str]) -> list[str]:
        return _normalize_text_list(value, field_name="warnings")


class AssistantAgentSelfUpdateEvidenceOut(BaseModel):
    recommendation_reasons: list[str] = Field(default_factory=list)
    recent_needs_work_feedback: list[str] = Field(default_factory=list)
    failing_eval_cases: list[str] = Field(default_factory=list)
    knowledge_base_titles: list[str] = Field(default_factory=list)
    stop_conditions: list[str] = Field(default_factory=list)


class AssistantAgentSelfUpdateDraftOut(BaseModel):
    revision_id: int
    revision_version: int
    agent_id: str
    name: str
    description: str
    status: AssistantAgentStatus
    scope: AssistantAgentScope
    provider: Optional[AssistantProvider]
    model: Optional[str]
    role_key: Optional[str] = None
    profile_kind: AssistantAgentProfileKind
    specialization_summary: Optional[str] = None
    human_owner_role: Optional[str] = None
    authority_ceiling: Optional[AssistantAgentAuthorityLevel] = None
    activation_notes: Optional[str] = None
    profile_request_id: Optional[int] = None
    allowed_workspaces: list[AssistantWorkspace] = Field(default_factory=list)
    capabilities: list[AssistantAgentCapability] = Field(default_factory=list)
    skills: list[AssistantAgentSkillKey] = Field(default_factory=list)
    allowed_tools: list[str] = Field(default_factory=list)
    allowed_action_types: list[AssistantActionType] = Field(default_factory=list)
    daily_token_allocation: Optional[int] = None
    system_prompt: str
    source_brief: str
    change_summary: list[str] = Field(default_factory=list)
    diff_summary: list[AssistantAgentRevisionDiffOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    builder_provider: AssistantProvider
    builder_model: str
    evidence: AssistantAgentSelfUpdateEvidenceOut
    created_at: datetime
    created_by: str
    published_at: Optional[datetime] = None
    published_by: Optional[str] = None

class AssistantRunSummaryOut(BaseModel):
    conversation_id: Optional[int] = None
    run_id: int
    status: AssistantRunStatus
    created_at: datetime
    completed_at: datetime
    user_id: str
    user_role: str
    workspace: Optional[AssistantWorkspace]
    agent_id: Optional[str]
    agent_name: Optional[str]
    agent_role_key: Optional[str] = None
    agent_profile_kind: Optional[AssistantAgentProfileKind] = None
    provider: AssistantProvider
    model: str
    use_live_tools: bool
    warning_count: int
    tool_call_count: int
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    latest_user_message: Optional[str] = None
    assistant_message: Optional[str] = None
    error_detail: Optional[str] = None


class AssistantRunOut(AssistantRunSummaryOut):
    request_messages: list[AssistantMessageIn]
    application_context: Optional[str] = None
    prompt_sections: list[AssistantPromptSectionOut]
    rendered_system_prompt: str
    warnings: list[str] = Field(default_factory=list)
    tool_calls: list[AssistantToolCallOut] = Field(default_factory=list)


class AssistantAuditEventOut(BaseModel):
    event_id: str
    aggregate_type: str
    aggregate_id: str
    event_type: str
    occurred_at: datetime
    recorded_at: datetime
    actor_id: Optional[str] = None
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)


class AssistantAuditTimelineEntryOut(BaseModel):
    entry_type: str
    occurred_at: datetime
    title: str
    summary: str
    status: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssistantActionRequestTraceOut(BaseModel):
    action_request: AssistantActionRequestOut
    mutation_events: list[AssistantAuditEventOut] = Field(default_factory=list)


class AssistantRunAuditTraceOut(BaseModel):
    run: AssistantRunOut
    action_requests: list[AssistantActionRequestTraceOut] = Field(default_factory=list)
    timeline: list[AssistantAuditTimelineEntryOut] = Field(default_factory=list)
    mutation_event_count: int


class AssistantConversationMessageOut(BaseModel):
    role: AssistantMessageRole
    content: str
    recorded_at: datetime
    run_id: Optional[int] = None
    provider: Optional[AssistantProvider] = None
    model: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)
    tool_calls: list[AssistantToolCallOut] = Field(default_factory=list)
    feedback: Optional[AssistantRunFeedbackOut] = None


class AssistantConversationSummaryOut(BaseModel):
    conversation_id: int
    created_at: datetime
    updated_at: datetime
    user_id: str
    user_role: str
    workspace: Optional[AssistantWorkspace] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    provider: AssistantProvider
    model: str
    use_live_tools: bool
    title: str
    run_count: int
    latest_run_id: Optional[int] = None
    latest_user_message: Optional[str] = None
    latest_assistant_message: Optional[str] = None


class AssistantConversationOut(AssistantConversationSummaryOut):
    messages: list[AssistantConversationMessageOut] = Field(default_factory=list)
