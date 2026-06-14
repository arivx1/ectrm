import type { LocationRecord, PriceIndexRecord } from '../../shared/models'

export type ReportPromptPriceIntent = {
  kind: 'price-index'
  prompt: string
  title: string
  description: string
  commodityCode: string | null
  countryCode: string | null
  marketCodes: string[]
  priceIndices: PriceIndexRecord[]
  warnings: string[]
}

export type ReportPromptUnsupportedIntent = {
  kind: 'unsupported'
  prompt: string
  title: string
  message: string
  hints: string[]
}

export type ReportPromptIntent = ReportPromptPriceIntent | ReportPromptUnsupportedIntent

type ResolveReportPromptIntentArgs = {
  priceIndices: readonly PriceIndexRecord[]
  locations: readonly LocationRecord[]
}

const US_POWER_MARKETS = new Set([
  'BPA',
  'CAISO',
  'ERCOT',
  'ISO_NE',
  'MISO',
  'NYISO',
  'PJM',
  'SPP',
  'WECC',
])

const COMMODITY_PROMPT_ALIASES: Array<{
  commodityCode: string
  label: string
  terms: string[]
}> = [
  {
    commodityCode: 'POWER',
    label: 'Power',
    terms: ['power', 'electric', 'electricity', 'lmp', 'lbmp'],
  },
  {
    commodityCode: 'NATURAL_GAS',
    label: 'Natural Gas',
    terms: ['natural gas', 'natgas', 'henry hub'],
  },
  {
    commodityCode: 'WTI',
    label: 'WTI',
    terms: ['wti', 'crude', 'crude oil'],
  },
  {
    commodityCode: 'BRENT',
    label: 'Brent',
    terms: ['brent'],
  },
  {
    commodityCode: 'DIESEL',
    label: 'Diesel',
    terms: ['diesel'],
  },
  {
    commodityCode: 'GASOLINE',
    label: 'Gasoline',
    terms: ['gasoline'],
  },
]

const MARKET_PROMPT_TERMS: Array<{ marketCode: string; terms: string[] }> = [
  { marketCode: 'PJM', terms: ['pjm'] },
  { marketCode: 'ERCOT', terms: ['ercot'] },
  { marketCode: 'CAISO', terms: ['caiso', 'california iso'] },
  { marketCode: 'MISO', terms: ['miso'] },
  { marketCode: 'NYISO', terms: ['nyiso', 'new york iso'] },
  { marketCode: 'ISO_NE', terms: ['iso ne', 'iso-ne', 'isone', 'new england'] },
  { marketCode: 'SPP', terms: ['spp', 'southwest power pool'] },
  { marketCode: 'WECC', terms: ['wecc'] },
  { marketCode: 'BPA', terms: ['bpa', 'mid c', 'mid-columbia', 'mid columbia'] },
]

function normalizePromptSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsNormalizedPhrase(normalizedPrompt: string, phrase: string): boolean {
  const normalizedPhrase = normalizePromptSearchText(phrase)
  if (!normalizedPhrase) {
    return false
  }

  return ` ${normalizedPrompt} `.includes(` ${normalizedPhrase} `)
}

function detectCountryCode(prompt: string): string | null {
  if (
    /\b(?:in|for|within|across|around)\s+(?:the\s+)?u\.?s\.?\b/i.test(prompt) ||
    /\b(?:in|for|within|across|around)\s+(?:the\s+)?usa\b/i.test(prompt) ||
    /\b(?:united states|america|american)\b/i.test(prompt)
  ) {
    return 'US'
  }

  return null
}

function detectCommodity(normalizedPrompt: string): { commodityCode: string; label: string } | null {
  return (
    COMMODITY_PROMPT_ALIASES.find((alias) =>
      alias.terms.some((term) => containsNormalizedPhrase(normalizedPrompt, term)),
    ) ?? null
  )
}

function detectMarketCodes(normalizedPrompt: string): string[] {
  return MARKET_PROMPT_TERMS.filter((entry) =>
    entry.terms.some((term) => containsNormalizedPhrase(normalizedPrompt, term)),
  ).map((entry) => entry.marketCode)
}

function promptMentionsPrice(normalizedPrompt: string): boolean {
  return [
    'price',
    'prices',
    'pricing',
    'index',
    'indices',
    'mark',
    'marks',
    'lmp',
    'lbmp',
    'settlement point',
  ].some((term) => containsNormalizedPhrase(normalizedPrompt, term))
}

function priceIndexSearchText(priceIndex: PriceIndexRecord): string {
  return normalizePromptSearchText([
    priceIndex.code,
    priceIndex.name,
    priceIndex.description,
    priceIndex.commodity_code,
    priceIndex.provider,
    priceIndex.market,
    priceIndex.location_code,
    priceIndex.calendar_code,
  ].filter(Boolean).join(' '))
}

function promptMentionsPriceIndexCode(normalizedPrompt: string, priceIndex: PriceIndexRecord): boolean {
  return containsNormalizedPhrase(normalizedPrompt, priceIndex.code)
}

function priceIndexMatchesCountry(
  priceIndex: PriceIndexRecord,
  countryCode: string | null,
  locationsByCode: ReadonlyMap<string, LocationRecord>,
): boolean {
  if (!countryCode) {
    return true
  }

  const location = priceIndex.location_code ? locationsByCode.get(priceIndex.location_code) : null
  if (location?.country_code?.trim().toUpperCase() === countryCode) {
    return true
  }

  const market = priceIndex.market?.trim().toUpperCase() ?? ''
  if (countryCode === 'US' && (market === 'US' || US_POWER_MARKETS.has(market))) {
    return true
  }

  return false
}

function priceIndexMatchesMarkets(priceIndex: PriceIndexRecord, marketCodes: readonly string[]): boolean {
  if (marketCodes.length === 0) {
    return true
  }

  const searchableText = priceIndexSearchText(priceIndex)
  return marketCodes.some((marketCode) => containsNormalizedPhrase(searchableText, marketCode))
}

function buildPricePromptTitle(args: {
  commodityLabel: string | null
  countryCode: string | null
  marketCodes: readonly string[]
  priceIndices: readonly PriceIndexRecord[]
}): string {
  if (args.priceIndices.length === 1) {
    const priceIndex = args.priceIndices[0]
    return `${priceIndex?.name || priceIndex?.code || 'Price Index'}`
  }

  const scopeParts: string[] = []
  if (args.countryCode) {
    scopeParts.push(args.countryCode)
  }
  if (args.marketCodes.length > 0) {
    scopeParts.push(args.marketCodes.join(', '))
  }

  const base = args.commodityLabel ? `${args.commodityLabel} Prices` : 'Price Index Report'
  return scopeParts.length > 0 ? `${base} · ${scopeParts.join(' · ')}` : base
}

function unsupportedPrompt(prompt: string, message: string): ReportPromptUnsupportedIntent {
  return {
    kind: 'unsupported',
    prompt,
    title: 'Prompt Result',
    message,
    hints: [
      'Show me power prices in the US',
      'Show PJM prices',
      'Show Henry Hub natural gas prices',
    ],
  }
}

export function resolveReportPromptIntent(
  prompt: string,
  { priceIndices, locations }: ResolveReportPromptIntentArgs,
): ReportPromptIntent {
  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    return unsupportedPrompt(trimmedPrompt, 'Enter a report request to build a read-only report view.')
  }

  const normalizedPrompt = normalizePromptSearchText(trimmedPrompt)
  const activePriceIndices = priceIndices.filter((priceIndex) => priceIndex.is_active)
  const exactCodeMatches = activePriceIndices.filter((priceIndex) =>
    promptMentionsPriceIndexCode(normalizedPrompt, priceIndex),
  )
  const commodity = detectCommodity(normalizedPrompt)
  const marketCodes = detectMarketCodes(normalizedPrompt)
  const countryCode = detectCountryCode(trimmedPrompt)
  const priceRequest = promptMentionsPrice(normalizedPrompt) || exactCodeMatches.length > 0

  if (!priceRequest) {
    return unsupportedPrompt(
      trimmedPrompt,
      'This prompt did not map to a reportable market-price request yet.',
    )
  }

  if (activePriceIndices.length === 0) {
    return unsupportedPrompt(
      trimmedPrompt,
      'No active price index reference data is loaded for the Reports prompt.',
    )
  }

  const locationsByCode = new Map(
    locations.map((location) => [location.code, location]),
  )

  const selectedPriceIndices = activePriceIndices
    .filter((priceIndex) => {
      if (exactCodeMatches.length > 0 && exactCodeMatches.some((match) => match.code === priceIndex.code)) {
        return true
      }

      if (commodity && priceIndex.commodity_code.trim().toUpperCase() !== commodity.commodityCode) {
        return false
      }

      if (!commodity && exactCodeMatches.length === 0 && marketCodes.length === 0 && !countryCode) {
        return false
      }

      return (
        priceIndexMatchesMarkets(priceIndex, marketCodes) &&
        priceIndexMatchesCountry(priceIndex, countryCode, locationsByCode)
      )
    })
    .sort((left, right) => {
      const leftMarket = left.market ?? ''
      const rightMarket = right.market ?? ''
      if (leftMarket !== rightMarket) {
        return leftMarket.localeCompare(rightMarket)
      }
      return (left.name || left.code).localeCompare(right.name || right.code)
    })

  if (selectedPriceIndices.length === 0) {
    return unsupportedPrompt(
      trimmedPrompt,
      'No active price indices matched the requested commodity, market, or geography.',
    )
  }

  const title = buildPricePromptTitle({
    commodityLabel: commodity?.label ?? null,
    countryCode,
    marketCodes,
    priceIndices: selectedPriceIndices,
  })

  return {
    kind: 'price-index',
    prompt: trimmedPrompt,
    title,
    description: `Read-only market-price report over ${selectedPriceIndices.length} active price index${selectedPriceIndices.length === 1 ? '' : 'es'}.`,
    commodityCode: commodity?.commodityCode ?? null,
    countryCode,
    marketCodes,
    priceIndices: selectedPriceIndices,
    warnings: [],
  }
}
