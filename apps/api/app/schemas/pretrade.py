from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from apps.api.app.schemas._validation import normalize_required_text

PreTradeTradeSide = Literal["BUY", "SELL"]
PreTradeReviewStatus = Literal["OPEN", "IN_REVIEW", "APPROVED", "REJECTED"]
PreTradeReviewActivityAction = Literal["SUBMITTED", "CLAIMED", "COMMENTED", "APPROVED", "REJECTED", "BOOKED"]
PreTradeRecommendationStance = Literal["PROCEED", "PROCEED_WITH_CARE", "ESCALATE", "WAIT_FOR_DATA"]
PreTradeRecommendationConfidence = Literal["LOW", "MEDIUM", "HIGH"]
PreTradeRecommendationCheckStatus = Literal["good", "watch", "block"]
PreTradeRecommendationSourceType = Literal["USER_INPUT", "INTERNAL", "EXTERNAL", "DERIVED"]
PreTradeRecommendationFreshness = Literal["FRESH", "STALE", "DEGRADED", "UNKNOWN"]
PreTradeRecommendationSourceQuality = Literal["OK", "STALE", "DEGRADED", "MISSING"]
PreTradeGovernanceRiskStatus = Literal["CLEAR", "WATCH", "ACTION_REQUIRED"]


def _normalize_optional_text(value: str | None, *, field_name: str) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalize_required_text(normalized, field_name=field_name)


class PreTradeScenarioDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    book: str = Field(..., min_length=1, max_length=64)
    portfolio: str | None = Field(default=None, max_length=64)
    counterparty: str | None = Field(default=None, max_length=64)
    commodity_class: str = Field(..., min_length=1, max_length=64)
    commodity: str = Field(..., min_length=1, max_length=64)
    trade_side: PreTradeTradeSide = "BUY"
    pricing_type: str = Field(..., min_length=1, max_length=64)
    price_index_code: str | None = Field(default=None, max_length=64)
    target_price: float | None = None
    target_volume: float | None = None
    trade_currency_code: str | None = Field(default=None, max_length=16)
    unit_of_measure: str | None = Field(default=None, max_length=32)
    price_unit_code: str | None = Field(default=None, max_length=32)
    location_code: str | None = Field(default=None, max_length=64)
    delivery_start: date | None = None
    delivery_end: date | None = None

    @field_validator(
        "book",
        "commodity_class",
        "commodity",
        "pricing_type",
    )
    @classmethod
    def normalize_required_fields(cls, value: str, info) -> str:
        return normalize_required_text(value, field_name=info.field_name)

    @field_validator(
        "portfolio",
        "counterparty",
        "price_index_code",
        "trade_currency_code",
        "unit_of_measure",
        "price_unit_code",
        "location_code",
    )
    @classmethod
    def normalize_optional_fields(cls, value: str | None, info) -> str | None:
        return _normalize_optional_text(value, field_name=info.field_name)

    @field_validator("target_volume")
    @classmethod
    def validate_target_volume(cls, value: float | None) -> float | None:
        if value is not None and value <= 0:
            raise ValueError("target_volume must be greater than zero")
        return value

    @model_validator(mode="after")
    def validate_delivery_window(self) -> "PreTradeScenarioDraft":
        if self.delivery_start and self.delivery_end and self.delivery_end < self.delivery_start:
            raise ValueError("delivery_end must be on or after delivery_start")
        return self


class PreTradeScenarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    thesis: str | None = Field(default=None, max_length=2000)
    draft: PreTradeScenarioDraft

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator("thesis")
    @classmethod
    def normalize_thesis(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value, field_name="thesis")


class PreTradeScenarioUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    thesis: str | None = Field(default=None, max_length=2000)
    draft: PreTradeScenarioDraft | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value, field_name="name")

    @field_validator("thesis")
    @classmethod
    def normalize_thesis(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value, field_name="thesis")


class PreTradeScenarioOut(BaseModel):
    scenario_id: int
    name: str
    thesis: str | None
    draft: PreTradeScenarioDraft
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    can_edit: bool


class PreTradeReviewItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    thesis: str | None = Field(default=None, max_length=2000)
    draft: PreTradeScenarioDraft
    source_scenario_id: int | None = Field(default=None, ge=1)
    recommendation_run_id: int | None = Field(default=None, ge=1)
    owner: str | None = Field(default=None, max_length=120)
    due_at: datetime | None = None
    review_notes: str | None = Field(default=None, max_length=4000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator("thesis", "owner", "review_notes")
    @classmethod
    def normalize_optional_fields(cls, value: str | None, info) -> str | None:
        return _normalize_optional_text(value, field_name=info.field_name)


class PreTradeReviewItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    thesis: str | None = Field(default=None, max_length=2000)
    draft: PreTradeScenarioDraft | None = None
    recommendation_run_id: int | None = Field(default=None, ge=1)
    recommendation_override_reason: str | None = Field(default=None, max_length=4000)
    review_status: PreTradeReviewStatus | None = None
    owner: str | None = Field(default=None, max_length=120)
    due_at: datetime | None = None
    review_notes: str | None = Field(default=None, max_length=4000)
    activity_comment: str | None = Field(default=None, max_length=4000)

    @field_validator("name", "thesis", "owner", "review_notes", "activity_comment", "recommendation_override_reason")
    @classmethod
    def normalize_optional_fields(cls, value: str | None, info) -> str | None:
        return _normalize_optional_text(value, field_name=info.field_name)


class PreTradeReviewActivityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    comment: str = Field(..., min_length=1, max_length=4000)

    @field_validator("comment")
    @classmethod
    def normalize_comment(cls, value: str) -> str:
        return normalize_required_text(value, field_name="comment")


class PreTradeReviewActivityOut(BaseModel):
    activity_id: str
    action: PreTradeReviewActivityAction
    actor_id: str
    occurred_at: datetime
    comment: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class PreTradeReviewRecommendationSummary(BaseModel):
    run_id: int
    run_key: str
    name: str
    stance: PreTradeRecommendationStance
    headline: str
    confidence: PreTradeRecommendationConfidence
    score: int = Field(..., ge=0, le=100)
    explanation: "PreTradeRecommendationExplanationOut | None" = None
    source_scenario_id: int | None = None
    source_review_id: int | None = None
    input_snapshot_count: int = 0
    created_at: datetime
    created_by: str


class PreTradeReviewItemOut(BaseModel):
    review_id: int
    name: str
    thesis: str | None
    draft: PreTradeScenarioDraft
    source_scenario_id: int | None
    recommendation_run_id: int | None = None
    recommendation_summary: PreTradeReviewRecommendationSummary | None = None
    recommendation_override_reason: str | None = None
    recommendation_override_by: str | None = None
    recommendation_override_at: datetime | None = None
    review_status: PreTradeReviewStatus
    owner: str | None
    due_at: datetime | None
    review_notes: str | None
    linked_trade_id: str | None = None
    linked_trade_status: str | None = None
    booked_at: datetime | None = None
    booked_by: str | None = None
    activity: list[PreTradeReviewActivityOut] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    can_edit: bool


class PreTradeGovernanceSummaryOut(BaseModel):
    generated_at: datetime
    risk_status: PreTradeGovernanceRiskStatus
    open_review_count: int = 0
    in_review_count: int = 0
    approved_review_count: int = 0
    rejected_review_count: int = 0
    pending_review_count: int = 0
    booked_review_count: int = 0
    risky_recommendation_count: int = 0
    unresolved_risky_recommendation_count: int = 0
    override_count: int = 0
    booked_with_override_count: int = 0
    stale_evidence_run_count: int = 0
    stale_evidence_source_count: int = 0
    recommendation_run_count: int = 0


class PreTradeRecommendationSourceSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_key: str = Field(..., min_length=1, max_length=120)
    adapter_key: str | None = Field(default=None, max_length=120)
    adapter_label: str | None = Field(default=None, max_length=120)
    source_type: PreTradeRecommendationSourceType
    source_available: bool = True
    captured_at: datetime | None = None
    freshness: PreTradeRecommendationFreshness = "UNKNOWN"
    quality_status: PreTradeRecommendationSourceQuality = "MISSING"
    quality_score: int = Field(default=0, ge=0, le=100)
    summary: str | None = Field(default=None, max_length=1000)
    provenance: "PreTradeRecommendationSourceProvenance" = Field(default_factory=lambda: PreTradeRecommendationSourceProvenance())
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("source_key", "adapter_key", "adapter_label")
    @classmethod
    def normalize_source_keys(cls, value: str | None, info) -> str | None:
        if info.field_name == "source_key":
            if value is None:
                raise ValueError("source_key is required")
            return normalize_required_text(value, field_name=info.field_name)
        return _normalize_optional_text(value, field_name=info.field_name)

    @field_validator("summary")
    @classmethod
    def normalize_summary(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value, field_name="summary")


class PreTradeRecommendationSourceProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str | None = Field(default=None, max_length=120)
    dataset: str | None = Field(default=None, max_length=120)
    record_id: str | None = Field(default=None, max_length=160)
    observed_at: datetime | None = None
    ingested_at: datetime | None = None
    captured_by: str | None = Field(default=None, max_length=120)

    @field_validator("provider", "dataset", "record_id", "captured_by")
    @classmethod
    def normalize_optional_fields(cls, value: str | None, info) -> str | None:
        return _normalize_optional_text(value, field_name=info.field_name)


class PreTradeRecommendationSourceAdapterOut(BaseModel):
    adapter_key: str
    label: str
    source_type: PreTradeRecommendationSourceType
    description: str
    freshness_sla_hours: int | None = Field(default=None, ge=1)
    required_for_recommendation: bool
    payload_keys: list[str] = Field(default_factory=list)
    provenance_dataset: str


class PreTradeRecommendationCheckOut(BaseModel):
    key: str
    label: str
    status: PreTradeRecommendationCheckStatus
    detail: str
    score_impact: int = 0


class PreTradeRecommendationExplanationOut(BaseModel):
    stance_rationale: str
    source_quality_rationale: str
    confidence_rationale: str
    primary_drivers: list[str] = Field(default_factory=list)
    reviewer_focus: list[str] = Field(default_factory=list)


class PreTradeRecommendationResultOut(BaseModel):
    stance: PreTradeRecommendationStance
    headline: str
    summary: str
    confidence: PreTradeRecommendationConfidence
    score: int = Field(..., ge=0, le=100)
    estimated_notional: float | None = None
    projected_credit_utilization_pct: float | None = None
    current_net_position: float | None = None
    related_active_trade_count: int = 0
    latest_mark: float | None = None
    mark_gap_pct: float | None = None
    explanation: PreTradeRecommendationExplanationOut
    checks: list[PreTradeRecommendationCheckOut]
    next_actions: list[str]


class PreTradeRecommendationSourceQualityDeltaOut(BaseModel):
    adapter_key: str
    adapter_label: str
    previous_quality_status: PreTradeRecommendationSourceQuality | None = None
    current_quality_status: PreTradeRecommendationSourceQuality | None = None
    previous_freshness: PreTradeRecommendationFreshness | None = None
    current_freshness: PreTradeRecommendationFreshness | None = None


class PreTradeRecommendationInputDeltaOut(BaseModel):
    adapter_key: str
    adapter_label: str
    change_type: Literal["ADDED", "REMOVED", "CHANGED"]


class PreTradeRecommendationRunComparisonOut(BaseModel):
    previous_run_id: int
    previous_run_key: str
    previous_created_at: datetime
    previous_stance: PreTradeRecommendationStance
    previous_score: int = Field(..., ge=0, le=100)
    stance_changed: bool
    score_delta: int
    added_primary_drivers: list[str] = Field(default_factory=list)
    removed_primary_drivers: list[str] = Field(default_factory=list)
    source_quality_changes: list[PreTradeRecommendationSourceQualityDeltaOut] = Field(default_factory=list)
    input_snapshot_changes: list[PreTradeRecommendationInputDeltaOut] = Field(default_factory=list)
    summary: str


class PreTradeRecommendationRunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    thesis: str | None = Field(default=None, max_length=2000)
    draft: PreTradeScenarioDraft | None = None
    source_scenario_id: int | None = Field(default=None, ge=1)
    source_review_id: int | None = Field(default=None, ge=1)
    input_snapshots: list[PreTradeRecommendationSourceSnapshot] = Field(default_factory=list, max_length=20)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value, field_name="name")

    @field_validator("thesis")
    @classmethod
    def normalize_thesis(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value, field_name="thesis")

    @model_validator(mode="after")
    def validate_source(self) -> "PreTradeRecommendationRunCreate":
        if self.draft is None and self.source_scenario_id is None and self.source_review_id is None:
            raise ValueError("draft, source_scenario_id, or source_review_id is required")
        return self


class PreTradeRecommendationRunOut(BaseModel):
    run_id: int
    run_key: str
    name: str
    thesis: str | None
    draft: PreTradeScenarioDraft
    source_scenario_id: int | None = None
    source_review_id: int | None = None
    input_snapshots: list[PreTradeRecommendationSourceSnapshot]
    recommendation: PreTradeRecommendationResultOut
    comparison: PreTradeRecommendationRunComparisonOut | None = None
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    can_edit: bool


class PreTradeGovernanceStaleEvidenceRunOut(BaseModel):
    run: PreTradeRecommendationRunOut
    impaired_snapshots: list[PreTradeRecommendationSourceSnapshot] = Field(default_factory=list)


class PreTradeGovernanceItemsOut(BaseModel):
    generated_at: datetime
    pending_reviews: list[PreTradeReviewItemOut] = Field(default_factory=list)
    risky_recommendation_reviews: list[PreTradeReviewItemOut] = Field(default_factory=list)
    unresolved_risky_recommendation_reviews: list[PreTradeReviewItemOut] = Field(default_factory=list)
    override_reviews: list[PreTradeReviewItemOut] = Field(default_factory=list)
    booked_with_override_reviews: list[PreTradeReviewItemOut] = Field(default_factory=list)
    stale_evidence_runs: list[PreTradeGovernanceStaleEvidenceRunOut] = Field(default_factory=list)
