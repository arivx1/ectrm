import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { OperationalResourceDescriptor } from '../src/entities/app/api'
import {
  resolveOperationalResourcePermissionMessage,
  OperationalDescriptorActionRow,
  resolveOperationalFormActionSet,
} from '../src/workspaces/operations/operationalFormActionRegistry'

const CONFIRMATION_DESCRIPTOR: OperationalResourceDescriptor = {
  resource_key: 'confirmations',
  filters: ['trade_id'],
  sort_fields: ['created_at desc'],
  actions: ['create', 'update', 'issue', 'record_response'],
  surface: {
    title: 'Confirmation Ledger',
    description: 'Dedicated confirmation records drive draft, issue, dispute, and amendment handling.',
    board_section: 'Trade Confirmation',
    actions: [
      {
        key: 'create',
        label: 'Create Confirmation',
        detail: 'Create the first managed confirmation record.',
        permission_message: 'Sign in to create, issue, respond to, and revise confirmation records.',
        comment_required: false,
        comment_hint: null,
      },
      {
        key: 'issue',
        label: 'Issue Confirmation',
        detail: 'Issue the current draft once it is ready.',
        permission_message: 'Sign in to create, issue, respond to, and revise confirmation records.',
        comment_required: false,
        comment_hint: null,
      },
      {
        key: 'received',
        label: 'Mark Received',
        detail: 'Record receipt of the counterparty response.',
        permission_message: 'Sign in to create, issue, respond to, and revise confirmation records.',
        comment_required: false,
        comment_hint: null,
      },
      {
        key: 'confirmed',
        label: 'Counterparty Confirmed',
        detail: 'Record a clean counterparty confirmation response.',
        permission_message: 'Sign in to create, issue, respond to, and revise confirmation records.',
        comment_required: false,
        comment_hint: null,
      },
      {
        key: 'disputed',
        label: 'Counterparty Disputed',
        detail: 'Record a disputed counterparty response.',
        permission_message: 'Sign in to create, issue, respond to, and revise confirmation records.',
        comment_required: true,
        comment_hint: 'Add a dispute reason or response note before marking the confirmation as disputed.',
      },
      {
        key: 'save',
        label: 'Save Current',
        detail: 'Persist edits to the current confirmation.',
        permission_message: 'Sign in to create, issue, respond to, and revise confirmation records.',
        comment_required: false,
        comment_hint: null,
      },
      {
        key: 'newVersion',
        label: 'Log New Version',
        detail: 'Create a new managed version.',
        permission_message: 'Sign in to create, issue, respond to, and revise confirmation records.',
        comment_required: false,
        comment_hint: null,
      },
    ],
    primary_action: null,
    empty_state: null,
    summary_stats: [],
  },
}

const WORKFLOW_DESCRIPTOR: OperationalResourceDescriptor = {
  resource_key: 'work_items',
  filters: ['queue'],
  sort_fields: ['attention_rank'],
  actions: ['create', 'update', 'book_underlying'],
  surface: {
    title: 'Operational Work Queue',
    description: 'The queue stays focused on owner, due date, and downstream handoff decisions.',
    board_section: 'Critical Path',
    actions: [
      {
        key: 'create',
        label: 'Create Work Item',
        detail: 'Open the next handoff.',
        permission_message: 'Sign in to edit workflow ownership, due dates, and statuses.',
        comment_required: false,
        comment_hint: null,
      },
      {
        key: 'approve',
        label: 'Approve With Comment',
        detail: 'Approve the credit workflow decision.',
        permission_message: 'Only authorized credit approvers can approve credit workflow items.',
        comment_required: true,
        comment_hint: 'Add a decision comment before approving a credit approval workflow item.',
      },
      {
        key: 'reject',
        label: 'Reject With Comment',
        detail: 'Reject the credit workflow decision.',
        permission_message: 'Only authorized credit approvers can reject credit workflow items.',
        comment_required: true,
        comment_hint: 'Add a decision comment before rejecting a credit approval workflow item.',
      },
      {
        key: 'assignSelf',
        label: 'Assign Me',
        detail: 'Claim ownership of the item.',
        permission_message: 'Sign in to edit workflow ownership, due dates, and statuses.',
        comment_required: false,
        comment_hint: null,
      },
      {
        key: 'save',
        label: 'Save',
        detail: 'Persist workflow changes.',
        permission_message: 'Sign in to edit workflow ownership, due dates, and statuses.',
        comment_required: false,
        comment_hint: null,
      },
    ],
    primary_action: null,
    empty_state: null,
    summary_stats: [],
  },
}

describe('operational form action registry', () => {
  it('resolves confirmation action labels and gating from the backend contract', () => {
    const actionSet = resolveOperationalFormActionSet('confirmationLedgerActions', {
      actionStates: [
        {
          key: 'issue',
          available: true,
          blocked_reason: null,
          label: 'Reissue Confirmation',
        },
        {
          key: 'received',
          available: true,
          blocked_reason: null,
          label: null,
        },
        {
          key: 'confirmed',
          available: false,
          blocked_reason: 'Resolve blocking comparison mismatches or add a waiver note before marking the confirmation as confirmed.',
          label: null,
        },
        {
          key: 'disputed',
          available: true,
          blocked_reason: null,
          label: null,
        },
        {
          key: 'save',
          available: true,
          blocked_reason: null,
          label: null,
        },
        {
          key: 'newVersion',
          available: true,
          blocked_reason: null,
          label: null,
        },
      ],
      currentConfirmation: {
        issue_count: 2,
        status: 'SENT',
      } as never,
      hasAuthenticatedSession: true,
      isSaving: false,
      onCounterpartyConfirmed: vi.fn(),
      onCounterpartyDisputed: vi.fn(),
      onCreateVersion: vi.fn(),
      onIssue: vi.fn(),
      onMarkReceived: vi.fn(),
      onOpenTrade: vi.fn(),
      onSaveCurrent: vi.fn(),
      responseDisputeBlocked: true,
      responseDisputeNeedsComment: true,
      saveBlockedByComparison: false,
      savePayloadEmpty: false,
    }, CONFIRMATION_DESCRIPTOR)

    expect(actionSet.actions.map((action) => action.label)).toEqual([
      'Reissue Confirmation',
      'Mark Received',
      'Counterparty Confirmed',
      'Counterparty Disputed',
      'Save Current',
      'Log New Version',
      'Open Trade',
    ])

    const disputedAction = actionSet.actions.find((action) => action.key === 'disputed')
    expect(disputedAction?.disabled).toBe(true)
    expect(disputedAction?.disabledReason).toBe(
      'Add a dispute reason or response note before marking the confirmation as disputed.',
    )
    const confirmedAction = actionSet.actions.find((action) => action.key === 'confirmed')
    expect(confirmedAction?.disabled).toBe(true)
    expect(confirmedAction?.disabledReason).toBe(
      'Resolve blocking comparison mismatches or add a waiver note before marking the confirmation as confirmed.',
    )
  })

  it('renders shared action rows with resolved button variants', () => {
    const actionSet = resolveOperationalFormActionSet('paymentCreateActions', {
      createPending: false,
      hasAuthenticatedSession: true,
      onCreate: vi.fn(),
      onOpenTrade: vi.fn(),
    })

    const markup = renderToStaticMarkup(
      createElement(OperationalDescriptorActionRow, { actionSet }),
    )

    expect(markup).toContain('workflow-item-button-row')
    expect(markup).toContain('button button-primary')
    expect(markup).toContain('Add Payment')
    expect(markup).toContain('Open Trade')
  })

  it('uses backend row state for workflow action gating', () => {
    const actionSet = resolveOperationalFormActionSet('workflowItemActions', {
      actionStates: [
        {
          key: 'assignSelf',
          available: true,
          blocked_reason: null,
          label: null,
        },
        {
          key: 'save',
          available: true,
          blocked_reason: null,
          label: null,
        },
        {
          key: 'approve',
          available: false,
          blocked_reason: 'Counterparty credit data is stale and must be refreshed before approval.',
          label: null,
        },
        {
          key: 'reject',
          available: true,
          blocked_reason: null,
          label: null,
        },
      ],
      approvePayloadEmpty: false,
      creditApprovalAuthorized: true,
      creditDecisionCommentRequired: false,
      creditDecisionNoteAvailable: true,
      currentUserId: 'ops_admin',
      hasAuthenticatedSession: true,
      isSaving: false,
      item: {
        linked_trade_id: null,
        workflow_type: 'CREDIT_APPROVAL',
      } as never,
      itemOwner: 'risk_user',
      onApprove: vi.fn(),
      onAssignSelf: vi.fn(),
      onBookUnderlying: vi.fn(),
      onOpenUnderlying: vi.fn(),
      onReject: vi.fn(),
      onSave: vi.fn(),
      rejectPayloadEmpty: false,
      savePayloadEmpty: false,
    }, WORKFLOW_DESCRIPTOR)

    const approveAction = actionSet.actions.find((action) => action.key === 'approve')
    expect(approveAction?.disabled).toBe(true)
    expect(approveAction?.disabledReason).toBe(
      'Counterparty credit data is stale and must be refreshed before approval.',
    )
  })

  it('summarizes backend permission messages for board-level notes', () => {
    expect(resolveOperationalResourcePermissionMessage(CONFIRMATION_DESCRIPTOR)).toBe(
      'Sign in to create, issue, respond to, and revise confirmation records.',
    )
  })
})
