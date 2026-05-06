import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { shouldAutoEnsurePromptHomeData } from '../src/workspaces/prompt/promptHomeAutoLoad'
import { summarizePromptHomeAvailableTokens } from '../src/workspaces/prompt/promptHomeAvailableTokens'
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

test('prompt home renders guided prompts without legacy home actions', () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: 'ok',
      counts: defaultCounts,
      onOpenView: () => undefined,
    }),
  )
  const deskTimeIndex = markup.indexOf('Desk Time')
  const mapIndex = markup.indexOf('Open Map Workspace')
  const operatorPromptIndex = markup.indexOf('Operator prompt')

  assert.doesNotMatch(markup, /Show live context/)
  assert.doesNotMatch(markup, />Assistant Console</)
  assert.doesNotMatch(markup, /Contextual starting points/)
  assert.doesNotMatch(markup, /Clear operations blockers/)
  assert.doesNotMatch(markup, /Recent prompt threads/)
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
  assert.match(markup, /Available Token Count/)
  assert.match(markup, /Loading\.\.\./)
  assert.ok(deskTimeIndex >= 0)
  assert.ok(mapIndex > deskTimeIndex)
  assert.ok(operatorPromptIndex > mapIndex)
  assert.match(markup, /Desk Time/)
  assert.match(markup, /aria-expanded="true" aria-controls="prompt-home-timeframe-panel"/)
  assert.match(markup, /id="prompt-home-timeframe-panel" class="prompt-home-timeframe-panel-body"/)
  assert.match(markup, /id="prompt-home-map-panel" class="prompt-home-map-card-body"/)
  assert.doesNotMatch(markup, /Asset footprint preview/)
  assert.doesNotMatch(markup, /0 plotted \| 0 hidden \| 0 overlays/)
  assert.doesNotMatch(markup, /Preview map-ready assets and shared spatial overlays without leaving Home\./)
  assert.doesNotMatch(markup, /Map Scope/)
  assert.doesNotMatch(markup, /map-ready assets are currently plotted in Home\./)
  assert.doesNotMatch(markup, /All currently loaded assets meet the map-ready rules\./)
  assert.match(markup, /<strong>Map<\/strong>/)
  assert.match(markup, /class="prompt-home-map-card-toggle"/)
  assert.match(markup, /aria-expanded="true" aria-controls="prompt-home-map-panel"/)
  assert.match(markup, /Open Map Workspace/)
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

test('prompt home stops auto-loading weather after the first load error', () => {
  assert.equal(
    shouldAutoEnsurePromptHomeData({
      hasSession: true,
      dataLoaded: false,
      dataLoading: false,
      dataError: '',
      hasEnsureHandler: true,
    }),
    true,
  )

  assert.equal(
    shouldAutoEnsurePromptHomeData({
      hasSession: true,
      dataLoaded: false,
      dataLoading: false,
      dataError: 'Request failed: 404',
      hasEnsureHandler: true,
    }),
    false,
  )
})

test('prompt home token summary reports a single assistant budget', () => {
  const summary = summarizePromptHomeAvailableTokens([
    {
      agent_id: 'ops-governor',
      name: 'Ops Governor',
      description: 'Governed assistant',
      status: 'ACTIVE',
      scope: 'TEAM',
      provider: 'openai',
      model: 'gpt-5.4',
      role_key: 'trade-ops-copilot',
      profile_kind: 'ROLE_DERIVED',
      allowed_workspaces: ['assistant', 'trades'],
      capabilities: ['READ'],
      allowed_tools: [],
      allowed_action_types: [],
      token_budget: {
        status: 'GREEN',
        allocated_tokens: 50000,
        used_tokens: 4200,
        remaining_tokens: 45800,
        percent_used: 8.4,
        warning_threshold_percent: 80,
        allocation_source: 'AGENT',
        window_started_at: '2026-05-05T00:00:00Z',
        reset_at: '2026-05-06T00:00:00Z',
      },
      effective_policy: {
        allowed_tools: [],
        blocked_tools: [],
        allowed_actions: [],
        blocked_actions: [],
        policy_notes: [],
      },
      eval_gate: {
        status: 'PASS',
        role_key: 'trade-ops-copilot',
        required_cases: [],
        covered_cases: [],
        missing_cases: [],
        custom_case_count: 0,
        notes: [],
      },
    },
  ])

  assert.equal(summary.value, '45,800')
  assert.equal(summary.detail, 'Ops Governor remaining today.')
})

test('prompt home token summary combines multiple assistant budgets', () => {
  const summary = summarizePromptHomeAvailableTokens([
    {
      agent_id: 'ops-governor',
      name: 'Ops Governor',
      description: 'Governed assistant',
      status: 'ACTIVE',
      scope: 'TEAM',
      provider: 'openai',
      model: 'gpt-5.4',
      role_key: 'trade-ops-copilot',
      profile_kind: 'ROLE_DERIVED',
      allowed_workspaces: ['assistant'],
      capabilities: ['READ'],
      allowed_tools: [],
      allowed_action_types: [],
      token_budget: {
        status: 'GREEN',
        allocated_tokens: 50000,
        used_tokens: 4200,
        remaining_tokens: 45800,
        percent_used: 8.4,
        warning_threshold_percent: 80,
        allocation_source: 'AGENT',
        window_started_at: '2026-05-05T00:00:00Z',
        reset_at: '2026-05-06T00:00:00Z',
      },
      effective_policy: {
        allowed_tools: [],
        blocked_tools: [],
        allowed_actions: [],
        blocked_actions: [],
        policy_notes: [],
      },
      eval_gate: {
        status: 'PASS',
        role_key: 'trade-ops-copilot',
        required_cases: [],
        covered_cases: [],
        missing_cases: [],
        custom_case_count: 0,
        notes: [],
      },
    },
    {
      agent_id: 'risk-analyst',
      name: 'Risk Analyst',
      description: 'Risk assistant',
      status: 'ACTIVE',
      scope: 'TEAM',
      provider: 'openai',
      model: 'gpt-5.4',
      role_key: 'risk-analyst',
      profile_kind: 'ROLE_DERIVED',
      allowed_workspaces: ['assistant', 'risk'],
      capabilities: ['READ'],
      allowed_tools: [],
      allowed_action_types: [],
      token_budget: {
        status: 'AMBER',
        allocated_tokens: 25000,
        used_tokens: 7000,
        remaining_tokens: 18000,
        percent_used: 28,
        warning_threshold_percent: 80,
        allocation_source: 'AGENT',
        window_started_at: '2026-05-05T00:00:00Z',
        reset_at: '2026-05-06T00:00:00Z',
      },
      effective_policy: {
        allowed_tools: [],
        blocked_tools: [],
        allowed_actions: [],
        blocked_actions: [],
        policy_notes: [],
      },
      eval_gate: {
        status: 'PASS',
        role_key: 'risk-analyst',
        required_cases: [],
        covered_cases: [],
        missing_cases: [],
        custom_case_count: 0,
        notes: [],
      },
    },
  ])

  assert.equal(summary.value, '63,800')
  assert.equal(summary.detail, 'Combined across 2 published assistant budgets.')
})
