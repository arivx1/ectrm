import { useEffect, useMemo, useState } from 'react'

import { loadMarketNewsHeadlines } from '../../entities/news/api'
import type { MarketNewsHeadlineRecord, MarketNewsRecord } from '../../shared/models'

export type MarketNewsImpactDirection = 'up' | 'down' | 'neutral'
export type MarketNewsImpactHorizon =
  | 'immediate'
  | 'near_term'
  | 'mid_term'
  | 'long_term'
  | 'very_long_term'
export type MarketNewsEffectFilter = 'all' | 'positive' | 'negative' | 'neutral'
export type MarketNewsHorizonFilter = 'all' | MarketNewsImpactHorizon
export type MarketNewsLocationScope =
  | 'region'
  | 'country'
  | 'state'
  | 'province'
  | 'territory'
  | 'city'
  | 'unspecified'

type MarketNewsPanelProps = {
  apiBase: string
  commodity?: string | null
  query?: string | null
  limit?: number
  lookbackDays?: number
  variant?: 'list' | 'table'
  title?: string
  detail?: string
  filters?: MarketNewsPanelFilters
  formatDate?: (value: string | null | undefined) => string
}

export type MarketNewsPanelFilters = {
  marketLocation?: string | null
  horizon?: MarketNewsHorizonFilter | string | null
  supplyEffect?: MarketNewsEffectFilter | string | null
  demandEffect?: MarketNewsEffectFilter | string | null
}

type MarketNewsHeadlineEffects = {
  supply: MarketNewsHeadlineEffect
  demand: MarketNewsHeadlineEffect
}

type MarketNewsHeadlineEffect = {
  direction: MarketNewsImpactDirection
  horizon: MarketNewsImpactHorizon
}

type MarketNewsLocationRule = {
  label: string
  scope: Exclude<MarketNewsLocationScope, 'unspecified'>
  patterns: RegExp[]
}

type MarketNewsMarketLocation = {
  label: string
  scope: MarketNewsLocationScope
}

type NormalizedMarketNewsPanelFilters = {
  marketLocation: string
  horizon: MarketNewsHorizonFilter
  supplyEffect: MarketNewsEffectFilter
  demandEffect: MarketNewsEffectFilter
}

const MARKET_NEWS_LOCATION_RULES: MarketNewsLocationRule[] = [
  { label: 'Asia-Pacific', scope: 'region', patterns: [/\basia[-\s]?pacific\b/, /\bapac\b/] },
  { label: 'North America', scope: 'region', patterns: [/\bnorth america\b/] },
  { label: 'South America', scope: 'region', patterns: [/\bsouth america\b/] },
  { label: 'Latin America', scope: 'region', patterns: [/\blatin america\b/] },
  { label: 'Middle East', scope: 'region', patterns: [/\bmiddle east\b/] },
  { label: 'West Africa', scope: 'region', patterns: [/\bwest africa\b/] },
  { label: 'East Africa', scope: 'region', patterns: [/\beast africa\b/] },
  { label: 'European Union', scope: 'region', patterns: [/\beuropean union\b/, /\beu\b/] },
  { label: 'Europe', scope: 'region', patterns: [/\beurope\b/, /\beuropean\b/] },
  { label: 'Black Sea', scope: 'region', patterns: [/\bblack sea\b/] },
  { label: 'North Sea', scope: 'region', patterns: [/\bnorth sea\b/] },
  { label: 'US Gulf Coast', scope: 'region', patterns: [/\bu\.?s\.?\s+gulf coast\b/, /\bgulf coast\b/] },
  { label: 'Pacific Northwest', scope: 'region', patterns: [/\bpacific northwest\b/] },
  { label: 'Mediterranean', scope: 'region', patterns: [/\bmediterranean\b/] },
  { label: 'Caribbean', scope: 'region', patterns: [/\bcaribbean\b/] },
  { label: 'United States', scope: 'country', patterns: [/\bunited states\b/, /\bu\.?s\.?(?=\W|$)/, /\busa\b/, /\bamerican\b/] },
  { label: 'Canada', scope: 'country', patterns: [/\bcanada\b/, /\bcanadian\b/] },
  { label: 'Mexico', scope: 'country', patterns: [/\bmexico\b/, /\bmexican\b/] },
  { label: 'Brazil', scope: 'country', patterns: [/\bbrazil\b/, /\bbrazilian\b/] },
  { label: 'Argentina', scope: 'country', patterns: [/\bargentina\b/, /\bargentine\b/] },
  { label: 'Chile', scope: 'country', patterns: [/\bchile\b/, /\bchilean\b/, /\bsalmonchile\b/] },
  { label: 'Vietnam', scope: 'country', patterns: [/\bvietnam\b/, /\bvietnamese\b/] },
  { label: 'China', scope: 'country', patterns: [/\bchina\b/, /\bchinese\b/] },
  { label: 'Japan', scope: 'country', patterns: [/\bjapan\b/, /\bjapanese\b/] },
  { label: 'South Korea', scope: 'country', patterns: [/\bsouth korea\b/, /\bkorean\b/] },
  { label: 'India', scope: 'country', patterns: [/\bindia\b/, /\bindian\b/] },
  { label: 'Indonesia', scope: 'country', patterns: [/\bindonesia\b/, /\bindonesian\b/] },
  { label: 'Thailand', scope: 'country', patterns: [/\bthailand\b/, /\bthai\b/] },
  { label: 'Philippines', scope: 'country', patterns: [/\bphilippines\b/, /\bphilippine\b/] },
  { label: 'Malaysia', scope: 'country', patterns: [/\bmalaysia\b/, /\bmalaysian\b/] },
  { label: 'Norway', scope: 'country', patterns: [/\bnorway\b/, /\bnorwegian\b/] },
  { label: 'Iceland', scope: 'country', patterns: [/\biceland\b/, /\bicelandic\b/] },
  { label: 'United Kingdom', scope: 'country', patterns: [/\bunited kingdom\b/, /\buk\b/, /\bbritain\b/, /\bbritish\b/] },
  { label: 'France', scope: 'country', patterns: [/\bfrance\b/, /\bfrench\b/] },
  { label: 'Germany', scope: 'country', patterns: [/\bgermany\b/, /\bgerman\b/] },
  { label: 'Netherlands', scope: 'country', patterns: [/\bnetherlands\b/, /\bdutch\b/] },
  { label: 'Spain', scope: 'country', patterns: [/\bspain\b/, /\bspanish\b/] },
  { label: 'Italy', scope: 'country', patterns: [/\bitaly\b/, /\bitalian\b/] },
  { label: 'Russia', scope: 'country', patterns: [/\brussia\b/, /\brussian\b/] },
  { label: 'Ukraine', scope: 'country', patterns: [/\bukraine\b/, /\bukrainian\b/] },
  { label: 'Turkey', scope: 'country', patterns: [/\bturkey\b/, /\bturkish\b/] },
  { label: 'Saudi Arabia', scope: 'country', patterns: [/\bsaudi arabia\b/, /\bsaudi\b/] },
  { label: 'United Arab Emirates', scope: 'country', patterns: [/\bunited arab emirates\b/, /\buae\b/, /\bemirati\b/] },
  { label: 'Qatar', scope: 'country', patterns: [/\bqatar\b/, /\bqatari\b/] },
  { label: 'Australia', scope: 'country', patterns: [/\baustralia\b/, /\baustralian\b/] },
  { label: 'New Zealand', scope: 'country', patterns: [/\bnew zealand\b/] },
  { label: 'California', scope: 'state', patterns: [/\bcalifornia\b/] },
  { label: 'Texas', scope: 'state', patterns: [/\btexas\b/] },
  { label: 'Louisiana', scope: 'state', patterns: [/\blouisiana\b/] },
  { label: 'North Dakota', scope: 'state', patterns: [/\bnorth dakota\b/] },
  { label: 'Alaska', scope: 'state', patterns: [/\balaska\b/] },
  { label: 'Florida', scope: 'state', patterns: [/\bflorida\b/] },
  { label: 'Washington', scope: 'state', patterns: [/\bwashington\b/] },
  { label: 'British Columbia', scope: 'province', patterns: [/\bbritish columbia\b/] },
  { label: 'Alberta', scope: 'province', patterns: [/\balberta\b/] },
  { label: 'Ontario', scope: 'province', patterns: [/\bontario\b/] },
  { label: 'Quebec', scope: 'province', patterns: [/\bquebec\b/] },
  { label: 'Nova Scotia', scope: 'province', patterns: [/\bnova scotia\b/] },
  { label: 'Puerto Rico', scope: 'territory', patterns: [/\bpuerto rico\b/] },
  { label: 'Guam', scope: 'territory', patterns: [/\bguam\b/] },
  { label: 'Hanoi', scope: 'city', patterns: [/\bhanoi\b/] },
  { label: 'Ho Chi Minh City', scope: 'city', patterns: [/\bho chi minh city\b/] },
  { label: 'Singapore', scope: 'city', patterns: [/\bsingapore\b/] },
  { label: 'Shanghai', scope: 'city', patterns: [/\bshanghai\b/] },
  { label: 'Rotterdam', scope: 'city', patterns: [/\brotterdam\b/] },
  { label: 'Houston', scope: 'city', patterns: [/\bhouston\b/] },
  { label: 'New Orleans', scope: 'city', patterns: [/\bnew orleans\b/] },
  { label: 'London', scope: 'city', patterns: [/\blondon\b/] },
  { label: 'Oslo', scope: 'city', patterns: [/\boslo\b/] },
  { label: 'Reykjavik', scope: 'city', patterns: [/\breykjavik\b/] },
  { label: 'Dubai', scope: 'city', patterns: [/\bdubai\b/] },
  { label: 'Santiago', scope: 'city', patterns: [/\bsantiago\b/] },
]

const MARKET_NEWS_SUPPLY_UP_PATTERNS = [
  /\b(?:output|production|supply|exports?|shipments?|capacity|inventor(?:y|ies)|stockpiles?|harvest|crop)\s+(?:rises?|grows?|increases?|expands?|rebounds?|recovers?|builds?|climbs?|surges?|jumps?)\b/,
  /\b(?:output|production|supply|exports?|shipments?|capacity|inventor(?:y|ies)|stockpiles?|harvest|crop)\s+(?:hits?|reaches?|sets?)\s+(?:a\s+)?record\b/,
  /\b(?:output|production|supply|exports?|shipments?|capacity|inventor(?:y|ies)|stockpiles?|harvest|crop)\s+(?:at|near)\s+(?:a\s+)?record\b/,
  /\b(?:rising|higher|stronger|record)\s+(?:output|production|supply|exports?|shipments?|capacity|inventor(?:y|ies)|stockpiles?|harvest|crop)\b/,
  /\b(?:warehouse|exchange|commercial|commodity|oil|gas|grain|metal|copper|aluminum|aluminium|crude)\s+stocks?\s+(?:rises?|grows?|increases?|expands?|builds?|climbs?|surges?|jumps?)\b/,
  /\b(?:boosts?|raises?|lifts?|restarts?|resumes?|returns?|ramps?\s+up)\b.*\b(?:output|production|supply|exports?|shipments?|capacity)\b/,
  /\b(?:output|production|supply|exports?|shipments?|capacity)\b.*\b(?:boosted|raised|lifted|restarted|resumed|returning|ramping\s+up)\b/,
  /\b(?:new|added|expanded|extra|more)\s+(?:output|production|supply|exports?|shipments?|capacity|inventor(?:y|ies)|stockpiles?)\b/,
  /\bmore\s+(?:cattle|livestock|beef|hogs|pigs|pork|chicken|poultry|fish|seafood|salmon|shrimp|tuna)\b/,
]

const MARKET_NEWS_SUPPLY_DOWN_PATTERNS = [
  /\b(?:outage|shutdown|disruption|strike|sanctions?|embargo|blockade|war|conflict|attack|storm|freeze|drought|dry spells?|flood|fire|force majeure|leak|maintenance|halt|disease outbreaks?)\b/,
  /\bsupply[-\s]+(?:risk|risks|concerns?|crunch|squeeze|shortage|shortfall|tightens?|tight|uncertaint(?:y|ies)|constraints?|pressure|backdrop)\b/,
  /\b(?:risk|risks|concerns?|uncertaint(?:y|ies)|constraints?|pressure|backdrop)\b.*\bsupply\b/,
  /\b(?:output|production|supply|exports?|shipments?|capacity|inventor(?:y|ies)|stockpiles?|harvest|crop)\s+(?:falls?|drops?|declines?|slumps?|weakens?|contracts?|tightens?|cut|cuts|curbed|halted|reduced)\b/,
  /\b(?:lower|reduced|weaker|falling)\s+(?:output|production|supply|exports?|shipments?|capacity|inventor(?:y|ies)|stockpiles?|harvest|crop)\b/,
  /\b(?:warehouse|exchange|commercial|commodity|oil|gas|grain|metal|copper|aluminum|aluminium|crude)\s+stocks?\s+(?:falls?|drops?|declines?|slumps?|weakens?|contracts?|tightens?|cut|cuts|curbed|halted|reduced)\b/,
  /\b(?:cuts?|reduces?|curtails?|weakens?)\b.*\b(?:output|production|supply|exports?|shipments?|capacity|harvest|crop)\b/,
  /\b(?:supply|exports?|shipments?|production|output|capacity)\b.*\b(?:tight|tightens?|tightening|constrained|constraints?|at risk|risk|concerns?|uncertaint(?:y|ies))\b/,
]

const MARKET_NEWS_DEMAND_UP_PATTERNS = [
  /\b(?:demand|consumption|load|imports?|buying|purchases?)\s+(?:rises?|grows?|increases?|rebounds?|recovers?|surges?|jumps?|climbs?|strengthens?|firms?)\b/,
  /\b(?:strong|stronger|rising|higher|record)\s+(?:demand|consumption|load|imports?|buying|purchases?)\b/,
  /\b(?:lifts?|boosts?|raises?)\b.*\b(?:demand|consumption|load|imports?|buying|purchases?)\b/,
  /\b(?:demand|consumption|load|imports?)\b.*\b(?:outpaces|exceeds|beats)\b/,
  /\b(?:global|consumer|industrial|export|import|seasonal|spot)\s+demand\b/,
  /\bprices?\s+(?:rise|rises|rising|soar|soars|surge|surges|jump|jumps|hit|hits|climb|climbs)\b.*\bdemand\b/,
  /\bdemand\b.*\b(?:drives?|supports?|pushes?|lifts?|boosts?|raises?)\b.*\bprices?\b/,
]

const MARKET_NEWS_DEMAND_DOWN_PATTERNS = [
  /\bdemand\s+(?:destruction|risk|risks|concern|concerns)\b/,
  /\b(?:demand|consumption|load|imports?|buying|purchases?)\s+(?:falls?|drops?|declines?|slumps?|weakens?|softens?|eases?|wanes|contracts?)\b/,
  /\b(?:weak|weaker|soft|softer|lower|falling)\s+(?:demand|consumption|load|imports?|buying|purchases?)\b/,
  /\b(?:weakens?|softens?|eases?|cuts?|curtails?)\b.*\b(?:demand|consumption|load|imports?|buying|purchases?)\b/,
  /\b(?:recession|slowdown|demand curtailment|industrial curtailment|mild weather|warm winter|cool summer)\b/,
]

const MARKET_NEWS_PRICE_OR_EQUITY_MOVE_PATTERNS = [
  /\b(?:prices?|futures?|stocks?|shares?|equities?)\s+(?:rise|rises|rising|soar|soars|surge|surges|jump|jumps|hit|hits|climb|climbs|rall(?:y|ies|ied))\b/,
  /\b(?:jumps?|rises?|rall(?:y|ies|ied))\b.*\b(?:stocks?|shares?|equities?)\b/,
]

const MARKET_NEWS_IMMEDIATE_HORIZON_PATTERNS = [
  /\b(?:today|now|immediate|immediately|overnight|spot|prompt|this week)\b/,
  /\b(?:outage|shutdown|halt|strike|sanctions?|embargo|blockade|attack|storm|freeze|drought|dry spells?|flood|fire|force majeure|disease outbreaks?)\b/,
  /\b(?:prices?|futures?|spreads?)\s+(?:rall(?:y|ies|ied)|rise|rises|jump|jumps|surge|surges|fall|falls|drop|drops|slump|slumps|slide|slides)\b/,
  /\b(?:crude|oil|gas|lng|diesel|seafood|salmon|fish|cattle|corn|wheat|soy|power|coal)\s+(?:rall(?:y|ies|ied)|jumps?|surges?|falls?|drops?|slumps?|slides?)\b/,
  /\b(?:supply|demand|exports?|imports?|production|output|inventor(?:y|ies)|stocks?|load)\s+(?:rall(?:y|ies|ied)|jumps?|surges?|falls?|drops?|slumps?|slides?)\b/,
  /\b(?:resumes?|restarts?|returns?|halts?|builds?)\b/,
]

const MARKET_NEWS_NEAR_TERM_HORIZON_PATTERNS = [
  /\b(?:near[-\s]?term|short[-\s]?term|next week|next month|coming weeks|coming months|current|latest)\b/,
  /\b(?:supply|demand|exports?|imports?|inventor(?:y|ies)|stocks?|shipments?)\b/,
]

const MARKET_NEWS_MID_TERM_HORIZON_PATTERNS = [
  /\b(?:mid[-\s]?term|quarter|quarterly|q[1-4]|season|seasonal|seasonality|harvest|crop|202[0-9])\b/,
  /\b(?:earnings|revenue|profit|guidance|forecast)\b/,
]

const MARKET_NEWS_LONG_TERM_HORIZON_PATTERNS = [
  /\b(?:long[-\s]?term|investment|invest|capacity|infrastructure|expansion|plant|facility|port|pipeline|project|buildout|modernization)\b/,
]

const MARKET_NEWS_VERY_LONG_TERM_HORIZON_PATTERNS = [
  /\b(?:very long[-\s]?term|multi[-\s]?year|decades?|climate|energy transition|2050|2040|2035|2030)\b/,
]

const MARKET_NEWS_IMPACT_DISPLAY: Record<
  MarketNewsImpactDirection,
  { label: string; symbol: string }
> = {
  up: { label: 'Up', symbol: '↑' },
  down: { label: 'Down', symbol: '↓' },
  neutral: { label: 'Neutral', symbol: '-' },
}

const MARKET_NEWS_HORIZON_DISPLAY: Record<
  MarketNewsImpactHorizon,
  { label: string; className: string }
> = {
  immediate: { label: 'Immediate', className: 'market-news-horizon-immediate' },
  near_term: { label: 'Near Term', className: 'market-news-horizon-near-term' },
  mid_term: { label: 'Mid Term', className: 'market-news-horizon-mid-term' },
  long_term: { label: 'Long Term', className: 'market-news-horizon-long-term' },
  very_long_term: { label: 'Very Long Term', className: 'market-news-horizon-very-long-term' },
}

const MARKET_NEWS_EFFECT_FILTER_DIRECTIONS: Record<
  Exclude<MarketNewsEffectFilter, 'all'>,
  MarketNewsImpactDirection
> = {
  positive: 'up',
  negative: 'down',
  neutral: 'neutral',
}

function normalizeOptionalNewsText(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : null
}

function normalizeMarketNewsFilterText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? ''
}

export function normalizeMarketNewsEffectFilter(value: unknown): MarketNewsEffectFilter {
  return value === 'positive' || value === 'negative' || value === 'neutral' ? value : 'all'
}

export function normalizeMarketNewsHorizonFilter(value: unknown): MarketNewsHorizonFilter {
  return value === 'immediate' ||
    value === 'near_term' ||
    value === 'mid_term' ||
    value === 'long_term' ||
    value === 'very_long_term'
    ? value
    : 'all'
}

function normalizeMarketNewsPanelFilters(
  filters: MarketNewsPanelFilters | null | undefined,
): NormalizedMarketNewsPanelFilters {
  return {
    marketLocation: normalizeMarketNewsFilterText(filters?.marketLocation ?? null),
    horizon: normalizeMarketNewsHorizonFilter(filters?.horizon),
    supplyEffect: normalizeMarketNewsEffectFilter(filters?.supplyEffect),
    demandEffect: normalizeMarketNewsEffectFilter(filters?.demandEffect),
  }
}

export function hasActiveMarketNewsTableFilters(
  filters: MarketNewsPanelFilters | null | undefined,
): boolean {
  const normalizedFilters = normalizeMarketNewsPanelFilters(filters)
  return Boolean(
    normalizedFilters.marketLocation ||
      normalizedFilters.horizon !== 'all' ||
      normalizedFilters.supplyEffect !== 'all' ||
      normalizedFilters.demandEffect !== 'all',
  )
}

function formatFallbackNewsDate(value: string | null | undefined): string {
  if (!value) {
    return 'Time unavailable'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function newsHeadlineSourceLabel(item: MarketNewsHeadlineRecord): string {
  return item.source?.trim() || 'Market news'
}

function formatMarketNewsLocationScope(scope: MarketNewsLocationScope): string {
  return scope
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function inferMarketNewsMarketLocation(
  item: Pick<MarketNewsHeadlineRecord, 'title' | 'source'> | string,
): MarketNewsMarketLocation {
  const rawValue =
    typeof item === 'string' ? item : `${item.title ?? ''} ${item.source ?? ''}`
  const normalizedValue = rawValue.trim().toLowerCase()

  if (!normalizedValue) {
    return { label: 'Unspecified', scope: 'unspecified' }
  }

  for (const rule of MARKET_NEWS_LOCATION_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedValue))) {
      return { label: rule.label, scope: rule.scope }
    }
  }

  return { label: 'Unspecified', scope: 'unspecified' }
}

function scoreMarketNewsPatterns(value: string, patterns: RegExp[]): number {
  return patterns.reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0)
}

function inferMarketNewsDirection(
  value: string,
  upPatterns: RegExp[],
  downPatterns: RegExp[],
): MarketNewsImpactDirection {
  const upScore = scoreMarketNewsPatterns(value, upPatterns)
  const downScore = scoreMarketNewsPatterns(value, downPatterns)

  if (upScore > downScore) {
    return 'up'
  }
  if (downScore > upScore) {
    return 'down'
  }
  return 'neutral'
}

function inferMarketNewsSupplyDirection(value: string): MarketNewsImpactDirection {
  const upScore = scoreMarketNewsPatterns(value, MARKET_NEWS_SUPPLY_UP_PATTERNS)
  const downScore = scoreMarketNewsPatterns(value, MARKET_NEWS_SUPPLY_DOWN_PATTERNS)

  if (downScore > upScore) {
    return 'down'
  }
  if (upScore > downScore) {
    return 'up'
  }
  return 'neutral'
}

function inferMarketNewsDemandDirection(value: string): MarketNewsImpactDirection {
  return inferMarketNewsDirection(
    value,
    MARKET_NEWS_DEMAND_UP_PATTERNS,
    MARKET_NEWS_DEMAND_DOWN_PATTERNS,
  )
}

function headlineOnlyMovesPriceOrEquity(value: string): boolean {
  return (
    scoreMarketNewsPatterns(value, MARKET_NEWS_PRICE_OR_EQUITY_MOVE_PATTERNS) > 0 &&
    inferMarketNewsSupplyDirection(value) === 'neutral' &&
    inferMarketNewsDemandDirection(value) === 'neutral'
  )
}

function inferMarketNewsHorizon(value: string): MarketNewsImpactHorizon {
  if (scoreMarketNewsPatterns(value, MARKET_NEWS_VERY_LONG_TERM_HORIZON_PATTERNS) > 0) {
    return 'very_long_term'
  }
  if (scoreMarketNewsPatterns(value, MARKET_NEWS_LONG_TERM_HORIZON_PATTERNS) > 0) {
    return 'long_term'
  }
  if (scoreMarketNewsPatterns(value, MARKET_NEWS_IMMEDIATE_HORIZON_PATTERNS) > 0) {
    return 'immediate'
  }
  if (scoreMarketNewsPatterns(value, MARKET_NEWS_MID_TERM_HORIZON_PATTERNS) > 0) {
    return 'mid_term'
  }
  if (scoreMarketNewsPatterns(value, MARKET_NEWS_NEAR_TERM_HORIZON_PATTERNS) > 0) {
    return 'near_term'
  }
  return 'near_term'
}

export function inferMarketNewsHeadlineEffects(
  item: Pick<MarketNewsHeadlineRecord, 'title' | 'source'> | string,
): MarketNewsHeadlineEffects {
  const rawValue =
    typeof item === 'string' ? item : `${item.title ?? ''} ${item.source ?? ''}`
  const normalizedValue = rawValue.trim().toLowerCase()

  if (!normalizedValue) {
    return {
      supply: { direction: 'neutral', horizon: 'near_term' },
      demand: { direction: 'neutral', horizon: 'near_term' },
    }
  }

  const horizon = inferMarketNewsHorizon(normalizedValue)

  return {
    supply: {
      direction: headlineOnlyMovesPriceOrEquity(normalizedValue)
        ? 'neutral'
        : inferMarketNewsSupplyDirection(normalizedValue),
      horizon,
    },
    demand: {
      direction: inferMarketNewsDemandDirection(normalizedValue),
      horizon,
    },
  }
}

export function shouldShowMarketNewsImpactHorizon(
  effect: Pick<MarketNewsHeadlineEffect, 'direction'>,
): boolean {
  return effect.direction !== 'neutral'
}

function marketNewsEffectMatches(
  effect: MarketNewsHeadlineEffect,
  filter: MarketNewsEffectFilter,
): boolean {
  return filter === 'all' || effect.direction === MARKET_NEWS_EFFECT_FILTER_DIRECTIONS[filter]
}

function marketNewsHorizonMatches(
  effects: MarketNewsHeadlineEffects,
  filter: MarketNewsHorizonFilter,
): boolean {
  return filter === 'all' || effects.supply.horizon === filter || effects.demand.horizon === filter
}

function marketNewsLocationMatches(
  location: MarketNewsMarketLocation,
  filter: string,
): boolean {
  if (!filter) {
    return true
  }

  return `${location.label} ${formatMarketNewsLocationScope(location.scope)}`
    .toLowerCase()
    .includes(filter)
}

export function filterMarketNewsHeadlines(
  items: MarketNewsHeadlineRecord[],
  filters: MarketNewsPanelFilters | null | undefined,
): MarketNewsHeadlineRecord[] {
  const normalizedFilters = normalizeMarketNewsPanelFilters(filters)
  if (!hasActiveMarketNewsTableFilters(normalizedFilters)) {
    return items
  }

  return items.filter((item) => {
    const effects = inferMarketNewsHeadlineEffects(item)
    const location = inferMarketNewsMarketLocation(item)

    return (
      marketNewsLocationMatches(location, normalizedFilters.marketLocation) &&
      marketNewsHorizonMatches(effects, normalizedFilters.horizon) &&
      marketNewsEffectMatches(effects.supply, normalizedFilters.supplyEffect) &&
      marketNewsEffectMatches(effects.demand, normalizedFilters.demandEffect)
    )
  })
}

function MarketNewsImpactCell({
  axis,
  effect,
}: {
  axis: 'Supply' | 'Demand'
  effect: MarketNewsHeadlineEffect
}) {
  const impact = MARKET_NEWS_IMPACT_DISPLAY[effect.direction]
  const horizon = MARKET_NEWS_HORIZON_DISPLAY[effect.horizon]
  const impactLabel = `${axis} ${impact.label.toLowerCase()}`
  const horizonLabel = `${axis} ${horizon.label.toLowerCase()} impact`
  const showHorizon = shouldShowMarketNewsImpactHorizon(effect)

  return (
    <span className="market-news-impact-group">
      <span
        className={`market-news-impact market-news-impact-${effect.direction}`}
        aria-label={impactLabel}
        title={impactLabel}
      >
        <span className="market-news-impact-symbol" aria-hidden="true">
          {impact.symbol}
        </span>
        <span>{impact.label}</span>
      </span>
      {showHorizon ? (
        <span
          className={`market-news-horizon ${horizon.className}`}
          aria-label={horizonLabel}
          title={horizonLabel}
        >
          {horizon.label}
        </span>
      ) : null}
    </span>
  )
}

function MarketNewsTable({
  formatDate,
  items,
}: {
  formatDate: (value: string | null | undefined) => string
  items: MarketNewsHeadlineRecord[]
}) {
  return (
    <div className="market-news-table-scroll">
      <table className="market-news-table">
        <thead>
          <tr>
            <th scope="col">News title</th>
            <th scope="col">Source</th>
            <th scope="col">Market Location</th>
            <th scope="col">Effect on Supply</th>
            <th scope="col">Effect on Demand</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const effects = inferMarketNewsHeadlineEffects(item)
            const location = inferMarketNewsMarketLocation(item)
            return (
              <tr key={`${item.link}-${item.title}`}>
                <td className="market-news-title-cell">
                  <a href={item.link} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                </td>
                <td className="market-news-source-cell">
                  <span>{newsHeadlineSourceLabel(item)}</span>
                  {item.published_at ? <small>{formatDate(item.published_at)}</small> : null}
                </td>
                <td className="market-news-location-cell">
                  <span>{location.label}</span>
                  <small>{formatMarketNewsLocationScope(location.scope)}</small>
                </td>
                <td>
                  <MarketNewsImpactCell axis="Supply" effect={effects.supply} />
                </td>
                <td>
                  <MarketNewsImpactCell axis="Demand" effect={effects.demand} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function MarketNewsPanel({
  apiBase,
  commodity = null,
  query = null,
  limit = 5,
  lookbackDays = 3,
  variant = 'list',
  title = 'Market News',
  detail = 'Recent headlines matched to this market context.',
  filters = undefined,
  formatDate = formatFallbackNewsDate,
}: MarketNewsPanelProps) {
  const normalizedCommodity = normalizeOptionalNewsText(commodity)
  const normalizedQuery = normalizeOptionalNewsText(query)
  const normalizedLimit = Math.max(1, Math.floor(limit))
  const normalizedLookbackDays = Math.max(1, Math.floor(lookbackDays))
  const [news, setNews] = useState<MarketNewsRecord | null>(null)
  const [loading, setLoading] = useState(Boolean(normalizedCommodity || normalizedQuery))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!normalizedCommodity && !normalizedQuery) {
      setNews(null)
      setLoading(false)
      setError('')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    async function loadNews() {
      try {
        const payload = await loadMarketNewsHeadlines(apiBase, {
          commodity: normalizedCommodity,
          query: normalizedQuery,
          limit: normalizedLimit,
          lookbackDays: normalizedLookbackDays,
        })
        if (!cancelled) {
          setNews(payload)
        }
      } catch (nextError) {
        if (!cancelled) {
          setNews(null)
          setError(nextError instanceof Error ? nextError.message : 'Unable to load market news.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadNews()

    return () => {
      cancelled = true
    }
  }, [
    apiBase,
    normalizedCommodity,
    normalizedLimit,
    normalizedLookbackDays,
    normalizedQuery,
  ])

  const generatedAt = news?.generated_at ? formatDate(news.generated_at) : null
  const panelClassName =
    variant === 'table' ? 'market-news-panel market-news-panel-table' : 'market-news-panel'
  const filteredItems = useMemo(
    () => (news ? filterMarketNewsHeadlines(news.items, filters) : []),
    [filters, news],
  )
  const hasActiveTableFilters = hasActiveMarketNewsTableFilters(filters)

  return (
    <div className={panelClassName}>
      <div className="market-news-panel-head">
        <div className="pnl-trend-copy">
          <span>{title}</span>
          <p>{detail}</p>
        </div>
        <div className="market-news-chip-row">
          {normalizedCommodity ? <span className="entity-chip entity-chip-soft">{normalizedCommodity}</span> : null}
          {generatedAt ? <span className="entity-chip entity-chip-soft">Updated {generatedAt}</span> : null}
          {hasActiveTableFilters && news && news.items.length > 0 ? (
            <span className="entity-chip entity-chip-soft">{filteredItems.length} matched</span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="skeleton-stack">
          <div className="skeleton-block" />
          <div className="skeleton-block" />
        </div>
      ) : error ? (
        <div className="empty-state">
          <strong>News unavailable</strong>
          <p>{error}</p>
        </div>
      ) : news && news.items.length > 0 && filteredItems.length === 0 ? (
        <div className="empty-state">
          <strong>No headlines match filters</strong>
          <p>Adjust the market location, term, or supply and demand effect filters.</p>
        </div>
      ) : news && filteredItems.length > 0 && variant === 'table' ? (
        <MarketNewsTable items={filteredItems} formatDate={formatDate} />
      ) : news && filteredItems.length > 0 ? (
        <div className="market-news-list">
          {filteredItems.map((item) => (
            <article key={`${item.link}-${item.title}`} className="market-news-row">
              <div className="market-news-copy">
                <strong>
                  <a href={item.link} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                </strong>
                <div className="market-news-meta">
                  <span>{newsHeadlineSourceLabel(item)}</span>
                  <span>{formatDate(item.published_at)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No recent headlines</strong>
          <p>The current market news search did not return matching headlines.</p>
        </div>
      )}
    </div>
  )
}
