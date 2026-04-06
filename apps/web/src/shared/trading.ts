import type { TradeHeaderDraft, TradeLegDraft } from './models'

export const tradeAggregateType = 'trade'
export const currentTradeEventSchemaVersion = 4
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
