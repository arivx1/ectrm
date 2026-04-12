import {
  actualizationStatusOptions,
  allocationStatusOptions,
  confirmationStatusOptions,
  creditApprovalStatusOptions,
  defaultTradeSourceSystem,
  invoiceStatusOptions,
  nominationStatusOptions,
  optionLifecycleEventTypes,
  optionSettlementStatusOptions,
  optionStyleOptions,
  optionTypeOptions,
  paymentStatusOptions,
  pricingStatusOptions,
  pricingTypeOptions,
  settlementStatusOptions,
  tradeFormDefaults,
  tradeInstrumentTypeOptions,
  tradeNatureOptions,
  tradeSideOptions,
  tradeStatusValues,
  tradeStructureOptions,
} from './trading'

export type TradeWorkflowStatusDefaults = {
  confirmation_status: string
  nomination_status: string
  allocation_status: string
  actualization_status: string
  invoice_status: string
  payment_status: string
}

export type TradeMetadataVocabulary = {
  trade_natures: string[]
  instrument_types: string[]
  trade_structures: string[]
  trade_sides: string[]
  trade_statuses: string[]
  option_types: string[]
  option_styles: string[]
  option_lifecycle_event_types: string[]
  pricing_types: string[]
  pricing_statuses: string[]
  confirmation_statuses: string[]
  nomination_statuses: string[]
  allocation_statuses: string[]
  actualization_statuses: string[]
  invoice_statuses: string[]
  payment_statuses: string[]
  settlement_statuses: string[]
  credit_approval_statuses: string[]
  option_settlement_statuses: string[]
}

export type TradeMetadataDefaults = {
  source_system: string
  instrument_type: string
  trade_nature: string
  trade_structure: string
  trade_side: string
  trade_status: string
  pricing_type: string
  pricing_status: string
  settlement_status: string
  option_style: string
  workflow_statuses_by_trade_nature: Record<string, TradeWorkflowStatusDefaults>
}

export type TradeMetadataRules = {
  pricing_types_requiring_price_index: string[]
  pricing_types_requiring_explicit_price: string[]
  trade_structures_requiring_top_level_volume: string[]
  option_allowed_instrument_type: string
  option_required_trade_nature: string
  option_required_trade_structure: string
  option_required_pricing_type: string
  option_lifecycle_event_to_status: Record<string, string>
}

export type TradeMetadata = {
  contract_version: number
  vocabulary: TradeMetadataVocabulary
  defaults: TradeMetadataDefaults
  rules: TradeMetadataRules
}

export type TradeFormMetadata = {
  sourceSystem: string
  defaults: {
    instrumentType: string
    tradeNature: string
    tradeStructure: string
    tradeSide: string
    pricingType: string
    pricingStatus: string
    settlementStatus: string
    optionType: string
    optionStyle: string
  }
  tradeInstrumentTypeOptions: readonly string[]
  optionTypeOptions: readonly string[]
  optionStyleOptions: readonly string[]
  tradeNatureOptions: readonly string[]
  tradeStructureOptions: readonly string[]
  tradeSideOptions: readonly string[]
  pricingTypeOptions: readonly string[]
  pricingStatusOptions: readonly string[]
  confirmationStatusOptions: readonly string[]
  nominationStatusOptions: readonly string[]
  allocationStatusOptions: readonly string[]
  invoiceStatusOptions: readonly string[]
  paymentStatusOptions: readonly string[]
  settlementStatusOptions: readonly string[]
  pricingTypesRequiringPriceIndex: readonly string[]
  pricingTypesRequiringExplicitPrice: readonly string[]
}

export const FALLBACK_TRADE_METADATA_CONTRACT_VERSION = 0

function buildFallbackWorkflowStatusDefaults(): Record<string, TradeWorkflowStatusDefaults> {
  return {
    PHYSICAL: {
      confirmation_status: confirmationStatusOptions[0],
      nomination_status: nominationStatusOptions[1],
      allocation_status: allocationStatusOptions[1],
      actualization_status: actualizationStatusOptions[1],
      invoice_status: invoiceStatusOptions[1],
      payment_status: paymentStatusOptions[1],
    },
    FINANCIAL: {
      confirmation_status: confirmationStatusOptions[0],
      nomination_status: nominationStatusOptions[0],
      allocation_status: allocationStatusOptions[0],
      actualization_status: actualizationStatusOptions[0],
      invoice_status: invoiceStatusOptions[0],
      payment_status: paymentStatusOptions[1],
    },
  }
}

export function buildFallbackTradeMetadata(): TradeMetadata {
  return {
    contract_version: FALLBACK_TRADE_METADATA_CONTRACT_VERSION,
    vocabulary: {
      trade_natures: [...tradeNatureOptions],
      instrument_types: [...tradeInstrumentTypeOptions],
      trade_structures: [...tradeStructureOptions],
      trade_sides: [...tradeSideOptions],
      trade_statuses: Object.values(tradeStatusValues),
      option_types: [...optionTypeOptions],
      option_styles: [...optionStyleOptions],
      option_lifecycle_event_types: [...optionLifecycleEventTypes],
      pricing_types: [...pricingTypeOptions],
      pricing_statuses: [...pricingStatusOptions],
      confirmation_statuses: [...confirmationStatusOptions],
      nomination_statuses: [...nominationStatusOptions],
      allocation_statuses: [...allocationStatusOptions],
      actualization_statuses: [...actualizationStatusOptions],
      invoice_statuses: [...invoiceStatusOptions],
      payment_statuses: [...paymentStatusOptions],
      settlement_statuses: [...settlementStatusOptions],
      credit_approval_statuses: [...creditApprovalStatusOptions],
      option_settlement_statuses: [...optionSettlementStatusOptions],
    },
    defaults: {
      source_system: defaultTradeSourceSystem,
      instrument_type: tradeFormDefaults.instrumentType,
      trade_nature: tradeFormDefaults.nature,
      trade_structure: tradeFormDefaults.structure,
      trade_side: tradeFormDefaults.side,
      trade_status: tradeStatusValues.active,
      pricing_type: tradeFormDefaults.pricingType,
      pricing_status: tradeFormDefaults.pricingStatus,
      settlement_status: tradeFormDefaults.settlementStatus,
      option_style: tradeFormDefaults.optionStyle,
      workflow_statuses_by_trade_nature: buildFallbackWorkflowStatusDefaults(),
    },
    rules: {
      pricing_types_requiring_price_index: ['INDEX', 'HYBRID'],
      pricing_types_requiring_explicit_price: ['FIXED', 'HYBRID'],
      trade_structures_requiring_top_level_volume: ['SINGLE'],
      option_allowed_instrument_type: tradeInstrumentTypeOptions[1],
      option_required_trade_nature: 'FINANCIAL',
      option_required_trade_structure: 'SINGLE',
      option_required_pricing_type: 'FIXED',
      option_lifecycle_event_to_status: {
        OptionAssigned: tradeStatusValues.assigned,
        OptionExercised: tradeStatusValues.exercised,
        OptionExpired: tradeStatusValues.expired,
      },
    },
  }
}

function uniqueOptions(values: string[] | readonly string[], fallback: readonly string[]): readonly string[] {
  const normalizedValues = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  return normalizedValues.length > 0 ? Array.from(new Set(normalizedValues)) : fallback
}

function pickDefault(
  value: string | null | undefined,
  options: readonly string[],
  fallback: string,
): string {
  if (typeof value === 'string' && options.includes(value)) {
    return value
  }

  return options[0] ?? fallback
}

export function resolveTradeFormMetadata(tradeMetadata: TradeMetadata | null | undefined): TradeFormMetadata {
  const contract = tradeMetadata ?? buildFallbackTradeMetadata()
  const tradeInstrumentTypeValues = uniqueOptions(contract.vocabulary.instrument_types, tradeInstrumentTypeOptions)
  const optionTypeValues = uniqueOptions(contract.vocabulary.option_types, optionTypeOptions)
  const optionStyleValues = uniqueOptions(contract.vocabulary.option_styles, optionStyleOptions)
  const tradeNatureValues = uniqueOptions(contract.vocabulary.trade_natures, tradeNatureOptions)
  const tradeStructureValues = uniqueOptions(contract.vocabulary.trade_structures, tradeStructureOptions)
  const tradeSideValues = uniqueOptions(contract.vocabulary.trade_sides, tradeSideOptions)
  const pricingTypeValues = uniqueOptions(contract.vocabulary.pricing_types, pricingTypeOptions)
  const pricingStatusValues = uniqueOptions(contract.vocabulary.pricing_statuses, pricingStatusOptions)
  const confirmationStatusValues = uniqueOptions(
    contract.vocabulary.confirmation_statuses,
    confirmationStatusOptions,
  )
  const nominationStatusValues = uniqueOptions(contract.vocabulary.nomination_statuses, nominationStatusOptions)
  const allocationStatusValues = uniqueOptions(contract.vocabulary.allocation_statuses, allocationStatusOptions)
  const invoiceStatusValues = uniqueOptions(contract.vocabulary.invoice_statuses, invoiceStatusOptions)
  const paymentStatusValues = uniqueOptions(contract.vocabulary.payment_statuses, paymentStatusOptions)
  const settlementStatusValues = uniqueOptions(contract.vocabulary.settlement_statuses, settlementStatusOptions)

  return {
    sourceSystem: contract.defaults.source_system || defaultTradeSourceSystem,
    defaults: {
      instrumentType: pickDefault(
        contract.defaults.instrument_type,
        tradeInstrumentTypeValues,
        tradeFormDefaults.instrumentType,
      ),
      tradeNature: pickDefault(contract.defaults.trade_nature, tradeNatureValues, tradeFormDefaults.nature),
      tradeStructure: pickDefault(
        contract.defaults.trade_structure,
        tradeStructureValues,
        tradeFormDefaults.structure,
      ),
      tradeSide: pickDefault(contract.defaults.trade_side, tradeSideValues, tradeFormDefaults.side),
      pricingType: pickDefault(contract.defaults.pricing_type, pricingTypeValues, tradeFormDefaults.pricingType),
      pricingStatus: pickDefault(
        contract.defaults.pricing_status,
        pricingStatusValues,
        tradeFormDefaults.pricingStatus,
      ),
      settlementStatus: pickDefault(
        contract.defaults.settlement_status,
        settlementStatusValues,
        tradeFormDefaults.settlementStatus,
      ),
      optionType: pickDefault(optionTypeValues[0], optionTypeValues, tradeFormDefaults.optionType),
      optionStyle: pickDefault(contract.defaults.option_style, optionStyleValues, tradeFormDefaults.optionStyle),
    },
    tradeInstrumentTypeOptions: tradeInstrumentTypeValues,
    optionTypeOptions: optionTypeValues,
    optionStyleOptions: optionStyleValues,
    tradeNatureOptions: tradeNatureValues,
    tradeStructureOptions: tradeStructureValues,
    tradeSideOptions: tradeSideValues,
    pricingTypeOptions: pricingTypeValues,
    pricingStatusOptions: pricingStatusValues,
    confirmationStatusOptions: confirmationStatusValues,
    nominationStatusOptions: nominationStatusValues,
    allocationStatusOptions: allocationStatusValues,
    invoiceStatusOptions: invoiceStatusValues,
    paymentStatusOptions: paymentStatusValues,
    settlementStatusOptions: settlementStatusValues,
    pricingTypesRequiringPriceIndex: uniqueOptions(
      contract.rules.pricing_types_requiring_price_index,
      ['INDEX', 'HYBRID'],
    ),
    pricingTypesRequiringExplicitPrice: uniqueOptions(
      contract.rules.pricing_types_requiring_explicit_price,
      ['FIXED', 'HYBRID'],
    ),
  }
}

export function tradeFormMetadataRequiresPriceIndex(
  metadata: Pick<TradeFormMetadata, 'pricingTypesRequiringPriceIndex'>,
  pricingType: string,
): boolean {
  return metadata.pricingTypesRequiringPriceIndex.includes(pricingType)
}

export function tradeFormMetadataRequiresExplicitPrice(
  metadata: Pick<TradeFormMetadata, 'pricingTypesRequiringExplicitPrice'>,
  pricingType: string,
): boolean {
  return metadata.pricingTypesRequiringExplicitPrice.includes(pricingType)
}
