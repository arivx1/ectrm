import { describe, expect, it } from 'vitest'

import { buildPreTradeRecommendation } from '../src/workspaces/pretrade/preTradeRecommendations'
import type { PreTradeScenarioDraft } from '../src/shared/models'

function makeDraft(overrides: Partial<PreTradeScenarioDraft> = {}): PreTradeScenarioDraft {
  return {
    book: 'GAS_PHYS',
    portfolio: 'PROMPT',
    counterparty: 'SHELL_TRADING',
    commodity_class: 'NATURAL_GAS',
    commodity: 'HENRY_HUB',
    trade_side: 'BUY',
    pricing_type: 'FLOATING',
    price_index_code: 'NG_HH_PROMPT',
    target_price: 2.8,
    target_volume: 25000,
    trade_currency_code: 'USD',
    unit_of_measure: 'MMBTU',
    price_unit_code: 'MMBTU',
    location_code: 'HENRY_HUB',
    delivery_start: '2026-05-01',
    delivery_end: '2026-05-31',
    ...overrides,
  }
}

describe('buildPreTradeRecommendation', () => {
  it('waits for data when essential trade descriptors are missing', () => {
    const recommendation = buildPreTradeRecommendation({
      draft: makeDraft({ counterparty: null, target_volume: null }),
      activeTrades: [],
      positions: [],
      creditProfiles: [],
      externalCreditSnapshots: [],
      latestMark: null,
      marketContext: null,
      weatherOverview: null,
    })

    expect(recommendation.stance).toBe('WAIT_FOR_DATA')
    expect(recommendation.checks.some((check) => check.status === 'block')).toBe(true)
    expect(recommendation.explanation.stance_rationale).toContain('Wait for data')
  })

  it('escalates when projected credit utilization breaches the limit', () => {
    const recommendation = buildPreTradeRecommendation({
      draft: makeDraft({ target_price: 5, target_volume: 30000 }),
      activeTrades: [
        {
          trade_id: 'TRD-1',
          originating_option_trade_id: null,
          external_trade_id: null,
          source_system: null,
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
          execution_timestamp: null,
          trade_date: null,
          effective_start_date: null,
          effective_end_date: null,
          quality_spec: null,
          unit_of_measure: 'MMBTU',
          trade_currency_code: 'USD',
          location_code: 'HENRY_HUB',
          delivery_start: null,
          delivery_end: null,
          price_unit_code: 'MMBTU',
          instrument_type: 'LINEAR',
          option_type: null,
          option_style: null,
          option_strike_price: null,
          option_expiration_date: null,
          trade_nature: 'PHYSICAL',
          trade_structure: 'SINGLE',
          trade_side: 'BUY',
          book: 'GAS_PHYS',
          portfolio: 'PROMPT',
          counterparty: 'SHELL_TRADING',
          commodity_class: 'NATURAL_GAS',
          commodity: 'HENRY_HUB',
          pricing_type: 'FLOATING',
          pricing_status: 'PRICED',
          confirmation_status: 'CONFIRMED',
          nomination_status: 'NOMINATED',
          allocation_status: 'ALLOCATED',
          actualization_status: 'ACTUALIZED',
          price_index_code: 'NG_HH_PROMPT',
          price: 4,
          volume: 15000,
          invoice_status: 'PENDING',
          payment_status: 'PENDING',
          settlement_status: 'OPEN',
          trader_user: 'trader.alpha',
          status: 'ACTIVE',
          last_event_id: 'evt-1',
        },
      ],
      positions: [{ commodity: 'HENRY_HUB', net_volume: 10000, updated_at: '2026-04-01T00:00:00Z' }],
      creditProfiles: [
        {
          counterparty_code: 'SHELL_TRADING',
          credit_rating: 'A',
          review_due_at: '2026-06-01',
          limit_currency_code: 'USD',
          limit_amount: 100000,
          breach_action: 'REQUIRE_APPROVAL',
          notes: null,
          created_at: '2026-04-01T00:00:00Z',
          created_by: 'ops',
          updated_at: '2026-04-01T00:00:00Z',
          updated_by: 'ops',
          version: 1,
        },
      ],
      externalCreditSnapshots: [],
      latestMark: {
        id: 1,
        price_index_code: 'NG_HH_PROMPT',
        observation_date: '2026-04-15',
        value: 4.9,
        unit_code: 'MMBTU',
        currency_code: 'USD',
        source_provider: 'ICE',
        source_series_id: 'NG',
        source_frequency: 'DAILY',
        source_published_at: null,
        source_revision: null,
        downloaded_at: '2026-04-15T00:00:00Z',
        run_id: 1,
        created_at: '2026-04-15T00:00:00Z',
        updated_at: '2026-04-15T00:00:00Z',
      },
      marketContext: null,
      weatherOverview: null,
    })

    expect(recommendation.stance).toBe('ESCALATE')
    expect(recommendation.projected_credit_utilization_pct).not.toBeNull()
    expect(recommendation.explanation.primary_drivers[0]).toContain('Projected credit utilization')
  })

  it('proceeds when credit and pricing checks are within tolerance', () => {
    const recommendation = buildPreTradeRecommendation({
      draft: makeDraft(),
      activeTrades: [],
      positions: [{ commodity: 'HENRY_HUB', net_volume: 1000, updated_at: '2026-04-01T00:00:00Z' }],
      creditProfiles: [
        {
          counterparty_code: 'SHELL_TRADING',
          credit_rating: 'A',
          review_due_at: '2026-06-01',
          limit_currency_code: 'USD',
          limit_amount: 500000,
          breach_action: 'WARN',
          notes: null,
          created_at: '2026-04-01T00:00:00Z',
          created_by: 'ops',
          updated_at: '2026-04-01T00:00:00Z',
          updated_by: 'ops',
          version: 1,
        },
      ],
      externalCreditSnapshots: [],
      latestMark: {
        id: 1,
        price_index_code: 'NG_HH_PROMPT',
        observation_date: '2026-04-15',
        value: 2.79,
        unit_code: 'MMBTU',
        currency_code: 'USD',
        source_provider: 'ICE',
        source_series_id: 'NG',
        source_frequency: 'DAILY',
        source_published_at: null,
        source_revision: null,
        downloaded_at: '2026-04-15T00:00:00Z',
        run_id: 1,
        created_at: '2026-04-15T00:00:00Z',
        updated_at: '2026-04-15T00:00:00Z',
      },
      marketContext: null,
      weatherOverview: null,
    })

    expect(recommendation.stance).toBe('PROCEED')
    expect(recommendation.next_actions[0]).toContain('No blocking gaps')
    expect(recommendation.explanation.reviewer_focus[0]).toContain('Confirm desk intent')
  })
})
