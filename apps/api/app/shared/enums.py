from __future__ import annotations

from enum import StrEnum


class TradeNature(StrEnum):
    PHYSICAL = "PHYSICAL"
    FINANCIAL = "FINANCIAL"


class TradeStructure(StrEnum):
    SINGLE = "SINGLE"
    SWAP = "SWAP"


class TradeSide(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class PricingType(StrEnum):
    FIXED = "FIXED"
    INDEX = "INDEX"
    FORMULA = "FORMULA"
    HYBRID = "HYBRID"


class PricingStatus(StrEnum):
    PENDING = "PENDING"
    PARTIALLY_PRICED = "PARTIALLY_PRICED"
    PRICED = "PRICED"
    DISPUTED = "DISPUTED"


class SettlementStatus(StrEnum):
    PENDING = "PENDING"
    INVOICED = "INVOICED"
    PARTIALLY_SETTLED = "PARTIALLY_SETTLED"
    SETTLED = "SETTLED"
    DISPUTED = "DISPUTED"


class ConfirmationStatus(StrEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    CONFIRMED = "CONFIRMED"
    DISPUTED = "DISPUTED"


class NominationStatus(StrEnum):
    NOT_REQUIRED = "NOT_REQUIRED"
    PENDING = "PENDING"
    SCHEDULED = "SCHEDULED"
    NOMINATED = "NOMINATED"
    COMPLETED = "COMPLETED"


class AllocationStatus(StrEnum):
    NOT_REQUIRED = "NOT_REQUIRED"
    PENDING = "PENDING"
    PARTIALLY_ALLOCATED = "PARTIALLY_ALLOCATED"
    ALLOCATED = "ALLOCATED"
    COMPLETED = "COMPLETED"


class InvoiceStatus(StrEnum):
    NOT_REQUIRED = "NOT_REQUIRED"
    PENDING = "PENDING"
    ISSUED = "ISSUED"
    APPROVED = "APPROVED"
    DISPUTED = "DISPUTED"


class PaymentStatus(StrEnum):
    NOT_REQUIRED = "NOT_REQUIRED"
    PENDING = "PENDING"
    DUE = "DUE"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
