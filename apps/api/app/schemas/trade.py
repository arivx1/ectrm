from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from apps.api.app.schemas.pretrade import PreTradeGovernanceAuditExportOut


class TradeOut(BaseModel):
    trade_id: str
    originating_option_trade_id: Optional[str]
    external_trade_id: Optional[str]
    source_system: Optional[str]
    created_at: datetime
    updated_at: datetime
    execution_timestamp: Optional[datetime]
    trade_date: Optional[date]
    effective_start_date: Optional[date]
    effective_end_date: Optional[date]
    quality_spec: Optional[str]
    unit_of_measure: Optional[str]
    trade_currency_code: Optional[str]
    location_code: Optional[str]
    delivery_start: Optional[date]
    delivery_end: Optional[date]
    price_unit_code: Optional[str]
    instrument_type: str
    option_type: Optional[str]
    option_style: Optional[str]
    option_strike_price: Optional[float]
    option_expiration_date: Optional[date]
    trade_nature: str
    trade_structure: str
    trade_side: Optional[str]
    book: str
    portfolio: Optional[str]
    counterparty: Optional[str]
    commodity_class: str
    commodity: str
    pricing_type: str
    pricing_status: str
    confirmation_status: str
    nomination_status: str
    allocation_status: str
    actualization_status: str
    price_index_code: Optional[str]
    price: Optional[float]
    volume: Optional[float]
    invoice_status: str
    payment_status: str
    settlement_status: str
    trader_user: Optional[str]
    status: str
    last_event_id: str
    pretrade_review_id: Optional[int] = None
    pretrade_recommendation_run_id: Optional[int] = None
    pretrade_approval_governance_snapshot: PreTradeGovernanceAuditExportOut | None = None
    pretrade_booking_governance_snapshot: PreTradeGovernanceAuditExportOut | None = None


class TradeWorkflowStatusDefaultsOut(BaseModel):
    confirmation_status: str
    nomination_status: str
    allocation_status: str
    actualization_status: str
    invoice_status: str
    payment_status: str


class TradeMetadataVocabularyOut(BaseModel):
    trade_natures: list[str]
    instrument_types: list[str]
    trade_structures: list[str]
    trade_sides: list[str]
    trade_statuses: list[str]
    option_types: list[str]
    option_styles: list[str]
    option_lifecycle_event_types: list[str]
    pricing_types: list[str]
    pricing_statuses: list[str]
    confirmation_statuses: list[str]
    nomination_statuses: list[str]
    allocation_statuses: list[str]
    actualization_statuses: list[str]
    invoice_statuses: list[str]
    payment_statuses: list[str]
    settlement_statuses: list[str]
    credit_approval_statuses: list[str]
    option_settlement_statuses: list[str]


class TradeMetadataDefaultsOut(BaseModel):
    source_system: str
    instrument_type: str
    trade_nature: str
    trade_structure: str
    trade_side: str
    trade_status: str
    pricing_type: str
    pricing_status: str
    settlement_status: str
    option_style: str
    workflow_statuses_by_trade_nature: dict[str, TradeWorkflowStatusDefaultsOut]


class TradeMetadataRulesOut(BaseModel):
    pricing_types_requiring_price_index: list[str]
    pricing_types_requiring_explicit_price: list[str]
    trade_structures_requiring_top_level_volume: list[str]
    option_allowed_instrument_type: str
    option_required_trade_nature: str
    option_required_trade_structure: str
    option_required_pricing_type: str
    option_lifecycle_event_to_status: dict[str, str]


class TradeMetadataOut(BaseModel):
    contract_version: int
    vocabulary: TradeMetadataVocabularyOut
    defaults: TradeMetadataDefaultsOut
    rules: TradeMetadataRulesOut
