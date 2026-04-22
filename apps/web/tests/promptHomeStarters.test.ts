import assert from 'node:assert/strict'
import { test } from 'vitest'

import { buildPromptHomeContextualStarters } from '../src/workspaces/prompt/promptHomeStarters.ts'

test('prompt home contextual starters project live counts into prompt-first actions', () => {
  const starters = buildPromptHomeContextualStarters({
    activeTrades: 12,
    openWorkItems: 7,
    operationsQueueItems: 3,
    settlementQueueItems: 2,
    pendingInvoices: 4,
    paymentsDue: 1,
    attentionItems: 5,
    stalePricingItems: 2,
    pendingPricingTrades: 3,
    pendingSettlementTrades: 6,
  })

  assert.deepEqual(
    starters.map((starter) => ({
      key: starter.key,
      metric: starter.metric,
      targetView: starter.intent.targetView,
    })),
    [
      { key: 'operations-blockers', metric: '3', targetView: 'operations' },
      { key: 'settlement-follow-through', metric: '7', targetView: 'settlement' },
      { key: 'pricing-exposure', metric: '10', targetView: 'risk' },
      { key: 'trade-capture', metric: '18', targetView: 'trades' },
    ],
  )
  assert.match(starters[0]?.prompt ?? '', /operations queue/i)
  assert.equal(starters[0]?.askLabel, 'Ask about operations blockers')
})

test('prompt home contextual starters preserve unknown metrics', () => {
  const starters = buildPromptHomeContextualStarters({
    activeTrades: null,
    openWorkItems: null,
    operationsQueueItems: null,
    settlementQueueItems: null,
    pendingInvoices: null,
    paymentsDue: null,
    attentionItems: null,
    stalePricingItems: null,
    pendingPricingTrades: null,
    pendingSettlementTrades: null,
  })

  assert.equal(starters.length, 4)
  assert.equal(starters[0]?.metric, 'n/a')
  assert.equal(starters[1]?.metric, 'n/a')
  assert.equal(starters[2]?.metric, 'n/a')
  assert.equal(starters[3]?.metric, 'n/a')
})
