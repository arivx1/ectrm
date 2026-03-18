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
    PRICED = "PRICED"


class SettlementStatus(StrEnum):
    PENDING = "PENDING"
    SETTLED = "SETTLED"
