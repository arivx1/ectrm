from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TransactionScenarioOut(BaseModel):
    code: str
    name: str
    description: str
    trade_count: int
    event_count: int


class TransactionSeedRequest(BaseModel):
    action: Literal["add", "replace", "delete"]
    scenario_codes: list[str] = Field(default_factory=list)
    requested_by: str = Field(..., min_length=1, max_length=128)


class TransactionSeedResult(BaseModel):
    action: str
    requested_by: str
    scenario_codes: list[str]
    books_seeded: int
    events_seeded: int
    trades_seeded: int
    trade_legs_seeded: int
    price_terms_seeded: int
    positions_rebuilt: int


class ReferenceSeedRequest(BaseModel):
    requested_by: str = Field(..., min_length=1, max_length=128)
    replace_existing: bool = True


class ReferenceSeedResult(BaseModel):
    requested_by: str
    replace_existing: bool
    entity_counts: dict[str, int]
    total_records: int


class AssistantAgentSeedRequest(BaseModel):
    requested_by: str = Field(..., min_length=1, max_length=128)


class AssistantAgentSeedResult(BaseModel):
    requested_by: str
    total_templates: int
    created_count: int
    updated_count: int
    agent_ids: list[str]


class MutationProvenanceOut(BaseModel):
    id: int
    operation_key: str
    source_surface: str
    actor_id: str | None
    actor_role: str | None
    session_id: str | None
    correlation_id: str | None
    request_method: str | None
    request_path: str | None
    outcome: str
    started_at: datetime
    completed_at: datetime
    duration_ms: int
    affected_records: list[dict[str, object]]
    details: dict[str, object]


class TradeProjectionStructuralIssueOut(BaseModel):
    trade_id: str
    last_event_id: str
    issue_type: str
    matching_trade_event_count: int
    dependent_counts: dict[str, int]
    last_event_aggregate_type: str | None = None
    last_event_aggregate_id: str | None = None


class TradeProjectionInvariantIssueOut(BaseModel):
    trade_id: str
    issue_type: str
    expected_value: str | None = None
    actual_value: str | None = None
    details: dict[str, object] = Field(default_factory=dict)


class TradeProjectionIssuePage(BaseModel):
    structural_issue_count: int
    invariant_issue_count: int
    structural_issues: list[TradeProjectionStructuralIssueOut] = Field(default_factory=list)
    invariant_issues: list[TradeProjectionInvariantIssueOut] = Field(default_factory=list)


class TradeProjectionRepairRequest(BaseModel):
    requested_by: str = Field(..., min_length=1, max_length=128)
    trade_ids: list[str] = Field(default_factory=list, max_length=100)


class TradeProjectionRepairSummaryOut(BaseModel):
    trade_id: str
    before_issue_count: int
    after_issue_count: int
    resolved_issue_types: list[str]
    confirmation_record_present: bool
    option_settlement_workflow_present: bool


class TradeProjectionRepairResult(BaseModel):
    requested_by: str
    repaired_trade_count: int
    summaries: list[TradeProjectionRepairSummaryOut] = Field(default_factory=list)
