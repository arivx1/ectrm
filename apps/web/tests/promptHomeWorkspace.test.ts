import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { PromptHomeWorkspace } from '../src/workspaces/prompt/PromptHomeWorkspace'

test('prompt home hides live context starters by default', () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: 'ok',
      counts: {
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
      },
      onOpenView: () => undefined,
    }),
  )

  assert.match(markup, /Show live context/)
  assert.match(markup, /aria-expanded="false"/)
  assert.match(
    markup,
    /id="prompt-home-live-context-panel" class="prompt-home-starters" aria-label="Contextual starting points" hidden=""/,
  )
  assert.match(markup, /Clear operations blockers/)
})
