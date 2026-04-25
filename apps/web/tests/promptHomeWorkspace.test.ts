import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { PromptHomeWorkspace } from '../src/workspaces/prompt/PromptHomeWorkspace'

const defaultCounts = {
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
}

test('prompt home hides live context starters by default', () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: 'ok',
      counts: defaultCounts,
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
  assert.match(markup, /Older unconfirmed and uninvoiced trades rise first/)
  assert.match(markup, /Ready invoice work rises before blocked previews/)
  assert.match(markup, /Review queue/)
  assert.match(markup, /Sign in to review/)
  assert.match(markup, /aria-expanded="false" aria-controls="prompt-home-review-panel"/)
  assert.match(markup, /id="prompt-home-review-panel" class="prompt-home-support-body" hidden=""/)
})

test('prompt home shows the newest prompt thread messages first', () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: 'ok',
      counts: defaultCounts,
      onOpenView: () => undefined,
      initialMessages: [
        { id: 'prompt-1', role: 'user', content: 'Earliest prompt' },
        { id: 'completion-1', role: 'assistant', content: 'Earliest completion' },
        { id: 'prompt-2', role: 'user', content: 'Most recent prompt' },
        { id: 'completion-2', role: 'assistant', content: 'Most recent completion' },
      ],
    }),
  )

  const mostRecentCompletionIndex = markup.indexOf('Most recent completion')
  const mostRecentPromptIndex = markup.indexOf('Most recent prompt')
  const earliestCompletionIndex = markup.indexOf('Earliest completion')
  const earliestPromptIndex = markup.indexOf('Earliest prompt')

  assert.ok(mostRecentCompletionIndex >= 0)
  assert.ok(mostRecentPromptIndex >= 0)
  assert.ok(earliestCompletionIndex >= 0)
  assert.ok(earliestPromptIndex >= 0)
  assert.ok(mostRecentCompletionIndex < mostRecentPromptIndex)
  assert.ok(mostRecentPromptIndex < earliestCompletionIndex)
  assert.ok(earliestCompletionIndex < earliestPromptIndex)
})
