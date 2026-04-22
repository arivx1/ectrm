from __future__ import annotations

from collections.abc import Iterable

from apps.api.app.domains.trading.services.trade_event_support import (
    DEFAULT_SOURCE_SYSTEM,
    OPTION_LIFECYCLE_EVENT_TO_STATUS,
    OPTION_LIFECYCLE_EVENT_TYPES,
    default_trade_workflow_statuses,
)
from apps.api.app.schemas.trade import TradeMetadataDefaultsOut
from apps.api.app.schemas.trade import TradeMetadataOut
from apps.api.app.schemas.trade import TradeMetadataRulesOut
from apps.api.app.schemas.trade import TradeMetadataVocabularyOut
from apps.api.app.schemas.trade import TradeWorkflowStatusDefaultsOut
from apps.api.app.shared.enums import (
    ActualizationStatus,
    AllocationStatus,
    ConfirmationStatus,
    CreditApprovalStatus,
    InvoiceStatus,
    NominationStatus,
    OptionSettlementStatus,
    OptionStyle,
    OptionType,
    PaymentStatus,
    PricingStatus,
    PricingType,
    SettlementStatus,
    TradeInstrumentType,
    TradeNature,
    TradeSide,
    TradeStatus,
    TradeStructure,
)

TRADE_METADATA_CONTRACT_VERSION = 1


def _enum_values(enum_type: Iterable[object]) -> list[str]:
    return [str(member.value) for member in enum_type]


def _workflow_defaults_by_trade_nature() -> dict[str, TradeWorkflowStatusDefaultsOut]:
    workflow_defaults: dict[str, TradeWorkflowStatusDefaultsOut] = {}
    for trade_nature in TradeNature:
        workflow_defaults[trade_nature.value] = TradeWorkflowStatusDefaultsOut(
            **default_trade_workflow_statuses(trade_nature.value),
        )
    return workflow_defaults


def build_trade_metadata_contract() -> TradeMetadataOut:
    return TradeMetadataOut(
        contract_version=TRADE_METADATA_CONTRACT_VERSION,
        vocabulary=TradeMetadataVocabularyOut(
            trade_natures=_enum_values(TradeNature),
            instrument_types=_enum_values(TradeInstrumentType),
            trade_structures=_enum_values(TradeStructure),
            trade_sides=_enum_values(TradeSide),
            trade_statuses=_enum_values(TradeStatus),
            option_types=_enum_values(OptionType),
            option_styles=_enum_values(OptionStyle),
            option_lifecycle_event_types=sorted(OPTION_LIFECYCLE_EVENT_TYPES),
            pricing_types=_enum_values(PricingType),
            pricing_statuses=_enum_values(PricingStatus),
            confirmation_statuses=_enum_values(ConfirmationStatus),
            nomination_statuses=_enum_values(NominationStatus),
            allocation_statuses=_enum_values(AllocationStatus),
            actualization_statuses=_enum_values(ActualizationStatus),
            invoice_statuses=_enum_values(InvoiceStatus),
            payment_statuses=_enum_values(PaymentStatus),
            settlement_statuses=_enum_values(SettlementStatus),
            credit_approval_statuses=_enum_values(CreditApprovalStatus),
            option_settlement_statuses=_enum_values(OptionSettlementStatus),
        ),
        defaults=TradeMetadataDefaultsOut(
            source_system=DEFAULT_SOURCE_SYSTEM,
            instrument_type=TradeInstrumentType.LINEAR.value,
            trade_nature=TradeNature.PHYSICAL.value,
            trade_structure=TradeStructure.SINGLE.value,
            trade_side=TradeSide.BUY.value,
            trade_status=TradeStatus.ACTIVE.value,
            pricing_type=PricingType.FIXED.value,
            pricing_status=PricingStatus.PENDING.value,
            settlement_status=SettlementStatus.PENDING.value,
            option_style=OptionStyle.AMERICAN.value,
            workflow_statuses_by_trade_nature=_workflow_defaults_by_trade_nature(),
        ),
        rules=TradeMetadataRulesOut(
            pricing_types_requiring_price_index=[
                PricingType.INDEX.value,
                PricingType.HYBRID.value,
            ],
            pricing_types_requiring_explicit_price=[
                PricingType.FIXED.value,
                PricingType.HYBRID.value,
            ],
            trade_structures_requiring_top_level_volume=[TradeStructure.SINGLE.value],
            option_allowed_instrument_type=TradeInstrumentType.OPTION.value,
            option_required_trade_nature=TradeNature.FINANCIAL.value,
            option_required_trade_structure=TradeStructure.SINGLE.value,
            option_required_pricing_type=PricingType.FIXED.value,
            option_lifecycle_event_to_status=dict(sorted(OPTION_LIFECYCLE_EVENT_TO_STATUS.items())),
        ),
    )


__all__ = [
    "TRADE_METADATA_CONTRACT_VERSION",
    "build_trade_metadata_contract",
]
