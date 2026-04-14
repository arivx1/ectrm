from __future__ import annotations

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
