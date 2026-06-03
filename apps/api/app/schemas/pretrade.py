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
PreTradeOpportunityCategory = Literal[
    "MARK_GAP",
    "ARBITRAGE",
    "EXPOSURE_OFFSET",
    "RISK_REDUCTION",
    "RISK_INCREASE",
    "STANDARD_REVIEW",
    "WAIT_FOR_DATA",
]
PreTradeExposureDirection = Literal["LONG", "SHORT", "FLAT", "UNKNOWN"]
PreTradeExposureEffect = Literal["OFFSETS", "DEEPENS", "NEUTRAL", "UNKNOWN"]
PreTradeArbitrageFamily = Literal["PRODUCT_QUALITY", "TIME", "GEOGRAPHIC", "COMBINED"]
PreTradeArbitrageCandidateStatus = Literal["SUPPORTED", "INCOMPLETE", "UNSUPPORTED"]
PreTradeExecutablePriceBasis = Literal["ASK", "BID", "LAST", "TARGET", "ASSUMPTION"]
PreTradeTransformationEdgeType = Literal[
    "PRODUCT_CONVERSION",
    "STORAGE",
    "TRANSPORT",
    "FINANCING",
    "FEES",
    "RISK_BUFFER",
]
PreTradeNettingCandidateMatchQuality = Literal["EXACT", "PARTIAL", "REJECTED"]
PreTradeHedgeInstrumentType = Literal["FUTURES", "OPTIONS", "SWAP", "PHYSICAL_OFFSET", "NO_HEDGE", "WAIT_FOR_DATA"]
PreTradeMissingEvidenceSeverity = Literal["BLOCKING", "WARNING"]
PreTradePromotionCandidateType = Literal["NETTING_SET", "HEDGE_RECOMMENDATION", "RISK_SCENARIO"]
PreTradePromotionCandidateStatus = Literal["WATCH", "CANDIDATE"]
PreTradeNettingSetStatus = Literal["REVIEW_DRAFT", "RETIRED"]
PreTradeHedgeRecommendationStatus = Literal["REVIEW_DRAFT", "RETIRED"]
PreTradeRiskScenarioStatus = Literal["REVIEW_DRAFT", "RETIRED"]
PreTradeGovernanceAuditCategory = Literal[
    "PENDING_REVIEW",
    "RISKY_RECOMMENDATION",
    "UNRESOLVED_RISKY_RECOMMENDATION",
    "OVERRIDE",
    "BOOKED_WITH_OVERRIDE",
    "STALE_EVIDENCE",
    "PROMOTION_CANDIDATE",
]
PreTradeReviewDriftStatus = Literal["ALIGNED", "REAPPROVAL_REQUIRED", "NOT_APPROVED"]
PreTradeReviewDriftReasonCode = Literal[
    "MISSING_APPROVAL_SNAPSHOT",
    "MISSING_APPROVAL_BASELINE",
    "RECOMMENDATION_CHANGED",
    "NEWER_RECOMMENDATION_AVAILABLE",
    "SOURCE_IMPAIRMENT_APPEARED",
    "OVERRIDE_CHANGED",
]


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


class PreTradeScenarioEnrichmentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    opportunity_category: PreTradeOpportunityCategory | None = None
    hedge_intent: PreTradeHedgeInstrumentType | None = None
    residual_exposure_summary: str | None = Field(default=None, max_length=1000)
    source_freshness_summary: str | None = Field(default=None, max_length=1000)
    reviewer_focus: list[str] = Field(default_factory=list)
    recommendation_run_id: int | None = Field(default=None, ge=1)
    recommendation_run_key: str | None = Field(default=None, max_length=120)
    recommendation_stance: PreTradeRecommendationStance | None = None
    recommendation_score: int | None = Field(default=None, ge=0, le=100)
    recommendation_headline: str | None = Field(default=None, max_length=1000)
    captured_at: datetime | None = None

    @field_validator(
        "residual_exposure_summary",
        "source_freshness_summary",
        "recommendation_run_key",
        "recommendation_headline",
    )
    @classmethod
    def normalize_optional_fields(cls, value: str | None, info) -> str | None:
        return _normalize_optional_text(value, field_name=info.field_name)

    @field_validator("reviewer_focus")
    @classmethod
    def normalize_reviewer_focus(cls, value: list[str]) -> list[str]:
        normalized_items: list[str] = []
        seen_items: set[str] = set()
        for item in value:
            normalized_item = _normalize_optional_text(item, field_name="reviewer_focus")
            if normalized_item is None:
                continue
            item_key = normalized_item.casefold()
            if item_key in seen_items:
                continue
            normalized_items.append(normalized_item[:500])
            seen_items.add(item_key)
            if len(normalized_items) >= 8:
                break
        return normalized_items


class PreTradeScenarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    thesis: str | None = Field(default=None, max_length=2000)
    draft: PreTradeScenarioDraft
    enrichment: PreTradeScenarioEnrichmentOut | None = None

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
    enrichment: PreTradeScenarioEnrichmentOut | None = None

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
    enrichment: PreTradeScenarioEnrichmentOut | None = None
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
    enrichment: PreTradeScenarioEnrichmentOut | None = None
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
    enrichment: PreTradeScenarioEnrichmentOut | None = None
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
    enrichment: PreTradeScenarioEnrichmentOut | None = None
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
    approval_governance_snapshot: PreTradeGovernanceAuditExportOut | None = None
    booking_governance_snapshot: PreTradeGovernanceAuditExportOut | None = None
    activity: list[PreTradeReviewActivityOut] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    can_edit: bool


class PreTradeReviewDriftReasonOut(BaseModel):
    code: PreTradeReviewDriftReasonCode
    summary: str
    detail: str


class PreTradeReviewDriftOut(BaseModel):
    review_id: int
    checked_at: datetime
    review_status: PreTradeReviewStatus
    alignment_status: PreTradeReviewDriftStatus
    requires_reapproval: bool = False
    approval_snapshot_generated_at: datetime | None = None
    approval_snapshot_exported_by: str | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None
    approved_recommendation_run_id: int | None = None
    approved_recommendation_stance: PreTradeRecommendationStance | None = None
    approved_recommendation_score: int | None = Field(default=None, ge=0, le=100)
    current_recommendation_run_id: int | None = None
    current_recommendation_stance: PreTradeRecommendationStance | None = None
    current_recommendation_score: int | None = Field(default=None, ge=0, le=100)
    latest_recommendation_run_id: int | None = None
    latest_recommendation_stance: PreTradeRecommendationStance | None = None
    latest_recommendation_score: int | None = Field(default=None, ge=0, le=100)
    current_impaired_sources: list[str] = Field(default_factory=list)
    reasons: list[PreTradeReviewDriftReasonOut] = Field(default_factory=list)


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
    promotion_candidate_count: int = 0
    top_promotion_candidate_type: PreTradePromotionCandidateType | None = None


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


class PreTradeRecommendationEvidenceRefOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_key: str
    adapter_key: str | None = None
    adapter_label: str | None = None
    source_type: PreTradeRecommendationSourceType
    freshness: PreTradeRecommendationFreshness
    quality_status: PreTradeRecommendationSourceQuality
    record_id: str | None = None
    summary: str | None = None


class PreTradeRecommendationOpportunitySummaryOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: PreTradeOpportunityCategory
    title: str
    detail: str
    driver_keys: list[str] = Field(default_factory=list)
    source_refs: list[PreTradeRecommendationEvidenceRefOut] = Field(default_factory=list)


class PreTradeRecommendationCommodityStateOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    commodity_class: str | None = None
    commodity: str | None = None
    quality_spec: str | None = None
    location_code: str | None = None
    delivery_start: date | None = None
    delivery_end: date | None = None
    price_index_code: str | None = None
    unit_of_measure: str | None = None
    currency_code: str | None = None


class PreTradeRecommendationTransformationEdgeOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    edge_type: PreTradeTransformationEdgeType
    label: str
    bridge_cost_per_unit: float = Field(..., ge=0)
    supported: bool = True
    detail: str
    source_refs: list[PreTradeRecommendationEvidenceRefOut] = Field(default_factory=list)


class PreTradeRecommendationArbitrageCandidateOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    family: PreTradeArbitrageFamily
    status: PreTradeArbitrageCandidateStatus
    buy_state: PreTradeRecommendationCommodityStateOut
    sell_state: PreTradeRecommendationCommodityStateOut
    buy_price: float | None = None
    buy_price_basis: PreTradeExecutablePriceBasis | None = None
    sell_price: float | None = None
    sell_price_basis: PreTradeExecutablePriceBasis | None = None
    gross_spread: float | None = None
    bridge_cost: float | None = Field(default=None, ge=0)
    net_opportunity: float | None = None
    net_opportunity_pct: float | None = None
    estimated_value: float | None = None
    edges: list[PreTradeRecommendationTransformationEdgeOut] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    stop_reasons: list[str] = Field(default_factory=list)
    source_refs: list[PreTradeRecommendationEvidenceRefOut] = Field(default_factory=list)


class PreTradeRecommendationResidualExposureOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_net_position: float | None = None
    proposed_trade_delta: float | None = None
    residual_after_trade: float | None = None
    direction_before: PreTradeExposureDirection = "UNKNOWN"
    direction_after: PreTradeExposureDirection = "UNKNOWN"
    exposure_effect: PreTradeExposureEffect = "UNKNOWN"
    detail: str
    source_refs: list[PreTradeRecommendationEvidenceRefOut] = Field(default_factory=list)


class PreTradeRecommendationNettingCandidateOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_id: str
    label: str
    match_quality: PreTradeNettingCandidateMatchQuality
    gross_exposure: float | None = None
    offset_quantity: float | None = None
    residual_exposure: float | None = None
    matched_quantity: float | None = None
    residual_quantity: float | None = None
    constraints: list[str] = Field(default_factory=list)
    rejection_reasons: list[str] = Field(default_factory=list)
    source_refs: list[PreTradeRecommendationEvidenceRefOut] = Field(default_factory=list)


class PreTradeRecommendationHedgeRecommendationOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instrument_type: PreTradeHedgeInstrumentType
    decision_key: str | None = None
    rationale: str
    target_delta: float | None = None
    hedge_ratio: float | None = None
    decision_factors: list[str] = Field(default_factory=list)
    policy_stops: list[str] = Field(default_factory=list)
    source_refs: list[PreTradeRecommendationEvidenceRefOut] = Field(default_factory=list)


class PreTradeRecommendationRejectedAlternativeOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alternative: PreTradeHedgeInstrumentType
    reason: str
    source_refs: list[PreTradeRecommendationEvidenceRefOut] = Field(default_factory=list)


class PreTradeRecommendationMissingEvidenceOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_key: str
    label: str
    severity: PreTradeMissingEvidenceSeverity
    detail: str
    source_refs: list[PreTradeRecommendationEvidenceRefOut] = Field(default_factory=list)


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
    opportunity_summary: PreTradeRecommendationOpportunitySummaryOut | None = None
    arbitrage_candidate: PreTradeRecommendationArbitrageCandidateOut | None = None
    residual_exposure: PreTradeRecommendationResidualExposureOut | None = None
    netting_candidates: list[PreTradeRecommendationNettingCandidateOut] = Field(default_factory=list)
    hedge_recommendation: PreTradeRecommendationHedgeRecommendationOut | None = None
    rejected_alternatives: list[PreTradeRecommendationRejectedAlternativeOut] = Field(default_factory=list)
    missing_evidence: list[PreTradeRecommendationMissingEvidenceOut] = Field(default_factory=list)


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


class PreTradeRecommendationDraftAnalysisCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thesis: str | None = Field(default=None, max_length=2000)
    draft: PreTradeScenarioDraft
    source_scenario_id: int | None = Field(default=None, ge=1)
    source_review_id: int | None = Field(default=None, ge=1)
    input_snapshots: list[PreTradeRecommendationSourceSnapshot] = Field(default_factory=list, max_length=20)

    @field_validator("thesis")
    @classmethod
    def normalize_thesis(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value, field_name="thesis")


class PreTradeRecommendationDraftAnalysisOut(BaseModel):
    thesis: str | None
    draft: PreTradeScenarioDraft
    source_scenario_id: int | None = None
    source_review_id: int | None = None
    input_snapshots: list[PreTradeRecommendationSourceSnapshot]
    recommendation: PreTradeRecommendationResultOut
    comparison: PreTradeRecommendationRunComparisonOut | None = None
    evaluated_at: datetime


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


class PreTradeGovernancePromotionCandidateOut(BaseModel):
    candidate_type: PreTradePromotionCandidateType
    label: str
    status: PreTradePromotionCandidateStatus
    score: int = Field(..., ge=0, le=100)
    review_count: int = 0
    approved_review_count: int = 0
    booked_review_count: int = 0
    override_count: int = 0
    run_count: int = 0
    latest_review_id: int | None = None
    latest_run_id: int | None = None
    evidence_summary: str
    promotion_rationale: str
    stop_reasons: list[str] = Field(default_factory=list)
    sample_review_ids: list[int] = Field(default_factory=list)
    sample_run_ids: list[int] = Field(default_factory=list)


class PreTradeGovernanceItemsOut(BaseModel):
    generated_at: datetime
    pending_reviews: list[PreTradeReviewItemOut] = Field(default_factory=list)
    risky_recommendation_reviews: list[PreTradeReviewItemOut] = Field(default_factory=list)
    unresolved_risky_recommendation_reviews: list[PreTradeReviewItemOut] = Field(default_factory=list)
    override_reviews: list[PreTradeReviewItemOut] = Field(default_factory=list)
    booked_with_override_reviews: list[PreTradeReviewItemOut] = Field(default_factory=list)
    stale_evidence_runs: list[PreTradeGovernanceStaleEvidenceRunOut] = Field(default_factory=list)
    promotion_candidates: list[PreTradeGovernancePromotionCandidateOut] = Field(default_factory=list)


class PreTradeNettingSetPromoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner: str | None = Field(default=None, max_length=120)
    review_note: str | None = Field(default=None, max_length=2000)

    @field_validator("owner", "review_note")
    @classmethod
    def normalize_optional_fields(cls, value: str | None, info) -> str | None:
        return _normalize_optional_text(value, field_name=info.field_name)


class PreTradeNettingSetOut(BaseModel):
    netting_set_id: int
    netting_set_key: str
    name: str
    status: PreTradeNettingSetStatus
    owner: str | None = None
    review_note: str | None = None
    source_promotion_candidate_type: PreTradePromotionCandidateType
    source_promotion_status: PreTradePromotionCandidateStatus
    source_promotion_score: int = Field(..., ge=0, le=100)
    source_review_count: int = 0
    source_approved_review_count: int = 0
    source_booked_review_count: int = 0
    source_override_count: int = 0
    source_run_count: int = 0
    source_latest_review_id: int | None = None
    source_latest_run_id: int | None = None
    source_sample_review_ids: list[int] = Field(default_factory=list)
    source_sample_run_ids: list[int] = Field(default_factory=list)
    source_evidence_summary: str
    source_promotion_rationale: str
    source_stop_reasons: list[str] = Field(default_factory=list)
    draft: PreTradeScenarioDraft
    netting_candidates: list[PreTradeRecommendationNettingCandidateOut] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    can_edit: bool


class PreTradeHedgeRecommendationPromoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner: str | None = Field(default=None, max_length=120)
    review_note: str | None = Field(default=None, max_length=2000)

    @field_validator("owner", "review_note")
    @classmethod
    def normalize_optional_fields(cls, value: str | None, info) -> str | None:
        return _normalize_optional_text(value, field_name=info.field_name)


class PreTradeHedgeRecommendationOut(BaseModel):
    hedge_recommendation_id: int
    hedge_recommendation_key: str
    name: str
    status: PreTradeHedgeRecommendationStatus
    owner: str | None = None
    review_note: str | None = None
    source_promotion_candidate_type: PreTradePromotionCandidateType
    source_promotion_status: PreTradePromotionCandidateStatus
    source_promotion_score: int = Field(..., ge=0, le=100)
    source_review_count: int = 0
    source_approved_review_count: int = 0
    source_booked_review_count: int = 0
    source_override_count: int = 0
    source_run_count: int = 0
    source_latest_review_id: int | None = None
    source_latest_run_id: int | None = None
    source_sample_review_ids: list[int] = Field(default_factory=list)
    source_sample_run_ids: list[int] = Field(default_factory=list)
    source_evidence_summary: str
    source_promotion_rationale: str
    source_stop_reasons: list[str] = Field(default_factory=list)
    source_recommendation_stance: PreTradeRecommendationStance
    source_recommendation_score: int = Field(..., ge=0, le=100)
    source_recommendation_headline: str
    draft: PreTradeScenarioDraft
    residual_exposure: PreTradeRecommendationResidualExposureOut | None = None
    hedge_recommendation: PreTradeRecommendationHedgeRecommendationOut
    rejected_alternatives: list[PreTradeRecommendationRejectedAlternativeOut] = Field(default_factory=list)
    missing_evidence: list[PreTradeRecommendationMissingEvidenceOut] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    can_edit: bool


class PreTradeRiskScenarioPromoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner: str | None = Field(default=None, max_length=120)
    review_note: str | None = Field(default=None, max_length=2000)

    @field_validator("owner", "review_note")
    @classmethod
    def normalize_optional_fields(cls, value: str | None, info) -> str | None:
        return _normalize_optional_text(value, field_name=info.field_name)


class PreTradeRiskScenarioOut(BaseModel):
    risk_scenario_id: int
    risk_scenario_key: str
    name: str
    status: PreTradeRiskScenarioStatus
    owner: str | None = None
    review_note: str | None = None
    source_promotion_candidate_type: PreTradePromotionCandidateType
    source_promotion_status: PreTradePromotionCandidateStatus
    source_promotion_score: int = Field(..., ge=0, le=100)
    source_review_count: int = 0
    source_approved_review_count: int = 0
    source_booked_review_count: int = 0
    source_override_count: int = 0
    source_run_count: int = 0
    source_latest_review_id: int | None = None
    source_latest_run_id: int | None = None
    source_sample_review_ids: list[int] = Field(default_factory=list)
    source_sample_run_ids: list[int] = Field(default_factory=list)
    source_evidence_summary: str
    source_promotion_rationale: str
    source_stop_reasons: list[str] = Field(default_factory=list)
    source_review_name: str
    source_review_status: PreTradeReviewStatus
    source_review_thesis: str | None = None
    source_review_notes: str | None = None
    source_review_owner: str | None = None
    source_recommendation_stance: PreTradeRecommendationStance | None = None
    source_recommendation_score: int | None = Field(default=None, ge=0, le=100)
    source_recommendation_headline: str | None = None
    draft: PreTradeScenarioDraft
    enrichment: PreTradeScenarioEnrichmentOut | None = None
    residual_exposure: PreTradeRecommendationResidualExposureOut | None = None
    input_snapshots: list[PreTradeRecommendationSourceSnapshot] = Field(default_factory=list)
    missing_evidence: list[PreTradeRecommendationMissingEvidenceOut] = Field(default_factory=list)
    reviewer_focus: list[str] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    can_edit: bool


class PreTradeGovernanceAuditRowOut(BaseModel):
    category: PreTradeGovernanceAuditCategory
    review_id: int | None = None
    run_id: int | None = None
    run_key: str | None = None
    linked_trade_id: str | None = None
    name: str
    book: str | None = None
    commodity: str | None = None
    review_status: PreTradeReviewStatus | None = None
    recommendation_stance: PreTradeRecommendationStance | None = None
    recommendation_score: int | None = None
    override_reason: str | None = None
    override_by: str | None = None
    override_at: datetime | None = None
    booked_by: str | None = None
    booked_at: datetime | None = None
    source_adapter_key: str | None = None
    source_adapter_label: str | None = None
    source_quality_status: PreTradeRecommendationSourceQuality | None = None
    source_freshness: PreTradeRecommendationFreshness | None = None
    source_provider: str | None = None
    source_dataset: str | None = None
    source_observed_at: datetime | None = None
    promotion_candidate_type: PreTradePromotionCandidateType | None = None
    promotion_status: PreTradePromotionCandidateStatus | None = None
    promotion_score: int | None = Field(default=None, ge=0, le=100)
    summary: str


class PreTradeGovernanceAuditExportOut(BaseModel):
    generated_at: datetime
    exported_by: str
    format_version: str = "pretrade-governance-audit.v1"
    summary: PreTradeGovernanceSummaryOut
    items: PreTradeGovernanceItemsOut
    audit_rows: list[PreTradeGovernanceAuditRowOut] = Field(default_factory=list)
