from __future__ import annotations

import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from apps.api.app.schemas._validation import normalize_optional_text, normalize_required_text


DocumentIngestionStatus = Literal["UPLOADED", "PROCESSING", "ANALYZED", "FAILED"]
DocumentAnalysisStatus = Literal["PENDING", "ANALYZED", "FAILED"]
DocumentReviewStatus = Literal["UNREVIEWED", "IN_REVIEW", "VERIFIED"]
DocumentPageReviewStatus = Literal["UNREVIEWED", "REVIEWED"]
DocumentPageTextSource = Literal["none", "pdf_text", "ocr"]
DocumentProcessorProvider = Literal["openai", "anthropic", "google"]
DocumentProcessorSelection = Literal["builtin", "openai", "anthropic", "google"]
DocumentFieldValueType = Literal["text", "date", "number", "currency", "quantity", "identifier"]
DocumentKind = Literal[
    "UNKNOWN",
    "TRADE_COMMUNICATION",
    "TRADE_CONFIRMATION",
    "TRADE_CONTRACT",
    "BROKER_CONFIRMATION",
    "BROKER_STATEMENT",
    "PIPELINE_STATEMENT",
    "TRUCK_TICKET",
    "QUALITY_STATEMENT",
    "SAMPLING_ANALYSIS",
    "QUALITY_SPECIFICATION",
    "HAZARDOUS_CARGO_DOCUMENTATION",
    "DELIVERY_CONFIRMATION",
    "INVOICE",
    "BILL_OF_LADING",
    "CERTIFICATE_OF_ANALYSIS",
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
    "GENERAL",
]
DocumentTargetRole = Literal["PRIMARY", "SECONDARY", "REFERENCE"]
DocumentRoutingStrategy = Literal[
    "TRADE_FIRST",
    "DELIVERY_FIRST",
    "SETTLEMENT_FIRST",
    "ATTACHMENT_FIRST",
    "MANUAL_REVIEW",
]
DocumentRoutingStatus = Literal["READY", "PARTIAL", "INSUFFICIENT", "MANUAL_REVIEW"]
DocumentLinkageStatus = Literal["READY", "CANDIDATE", "CREATE", "MANUAL_REVIEW"]
DocumentLinkageAction = Literal["ATTACH", "REVIEW", "CREATE", "MANUAL_REVIEW"]
DocumentActionPlanStatus = Literal["READY", "REVIEW", "BLOCKED"]
DocumentActionType = Literal["ATTACH_EXISTING_RECORD", "CREATE_RECORD_FROM_DOCUMENT", "MANUAL_REVIEW"]

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


class DocumentKindSchemaOut(BaseModel):
    document_kind: DocumentKind | str
    label: str
    document_family: DocumentFamily | str = "GENERAL"
    description: str
    review_guidance: str
    linkage_summary: str
    record_targets: list[DocumentRecordTargetOut] = Field(default_factory=list)
    matching_keys: list[str] = Field(default_factory=list)
    header_fields: list[DocumentFieldSchemaOut] = Field(default_factory=list)
    table_templates: list[DocumentTableTemplateSchemaOut] = Field(default_factory=list)


class DocumentSchemaRegistryOut(BaseModel):
    version: str
    document_kinds: list[DocumentKindSchemaOut] = Field(default_factory=list)


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
    title: str
    description: str
    confidence: float = Field(default=0, ge=0, le=1)
    target: Optional[DocumentActionRecordRefOut] = None
    owner: Optional[DocumentActionRecordRefOut] = None
    reasons: list[str] = Field(default_factory=list)
    payload: dict[str, object] = Field(default_factory=dict)


class DocumentRecordLinkOut(BaseModel):
    record_type: str
    record_id: str
    record_label: str
    role: DocumentTargetRole = "PRIMARY"
    source: str
    summary: str
    linked_at: datetime
    linked_by: str


class DocumentProcessorProviderStatusOut(BaseModel):
    provider: DocumentProcessorProvider
    label: str
    enabled: bool
    configured: bool
    is_default: bool
    default_model: str
    base_url: str
    setup_env_var: str


class DocumentProcessorRuntimeSettingsOut(BaseModel):
    enabled: bool
    default_provider: DocumentProcessorProvider
    effective_default_provider: Optional[DocumentProcessorProvider]
    configured_provider_count: int
    providers: list[DocumentProcessorProviderStatusOut]


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


class DocumentIngestionPageOut(BaseModel):
    page_id: int
    page_number: int
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
    processor_trace: Optional[DocumentProcessorPageTraceOut] = None
    routing_assessment: Optional[DocumentRoutingAssessmentOut] = None


class DocumentIngestionOut(BaseModel):
    document_id: str
    original_filename: str
    display_name: str
    content_type: str
    storage_key: str
    sha256: str
    size_bytes: int
    page_count: int
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
    pages: list[DocumentIngestionPageOut] = Field(default_factory=list)


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


class DocumentIngestionUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=255)
    review_status: Optional[DocumentReviewStatus] = None
    review_notes: Optional[str] = Field(default=None, max_length=4_000)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="display_name")

    @field_validator("review_notes")
    @classmethod
    def normalize_review_notes(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="review_notes")


class DocumentIngestionProcessRequest(BaseModel):
    processor_provider: Optional[DocumentProcessorSelection] = None
