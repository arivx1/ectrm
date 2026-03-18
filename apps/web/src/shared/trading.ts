import type { TradeHeaderDraft, TradeLegDraft } from './models'

export const tradeAggregateType = 'trade'
export const currentTradeEventSchemaVersion = 2

export const commodityClassOrder = [
  'POWER',
  'CRUDE_OIL',
  'NATURAL_GAS',
  'LNG',
  'NGL',
  'REFINED_PRODUCTS',
  'CHEMICAL',
  'BASE_METAL',
  'PRECIOUS_METAL',
  'METAL_ORE',
  'AGRICULTURE',
  'OTHER',
] as const

export const tradeNatureOptions = ['PHYSICAL', 'FINANCIAL'] as const
export const tradeStructureOptions = ['SINGLE', 'SWAP'] as const
export const tradeSideOptions = ['BUY', 'SELL'] as const
export const pricingTypeOptions = ['FIXED', 'INDEX', 'FORMULA', 'HYBRID'] as const
export const pricingStatusOptions = ['PENDING', 'PRICED'] as const
export const settlementStatusOptions = ['PENDING', 'SETTLED'] as const

export const tradeStatusValues = {
  active: 'ACTIVE',
  cancelled: 'CANCELLED',
} as const

export const tradeFormDefaults = {
  nature: tradeNatureOptions[0],
  structure: tradeStructureOptions[0],
  side: tradeSideOptions[0],
  pricingType: pricingTypeOptions[0],
  pricingStatus: pricingStatusOptions[0],
  settlementStatus: settlementStatusOptions[0],
  price: '',
  volume: '',
} as const

export const tradeHeaderDefaults: TradeHeaderDraft = {
  external_trade_id: '',
  source_system: '',
  execution_timestamp: '',
  portfolio: '',
  counterparty: '',
  pricing_status: tradeFormDefaults.pricingStatus,
  settlement_status: tradeFormDefaults.settlementStatus,
  trader_user: '',
}

type TradeLegFactory = (overrides?: Partial<TradeLegDraft>) => TradeLegDraft

export function buildDefaultTradeLegs(
  makeLegDraft: TradeLegFactory,
  overrides: {
    firstLeg?: Partial<TradeLegDraft>
    secondLeg?: Partial<TradeLegDraft>
  } = {},
): TradeLegDraft[] {
  return [
    makeLegDraft({ leg_no: 1, side: tradeSideOptions[0], ...overrides.firstLeg }),
    makeLegDraft({ leg_no: 2, side: tradeSideOptions[1], ...overrides.secondLeg }),
  ]
}

export function tradeStructureSupportsLegs(tradeStructure: string): boolean {
  return tradeStructure === tradeStructureOptions[1]
}

export function pricingTypeRequiresPriceIndex(pricingType: string): boolean {
  return pricingType === 'INDEX' || pricingType === 'HYBRID'
}
