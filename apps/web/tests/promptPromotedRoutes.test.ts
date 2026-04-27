import assert from 'node:assert/strict'
import { test } from 'vitest'

import { buildPromptHomePromotedRoutes } from '../src/workspaces/prompt/promptPromotedRoutes.ts'
import type {
  InvoiceIssueCandidateRecord,
  TradeAttentionCandidateRecord,
} from '../src/entities/app/api.ts'
import type { AssistantPromptRouteRecommendation } from '../src/shared/models.ts'

function baseRecommendation(
  patch: Partial<AssistantPromptRouteRecommendation> = {},
): AssistantPromptRouteRecommendation {
  return {
    target_view: 'operations',
    target_label: 'Open Work Queue',
    target_rationale: 'Use operations for confirmation blockers and handoffs.',
    accepted_count: 4,
    outcome_count: 5,
    acceptance_rate: 0.8,
    last_accepted_at: '2026-04-25T09:00:00Z',
    signal: 'CANDIDATE_FOR_RULE',
    signal_reasons: ['Repeated accepted handoffs make this destination a strong deterministic rule candidate.'],
    ...patch,
  }
}

function baseTradeAttentionCandidate(
  patch: Partial<TradeAttentionCandidateRecord> = {},
): TradeAttentionCandidateRecord {
  return {
    trade_id: 'T-AMEND-100',
    candidate_types: ['confirmation_backlog'],
    source_count_keys: ['dashboard.attention.confirmation_backlog_count'],
    priority_reason: 'Older unconfirmed trades rise first in the confirmation queue.',
    trade_nature: 'PHYSICAL',
    book: 'GULF_GAS',
    portfolio: 'GULF_PROMPT',
    counterparty: 'ALPHA_MKT',
    commodity_class: 'NATURAL_GAS',
    commodity: 'HENRY_HUB_GAS',
    trader_user: 'trader.alpha',
    trade_date: '2026-04-10',
    execution_timestamp: '2026-04-10T16:00:00Z',
    delivery_start: '2026-04-12',
    delivery_end: '2026-04-12',
    confirmation_status: 'PENDING',
    nomination_status: 'PENDING',
    allocation_status: 'PENDING',
    pricing_status: 'PENDING',
    invoice_status: 'PENDING',
    payment_status: 'PENDING',
    settlement_status: 'PENDING',
    age_days: 3,
    supporting_records: {
      current_confirmation_id: 41,
    },
    suggested_next_tool: 'get_trade_confirmation_by_id',
    next_steps: ['Review the confirmation blocker with the operations owner.'],
    blocking_reasons: ['Counterparty acknowledgement is still missing.'],
    recommended_action: {
      action_type: 'issue_trade_confirmation',
      requires_approval: true,
      payload: {
        trade_id: 'T-AMEND-100',
        confirmation_id: 41,
      },
    },
    ...patch,
  }
}

function baseInvoiceIssueCandidate(
  patch: Partial<InvoiceIssueCandidateRecord> = {},
): InvoiceIssueCandidateRecord {
  return {
    trade_id: 'T-AMEND-100',
    trade_nature: 'PHYSICAL',
    book: 'GULF_GAS',
    portfolio: 'GULF_PROMPT',
    counterparty: 'ALPHA_MKT',
    commodity_class: 'NATURAL_GAS',
    commodity: 'HENRY_HUB_GAS',
    trader_user: 'trader.alpha',
    trade_date: '2026-04-10',
    execution_timestamp: '2026-04-10T16:00:00Z',
    delivery_start: '2026-04-12',
    delivery_end: '2026-04-12',
    trade_currency_code: 'USD',
    invoice_status: 'PENDING',
    payment_status: 'PENDING',
    settlement_status: 'PENDING',
    notional_amount: 1250,
    age_days: 4,
    readiness_status: 'READY',
    priority_reason: 'Ready-to-issue invoice candidates rise before blocked previews.',
    preview_summary: 'Ready to issue the first invoice from settlement.',
    blocking_reasons: [],
    assumptions: [],
    recommended_action: {
      action_type: 'issue_trade_invoice',
      requires_approval: true,
      payload: { trade_id: 'T-AMEND-100' },
      preview_status: 'READY',
    },
    ...patch,
  }
}

test('promoted operations routes upgrade into focused deterministic handoffs when a live candidate matches', () => {
  const routes = buildPromptHomePromotedRoutes({
    recommendations: [baseRecommendation()],
    tradeAttentionCandidates: [baseTradeAttentionCandidate()],
  })

  assert.equal(routes.length, 1)
  assert.equal(routes[0].readiness, 'ready')
  assert.equal(routes[0].hasFocusedHandoff, true)
  assert.equal(routes[0].intent.targetView, 'operations')
  assert.equal(routes[0].displayLabel, 'Open confirmation')
  assert.equal(routes[0].displayFocusLabel, 'Trade: T-AMEND-100')
  assert.equal(routes[0].intent.focus?.type, 'trade')
  assert.equal(routes[0].intent.focus?.id, 'T-AMEND-100')
  assert.equal(routes[0].intent.filter, '41')
})

test('promoted settlement routes prefer a live trade-attention handoff before generic invoice issuance', () => {
  const routes = buildPromptHomePromotedRoutes({
    recommendations: [
      baseRecommendation({
        target_view: 'settlement',
        target_label: 'Open Settlement',
        target_rationale: 'Use settlement for invoices, payments, aging, and cash exceptions.',
      }),
    ],
    tradeAttentionCandidates: [
      baseTradeAttentionCandidate({
        candidate_types: ['overdue_payment'],
        source_count_keys: ['dashboard.attention.overdue_payment_count'],
        invoice_status: 'ISSUED',
        payment_status: 'OVERDUE',
        settlement_status: 'INVOICED',
        supporting_records: {
          candidate_invoice_id: 501,
          candidate_invoice_number: 'INV-501',
        },
        recommended_action: null,
      }),
    ],
    invoiceIssueCandidates: [baseInvoiceIssueCandidate()],
  })

  assert.equal(routes.length, 1)
  assert.equal(routes[0].readiness, 'ready')
  assert.equal(routes[0].hasFocusedHandoff, true)
  assert.equal(routes[0].intent.targetView, 'settlement')
  assert.equal(routes[0].displayLabel, 'Open payment queue')
  assert.equal(routes[0].intent.focus?.type, 'invoice')
  assert.equal(routes[0].intent.focus?.id, '501')
  assert.equal(routes[0].intent.focus?.label, 'INV-501')
})

test('promoted settlement routes choose invoice issuance when the recommendation is invoice-specific', () => {
  const routes = buildPromptHomePromotedRoutes({
    recommendations: [
      baseRecommendation({
        target_view: 'settlement',
        target_label: 'Open invoice follow-through',
        target_rationale: 'Use settlement for invoices waiting to be issued.',
      }),
    ],
    tradeAttentionCandidates: [
      baseTradeAttentionCandidate({
        candidate_types: ['overdue_payment'],
        source_count_keys: ['dashboard.attention.overdue_payment_count'],
        invoice_status: 'ISSUED',
        payment_status: 'OVERDUE',
        settlement_status: 'INVOICED',
        supporting_records: {
          candidate_invoice_id: 501,
          candidate_invoice_number: 'INV-501',
        },
        recommended_action: null,
      }),
    ],
    invoiceIssueCandidates: [baseInvoiceIssueCandidate()],
  })

  assert.equal(routes.length, 1)
  assert.equal(routes[0].readiness, 'ready')
  assert.equal(routes[0].hasFocusedHandoff, true)
  assert.equal(routes[0].intent.targetView, 'settlement')
  assert.equal(routes[0].displayLabel, 'Open invoice ledger')
  assert.equal(routes[0].intent.focus?.type, 'trade')
  assert.equal(routes[0].intent.focus?.id, 'T-AMEND-100')
})

test('promoted routes use recommendation focus type as a tie-breaker for focused candidates', () => {
  const routes = buildPromptHomePromotedRoutes({
    recommendations: [
      baseRecommendation({
        target_view: 'settlement',
        target_label: 'Open settlement follow-through',
        target_rationale: 'Use settlement for focused follow-through that already proved out.',
        focus_type: 'invoice',
      }),
    ],
    tradeAttentionCandidates: [
      baseTradeAttentionCandidate({
        candidate_types: ['overdue_payment'],
        source_count_keys: ['dashboard.attention.overdue_payment_count'],
        invoice_status: 'ISSUED',
        payment_status: 'OVERDUE',
        settlement_status: 'INVOICED',
        supporting_records: {
          candidate_invoice_id: 501,
          candidate_invoice_number: 'INV-501',
        },
        recommended_action: null,
      }),
    ],
    invoiceIssueCandidates: [baseInvoiceIssueCandidate()],
  })

  assert.equal(routes.length, 1)
  assert.equal(routes[0].readiness, 'ready')
  assert.equal(routes[0].displayLabel, 'Open payment queue')
  assert.equal(routes[0].intent.focus?.type, 'invoice')
})

test('promoted trade routes choose pricing follow-through over other trade candidates when the recommendation asks for pricing', () => {
  const routes = buildPromptHomePromotedRoutes({
    recommendations: [
      baseRecommendation({
        target_view: 'trades',
        target_label: 'Open trade pricing',
        target_rationale: 'Use Trade Capture to resolve pricing gaps first.',
      }),
    ],
    tradeAttentionCandidates: [
      baseTradeAttentionCandidate({
        candidate_types: ['incomplete_ops_data'],
        source_count_keys: ['dashboard.attention.incomplete_ops_data_count'],
      }),
      baseTradeAttentionCandidate({
        trade_id: 'T-PRICE-200',
        candidate_types: ['stale_pricing'],
        source_count_keys: ['dashboard.attention.stale_pricing_count'],
        pricing_status: 'PENDING',
        supporting_records: {},
        recommended_action: null,
      }),
    ],
  })

  assert.equal(routes.length, 1)
  assert.equal(routes[0].readiness, 'ready')
  assert.equal(routes[0].hasFocusedHandoff, true)
  assert.equal(routes[0].intent.targetView, 'trades')
  assert.equal(routes[0].displayLabel, 'Open trade pricing')
  assert.equal(routes[0].intent.focus?.id, 'T-PRICE-200')
  assert.equal(routes[0].intent.inspectorTab, 'amend')
})

test('promoted routes fall back to the workspace-level recommendation when no live object matches', () => {
  const routes = buildPromptHomePromotedRoutes({
    recommendations: [baseRecommendation({ target_view: 'risk', target_label: 'Open Exposure' })],
  })

  assert.equal(routes.length, 1)
  assert.equal(routes[0].readiness, 'ready')
  assert.equal(routes[0].hasFocusedHandoff, false)
  assert.equal(routes[0].intent.targetView, 'risk')
  assert.equal(routes[0].displayLabel, 'Open Exposure')
  assert.equal(routes[0].intent.focus, undefined)
  assert.equal(routes[0].intent.filter, undefined)
})

test('route-specific promoted recommendations stay visible and wait for a live match before cooling off', () => {
  const routes = buildPromptHomePromotedRoutes({
    recommendations: [
      baseRecommendation({
        target_view: 'operations',
        target_label: 'Open confirmation',
        target_rationale: 'Review the confirmation blocker with the operations owner.',
        focus_type: 'trade',
        last_accepted_at: '2026-04-24T09:00:00Z',
      }),
    ],
    now: '2026-04-25T12:00:00Z',
  })

  assert.equal(routes.length, 1)
  assert.equal(routes[0].readiness, 'waiting')
  assert.equal(routes[0].displayLabel, 'Open confirmation')
  assert.equal(routes[0].recordOutcomeOnOpen, false)
  assert.equal(routes[0].intent.targetView, 'operations')
  assert.equal(routes[0].intent.label, undefined)
  assert.match(routes[0].displayDetail, /No current live match/)
  assert.equal(routes[0].ageLabel, 'Last accepted yesterday.')
})

test('route-specific promoted recommendations cool off after a week without a live match', () => {
  const routes = buildPromptHomePromotedRoutes({
    recommendations: [
      baseRecommendation({
        target_view: 'operations',
        target_label: 'Open confirmation',
        target_rationale: 'Review the confirmation blocker with the operations owner.',
        focus_type: 'trade',
        last_accepted_at: '2026-04-15T09:00:00Z',
      }),
    ],
    now: '2026-04-25T12:00:00Z',
  })

  assert.equal(routes.length, 1)
  assert.equal(routes[0].readiness, 'cooling_off')
  assert.equal(routes[0].readinessLabel, 'Cooling off')
  assert.match(routes[0].displayDetail, /cooling off/i)
  assert.equal(routes[0].ageLabel, 'Last accepted 10 days ago.')
})

test('ready promoted routes stay ahead of waiting and cooling cards', () => {
  const routes = buildPromptHomePromotedRoutes({
    recommendations: [
      baseRecommendation({
        target_view: 'operations',
        target_label: 'Open confirmation',
        target_rationale: 'Review the confirmation blocker with the operations owner.',
        focus_type: 'trade',
        last_accepted_at: '2026-04-24T09:00:00Z',
      }),
      baseRecommendation({
        target_view: 'risk',
        target_label: 'Open Exposure',
        target_rationale: 'Use Exposure to review live risk now.',
        focus_type: null,
        last_accepted_at: '2026-04-20T09:00:00Z',
      }),
      baseRecommendation({
        target_view: 'settlement',
        target_label: 'Open payment queue',
        target_rationale: 'Use settlement for overdue cash.',
        focus_type: 'invoice',
        last_accepted_at: '2026-04-10T09:00:00Z',
      }),
    ],
    now: '2026-04-25T12:00:00Z',
  })

  assert.deepEqual(
    routes.map((route) => [route.displayLabel, route.readiness]),
    [
      ['Open Exposure', 'ready'],
      ['Open confirmation', 'waiting'],
      ['Open payment queue', 'cooling_off'],
    ],
  )
})
