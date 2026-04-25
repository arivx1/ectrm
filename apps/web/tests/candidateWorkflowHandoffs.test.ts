import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildInvoiceIssueCandidateWorkflowHandoff,
  buildTradeAttentionCandidateWorkflowHandoff,
} from '../src/entities/app/candidateWorkflowHandoffs.ts'
import type {
  InvoiceIssueCandidateRecord,
  TradeAttentionCandidateRecord,
} from '../src/entities/app/api.ts'

function baseTradeAttentionCandidate(
  patch: Partial<TradeAttentionCandidateRecord> = {},
): TradeAttentionCandidateRecord {
  return {
    trade_id: 'TRD-1001',
    candidate_types: ['confirmation_backlog'],
    source_count_keys: ['dashboard.attention.confirmation_backlog_count'],
    priority_reason: 'Older unconfirmed trades rise first in the confirmation queue.',
    trade_nature: 'PHYSICAL',
    book: 'GAS-US',
    portfolio: 'PROMPT',
    counterparty: 'ACME',
    commodity_class: 'GAS',
    commodity: 'HH',
    trader_user: 'operator',
    trade_date: '2026-04-20',
    execution_timestamp: '2026-04-20T12:00:00Z',
    delivery_start: '2026-04-25',
    delivery_end: '2026-04-27',
    confirmation_status: 'PENDING',
    nomination_status: 'PENDING',
    allocation_status: 'PENDING',
    pricing_status: 'PENDING',
    invoice_status: 'PENDING',
    payment_status: 'PENDING',
    settlement_status: 'PENDING',
    age_days: 3,
    supporting_records: {},
    suggested_next_tool: null,
    next_steps: [],
    blocking_reasons: [],
    recommended_action: null,
    ...patch,
  }
}

function baseInvoiceIssueCandidate(
  patch: Partial<InvoiceIssueCandidateRecord> = {},
): InvoiceIssueCandidateRecord {
  return {
    trade_id: 'TRD-2002',
    trade_nature: 'PHYSICAL',
    book: 'POWER',
    portfolio: 'SETTLEMENT',
    counterparty: 'GRIDCO',
    commodity_class: 'POWER',
    commodity: 'ERCOT NORTH',
    trader_user: 'settlement_user',
    trade_date: '2026-04-19',
    execution_timestamp: '2026-04-19T12:00:00Z',
    delivery_start: '2026-04-20',
    delivery_end: '2026-04-20',
    trade_currency_code: 'USD',
    invoice_status: 'PENDING',
    payment_status: 'PENDING',
    settlement_status: 'PENDING',
    notional_amount: 1250,
    age_days: 4,
    readiness_status: 'READY',
    priority_reason: 'Ready-to-issue invoice candidates rise before blocked previews.',
    preview_summary: 'Ready to issue the first invoice.',
    blocking_reasons: [],
    assumptions: [],
    recommended_action: {
      action_type: 'issue_trade_invoice',
      requires_approval: true,
      payload: { trade_id: 'TRD-2002' },
      preview_status: 'READY',
    },
    ...patch,
  }
}

test('confirmation backlog handoffs focus the confirmation ledger when a row already exists', () => {
  const handoff = buildTradeAttentionCandidateWorkflowHandoff(
    baseTradeAttentionCandidate({
      recommended_action: {
        action_type: 'issue_trade_confirmation',
        requires_approval: true,
        payload: { confirmation_id: 41 },
      },
      supporting_records: {
        current_confirmation_id: 41,
      },
    }),
  )

  assert.equal(handoff.view, 'operations')
  assert.equal(handoff.label, 'Open confirmation')
  assert.equal(handoff.handoff.filter, '41')
  assert.equal(handoff.handoff.tradeId, 'TRD-1001')
})

test('nomination backlog handoffs point the scheduler queue at the open workflow item', () => {
  const handoff = buildTradeAttentionCandidateWorkflowHandoff(
    baseTradeAttentionCandidate({
      candidate_types: ['nomination_backlog'],
      source_count_keys: ['dashboard.attention.nomination_backlog_count'],
      supporting_records: {
        open_workflow_items: [
          {
            item_id: 77,
            workflow_type: 'NOMINATION',
            status: 'OPEN',
          },
        ],
      },
    }),
  )

  assert.equal(handoff.view, 'scheduling')
  assert.equal(handoff.label, 'Open nomination queue')
  assert.deepEqual(handoff.handoff.focus, {
    type: 'workflow_item',
    id: '77',
    label: 'Nomination item 77',
  })
  assert.equal(handoff.handoff.filter, '77')
})

test('overdue payment handoffs focus settlement on the matching invoice', () => {
  const handoff = buildTradeAttentionCandidateWorkflowHandoff(
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
    }),
  )

  assert.equal(handoff.view, 'settlement')
  assert.equal(handoff.label, 'Open payment queue')
  assert.equal(handoff.handoff.filter, '501')
  assert.deepEqual(handoff.handoff.focus, {
    type: 'invoice',
    id: '501',
    label: 'INV-501',
  })
})

test('payment due handoffs also focus settlement on the matching invoice', () => {
  const handoff = buildTradeAttentionCandidateWorkflowHandoff(
    baseTradeAttentionCandidate({
      candidate_types: ['payment_due'],
      source_count_keys: ['settlement.payment_due_count'],
      invoice_status: 'ISSUED',
      payment_status: 'DUE',
      settlement_status: 'INVOICED',
      supporting_records: {
        candidate_invoice_id: 777,
        candidate_invoice_number: 'INV-777',
      },
    }),
  )

  assert.equal(handoff.view, 'settlement')
  assert.equal(handoff.label, 'Open payment queue')
  assert.equal(handoff.handoff.filter, '777')
  assert.deepEqual(handoff.handoff.focus, {
    type: 'invoice',
    id: '777',
    label: 'INV-777',
  })
})

test('stale pricing handoffs open trade capture on the amend panel', () => {
  const handoff = buildTradeAttentionCandidateWorkflowHandoff(
    baseTradeAttentionCandidate({
      candidate_types: ['stale_pricing'],
      source_count_keys: ['dashboard.attention.stale_pricing_count'],
      pricing_status: 'PENDING',
    }),
  )

  assert.equal(handoff.view, 'trades')
  assert.equal(handoff.label, 'Open trade pricing')
  assert.equal(handoff.handoff.tradeInspectorTab, 'amend')
  assert.deepEqual(handoff.handoff.focus, {
    type: 'trade',
    id: 'TRD-1001',
    label: 'TRD-1001',
  })
})

test('incomplete ops data handoffs open the trade workbench on amend', () => {
  const handoff = buildTradeAttentionCandidateWorkflowHandoff(
    baseTradeAttentionCandidate({
      candidate_types: ['incomplete_ops_data'],
      source_count_keys: ['dashboard.attention.incomplete_ops_data_count'],
    }),
  )

  assert.equal(handoff.view, 'trades')
  assert.equal(handoff.label, 'Open trade workbench')
  assert.equal(handoff.handoff.tradeInspectorTab, 'amend')
  assert.deepEqual(handoff.handoff.focus, {
    type: 'trade',
    id: 'TRD-1001',
    label: 'TRD-1001',
  })
})

test('invoice issue candidates hand off into settlement with trade focus', () => {
  const handoff = buildInvoiceIssueCandidateWorkflowHandoff(baseInvoiceIssueCandidate())

  assert.equal(handoff.view, 'settlement')
  assert.equal(handoff.label, 'Open invoice ledger')
  assert.equal(handoff.handoff.tradeId, 'TRD-2002')
  assert.equal(handoff.handoff.filter, 'TRD-2002')
  assert.deepEqual(handoff.handoff.focus, {
    type: 'trade',
    id: 'TRD-2002',
    label: 'TRD-2002',
  })
})
