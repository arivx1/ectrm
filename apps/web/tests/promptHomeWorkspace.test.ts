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
  assert.match(markup, /What are you trying to do\?/)
  assert.match(markup, /Choose one to reveal a few suggested prompts and direct workspace links\./)
  assert.match(markup, /Trade/)
  assert.match(markup, /Schedule/)
  assert.match(markup, /Manage Shipments/)
  assert.match(markup, /Manage Risk/)
  assert.match(markup, /Settle/)
  assert.match(markup, /Accounting/)
  assert.doesNotMatch(markup, /Tell me updates about the Strait of Hormuz\./)
  assert.doesNotMatch(markup, /Help me build a simulated trade idea to hedge risk\./)
  assert.match(markup, /Review queue/)
  assert.match(markup, /Sign in to review/)
  assert.match(markup, /Desk Time/)
  assert.match(markup, /aria-expanded="true" aria-controls="prompt-home-timeframe-panel"/)
  assert.match(markup, /id="prompt-home-timeframe-panel" class="prompt-home-timeframe-panel-body"/)
  assert.match(markup, /Asset footprint preview/)
  assert.match(markup, /0 plotted \| 0 hidden \| 0 overlays/)
  assert.match(markup, /aria-expanded="false" aria-controls="prompt-home-map-panel"/)
  assert.match(markup, /id="prompt-home-map-panel" class="prompt-home-map-card-body" hidden=""/)
  assert.match(markup, /Time zone/)
  assert.match(markup, /Preferred time zone/)
  assert.match(markup, /aria-expanded="true" aria-controls="prompt-home-day-panel"/)
  assert.match(markup, /id="prompt-home-day-panel" class="prompt-home-time-meter-card-body"/)
  assert.match(markup, /Trading opens/)
  assert.match(markup, /Trading closes/)
  assert.match(markup, /Representative trading hours/)
  assert.match(markup, /Show details/)
  assert.match(markup, /aria-expanded="false" aria-controls="prompt-home-trading-hours-panel"/)
  assert.match(markup, /id="prompt-home-trading-hours-panel" class="prompt-home-session-board" hidden=""/)
  assert.match(markup, /Representative venue sessions converted into/)
  assert.match(markup, /ICE Brent/)
  assert.match(markup, /LMEselect/)
  assert.match(markup, /LME Ring/)
  assert.match(markup, /SGX MSCI/)
  assert.match(markup, /CME WTI/)
  assert.match(markup, /EEX Power/)
  assert.match(markup, /TOCOM Energy/)
  assert.match(markup, /aria-expanded="true" aria-controls="prompt-home-week-panel"/)
  assert.match(markup, /id="prompt-home-week-panel" class="prompt-home-time-meter-card-body"/)
  assert.match(markup, /Sunday through Saturday/)
  assert.match(markup, /aria-expanded="true" aria-controls="prompt-home-month-panel"/)
  assert.match(markup, /id="prompt-home-month-panel" class="prompt-home-time-meter-card-body"/)
  assert.match(markup, /1 through EOM/)
  assert.match(markup, /HE00/)
  assert.match(markup, /HE07/)
  assert.match(markup, /HE22/)
  assert.match(markup, /HE24/)
  assert.match(markup, /Sun/)
  assert.match(markup, /Sat/)
  assert.match(markup, /EOM/)
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
