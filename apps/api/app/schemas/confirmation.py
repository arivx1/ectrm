from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field
from apps.api.app.schemas.operations import OperationalRowActionStateOut


class TradeConfirmationMismatchOut(BaseModel):
    field_key: str
    label: str
    mismatch_type: str
    expected_value: Optional[str]
    actual_value: Optional[str]
    blocking: bool = True


class TradeConfirmationOut(BaseModel):
    confirmation_id: int
    trade_id: str
    source_document_id: Optional[str]
    source_document_display_name: Optional[str]
    source_document_review_status: Optional[str]
    confirmation_number: str
    status: str
    sent_at: Optional[datetime]
    confirmed_at: Optional[datetime]
    issue_count: int
    last_issued_at: Optional[datetime]
    last_issued_by: Optional[str]
    last_issue_method: Optional[str]
    last_issue_recipient: Optional[str]
    last_issue_note: Optional[str]
    receipt_status: str
    received_at: Optional[datetime]
    received_by: Optional[str]
    response_method: Optional[str]
    response_reference: Optional[str]
    response_note: Optional[str]
    dispute_reason: Optional[str]
    notes: Optional[str]
    comparison_waiver_note: Optional[str]
    comparison_waived_at: Optional[datetime]
    comparison_waived_by: Optional[str]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    workflow_item_id: Optional[int]
    workflow_owner: Optional[str]
    is_current: bool
    age_days: int
    trade_nature: str
    book: str
    portfolio: Optional[str]
    counterparty: Optional[str]
    commodity_class: str
    commodity: str
    trader_user: Optional[str]
    trade_date: Optional[date]
    delivery_start: Optional[date]
    delivery_end: Optional[date]
    comparison_status: str
    blocking_mismatch_count: int
    mismatches: list[TradeConfirmationMismatchOut]
    action_states: list[OperationalRowActionStateOut] = Field(default_factory=list)


class TradeConfirmationCreate(BaseModel):
    trade_id: str
    source_document_id: Optional[str] = None
    confirmation_number: Optional[str] = None
    status: Optional[str] = None
    sent_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    dispute_reason: Optional[str] = None
    notes: Optional[str] = None
    comparison_waiver_note: Optional[str] = None


class TradeConfirmationUpdate(BaseModel):
    source_document_id: Optional[str] = None
    confirmation_number: Optional[str] = None
    status: Optional[str] = None
    sent_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    dispute_reason: Optional[str] = None
    notes: Optional[str] = None
    comparison_waiver_note: Optional[str] = None


class TradeConfirmationIssue(BaseModel):
    issued_at: Optional[datetime] = None
    issue_method: Optional[str] = None
    issue_recipient: Optional[str] = None
    issue_note: Optional[str] = None


class TradeConfirmationResponse(BaseModel):
    action: str
    received_at: Optional[datetime] = None
    response_method: Optional[str] = None
    response_reference: Optional[str] = None
    response_note: Optional[str] = None
    dispute_reason: Optional[str] = None
