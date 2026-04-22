import {
  commodityClassOrder,
  optionStyleOptions,
  optionTypeOptions,
  pricingTypeRequiresPriceIndex,
  pricingTypeOptions,
  pricingStatusOptions,
  settlementStatusOptions,
  tradeFormDefaults,
  tradeInstrumentTypeOptions,
  tradeInstrumentUsesOptionFields,
  tradeNatureOptions,
  tradeSideOptions,
  tradeStructureOptions,
  tradeStructureSupportsLegs,
} from './trading'

const TRADE_CAPTURE_SETTINGS_STORAGE_KEY = 'ectrm.trade-capture-settings'

export type TradeCaptureVisibilityMode = 'auto' | 'always'
export type TradeCaptureRuleVisibilityOverride = 'inherit' | 'show' | 'hide'

export type TradeCaptureDefaults = {
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

export type TradeCaptureOptionInstrumentDefaults = {
  enabled: boolean
  tradeNature: string
  tradeStructure: string
  pricingType: string
}

export type TradeCaptureLinkedDefaults = {
  optionInstrument: TradeCaptureOptionInstrumentDefaults
}

export type TradeCaptureRuleConditions = {
  instrumentType: string | null
  tradeStructure: string | null
  pricingType: string | null
  commodityClass: string | null
  book: string | null
}

export type TradeCaptureRuleDefaults = {
  tradeNature: string | null
  tradeStructure: string | null
  tradeSide: string | null
  pricingType: string | null
  pricingStatus: string | null
  settlementStatus: string | null
  optionType: string | null
  optionStyle: string | null
}

export type TradeCaptureRule = {
  id: string
  name: string
  enabled: boolean
  conditions: TradeCaptureRuleConditions
  defaults: TradeCaptureRuleDefaults
  visibility: {
    optionDetails: TradeCaptureRuleVisibilityOverride
    priceIndex: TradeCaptureRuleVisibilityOverride
  }
}

export type TradeCaptureSettings = {
  defaults: TradeCaptureDefaults
  rules: TradeCaptureRule[]
  linkedDefaults: TradeCaptureLinkedDefaults
  visibility: {
    optionDetails: TradeCaptureVisibilityMode
    priceIndex: TradeCaptureVisibilityMode
  }
}

export type TradeCaptureRuleContext = {
  instrumentType: string
  tradeStructure: string
  pricingType: string
  commodityClass: string
  book: string
}

export type TradeCaptureAppliedRule = {
  id: string
  name: string
  reasons: string[]
  effects: string[]
}

export type TradeCaptureRuleEvaluation = {
  context: TradeCaptureRuleContext
  defaultOverrides: Partial<TradeCaptureRuleDefaults>
  visibilityOverrides: {
    optionDetails: TradeCaptureRuleVisibilityOverride | null
    priceIndex: TradeCaptureRuleVisibilityOverride | null
  }
  matchedRules: TradeCaptureAppliedRule[]
}

export type TradeCaptureVisibilityState = {
  optionTrade: boolean
  structureUsesLegs: boolean
  showOptionDetails: boolean
  showPriceIndex: boolean
  showTopLevelVolume: boolean
}

type LegacyTradeCaptureSettings = Partial<Omit<TradeCaptureSettings, 'linkedDefaults'>> & {
  linkedDefaults?: {
    optionInstrument?: Partial<TradeCaptureOptionInstrumentDefaults>
  }
}

const RULE_DEFAULTS: TradeCaptureRuleDefaults = {
  tradeNature: null,
  tradeStructure: null,
  tradeSide: null,
  pricingType: null,
  pricingStatus: null,
  settlementStatus: null,
  optionType: null,
  optionStyle: null,
}

const RULE_CONDITIONS: TradeCaptureRuleConditions = {
  instrumentType: null,
  tradeStructure: null,
  pricingType: null,
  commodityClass: null,
  book: null,
}

function normalizeEnumValue<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && allowedValues.includes(value as T) ? (value as T) : fallback
}

function normalizeNullableEnumValue<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): T | null {
  return typeof value === 'string' && allowedValues.includes(value as T) ? (value as T) : null
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeVisibilityMode(value: unknown, fallback: TradeCaptureVisibilityMode): TradeCaptureVisibilityMode {
  return value === 'always' || value === 'auto' ? value : fallback
}

function normalizeRuleVisibilityOverride(
  value: unknown,
  fallback: TradeCaptureRuleVisibilityOverride,
): TradeCaptureRuleVisibilityOverride {
  return value === 'inherit' || value === 'show' || value === 'hide' ? value : fallback
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue ? trimmedValue : null
}

function normalizeTradeCaptureOptionInstrumentDefaults(
  value: Partial<TradeCaptureOptionInstrumentDefaults> | null | undefined,
): TradeCaptureOptionInstrumentDefaults {
  return {
    enabled: normalizeBoolean(value?.enabled, true),
    tradeNature: normalizeEnumValue(value?.tradeNature, tradeNatureOptions, 'FINANCIAL'),
    tradeStructure: normalizeEnumValue(value?.tradeStructure, tradeStructureOptions, 'SINGLE'),
    pricingType: normalizeEnumValue(value?.pricingType, pricingTypeOptions, 'FIXED'),
  }
}

function formatRuleFieldLabel(value: string): string {
  return value.split('_').join(' ')
}

function formatRuleConditionLabel(field: keyof TradeCaptureRuleConditions): string {
  switch (field) {
    case 'instrumentType':
      return 'Instrument'
    case 'tradeStructure':
      return 'Structure'
    case 'pricingType':
      return 'Pricing'
    case 'commodityClass':
      return 'Commodity class'
    case 'book':
      return 'Book'
  }
}

function formatRuleDefaultLabel(field: keyof TradeCaptureRuleDefaults): string {
  switch (field) {
    case 'tradeNature':
      return 'Nature'
    case 'tradeStructure':
      return 'Structure'
    case 'tradeSide':
      return 'Side'
    case 'pricingType':
      return 'Pricing'
    case 'pricingStatus':
      return 'Pricing status'
    case 'settlementStatus':
      return 'Settlement status'
    case 'optionType':
      return 'Option type'
    case 'optionStyle':
      return 'Option style'
  }
}

function normalizeTradeCaptureRule(rule: Partial<TradeCaptureRule> | null | undefined): TradeCaptureRule {
  return {
    id: normalizeOptionalText(rule?.id) ?? buildTradeCaptureRuleId(),
    name: normalizeOptionalText(rule?.name) ?? 'Untitled rule',
    enabled: normalizeBoolean(rule?.enabled, false),
    conditions: {
      instrumentType: normalizeNullableEnumValue(rule?.conditions?.instrumentType, tradeInstrumentTypeOptions),
      tradeStructure: normalizeNullableEnumValue(rule?.conditions?.tradeStructure, tradeStructureOptions),
      pricingType: normalizeNullableEnumValue(rule?.conditions?.pricingType, pricingTypeOptions),
      commodityClass: normalizeOptionalText(rule?.conditions?.commodityClass),
      book: normalizeOptionalText(rule?.conditions?.book),
    },
    defaults: {
      tradeNature: normalizeNullableEnumValue(rule?.defaults?.tradeNature, tradeNatureOptions),
      tradeStructure: normalizeNullableEnumValue(rule?.defaults?.tradeStructure, tradeStructureOptions),
      tradeSide: normalizeNullableEnumValue(rule?.defaults?.tradeSide, tradeSideOptions),
      pricingType: normalizeNullableEnumValue(rule?.defaults?.pricingType, pricingTypeOptions),
      pricingStatus: normalizeNullableEnumValue(rule?.defaults?.pricingStatus, pricingStatusOptions),
      settlementStatus: normalizeNullableEnumValue(rule?.defaults?.settlementStatus, settlementStatusOptions),
      optionType: normalizeNullableEnumValue(rule?.defaults?.optionType, optionTypeOptions),
      optionStyle: normalizeNullableEnumValue(rule?.defaults?.optionStyle, optionStyleOptions),
    },
    visibility: {
      optionDetails: normalizeRuleVisibilityOverride(rule?.visibility?.optionDetails, 'inherit'),
      priceIndex: normalizeRuleVisibilityOverride(rule?.visibility?.priceIndex, 'inherit'),
    },
  }
}

export function buildTradeCaptureRuleId(): string {
  return `trade-rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createTradeCaptureRule(
  name = 'New rule',
  overrides: Partial<TradeCaptureRule> = {},
): TradeCaptureRule {
  return normalizeTradeCaptureRule({
    id: buildTradeCaptureRuleId(),
    name,
    enabled: false,
    conditions: RULE_CONDITIONS,
    defaults: RULE_DEFAULTS,
    visibility: {
      optionDetails: 'inherit',
      priceIndex: 'inherit',
    },
    ...overrides,
  })
}

function createDefaultOptionInstrumentRule(
  legacyRule: Partial<TradeCaptureOptionInstrumentDefaults> | undefined,
): TradeCaptureRule {
  const normalizedDefaults = normalizeTradeCaptureOptionInstrumentDefaults(legacyRule)
  return normalizeTradeCaptureRule({
    id: 'trade-rule-option-instrument',
    name: 'Option instrument defaults',
    enabled: normalizedDefaults.enabled,
    conditions: {
      instrumentType: 'OPTION',
      tradeStructure: null,
      pricingType: null,
      commodityClass: null,
      book: null,
    },
    defaults: {
      ...RULE_DEFAULTS,
      tradeNature: normalizedDefaults.tradeNature,
      tradeStructure: normalizedDefaults.tradeStructure,
      pricingType: normalizedDefaults.pricingType,
    },
    visibility: {
      optionDetails: 'show',
      priceIndex: 'hide',
    },
  })
}

export function getDefaultTradeCaptureSettings(): TradeCaptureSettings {
  const optionInstrumentDefaults = normalizeTradeCaptureOptionInstrumentDefaults(undefined)
  return {
    defaults: {
      instrumentType: tradeFormDefaults.instrumentType,
      tradeNature: tradeFormDefaults.nature,
      tradeStructure: tradeFormDefaults.structure,
      tradeSide: tradeFormDefaults.side,
      pricingType: tradeFormDefaults.pricingType,
      pricingStatus: tradeFormDefaults.pricingStatus,
      settlementStatus: tradeFormDefaults.settlementStatus,
      optionType: tradeFormDefaults.optionType,
      optionStyle: tradeFormDefaults.optionStyle,
    },
    rules: [createDefaultOptionInstrumentRule(optionInstrumentDefaults)],
    linkedDefaults: {
      optionInstrument: optionInstrumentDefaults,
    },
    visibility: {
      optionDetails: 'auto',
      priceIndex: 'auto',
    },
  }
}

export function normalizeTradeCaptureSettings(
  value: LegacyTradeCaptureSettings | null | undefined,
): TradeCaptureSettings {
  const defaults = getDefaultTradeCaptureSettings()
  const normalizedRules =
    Array.isArray(value?.rules) ? value.rules.map((rule) => normalizeTradeCaptureRule(rule)) : []
  const currentOptionInstrumentRule = normalizedRules.find((rule) => rule.id === 'trade-rule-option-instrument')
  const optionInstrumentDefaults = normalizeTradeCaptureOptionInstrumentDefaults(
    currentOptionInstrumentRule
      ? {
          enabled: currentOptionInstrumentRule.enabled,
          tradeNature: currentOptionInstrumentRule.defaults.tradeNature ?? undefined,
          tradeStructure: currentOptionInstrumentRule.defaults.tradeStructure ?? undefined,
          pricingType: currentOptionInstrumentRule.defaults.pricingType ?? undefined,
        }
      : value?.linkedDefaults?.optionInstrument ?? defaults.linkedDefaults.optionInstrument,
  )

  if (!Array.isArray(value?.rules) && normalizedRules.length === 0) {
    normalizedRules.push(createDefaultOptionInstrumentRule(optionInstrumentDefaults))
  }

  return {
    defaults: {
      instrumentType: normalizeEnumValue(
        value?.defaults?.instrumentType,
        tradeInstrumentTypeOptions,
        defaults.defaults.instrumentType,
      ),
      tradeNature: normalizeEnumValue(value?.defaults?.tradeNature, tradeNatureOptions, defaults.defaults.tradeNature),
      tradeStructure: normalizeEnumValue(
        value?.defaults?.tradeStructure,
        tradeStructureOptions,
        defaults.defaults.tradeStructure,
      ),
      tradeSide: normalizeEnumValue(value?.defaults?.tradeSide, tradeSideOptions, defaults.defaults.tradeSide),
      pricingType: normalizeEnumValue(value?.defaults?.pricingType, pricingTypeOptions, defaults.defaults.pricingType),
      pricingStatus: normalizeEnumValue(
        value?.defaults?.pricingStatus,
        pricingStatusOptions,
        defaults.defaults.pricingStatus,
      ),
      settlementStatus: normalizeEnumValue(
        value?.defaults?.settlementStatus,
        settlementStatusOptions,
        defaults.defaults.settlementStatus,
      ),
      optionType: normalizeEnumValue(value?.defaults?.optionType, optionTypeOptions, defaults.defaults.optionType),
      optionStyle: normalizeEnumValue(value?.defaults?.optionStyle, optionStyleOptions, defaults.defaults.optionStyle),
    },
    rules: normalizedRules,
    linkedDefaults: {
      optionInstrument: optionInstrumentDefaults,
    },
    visibility: {
      optionDetails: normalizeVisibilityMode(
        value?.visibility?.optionDetails,
        defaults.visibility.optionDetails,
      ),
      priceIndex: normalizeVisibilityMode(value?.visibility?.priceIndex, defaults.visibility.priceIndex),
    },
  }
}

export function getTradeCaptureSettingsSnapshot(): TradeCaptureSettings {
  if (typeof window === 'undefined') {
    return getDefaultTradeCaptureSettings()
  }

  const storedValue = window.localStorage.getItem(TRADE_CAPTURE_SETTINGS_STORAGE_KEY)
  if (!storedValue) {
    return getDefaultTradeCaptureSettings()
  }

  try {
    return normalizeTradeCaptureSettings(JSON.parse(storedValue) as LegacyTradeCaptureSettings)
  } catch {
    return getDefaultTradeCaptureSettings()
  }
}

export function saveTradeCaptureSettingsSnapshot(snapshot: TradeCaptureSettings): TradeCaptureSettings {
  const normalizedSnapshot = normalizeTradeCaptureSettings(snapshot)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TRADE_CAPTURE_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSnapshot))
  }

  return normalizedSnapshot
}

export function clearTradeCaptureSettingsSnapshot(): TradeCaptureSettings {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TRADE_CAPTURE_SETTINGS_STORAGE_KEY)
  }

  return getDefaultTradeCaptureSettings()
}

function tradeCaptureRuleMatches(rule: TradeCaptureRule, context: TradeCaptureRuleContext): boolean {
  if (!rule.enabled) {
    return false
  }

  const conditionEntries: Array<[keyof TradeCaptureRuleConditions, string]> = [
    ['instrumentType', context.instrumentType],
    ['tradeStructure', context.tradeStructure],
    ['pricingType', context.pricingType],
    ['commodityClass', context.commodityClass],
    ['book', context.book],
  ]

  return conditionEntries.every(([field, activeValue]) => {
    const expectedValue = rule.conditions[field]
    return expectedValue === null || expectedValue === activeValue
  })
}

function mergeRuleDefaults(rules: TradeCaptureRule[]): Partial<TradeCaptureRuleDefaults> {
  const defaults: Partial<TradeCaptureRuleDefaults> = {}

  for (const rule of rules) {
    for (const field of Object.keys(rule.defaults) as Array<keyof TradeCaptureRuleDefaults>) {
      const value = rule.defaults[field]
      if (value !== null) {
        defaults[field] = value
      }
    }
  }

  return defaults
}

function mergeRuleVisibility(rules: TradeCaptureRule[]) {
  let optionDetails: TradeCaptureRuleVisibilityOverride | null = null
  let priceIndex: TradeCaptureRuleVisibilityOverride | null = null

  for (const rule of rules) {
    if (rule.visibility.optionDetails !== 'inherit') {
      optionDetails = rule.visibility.optionDetails
    }
    if (rule.visibility.priceIndex !== 'inherit') {
      priceIndex = rule.visibility.priceIndex
    }
  }

  return {
    optionDetails,
    priceIndex,
  }
}

function sameRuleContext(left: TradeCaptureRuleContext, right: TradeCaptureRuleContext): boolean {
  return (
    left.instrumentType === right.instrumentType &&
    left.tradeStructure === right.tradeStructure &&
    left.pricingType === right.pricingType &&
    left.commodityClass === right.commodityClass &&
    left.book === right.book
  )
}

function describeAppliedRule(rule: TradeCaptureRule): TradeCaptureAppliedRule {
  const reasons = (Object.keys(rule.conditions) as Array<keyof TradeCaptureRuleConditions>)
    .flatMap((field) => {
      const value = rule.conditions[field]
      return value === null ? [] : [`${formatRuleConditionLabel(field)} is ${formatRuleFieldLabel(value)}`]
    })

  const effects = (Object.keys(rule.defaults) as Array<keyof TradeCaptureRuleDefaults>)
    .flatMap((field) => {
      const value = rule.defaults[field]
      return value === null ? [] : [`Default ${formatRuleDefaultLabel(field)} to ${formatRuleFieldLabel(value)}`]
    })

  if (rule.visibility.optionDetails === 'show') {
    effects.push('Show option detail fields')
  } else if (rule.visibility.optionDetails === 'hide') {
    effects.push('Hide option detail fields')
  }

  if (rule.visibility.priceIndex === 'show') {
    effects.push('Show price index')
  } else if (rule.visibility.priceIndex === 'hide') {
    effects.push('Hide price index')
  }

  return {
    id: rule.id,
    name: rule.name,
    reasons: reasons.length > 0 ? reasons : ['Always applies'],
    effects,
  }
}

export function resolveTradeCaptureRuleEvaluation(args: {
  context: TradeCaptureRuleContext
  settings: TradeCaptureSettings
}): TradeCaptureRuleEvaluation {
  let resolvedContext = {
    ...args.context,
  }

  const maxPasses = Math.max(2, args.settings.rules.length + 1)

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const matchedRules = args.settings.rules.filter((rule) => tradeCaptureRuleMatches(rule, resolvedContext))
    const defaultOverrides = mergeRuleDefaults(matchedRules)
    const nextContext = {
      ...resolvedContext,
      tradeStructure: defaultOverrides.tradeStructure ?? resolvedContext.tradeStructure,
      pricingType: defaultOverrides.pricingType ?? resolvedContext.pricingType,
    }

    if (sameRuleContext(nextContext, resolvedContext)) {
      return {
        context: resolvedContext,
        defaultOverrides,
        visibilityOverrides: mergeRuleVisibility(matchedRules),
        matchedRules: matchedRules.map((rule) => describeAppliedRule(rule)),
      }
    }

    resolvedContext = nextContext
  }

  const matchedRules = args.settings.rules.filter((rule) => tradeCaptureRuleMatches(rule, resolvedContext))
  return {
    context: resolvedContext,
    defaultOverrides: mergeRuleDefaults(matchedRules),
    visibilityOverrides: mergeRuleVisibility(matchedRules),
    matchedRules: matchedRules.map((rule) => describeAppliedRule(rule)),
  }
}

export function resolveTradeCaptureVisibilityState(args: {
  instrumentType: string
  tradeStructure: string
  pricingType: string
  commodityClass: string
  book: string
  settings: TradeCaptureSettings
}): TradeCaptureVisibilityState {
  const ruleEvaluation = resolveTradeCaptureRuleEvaluation({
    context: {
      instrumentType: args.instrumentType,
      tradeStructure: args.tradeStructure,
      pricingType: args.pricingType,
      commodityClass: args.commodityClass,
      book: args.book,
    },
    settings: args.settings,
  })
  const optionTrade = tradeInstrumentUsesOptionFields(ruleEvaluation.context.instrumentType)
  const structureUsesLegs = tradeStructureSupportsLegs(ruleEvaluation.context.tradeStructure)
  const priceIndexRelevant = pricingTypeRequiresPriceIndex(ruleEvaluation.context.pricingType)

  let showOptionDetails = args.settings.visibility.optionDetails === 'always' || optionTrade
  let showPriceIndex = args.settings.visibility.priceIndex === 'always' || priceIndexRelevant

  if (ruleEvaluation.visibilityOverrides.optionDetails === 'show') {
    showOptionDetails = true
  } else if (ruleEvaluation.visibilityOverrides.optionDetails === 'hide') {
    showOptionDetails = false
  }

  if (ruleEvaluation.visibilityOverrides.priceIndex === 'show') {
    showPriceIndex = true
  } else if (ruleEvaluation.visibilityOverrides.priceIndex === 'hide') {
    showPriceIndex = false
  }

  return {
    optionTrade,
    structureUsesLegs,
    showOptionDetails,
    showPriceIndex,
    showTopLevelVolume: !structureUsesLegs,
  }
}

export function resolveTradeCaptureDefaultsForInstrument(
  instrumentType: string,
  settings: TradeCaptureSettings,
): Partial<Pick<TradeCaptureDefaults, 'tradeNature' | 'tradeStructure' | 'pricingType'>> | null {
  const ruleEvaluation = resolveTradeCaptureRuleEvaluation({
    context: {
      instrumentType,
      tradeStructure: settings.defaults.tradeStructure,
      pricingType: settings.defaults.pricingType,
      commodityClass: commodityClassOrder[0],
      book: '',
    },
    settings,
  })

  const defaults: Partial<Pick<TradeCaptureDefaults, 'tradeNature' | 'tradeStructure' | 'pricingType'>> = {}
  if (ruleEvaluation.defaultOverrides.tradeNature) {
    defaults.tradeNature = ruleEvaluation.defaultOverrides.tradeNature
  }
  if (ruleEvaluation.defaultOverrides.tradeStructure) {
    defaults.tradeStructure = ruleEvaluation.defaultOverrides.tradeStructure
  }
  if (ruleEvaluation.defaultOverrides.pricingType) {
    defaults.pricingType = ruleEvaluation.defaultOverrides.pricingType
  }

  return Object.keys(defaults).length > 0 ? defaults : null
}
