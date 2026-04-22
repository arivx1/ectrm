import type {
  TradeCreditApprovalFreshnessRecord,
  TradeHeaderDraft,
  TradeLegDraft,
  TradeWorkflowItemRecord,
} from './models'

export const tradeAggregateType = 'trade'
export const currentTradeEventSchemaVersion = 6
export const defaultTradeSourceSystem = 'ETRM'
export const defaultTradeExecutionTime = '00:00'

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

export const tradeInstrumentTypeOptions = ['LINEAR', 'OPTION'] as const
export const tradeNatureOptions = ['PHYSICAL', 'FINANCIAL'] as const
export const tradeStructureOptions = ['SINGLE', 'SWAP'] as const
export const tradeSideOptions = ['BUY', 'SELL'] as const
export const optionTypeOptions = ['CALL', 'PUT'] as const
export const optionStyleOptions = ['AMERICAN', 'EUROPEAN'] as const
export const pricingTypeOptions = ['FIXED', 'INDEX', 'FORMULA', 'HYBRID'] as const
export const pricingStatusOptions = ['PENDING', 'PARTIALLY_PRICED', 'PRICED', 'DISPUTED'] as const
export const confirmationStatusOptions = ['PENDING', 'SENT', 'CONFIRMED', 'DISPUTED'] as const
export const nominationStatusOptions = ['NOT_REQUIRED', 'PENDING', 'SCHEDULED', 'NOMINATED', 'COMPLETED'] as const
export const allocationStatusOptions = ['NOT_REQUIRED', 'PENDING', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'COMPLETED'] as const
export const actualizationStatusOptions = ['NOT_REQUIRED', 'PENDING', 'PARTIALLY_ACTUALIZED', 'ACTUALIZED'] as const
export const creditApprovalStatusOptions = ['PENDING_REVIEW', 'APPROVED', 'NOT_REQUIRED', 'REJECTED'] as const
export const optionSettlementStatusOptions = ['PENDING', 'BOOKED', 'NOT_REQUIRED'] as const
export const invoiceStatusOptions = ['NOT_REQUIRED', 'PENDING', 'ISSUED', 'APPROVED', 'DISPUTED'] as const
export const paymentStatusOptions = ['NOT_REQUIRED', 'PENDING', 'DUE', 'PAID', 'OVERDUE'] as const
export const settlementStatusOptions = ['PENDING', 'INVOICED', 'PARTIALLY_SETTLED', 'SETTLED', 'DISPUTED'] as const

export const tradeStatusValues = {
  active: 'ACTIVE',
  cancelled: 'CANCELLED',
  exercised: 'EXERCISED',
  expired: 'EXPIRED',
  assigned: 'ASSIGNED',
} as const

export const optionLifecycleEventTypes = ['OptionExercised', 'OptionExpired', 'OptionAssigned'] as const

export type OptionLifecycleEventType = (typeof optionLifecycleEventTypes)[number]

export function tradeStatusIsActive(status: string | null | undefined): boolean {
  return (status ?? tradeStatusValues.active).trim().toUpperCase() === tradeStatusValues.active
}

export function tradeStatusIsClosed(status: string | null | undefined): boolean {
  return !tradeStatusIsActive(status)
}

export type TradeCreditHoldSummary = {
  credit_approval_status: string
  credit_hold_active: boolean
  credit_hold_reason: string | null
}

export function buildTradeCreditHoldSummary(
  item?: Pick<TradeWorkflowItemRecord, 'status' | 'notes'> | null,
): TradeCreditHoldSummary {
  const approvalStatus = item?.status?.trim().toUpperCase() || creditApprovalStatusOptions[2]
  const note = item?.notes?.trim() || ''

  if (approvalStatus === 'PENDING_REVIEW') {
    return {
      credit_approval_status: approvalStatus,
      credit_hold_active: true,
      credit_hold_reason: note || 'Credit approval is pending review.',
    }
  }

  if (approvalStatus === 'REJECTED') {
    return {
      credit_approval_status: approvalStatus,
      credit_hold_active: true,
      credit_hold_reason: note || 'Credit approval was rejected.',
    }
  }

  return {
    credit_approval_status: approvalStatus,
    credit_hold_active: false,
    credit_hold_reason: null,
  }
}

export function buildCreditApprovalFreshnessBlockerSummary(
  freshness?: Pick<TradeCreditApprovalFreshnessRecord, 'approval_blocked' | 'blocking_reasons'> | null,
): string | null {
  if (!freshness?.approval_blocked || freshness.blocking_reasons.length === 0) {
    return null
  }

  const summary = freshness.blocking_reasons.join('; ').trim()
  return summary ? `${summary.charAt(0).toUpperCase()}${summary.slice(1)}` : null
}

export const tradeFormDefaults = {
  instrumentType: tradeInstrumentTypeOptions[0],
  nature: tradeNatureOptions[0],
  structure: tradeStructureOptions[0],
  side: tradeSideOptions[0],
  optionType: optionTypeOptions[0],
  optionStyle: optionStyleOptions[0],
  optionStrikePrice: '',
  optionExpirationDate: '',
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
  trade_date: '',
  effective_start_date: '',
  effective_end_date: '',
  quality_spec: '',
  unit_of_measure: '',
  trade_currency_code: '',
  location_code: '',
  delivery_start: '',
  delivery_end: '',
  price_unit_code: '',
  portfolio: '',
  counterparty: '',
  pricing_status: tradeFormDefaults.pricingStatus,
  confirmation_status: confirmationStatusOptions[0],
  nomination_status: nominationStatusOptions[1],
  allocation_status: allocationStatusOptions[1],
  invoice_status: invoiceStatusOptions[1],
  payment_status: paymentStatusOptions[1],
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

export function tradeInstrumentUsesOptionFields(instrumentType: string): boolean {
  return instrumentType === tradeInstrumentTypeOptions[1]
}

export function tradeStructureRequiresTopLevelVolume(tradeStructure: string): boolean {
  return !tradeStructureSupportsLegs(tradeStructure)
}

export function pricingTypeRequiresPriceIndex(pricingType: string): boolean {
  return pricingType === 'INDEX' || pricingType === 'HYBRID'
}

export function pricingTypeRequiresExplicitPrice(pricingType: string): boolean {
  return pricingType === 'FIXED' || pricingType === 'HYBRID'
}

const qualitySpecOptionsByCommodity: Record<string, readonly string[]> = {
  CRUDE_OIL: [
    'Light Sweet',
    'Medium Sour',
    'Heavy Sour',
    'Synthetic Crude',
    'Condensate',
  ],
  WTI: [
    'WTI Light Sweet',
    'WTI Midland',
    'WTI Houston',
    'Cushing Spec',
    'Domestic Sweet',
  ],
  BRENT: [
    'Dated Brent',
    'Brent Blend',
    'BFOET Basket',
    'North Sea Light Sweet',
    'Forties Quality',
  ],
  LLS: [
    'LLS Light Sweet',
    'USGC Sweet',
    'Low Sulfur Sweet',
    'Premium LLS',
  ],
  ANS: [
    'ANS Medium Sour',
    'Alaska North Slope Export',
    'West Coast Refinery Spec',
  ],
  DUBAI: [
    'Dubai Medium Sour',
    'Oman/Dubai Sour',
    'Middle East Sour',
  ],
  NATURAL_GAS: [
    'Pipeline Quality',
    'Residue Gas',
    'Rich Gas',
    'Lean Gas',
    '1,000 BTU Spec',
  ],
  LNG: [
    'Lean LNG',
    'Rich LNG',
    'Pipeline-Quality Regas',
    'JKM Spec',
    'Reload Cargo Spec',
  ],
  NGL: [
    'Y-Grade Mix',
    'Fractionation Grade',
    'Purity Product',
    'Mixed NGL',
  ],
  PROPANE: [
    'HD-5 Propane',
    'Commercial Propane',
    'Propane/Butane Mix',
    'Petchem Propane',
  ],
  BUTANE: [
    'Normal Butane',
    'Commercial Butane',
    'Motor Fuel Blend Butane',
  ],
  ISOBUTANE: [
    'Isobutane Purity',
    'Alkylation Grade Isobutane',
    'Commercial Isobutane',
  ],
  ETHANE: [
    'Purity Ethane',
    'Petchem Grade Ethane',
    'Reject Ethane',
  ],
  NATURAL_GASOLINE: [
    'Y-Grade Natural Gasoline',
    'Pentanes Plus',
    'Stabilized Natural Gasoline',
  ],
  DIESEL: [
    'ULSD 15 ppm',
    'CARB ULSD',
    'Dyed ULSD',
    'No. 2 Diesel',
    'Low Sulfur Diesel 500 ppm',
    'Renewable Diesel',
  ],
  GASOLINE: [
    'RBOB 84',
    'CBOB 84',
    'Premium CBOB 91',
    'Premium CBOB 93',
    'Conventional 87',
    'Premium 93',
    'CARBOB',
    'E10 Regular',
  ],
  JET_FUEL: [
    'Jet A',
    'Jet A-1',
    'JP-8',
    'TS-1',
  ],
  FUEL_OIL: [
    'VLSFO 0.5%',
    'HSFO 3.5%',
    'Marine Gasoil',
    'No. 6 Fuel Oil',
    'No. 2 Heating Oil',
  ],
  NAPHTHA: [
    'Light Naphtha',
    'Heavy Naphtha',
    'Full-Range Naphtha',
    'Paraffinic Naphtha',
    'Petrochemical Naphtha',
  ],
  METHANOL: [
    'AA Grade',
    'IMPCA Spec',
    'Fuel Grade',
    'Crude Methanol',
    'Refined Methanol',
  ],
  AMMONIA: [
    'Anhydrous Ammonia',
    'Refrigeration Grade',
    'Agricultural Grade',
    'Blue Ammonia',
    'Green Ammonia',
  ],
  UREA: [
    'Prilled Urea 46-0-0',
    'Granular Urea 46-0-0',
    'Technical Grade Urea',
    'DEF Grade Urea',
    'Coated Urea',
  ],
  POWER: [
    'On-Peak 5x16',
    'Off-Peak 2x16H',
    '7x8',
    'ATC',
    'Day-Ahead Flat',
    'Real-Time Flat',
  ],
  COPPER: [
    'LME Grade A',
    'Cathode Grade',
    'Copper Concentrate',
    'No. 2 Copper Scrap',
  ],
  ALUMINUM: [
    'P1020A',
    'Standard Ingot',
    'Billet Grade',
    'Primary Foundry Alloy',
  ],
  NICKEL: [
    'Class 1 Nickel',
    'Nickel Briquette',
    'Nickel Cathode',
    'Ferronickel',
  ],
  ZINC: [
    'SHG Zinc',
    'Prime Western Zinc',
    'Special High Grade',
  ],
  GOLD: [
    'LBMA Good Delivery',
    '995 Fine',
    '999.9 Fine',
    'Kilobar',
  ],
  SILVER: [
    'LBMA Good Delivery',
    '999 Fine',
    '1000 oz Bar',
  ],
  PLATINUM: [
    '99.95% Pt',
    'Good Delivery',
    'Sponge Grade',
  ],
  PALLADIUM: [
    '99.95% Pd',
    'Good Delivery',
    'Sponge Grade',
  ],
  IRON_ORE: [
    '62% Fe Fines',
    '65% Fe Fines',
    '58% Fe Low Alumina',
    'Lump Ore',
  ],
  BAUXITE: [
    'Metallurgical Grade',
    'Calcined Grade',
    'Low Reactive Silica',
  ],
  SPODUMENE: [
    '6% Li2O Concentrate',
    '5.5% Li2O Concentrate',
    'Battery Grade Feed',
  ],
  WHEAT: [
    'No. 2 SRW',
    'No. 2 HRW',
    'No. 1 HRS',
    'Feed Wheat',
  ],
  CORN: [
    'No. 2 Yellow',
    'No. 3 Yellow',
    'Feed Corn',
    'White Corn',
  ],
  SOYBEANS: [
    'No. 1 Yellow',
    'No. 2 Yellow',
    'High Protein',
    'Food Grade',
  ],
  SUGAR: [
    'Raw Sugar No. 11',
    'White Sugar',
    'ICUMSA 45',
    'VHP Sugar',
  ],
  COFFEE: [
    'Arabica',
    'Robusta',
    'Washed Arabica',
    'Natural Arabica',
  ],
  COTTON: [
    'Middling 1-1/16',
    'Strict Low Middling',
    'Upland Cotton',
    'Shankar-6 Type',
  ],
  COAL: [
    'API2 Thermal Coal',
    'API4 Thermal Coal',
    'PRB 8,800',
    'High-Vol A Coking Coal',
    'PCI Coal',
  ],
  CARBON: [
    'CCA',
    'RGGI Allowance',
    'EUA',
    'VCU',
    'CORSIA Eligible',
  ],
  REC: [
    'National Green-e REC',
    'PJM Class I REC',
    'Solar REC',
    'Wind REC',
    'Voluntary REC',
  ],
  STEEL: [
    'HRC',
    'CRC',
    'HDG',
    'Rebar',
    'Billet',
  ],
} as const

export function getQualitySpecOptionsForCommodity(commodityCode: string): string[] {
  const normalizedCommodityCode = commodityCode.trim().toUpperCase()
  return normalizedCommodityCode ? [...(qualitySpecOptionsByCommodity[normalizedCommodityCode] ?? [])] : []
}
