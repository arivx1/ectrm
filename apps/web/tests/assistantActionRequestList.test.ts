import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { AssistantActionRequestList } from '../src/entities/assistant/AssistantActionRequestList'
import type { AssistantActionRequest } from '../src/shared/models'

function buildInvoiceActionRequest(
  preview: NonNullable<NonNullable<AssistantActionRequest['review_context']>['action_preview']>,
): AssistantActionRequest {
  return {
    action_request_id: 1017,
    run_id: 42,
    user_id: 'settlement.user',
    status: 'PENDING',
    workspace: 'assistant',
    agent_id: 'settlement-copilot',
    agent_name: 'Settlement Copilot',
    action_type: 'issue_trade_invoice',
    summary: 'Issue invoice INV-T-1017',
    description: 'Stage invoice issuance for review.',
    payload: {
      trade_id: 'T-1017',
      invoice_number: 'INV-T-1017',
      invoice_amount: 2500,
    },
    review_context: {
      owning_work_object: {
        type: 'trade',
        id: 'T-1017',
        label: 'Trade T-1017',
      },
      required_reviewer_role: 'SETTLEMENT_LEAD',
      business_rationale: 'Invoice terms were identified from settlement context.',
      proposed_mutation: {
        operation: 'issue_trade_invoice',
        trade_id: 'T-1017',
      },
      supporting_records: [],
      assumptions: [],
      missing_evidence: [],
      expected_downstream_effects: ['Create invoice ledger record.'],
      stale_state_basis: {
        trade_id: 'T-1017',
      },
      idempotency_key: 'assistant-action:issue_trade_invoice:T-1017:INV-T-1017',
      action_preview: preview,
    },
    lifecycle: {
      stage: 'AWAITING_REVIEW',
      label: preview.status === 'READY' ? 'Awaiting review' : 'Preview blocked',
      tone: preview.status === 'READY' ? 'attention' : 'danger',
      is_terminal: false,
      can_approve: preview.status === 'READY',
      can_reject: true,
      reviewer_action_label:
        preview.status === 'READY'
          ? 'Review evidence, then approve or reject'
          : 'Reject or restage with corrected input',
      decided_label: null,
      review_risk_flags:
        preview.status === 'READY' ? ['DRY_RUN_PREVIEW_READY'] : ['DRY_RUN_PREVIEW_BLOCKED'],
    },
    result: null,
    error_detail: null,
    review_outcome: null,
    decision_note: null,
    correction_summary: null,
    correction_fields: [],
    created_at: '2026-04-22T12:00:00Z',
    decided_at: null,
    decided_by: null,
  }
}

test('assistant action request list renders ready invoice dry-run preview details', () => {
  const markup = renderToStaticMarkup(
    createElement(AssistantActionRequestList, {
      actionRequests: [
        buildInvoiceActionRequest({
          preview_type: 'issue_trade_invoice',
          status: 'READY',
          summary: 'Approval will create invoice INV-T-1017 for trade T-1017 for USD 2500.00.',
          affected_records: [
            {
              type: 'trade',
              id: 'T-1017',
              label: 'Trade T-1017',
              summary: 'ACTIVE physical trade.',
            },
          ],
          field_changes: [
            {
              field: 'invoice_amount',
              proposed_value: 2500,
            },
          ],
          expected_side_effects: ['Create one trade invoice record.'],
          warnings: [],
          blocking_reasons: [],
          assumptions: ['Due timestamp will default from delivery/trade dates or five days after issue.'],
          existing_invoice_count: 0,
        }),
      ],
      formatDate: (value: string | null | undefined) => value ?? 'n/a',
    }),
  )

  assert.match(markup, /Dry-run preview/)
  assert.match(markup, /Ready/)
  assert.match(markup, /issue_trade_invoice/)
  assert.match(markup, /INV-T-1017/)
  assert.match(markup, /invoice_amount: n\/a -&gt; 2500/)
  assert.match(markup, /Preview side effects/)
  assert.match(markup, /Create one trade invoice record/)
})

test('assistant action request list renders blocked invoice preview blockers', () => {
  const markup = renderToStaticMarkup(
    createElement(AssistantActionRequestList, {
      actionRequests: [
        buildInvoiceActionRequest({
          preview_type: 'issue_trade_invoice',
          status: 'BLOCKED',
          summary: 'Invoice issue preview for trade T-1017 is blocked.',
          affected_records: [],
          field_changes: [],
          expected_side_effects: [],
          warnings: [],
          blocking_reasons: ["Invoice number 'INV-T-1017' is already in use for trade 'T-1017'."],
          assumptions: [],
          existing_invoice_count: 1,
        }),
      ],
      formatDate: (value: string | null | undefined) => value ?? 'n/a',
    }),
  )

  assert.match(markup, /Preview blocked/)
  assert.match(markup, /Blocked/)
  assert.match(markup, /Preview blockers/)
  assert.match(markup, /already in use/)
  assert.match(markup, /Dry Run Preview Blocked/)
})

test('assistant action request list renders structured settlement preset proposals', () => {
  const markup = renderToStaticMarkup(
    createElement(AssistantActionRequestList, {
      actionRequests: [
        {
          action_request_id: 2026,
          run_id: 88,
          user_id: 'trader.alpha',
          status: 'PENDING',
          workspace: 'reports',
          agent_id: 'settlement-copilot',
          agent_name: 'Settlement Copilot',
          action_type: 'create_settlement_report_preset',
          summary: 'Create settlement preset "Midwest cash watch"',
          description: 'Stage a saved settlement lens for review.',
          payload: {
            name: 'Midwest cash watch',
            scope: 'SHARED',
            filters: {
              book: 'CRUDE',
              currency: 'USD',
              exception_type: 'SHORT_PAY',
            },
          },
          review_context: {
            owning_work_object: {
              type: 'settlement_report_preset',
              id: 'SHARED:midwest cash watch',
              label: 'Settlement preset Midwest cash watch',
            },
            required_reviewer_role: 'REQUESTING_USER_OR_ADMIN',
            business_rationale:
              'The user asked to save the current settlement filters as a named lens.',
            proposed_mutation: {
              operation: 'create_settlement_report_preset',
              name: 'Midwest cash watch',
              scope: 'SHARED',
              filters: {
                book: 'CRUDE',
                currency: 'USD',
                exception_type: 'SHORT_PAY',
              },
            },
            supporting_records: [],
            assumptions: ['Scope was requested explicitly.'],
            missing_evidence: [],
            expected_downstream_effects: [
              'Expose the preset in the settlement preset picker for the desk.',
            ],
            stale_state_basis: {
              scope: 'SHARED',
              name_key: 'midwest cash watch',
              existing_preset_id: null,
            },
          },
          lifecycle: {
            stage: 'AWAITING_REVIEW',
            label: 'Awaiting review',
            tone: 'attention',
            is_terminal: false,
            can_approve: true,
            can_reject: true,
            reviewer_action_label: 'Review evidence, then approve or reject',
            decided_label: null,
            review_risk_flags: ['APPROVAL_GATED_ACTION'],
          },
          result: null,
          error_detail: null,
          review_outcome: null,
          decision_note: null,
          correction_summary: null,
          correction_fields: [],
          created_at: '2026-05-08T08:00:00Z',
          decided_at: null,
          decided_by: null,
        },
      ],
      formatDate: (value: string | null | undefined) => value ?? 'n/a',
    }),
  )

  assert.match(markup, /Preset proposal/)
  assert.match(markup, /Name: Midwest cash watch/)
  assert.match(markup, /Scope: Shared/)
  assert.match(markup, /Book: CRUDE/)
  assert.match(markup, /Currency: USD/)
  assert.match(markup, /Exception Type: SHORT_PAY/)
  assert.match(markup, /Name Key: midwest cash watch/)
})
