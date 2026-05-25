from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from apps.api.app.schemas._validation import normalize_optional_text, normalize_required_text


DocumentIngestionStatus = Literal["UPLOADED", "PROCESSING", "ANALYZED", "FAILED"]
DocumentAnalysisStatus = Literal["PENDING", "ANALYZED", "FAILED"]
DocumentReviewStatus = Literal["UNREVIEWED", "IN_REVIEW", "VERIFIED"]
DocumentVerificationMode = Literal["STRICT", "STATUS_ONLY"]
DocumentPageReviewStatus = Literal["UNREVIEWED", "REVIEWED"]
DocumentPageTextSource = Literal["none", "pdf_text", "ocr"]
DocumentProcessorProvider = Literal["openai", "anthropic", "google"]
DocumentProcessorSelection = Literal["builtin", "openai", "anthropic", "google"]
DocumentFieldValueType = Literal["text", "date", "number", "currency", "quantity", "identifier"]
DocumentFacetValueType = Literal["single_select", "multi_select", "boolean", "text", "date", "identifier"]
DocumentFacetSource = Literal["EXTRACTED", "LINKED_RECORD", "MANUAL", "AI_SUGGESTED", "SYSTEM_DERIVED"]
DocumentFacetReviewStatus = Literal["SUGGESTED", "CONFIRMED", "REJECTED"]
DocumentExtractionCardinality = Literal["one", "many"]
DocumentKind = Literal[
    "UNKNOWN",
    "TRADE_COMMUNICATION",
    "DEAL_RECAP",
    "PURCHASE_ORDER",
    "SALES_ORDER",
    "TRADE_CONFIRMATION",
    "TRADE_CONTRACT",
    "BROKER_CONFIRMATION",
    "BROKER_STATEMENT",
    "PRICE_PUBLICATION",
    "LETTER_OF_CREDIT",
    "NOMINATION",
    "CURTAILMENT_NOTICE",
    "PIPELINE_STATEMENT",
    "RAILCAR_TICKET",
    "DISPATCH_NOTICE",
    "TRUCK_TICKET",
    "QUALITY_STATEMENT",
    "SAMPLING_ANALYSIS",
    "QUALITY_SPECIFICATION",
    "INSPECTION_REPORT",
    "FORCE_MAJEURE_NOTICE",
    "HAZARDOUS_CARGO_DOCUMENTATION",
    "CERTIFICATE_OF_ORIGIN",
    "DELIVERY_CONFIRMATION",
    "NOTICE_OF_READINESS",
    "DEMURRAGE_CLAIM",
    "INVOICE",
    "BILL_OF_LADING",
    "PACKING_LIST",
    "CERTIFICATE_OF_ANALYSIS",
    "PAYMENT_ADVICE",
    "OUTAGE_NOTICE",
    "STORAGE_STATEMENT",
    "SETTLEMENT_STATEMENT",
    "WEIGH_TICKET",
    "OTHER",
]
DocumentFamily = Literal[
    "TRADE_EXECUTION",
    "TRADE_RECONCILIATION",
    "LOGISTICS",
    "NETWORK_FLOW",
    "QUALITY",
    "COMPLIANCE",
    "SETTLEMENT",
    "MARKET_DATA",
    "GENERAL",
]
DocumentTargetRole = Literal["PRIMARY", "SECONDARY", "REFERENCE"]
DocumentRoutingStrategy = Literal[
    "TRADE_FIRST",
    "DELIVERY_FIRST",
    "SETTLEMENT_FIRST",
    "MARKET_DATA_FIRST",
    "ATTACHMENT_FIRST",
    "MANUAL_REVIEW",
]
DocumentRoutingStatus = Literal["READY", "PARTIAL", "INSUFFICIENT", "MANUAL_REVIEW"]
DocumentLinkageStatus = Literal["READY", "CANDIDATE", "CREATE", "MANUAL_REVIEW"]
DocumentLinkageAction = Literal["ATTACH", "REVIEW", "CREATE", "MANUAL_REVIEW"]
DocumentLinkageCandidateState = Literal[
    "ATTACH_READY",
    "ATTACH_REVIEW",
    "CREATE_CANDIDATE",
    "OWNER_REQUIRED",
    "MANUAL_REVIEW",
    "ALREADY_LINKED",
]
DocumentActionPlanStatus = Literal["READY", "REVIEW", "BLOCKED"]
DocumentActionType = Literal["ATTACH_EXISTING_RECORD", "CREATE_RECORD_FROM_DOCUMENT", "MANUAL_REVIEW"]
DocumentGmailInboxProvider = Literal["gmail_api"]
DocumentGmailInboxAuthStatus = Literal["none", "partial", "configured"]
DocumentWorkflowStatus = Literal["READY", "REVIEW", "BLOCKED", "EXECUTED"]
DocumentWorkflowExecutionStatus = Literal["EXECUTED"]
DocumentWorkflowObservationAction = Literal["CREATED", "UPDATED", "UNCHANGED"]
DocumentActionApprovalRequestStatus = Literal["PENDING", "EXECUTED", "REJECTED"]

FIELD_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
TEMPLATE_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,63}$")


def _normalize_field_key(value: str, *, field_name: str) -> str:
    normalized = normalize_required_text(value, field_name=field_name, lowercase=True)
    normalized = re.sub(r"[^a-z0-9_]+", "_", normalized).strip("_")
    if not FIELD_KEY_PATTERN.fullmatch(normalized):
        raise ValueError(f"{field_name} must start with a letter and use lowercase letters, numbers, or underscores")
    return normalized


class DocumentFieldSchemaOut(BaseModel):
    field_key: str
    label: str
    description: Optional[str] = None
    value_type: DocumentFieldValueType = "text"
    required: bool = False


class DocumentTableColumnSchemaOut(BaseModel):
    column_key: str
    label: str
    description: Optional[str] = None
    value_type: DocumentFieldValueType = "text"
    required: bool = False


class DocumentTableTemplateSchemaOut(BaseModel):
    template_key: str
    label: str
    description: Optional[str] = None
    min_occurrences: int = Field(default=0, ge=0, le=10)
    max_occurrences: Optional[int] = Field(default=None, ge=1, le=50)
    columns: list[DocumentTableColumnSchemaOut] = Field(default_factory=list)


class DocumentRecordTargetOut(BaseModel):
    record_type: str
    label: str
    role: DocumentTargetRole = "PRIMARY"
    match_hint: str
    create_if_missing: bool = False


class DocumentFacetValueOut(BaseModel):
    code: str
    label: str
    description: Optional[str] = None


class DocumentFacetSchemaOut(BaseModel):
    facet_key: str
    label: str
    description: Optional[str] = None
    value_type: DocumentFacetValueType | str = "single_select"
    repeatable: bool = False
    required: bool = False
    allowed_values: list[DocumentFacetValueOut] = Field(default_factory=list)


class DocumentFacetAssignmentInput(BaseModel):
    facet_key: str = Field(..., min_length=2, max_length=64)
    value_code: str = Field(..., min_length=1, max_length=100)
    value_label: Optional[str] = Field(default=None, max_length=160)
    source: DocumentFacetSource = "MANUAL"
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    review_status: DocumentFacetReviewStatus = "CONFIRMED"
    evidence: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("facet_key")
    @classmethod
    def normalize_facet_key(cls, value: str) -> str:
        return _normalize_field_key(value, field_name="facet_key")

    @field_validator("value_code")
    @classmethod
    def normalize_value_code(cls, value: str) -> str:
        return normalize_required_text(value, field_name="value_code", uppercase=True)

    @field_validator("value_label")
    @classmethod
    def normalize_value_label(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="value_label")

    @field_validator("evidence")
    @classmethod
    def normalize_evidence(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            text = normalize_optional_text(item, field_name="evidence")
            if text is None or text in seen:
                continue
            seen.add(text)
            normalized.append(text)
        return normalized


class DocumentFacetAssignmentOut(BaseModel):
    facet_value_id: int
    document_id: str
    page_id: Optional[int] = None
    facet_key: str
    facet_label: str
    value_code: str
    value_label: str
    source: DocumentFacetSource | str = "MANUAL"
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    review_status: DocumentFacetReviewStatus | str = "CONFIRMED"
    evidence: list[str] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class DocumentExtractionObjectSchemaOut(BaseModel):
    object_key: str
    label: str
    cardinality: DocumentExtractionCardinality | str = "one"
    source_object_type: Optional[str] = None
    canonical_table: Optional[str] = None
    description: Optional[str] = None
    field_keys: list[str] = Field(default_factory=list)
    table_template_keys: list[str] = Field(default_factory=list)
    child_object_keys: list[str] = Field(default_factory=list)


class DocumentKindSchemaOut(BaseModel):
    document_kind: DocumentKind | str
    label: str
    document_family: DocumentFamily | str = "GENERAL"
    description: str
    review_guidance: str
    linkage_summary: str
    record_targets: list[DocumentRecordTargetOut] = Field(default_factory=list)
    matching_keys: list[str] = Field(default_factory=list)
    facets: list[DocumentFacetSchemaOut] = Field(default_factory=list)
    extraction_schema_code: Optional[str] = None
    deep_extraction_required: bool = False
    extraction_objects: list[DocumentExtractionObjectSchemaOut] = Field(default_factory=list)
    validation_rules: list[str] = Field(default_factory=list)
    review_rules: list[str] = Field(default_factory=list)
    header_fields: list[DocumentFieldSchemaOut] = Field(default_factory=list)
    table_templates: list[DocumentTableTemplateSchemaOut] = Field(default_factory=list)


class DocumentSchemaRegistryOut(BaseModel):
    version: str
    document_kinds: list[DocumentKindSchemaOut] = Field(default_factory=list)
    document_facets: list[DocumentFacetSchemaOut] = Field(default_factory=list)


class DocumentRoutingCandidateOut(BaseModel):
    record_type: str
    label: str
    role: DocumentTargetRole = "PRIMARY"
    score: float = Field(default=0, ge=0, le=1)
    matched_keys: list[str] = Field(default_factory=list)
    missing_keys: list[str] = Field(default_factory=list)
    rationale: str
    create_if_missing: bool = False


class DocumentRoutingAssessmentOut(BaseModel):
    routing_strategy: DocumentRoutingStrategy = "MANUAL_REVIEW"
    status: DocumentRoutingStatus = "MANUAL_REVIEW"
    confidence: float = Field(default=0, ge=0, le=1)
    primary_record_type: Optional[str] = None
    primary_label: Optional[str] = None
    matched_keys: list[str] = Field(default_factory=list)
    missing_keys: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    candidates: list[DocumentRoutingCandidateOut] = Field(default_factory=list)


class DocumentLinkageCandidateOut(BaseModel):
    record_type: str
    record_id: Optional[str] = None
    record_label: str
    role: DocumentTargetRole = "PRIMARY"
    candidate_state: DocumentLinkageCandidateState = "ATTACH_REVIEW"
    existing_record: bool = True
    score: float = Field(default=0, ge=0, le=1)
    matched_keys: list[str] = Field(default_factory=list)
    missing_keys: list[str] = Field(default_factory=list)
    summary: str
    reason: str
    create_if_missing: bool = False


class DocumentLinkageAssessmentOut(BaseModel):
    status: DocumentLinkageStatus = "MANUAL_REVIEW"
    recommended_action: DocumentLinkageAction = "MANUAL_REVIEW"
    confidence: float = Field(default=0, ge=0, le=1)
    primary_record_type: Optional[str] = None
    primary_record_id: Optional[str] = None
    primary_record_label: Optional[str] = None
    reasons: list[str] = Field(default_factory=list)
    candidates: list[DocumentLinkageCandidateOut] = Field(default_factory=list)


class DocumentActionRecordRefOut(BaseModel):
    record_type: str
    record_id: Optional[str] = None
    record_label: str
    existing_record: bool = True


class DocumentActionPlanOut(BaseModel):
    status: DocumentActionPlanStatus = "REVIEW"
    action_type: DocumentActionType = "MANUAL_REVIEW"
    operation_type: Optional[str] = None
    candidate_state: DocumentLinkageCandidateState = "MANUAL_REVIEW"
    title: str
    description: str
    confidence: float = Field(default=0, ge=0, le=1)
    target: Optional[DocumentActionRecordRefOut] = None
    owner: Optional[DocumentActionRecordRefOut] = None
    required_owner_record_types: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    payload: dict[str, object] = Field(default_factory=dict)


class DocumentActionGovernanceOut(BaseModel):
    status: str
    recommended_execution_mode: str
    manual_execution_allowed: bool = False
    auto_execution_allowed: bool = False
    approval_required: bool = False
    risk_flags: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


class DocumentActionApprovalRequestCreate(BaseModel):
    request_comment: Optional[str] = Field(default=None, max_length=2_000)

    @field_validator("request_comment")
    @classmethod
    def normalize_request_comment(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="request_comment")


class DocumentActionApprovalDecisionRequest(BaseModel):
    decision_comment: str = Field(min_length=1, max_length=4_000)

    @field_validator("decision_comment")
    @classmethod
    def normalize_decision_comment(cls, value: str) -> str:
        return normalize_required_text(value, field_name="decision_comment")


class DocumentRecordCandidateSelectionRequest(BaseModel):
    record_type: str = Field(min_length=1, max_length=64)
    record_id: str = Field(min_length=1, max_length=96)
    request_comment: Optional[str] = Field(default=None, max_length=2_000)

    @field_validator("record_type")
    @classmethod
    def normalize_record_type(cls, value: str) -> str:
        return normalize_required_text(value, field_name="record_type", uppercase=True)

    @field_validator("record_id")
    @classmethod
    def normalize_record_id(cls, value: str) -> str:
        return normalize_required_text(value, field_name="record_id")

    @field_validator("request_comment")
    @classmethod
    def normalize_selection_request_comment(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="request_comment")


class DocumentActionApprovalRequestOut(BaseModel):
    request_id: int
    document_id: str
    status: DocumentActionApprovalRequestStatus
    title: str
    description: str
    action_type: DocumentActionType
    operation_type: Optional[str] = None
    governance_status: str
    target_record_type: Optional[str] = None
    target_record_id: Optional[str] = None
    owner_record_type: Optional[str] = None
    owner_record_id: Optional[str] = None
    request_comment: Optional[str] = None
    decision_comment: Optional[str] = None
    action_plan_snapshot: dict[str, object] = Field(default_factory=dict)
    governance_snapshot: dict[str, object] = Field(default_factory=dict)
    result_snapshot: dict[str, object] = Field(default_factory=dict)
    error_detail: Optional[str] = None
    execution_decision_id: Optional[int] = None
    requested_at: datetime
    requested_by: str
    decided_at: Optional[datetime] = None
    decided_by: Optional[str] = None


class DocumentRecordLinkOut(BaseModel):
    record_type: str
    record_id: str
    record_label: str
    role: DocumentTargetRole = "PRIMARY"
    source: str
    summary: str
    linked_at: datetime
    linked_by: str


class DocumentWorkflowOut(BaseModel):
    workflow_id: str
    label: str
    document_kind: str
    document_type_label: str
    description: str
    status: DocumentWorkflowStatus = "READY"
    recommended: bool = False
    action_type: Optional[DocumentActionType] = None
    operation_type: Optional[str] = None
    candidate_state: Optional[DocumentLinkageCandidateState] = None
    record_effect: Optional[str] = None
    target: Optional[DocumentActionRecordRefOut] = None
    owner: Optional[DocumentActionRecordRefOut] = None
    required_owner_record_types: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    governance_status: Optional[str] = None
    recommended_execution_mode: Optional[str] = None
    approval_required: bool = False
    risk_flags: list[str] = Field(default_factory=list)
    disabled_reason: Optional[str] = None
    reasons: list[str] = Field(default_factory=list)


class DocumentWorkflowListOut(BaseModel):
    document_id: str
    document_kind: Optional[str] = None
    document_type_label: Optional[str] = None
    linkage_assessment: Optional[DocumentLinkageAssessmentOut] = None
    action_plan: Optional[DocumentActionPlanOut] = None
    governance: Optional[DocumentActionGovernanceOut] = None
    pending_approval_request: Optional[DocumentActionApprovalRequestOut] = None
    record_links: list[DocumentRecordLinkOut] = Field(default_factory=list)
    workflows: list[DocumentWorkflowOut] = Field(default_factory=list)
    empty_message: str = "No workflows assigned to this document type."


class DocumentWorkflowPriceObservationOut(BaseModel):
    price_index_code: str
    observation_date: date
    value: float
    unit_code: str
    currency_code: Optional[str] = None
    source_provider: str
    source_series_id: str
    action: DocumentWorkflowObservationAction
    observation_id: Optional[int] = None


class DocumentWorkflowExecutionOut(BaseModel):
    document_id: str
    workflow_id: str
    label: str
    status: DocumentWorkflowExecutionStatus = "EXECUTED"
    message: str
    run_id: int
    observation_count: int
    created_count: int = 0
    updated_count: int = 0
    unchanged_count: int = 0
    price_index_codes: list[str] = Field(default_factory=list)
    observations: list[DocumentWorkflowPriceObservationOut] = Field(default_factory=list)


class DocumentProcessorProviderStatusOut(BaseModel):
    provider: DocumentProcessorProvider
    label: str
    enabled: bool
    configured: bool
    is_default: bool
    default_model: str
    available_models: list[str] = Field(default_factory=list)
    base_url: str
    setup_env_var: str


class DocumentGmailInboxRuntimeSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: DocumentGmailInboxProvider = "gmail_api"
    account_email: Optional[str] = None
    query: str
    max_messages_per_import: int
    auth_status: DocumentGmailInboxAuthStatus = "none"


class DocumentProcessorRuntimeSettingsOut(BaseModel):
    enabled: bool
    default_provider: DocumentProcessorProvider
    effective_default_provider: Optional[DocumentProcessorProvider]
    configured_provider_count: int
    ai_processing_confidence_threshold: float = Field(default=0.46, ge=0, le=1)
    providers: list[DocumentProcessorProviderStatusOut]
    gmail_inbox: Optional[DocumentGmailInboxRuntimeSettingsOut] = None


class DocumentProcessorTraceOut(BaseModel):
    provider: Optional[DocumentProcessorProvider] = None
    model: Optional[str] = None
    applied: bool = False
    overrode_heuristics: bool = False
    partial: bool = False
    warning_count: int = 0
    warnings: list[str] = Field(default_factory=list)


class DocumentProcessorPageTraceOut(DocumentProcessorTraceOut):
    heuristic_document_kind: Optional[str] = None
    heuristic_document_subtype: Optional[str] = None


class DocumentProcessorDocumentTraceOut(DocumentProcessorTraceOut):
    applied_page_count: int = 0
    overridden_page_count: int = 0
    partial_page_count: int = 0


class DocumentExtractedFieldOut(BaseModel):
    field_key: str
    label: str
    value: str
    confidence: Optional[float] = None
    source: str


class DocumentTableBlockOut(BaseModel):
    table_index: int
    template_key: Optional[str] = None
    title: Optional[str] = None
    columns: list[str] = Field(default_factory=list)
    rows: list[dict[str, Optional[str]]] = Field(default_factory=list)
    header_row_detected: bool = False
    source: str


class DocumentUnderstandingSourceCountsOut(BaseModel):
    none: int = 0
    pdf_text: int = 0
    ocr: int = 0


class DocumentUnderstandingTextStatsOut(BaseModel):
    source: DocumentPageTextSource = "none"
    text_available: bool = False
    character_count: int = 0
    line_count: int = 0
    token_count: int = 0
    numeric_token_count: int = 0
    date_like_value_count: int = 0
    currency_marker_count: int = 0


class DocumentUnderstandingDocumentTextStatsOut(BaseModel):
    pages_with_text: int = 0
    source_counts: DocumentUnderstandingSourceCountsOut = Field(default_factory=DocumentUnderstandingSourceCountsOut)
    total_character_count: int = 0
    total_line_count: int = 0
    total_token_count: int = 0
    total_numeric_token_count: int = 0
    total_date_like_value_count: int = 0
    total_currency_marker_count: int = 0


class DocumentUnderstandingLayoutHintsOut(BaseModel):
    non_empty_line_count: int = 0
    short_line_count: int = 0
    uppercase_line_count: int = 0
    key_value_line_count: int = 0
    table_like_line_count: int = 0


class DocumentUnderstandingStructureSignalsOut(BaseModel):
    header_candidate_count: int = 0
    header_candidate_keys: list[str] = Field(default_factory=list)
    table_candidate_count: int = 0
    table_template_keys: list[str] = Field(default_factory=list)
    table_column_count: int = 0
    table_column_keys: list[str] = Field(default_factory=list)
    table_row_count: int = 0


class DocumentUnderstandingVisualSignalsOut(BaseModel):
    preview_generated: bool = False
    preview_available: bool = False
    image_has_visible_content: bool = False
    ocr_used: bool = False


class DocumentUnderstandingDocumentVisualSummaryOut(BaseModel):
    preview_generated_page_count: int = 0
    preview_available_page_count: int = 0
    visible_content_page_count: int = 0


class DocumentUnderstandingContentFingerprintOut(BaseModel):
    filename_signature: Optional[str] = None
    content_features: list[str] = Field(default_factory=list)
    content_feature_count: int = 0
    learning_version: Optional[str] = None


class DocumentUnderstandingClassificationEvidenceOut(BaseModel):
    system_document_kind: Optional[str] = None
    system_document_subtype: Optional[str] = None
    system_classification_source: Optional[str] = None
    system_classification_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    matched_by: Optional[str] = None
    corrected: bool = False
    correction_count: int = 0
    corrected_document_kind: Optional[str] = None
    corrected_document_subtype: Optional[str] = None
    learning_applied: bool = False
    learning_source: Optional[str] = None
    learning_similarity: Optional[float] = Field(default=None, ge=0, le=1)
    learning_example_count: int = 0
    automated_document_kind: Optional[str] = None
    automated_document_subtype: Optional[str] = None


class DocumentUnderstandingClassificationAssessmentOut(BaseModel):
    assessment_version: Optional[str] = None
    document_kind: Optional[str] = None
    document_subtype: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    matched_by: Optional[str] = None
    supporting_evidence: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)


class DocumentIngestionPageUnderstandingOut(BaseModel):
    bundle_version: str = "document-understanding-v1"
    text_stats: DocumentUnderstandingTextStatsOut = Field(default_factory=DocumentUnderstandingTextStatsOut)
    layout_hints: DocumentUnderstandingLayoutHintsOut = Field(default_factory=DocumentUnderstandingLayoutHintsOut)
    structure_signals: DocumentUnderstandingStructureSignalsOut = Field(
        default_factory=DocumentUnderstandingStructureSignalsOut
    )
    visual_signals: DocumentUnderstandingVisualSignalsOut = Field(default_factory=DocumentUnderstandingVisualSignalsOut)
    content_fingerprint: DocumentUnderstandingContentFingerprintOut = Field(
        default_factory=DocumentUnderstandingContentFingerprintOut
    )
    classification_evidence: DocumentUnderstandingClassificationEvidenceOut = Field(
        default_factory=DocumentUnderstandingClassificationEvidenceOut
    )
    deterministic_assessment: DocumentUnderstandingClassificationAssessmentOut = Field(
        default_factory=DocumentUnderstandingClassificationAssessmentOut
    )


class DocumentIngestionUnderstandingOut(BaseModel):
    bundle_version: str = "document-understanding-v1"
    page_count: int = 0
    text_stats: DocumentUnderstandingDocumentTextStatsOut = Field(default_factory=DocumentUnderstandingDocumentTextStatsOut)
    structure_signals: DocumentUnderstandingStructureSignalsOut = Field(
        default_factory=DocumentUnderstandingStructureSignalsOut
    )
    visual_signals: DocumentUnderstandingDocumentVisualSummaryOut = Field(
        default_factory=DocumentUnderstandingDocumentVisualSummaryOut
    )
    content_fingerprint: DocumentUnderstandingContentFingerprintOut = Field(
        default_factory=DocumentUnderstandingContentFingerprintOut
    )
    deterministic_assessment: DocumentUnderstandingClassificationAssessmentOut = Field(
        default_factory=DocumentUnderstandingClassificationAssessmentOut
    )


class DocumentIngestionPageOut(BaseModel):
    page_id: int
    page_number: int
    logical_document_id: Optional[str] = None
    logical_document_key: Optional[str] = None
    classification_status: DocumentAnalysisStatus
    extraction_status: DocumentAnalysisStatus
    document_kind: DocumentKind | str
    document_subtype: Optional[str] = None
    classification_confidence: Optional[float] = None
    classification_payload: dict[str, object] = Field(default_factory=dict)
    header_fields: list[DocumentExtractedFieldOut] = Field(default_factory=list)
    table_blocks: list[DocumentTableBlockOut] = Field(default_factory=list)
    raw_text_excerpt: Optional[str] = None
    text_source: DocumentPageTextSource = "none"
    preview_available: bool = False
    processing_warnings: list[str] = Field(default_factory=list)
    processing_errors: list[str] = Field(default_factory=list)
    review_status: DocumentPageReviewStatus = "UNREVIEWED"
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    processed_at: Optional[datetime] = None
    facet_values: list[DocumentFacetAssignmentOut] = Field(default_factory=list)
    processor_trace: Optional[DocumentProcessorPageTraceOut] = None
    routing_assessment: Optional[DocumentRoutingAssessmentOut] = None
    understanding: DocumentIngestionPageUnderstandingOut = Field(default_factory=DocumentIngestionPageUnderstandingOut)


class DocumentLogicalDocumentOut(BaseModel):
    logical_document_id: str
    document_id: str
    logical_document_key: str
    sequence_number: int
    page_start: int
    page_end: int
    page_count: int
    page_numbers: list[int] = Field(default_factory=list)
    document_kind: DocumentKind | str
    document_subtype: Optional[str] = None
    classification_status: DocumentAnalysisStatus
    classification_confidence: Optional[float] = None
    review_status: DocumentReviewStatus = "UNREVIEWED"
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    provenance: dict[str, object] = Field(default_factory=dict)
    routing_assessment: Optional[DocumentRoutingAssessmentOut] = None
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class DocumentActivityOut(BaseModel):
    activity_id: str
    event_type: str
    label: str
    detail: str
    occurred_at: datetime
    actor_id: Optional[str] = None
    payload: dict[str, object] = Field(default_factory=dict)


class DocumentIngestionOut(BaseModel):
    document_id: str
    uploaded_file_id: str
    original_filename: str
    display_name: str
    content_type: str
    storage_key: str
    sha256: str
    size_bytes: int
    page_count: int
    source_available: bool = False
    status: DocumentIngestionStatus
    processor_provider: Optional[DocumentProcessorSelection] = None
    processor_model: Optional[str] = None
    classifier_version: str
    extractor_version: str
    analysis_summary: dict[str, object] = Field(default_factory=dict)
    processing_errors: list[str] = Field(default_factory=list)
    review_status: DocumentReviewStatus = "UNREVIEWED"
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    processor_trace: Optional[DocumentProcessorDocumentTraceOut] = None
    routing_assessment: Optional[DocumentRoutingAssessmentOut] = None
    linkage_assessment: Optional[DocumentLinkageAssessmentOut] = None
    action_plan: Optional[DocumentActionPlanOut] = None
    record_links: list[DocumentRecordLinkOut] = Field(default_factory=list)
    facet_values: list[DocumentFacetAssignmentOut] = Field(default_factory=list)
    activity: list[DocumentActivityOut] = Field(default_factory=list)
    logical_documents: list[DocumentLogicalDocumentOut] = Field(default_factory=list)
    pages: list[DocumentIngestionPageOut] = Field(default_factory=list)
    understanding: DocumentIngestionUnderstandingOut = Field(default_factory=DocumentIngestionUnderstandingOut)


class DocumentExtractedFieldInput(BaseModel):
    field_key: str = Field(..., min_length=2, max_length=64)
    label: Optional[str] = Field(default=None, max_length=120)
    value: Optional[str] = Field(default=None, max_length=500)
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    source: Optional[str] = Field(default=None, max_length=64)

    @field_validator("field_key")
    @classmethod
    def normalize_field_key(cls, value: str) -> str:
        return _normalize_field_key(value, field_name="field_key")

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="label")

    @field_validator("value")
    @classmethod
    def normalize_value(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="value")

    @field_validator("source")
    @classmethod
    def normalize_source(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="source", lowercase=True)


class DocumentTableBlockInput(BaseModel):
    template_key: Optional[str] = Field(default=None, max_length=64)
    title: Optional[str] = Field(default=None, max_length=160)
    columns: list[str] = Field(default_factory=list, max_length=24)
    rows: list[dict[str, Optional[str]]] = Field(default_factory=list, max_length=500)
    header_row_detected: bool = False
    source: Optional[str] = Field(default=None, max_length=64)

    @field_validator("template_key")
    @classmethod
    def normalize_template_key(cls, value: Optional[str]) -> Optional[str]:
        normalized = normalize_optional_text(value, field_name="template_key", lowercase=True)
        if normalized is None:
            return None
        normalized = re.sub(r"[^a-z0-9_]+", "_", normalized).strip("_")
        if not TEMPLATE_KEY_PATTERN.fullmatch(normalized):
            raise ValueError("template_key must start with a letter and use lowercase letters, numbers, or underscores")
        return normalized

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="title")

    @field_validator("columns")
    @classmethod
    def normalize_columns(cls, value: list[str]) -> list[str]:
        normalized_columns: list[str] = []
        seen_columns: set[str] = set()
        for item in value:
            normalized = _normalize_field_key(item, field_name="columns")
            if normalized in seen_columns:
                raise ValueError("columns must not contain duplicates")
            seen_columns.add(normalized)
            normalized_columns.append(normalized)
        return normalized_columns

    @field_validator("rows")
    @classmethod
    def normalize_rows(cls, value: list[dict[str, Optional[str]]]) -> list[dict[str, Optional[str]]]:
        normalized_rows: list[dict[str, Optional[str]]] = []
        for row in value:
            normalized_row: dict[str, Optional[str]] = {}
            for key, cell in row.items():
                normalized_key = _normalize_field_key(str(key), field_name="row key")
                normalized_row[normalized_key] = normalize_optional_text(cell, field_name=f"row value '{normalized_key}'")
            normalized_rows.append(normalized_row)
        return normalized_rows

    @field_validator("source")
    @classmethod
    def normalize_source(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="source", lowercase=True)


class DocumentIngestionPageUpdate(BaseModel):
    document_kind: Optional[str] = Field(default=None, max_length=64)
    document_subtype: Optional[str] = Field(default=None, max_length=128)
    header_fields: Optional[list[DocumentExtractedFieldInput]] = None
    table_blocks: Optional[list[DocumentTableBlockInput]] = None
    facet_values: Optional[list[DocumentFacetAssignmentInput]] = None
    review_status: Optional[DocumentPageReviewStatus] = None
    review_notes: Optional[str] = Field(default=None, max_length=4_000)

    @field_validator("document_kind")
    @classmethod
    def normalize_document_kind(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="document_kind", uppercase=True)

    @field_validator("document_subtype")
    @classmethod
    def normalize_document_subtype(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="document_subtype")

    @field_validator("review_notes")
    @classmethod
    def normalize_review_notes(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="review_notes")


class DocumentGmailInboxImportRequest(BaseModel):
    query: Optional[str] = Field(default=None, max_length=500)
    max_messages: Optional[int] = Field(default=None, ge=1, le=100)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="query")


class DocumentGmailImportedDocumentOut(BaseModel):
    document_id: str
    display_name: str
    original_filename: str
    gmail_message_id: str
    gmail_thread_id: Optional[str] = None
    gmail_subject: Optional[str] = None
    gmail_sender: Optional[str] = None


class DocumentGmailInboxAttachmentOut(BaseModel):
    filename: str
    mime_type: str
    size_bytes: int = 0
    part_token: str
    attachment_id: Optional[str] = None
    importable: bool = False
    already_imported: bool = False


class DocumentGmailInboxMessageSummaryOut(BaseModel):
    message_id: str
    thread_id: Optional[str] = None
    subject: Optional[str] = None
    sender: Optional[str] = None
    received_at: Optional[datetime] = None
    snippet: Optional[str] = None
    unread: bool = False
    attachment_count: int = 0
    pdf_attachment_count: int = 0
    imported_pdf_attachment_count: int = 0


class DocumentGmailInboxBrowseResultOut(BaseModel):
    query: str
    page_size: int
    next_page_token: Optional[str] = None
    messages: list[DocumentGmailInboxMessageSummaryOut] = Field(default_factory=list)


class DocumentGmailInboxMessageDetailOut(BaseModel):
    message_id: str
    thread_id: Optional[str] = None
    subject: Optional[str] = None
    sender: Optional[str] = None
    to_recipients: Optional[str] = None
    received_at: Optional[datetime] = None
    snippet: Optional[str] = None
    unread: bool = False
    body_text: Optional[str] = None
    body_truncated: bool = False
    attachments: list[DocumentGmailInboxAttachmentOut] = Field(default_factory=list)


class DocumentGmailInboxImportResultOut(BaseModel):
    query: str
    requested_max_messages: int
    matched_message_count: int = 0
    matched_attachment_count: int = 0
    imported_count: int = 0
    skipped_count: int = 0
    imported_documents: list[DocumentGmailImportedDocumentOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DocumentIngestionUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=255)
    document_kind: Optional[str] = Field(default=None, max_length=64)
    facet_values: Optional[list[DocumentFacetAssignmentInput]] = None
    review_status: Optional[DocumentReviewStatus] = None
    verification_mode: Optional[DocumentVerificationMode] = None
    review_notes: Optional[str] = Field(default=None, max_length=4_000)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="display_name")

    @field_validator("document_kind")
    @classmethod
    def normalize_document_kind(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="document_kind", uppercase=True)

    @field_validator("review_notes")
    @classmethod
    def normalize_review_notes(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="review_notes")


class DocumentIngestionProcessRequest(BaseModel):
    processor_provider: Optional[DocumentProcessorSelection] = None
    processor_model: Optional[str] = Field(default=None, max_length=160)
    ai_confidence_threshold: Optional[float] = Field(default=None, ge=0, le=1)

    @field_validator("processor_model")
    @classmethod
    def normalize_processor_model(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="processor_model")
