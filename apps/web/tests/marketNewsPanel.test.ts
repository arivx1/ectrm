import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildMarketNewsTableRows,
  filterMarketNewsHeadlines,
  filterMarketNewsTableRows,
  inferMarketNewsHeadlineEffects,
  inferMarketNewsMarketLocation,
  normalizeMarketNewsEffectFilter,
  normalizeMarketNewsHorizonFilter,
  shouldShowMarketNewsImpactHorizon,
  type MarketNewsImpactDirection,
  type MarketNewsImpactHorizon,
  type MarketNewsLocationScope,
} from '../src/widgets/news/MarketNewsPanel.tsx'
import type { MarketNewsHeadlineRecord } from '../src/shared/models.ts'

function assertEffects(
  title: string,
  expected: {
    supply: { direction: MarketNewsImpactDirection; horizon: MarketNewsImpactHorizon }
    demand: { direction: MarketNewsImpactDirection; horizon: MarketNewsImpactHorizon }
  },
) {
  assert.deepEqual(inferMarketNewsHeadlineEffects(title), expected)
}

function assertLocation(
  value: Parameters<typeof inferMarketNewsMarketLocation>[0],
  expected: { label: string; scope: MarketNewsLocationScope },
) {
  assert.deepEqual(inferMarketNewsMarketLocation(value), expected)
}

test('inferMarketNewsHeadlineEffects classifies supply and demand impact signals', () => {
  assertEffects('Crude rallies on supply risk', {
    supply: { direction: 'down', horizon: 'immediate' },
    demand: { direction: 'neutral', horizon: 'immediate' },
  })
  assertEffects('Gas inventories build as production resumes', {
    supply: { direction: 'up', horizon: 'immediate' },
    demand: { direction: 'neutral', horizon: 'immediate' },
  })
  assertEffects('LNG demand jumps as cold snap lifts heating demand', {
    supply: { direction: 'neutral', horizon: 'immediate' },
    demand: { direction: 'up', horizon: 'immediate' },
  })
  assertEffects('Factory slowdown weakens diesel demand', {
    supply: { direction: 'neutral', horizon: 'near_term' },
    demand: { direction: 'down', horizon: 'near_term' },
  })
  assertEffects('Interagency wildlife biologists receive Craighead Conservation Award', {
    supply: { direction: 'neutral', horizon: 'near_term' },
    demand: { direction: 'neutral', horizon: 'near_term' },
  })
  assertEffects('Industrial curtailment weakens power demand', {
    supply: { direction: 'neutral', horizon: 'near_term' },
    demand: { direction: 'down', horizon: 'near_term' },
  })
  assertEffects('A royal time at Beef and Boards', {
    supply: { direction: 'neutral', horizon: 'near_term' },
    demand: { direction: 'neutral', horizon: 'near_term' },
  })
  assertEffects('Vietnamese province to invest $162m in smart port to boost tuna exports', {
    supply: { direction: 'up', horizon: 'long_term' },
    demand: { direction: 'neutral', horizon: 'long_term' },
  })
  assertEffects('Nor Seafoods revenue jumps 22% in 2025 as trader warns securing fish supply remains key challenge', {
    supply: { direction: 'neutral', horizon: 'mid_term' },
    demand: { direction: 'neutral', horizon: 'mid_term' },
  })
  assertEffects('Climate change cuts seafood supply over decades', {
    supply: { direction: 'down', horizon: 'very_long_term' },
    demand: { direction: 'neutral', horizon: 'very_long_term' },
  })
})

test('inferMarketNewsHeadlineEffects separates price and equity moves from supply demand drivers', () => {
  assertEffects(
    'Copper prices soar to a two-week high nearing $14,000, aluminum hits over four-year peak as supply tightens and tariff uncertainties persist',
    {
      supply: { direction: 'down', horizon: 'near_term' },
      demand: { direction: 'neutral', horizon: 'near_term' },
    },
  )
  assertEffects('Copper, Aluminum Prices Rise on Global Demand, War Outlook', {
    supply: { direction: 'down', horizon: 'immediate' },
    demand: { direction: 'up', horizon: 'immediate' },
  })
  assertEffects('Alcoa jumps as aluminum prices surge on renewed supply-risk backdrop', {
    supply: { direction: 'down', horizon: 'immediate' },
    demand: { direction: 'neutral', horizon: 'immediate' },
  })
  assertEffects('Alcoa (AA) Stocks Rise as Aluminum Prices Hit Four-Year Highs', {
    supply: { direction: 'neutral', horizon: 'near_term' },
    demand: { direction: 'neutral', horizon: 'near_term' },
  })
  assertEffects('Alcoa (AA) Aluminum Prices Surge Amid Supply Concerns', {
    supply: { direction: 'down', horizon: 'immediate' },
    demand: { direction: 'neutral', horizon: 'immediate' },
  })
  assertEffects('Copper warehouse stocks rise as smelter output rebounds', {
    supply: { direction: 'up', horizon: 'near_term' },
    demand: { direction: 'neutral', horizon: 'near_term' },
  })
})

test('inferMarketNewsHeadlineEffects classifies livestock production and herd supply language', () => {
  assertEffects(
    'Australian Cattle Prices Surge on Rain as Beef Output Hits Record, May 31',
    {
      supply: { direction: 'up', horizon: 'immediate' },
      demand: { direction: 'neutral', horizon: 'immediate' },
    },
  )
  assertEffects('In the Cattle Markets: Beef Production Seasonality', {
    supply: { direction: 'neutral', horizon: 'mid_term' },
    demand: { direction: 'neutral', horizon: 'mid_term' },
  })
  assertEffects(
    'KILO YA BEEF, KILO YA STRESS! Disease Outbreaks, Dry Spells Push Up Beef Prices to Sh22,000',
    {
      supply: { direction: 'down', horizon: 'immediate' },
      demand: { direction: 'neutral', horizon: 'immediate' },
    },
  )
  assertEffects('Could more cattle cause record beef prices to drop?', {
    supply: { direction: 'up', horizon: 'near_term' },
    demand: { direction: 'neutral', horizon: 'near_term' },
  })
})

test('shouldShowMarketNewsImpactHorizon suppresses temporal tags for neutral effects', () => {
  assert.equal(shouldShowMarketNewsImpactHorizon({ direction: 'neutral' }), false)
  assert.equal(shouldShowMarketNewsImpactHorizon({ direction: 'up' }), true)
  assert.equal(shouldShowMarketNewsImpactHorizon({ direction: 'down' }), true)
})

test('inferMarketNewsMarketLocation extracts explicit market locations', () => {
  assertLocation('Vietnamese province to invest $162m in smart port to boost tuna exports', {
    label: 'Vietnam',
    scope: 'country',
  })
  assertLocation('Asia-Pacific seafood demand rises as inventories tighten', {
    label: 'Asia-Pacific',
    scope: 'region',
  })
  assertLocation(
    {
      title: 'Cattle supply tightens on lower placements',
      source: 'North Dakota Game and Fish',
    },
    {
      label: 'North Dakota',
      scope: 'state',
    },
  )
  assertLocation('Puerto Rico seafood imports rise after port disruption', {
    label: 'Puerto Rico',
    scope: 'territory',
  })
  assertLocation('Beef Market Warning: Cattle Futures Tumble as New Risks Hit U.S. Ranchers', {
    label: 'United States',
    scope: 'country',
  })
  assertLocation('U.S. Gulf Coast diesel exports rise after refinery restart', {
    label: 'US Gulf Coast',
    scope: 'region',
  })
  assertLocation('Rotterdam port expansion boosts grain export capacity', {
    label: 'Rotterdam',
    scope: 'city',
  })
  assertLocation('SalmonChile strengthens supply chain ties', {
    label: 'Chile',
    scope: 'country',
  })
  assertLocation('Retailers key to drive low-trophic seafood demand, executives say', {
    label: 'Unspecified',
    scope: 'unspecified',
  })
})

test('filterMarketNewsHeadlines filters by location, horizon, and market effect', () => {
  const items: MarketNewsHeadlineRecord[] = [
    {
      title: 'Vietnamese province to invest $162m in smart port to boost tuna exports',
      source: 'Undercurrent News',
      published_at: null,
      link: 'https://example.test/vietnam-tuna',
    },
    {
      title: 'Factory slowdown weakens diesel demand in Houston',
      source: 'Market Desk',
      published_at: null,
      link: 'https://example.test/houston-diesel',
    },
    {
      title: 'Asia-Pacific fish demand rises as imports jump',
      source: 'Seafood Wire',
      published_at: null,
      link: 'https://example.test/apac-fish',
    },
    {
      title: 'Climate change cuts seafood supply over decades in Alaska',
      source: 'SeafoodSource',
      published_at: null,
      link: 'https://example.test/alaska-climate',
    },
    {
      title: 'Local seafood roundup',
      source: 'Market Desk',
      published_at: null,
      link: 'https://example.test/local-roundup',
    },
  ]

  assert.deepEqual(
    filterMarketNewsHeadlines(items, { marketLocation: 'vietnam' }).map((item) => item.link),
    ['https://example.test/vietnam-tuna'],
  )
  assert.deepEqual(
    filterMarketNewsHeadlines(items, { horizon: 'very_long_term' }).map((item) => item.link),
    ['https://example.test/alaska-climate'],
  )
  assert.deepEqual(
    filterMarketNewsHeadlines(items, { supplyEffect: 'positive' }).map((item) => item.link),
    ['https://example.test/vietnam-tuna'],
  )
  assert.deepEqual(
    filterMarketNewsHeadlines(items, { demandEffect: 'negative' }).map((item) => item.link),
    ['https://example.test/houston-diesel'],
  )
  assert.deepEqual(
    filterMarketNewsHeadlines(items, {
      marketLocation: 'region',
      demandEffect: 'positive',
    }).map((item) => item.link),
    ['https://example.test/apac-fish'],
  )
  assert.deepEqual(
    filterMarketNewsHeadlines(items, {
      supplyEffect: 'neutral',
      demandEffect: 'neutral',
    }).map((item) => item.link),
    ['https://example.test/local-roundup'],
  )
})

test('filterMarketNewsTableRows applies validated AI tags after deterministic baseline', () => {
  const items: MarketNewsHeadlineRecord[] = [
    {
      title: 'Beef output breaks all-time high in U.S.',
      source: 'Market Wire',
      published_at: null,
      link: 'https://example.test/beef-output',
    },
  ]

  assert.equal(inferMarketNewsHeadlineEffects(items[0]).supply.direction, 'neutral')

  const rows = buildMarketNewsTableRows(items, {
    'headline-0': {
      id: 'headline-0',
      supply: {
        direction: 'up',
        horizon: 'immediate',
        confidence: 0.93,
        rationale: 'Output breaking an all-time high indicates more physical beef supply.',
        source: 'ai',
      },
      demand: {
        direction: 'neutral',
        horizon: 'near_term',
        confidence: 0.82,
        rationale: 'No demand driver is named.',
        source: 'ai',
      },
      market_location: {
        label: 'United States',
        scope: 'country',
        confidence: 0.91,
        rationale: 'The headline explicitly mentions U.S.',
        source: 'ai',
      },
    },
  })

  assert.equal(rows[0].effects.supply.direction, 'up')
  assert.equal(rows[0].effects.supply.source, 'ai')
  assert.deepEqual(
    filterMarketNewsTableRows(rows, { supplyEffect: 'positive' }).map((row) => row.item.link),
    ['https://example.test/beef-output'],
  )
  assert.deepEqual(
    filterMarketNewsTableRows(rows, { supplyEffect: 'neutral' }).map((row) => row.item.link),
    [],
  )
})

test('market news filter normalizers fall back to all for stale values', () => {
  assert.equal(normalizeMarketNewsEffectFilter('positive'), 'positive')
  assert.equal(normalizeMarketNewsEffectFilter('up'), 'all')
  assert.equal(normalizeMarketNewsHorizonFilter('long_term'), 'long_term')
  assert.equal(normalizeMarketNewsHorizonFilter('someday'), 'all')
})
