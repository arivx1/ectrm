from __future__ import annotations

from enum import StrEnum


class TradeNature(StrEnum):
    PHYSICAL = "PHYSICAL"
    FINANCIAL = "FINANCIAL"


class TradeInstrumentType(StrEnum):
    LINEAR = "LINEAR"
    OPTION = "OPTION"


class TradeStructure(StrEnum):
    SINGLE = "SINGLE"
    SWAP = "SWAP"


class TradeSide(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class TradeStatus(StrEnum):
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"
    EXERCISED = "EXERCISED"
    EXPIRED = "EXPIRED"
    ASSIGNED = "ASSIGNED"


class OptionType(StrEnum):
    CALL = "CALL"
    PUT = "PUT"


class OptionStyle(StrEnum):
    AMERICAN = "AMERICAN"
    EUROPEAN = "EUROPEAN"


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


class CreditApprovalStatus(StrEnum):
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    NOT_REQUIRED = "NOT_REQUIRED"
    REJECTED = "REJECTED"


class OptionSettlementStatus(StrEnum):
    PENDING = "PENDING"
    BOOKED = "BOOKED"
    NOT_REQUIRED = "NOT_REQUIRED"


class TradeWorkflowType(StrEnum):
    CONFIRMATION = "CONFIRMATION"
    NOMINATION = "NOMINATION"
    ALLOCATION = "ALLOCATION"
    INVOICE = "INVOICE"
    PAYMENT = "PAYMENT"
    CREDIT_APPROVAL = "CREDIT_APPROVAL"
    OPTION_SETTLEMENT = "OPTION_SETTLEMENT"


class TransportMode(StrEnum):
    UNSPECIFIED = "UNSPECIFIED"
    TRUCK = "TRUCK"
    RAIL = "RAIL"
    BARGE = "BARGE"
    VESSEL = "VESSEL"
    PIPELINE = "PIPELINE"
    POWER_GRID = "POWER_GRID"
    STORAGE = "STORAGE"


class TransportModeSource(StrEnum):
    EXPLICIT = "EXPLICIT"
    DERIVED = "DERIVED"
    UNSPECIFIED = "UNSPECIFIED"


class DeliveryModeFamily(StrEnum):
    LOGISTICS = "LOGISTICS"
    NETWORK_FLOW = "NETWORK_FLOW"
    POWER_SCHEDULE = "POWER_SCHEDULE"


class DeliveryProfile(StrEnum):
    LOAD_DISCHARGE_WINDOW = "LOAD_DISCHARGE_WINDOW"
    FLOW_WINDOW = "FLOW_WINDOW"
    INTERVAL_SCHEDULE = "INTERVAL_SCHEDULE"
