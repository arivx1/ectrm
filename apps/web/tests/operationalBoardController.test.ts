import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { OperationalResourceDescriptor } from '../src/entities/app/api'
import { OperationalBoardController } from '../src/workspaces/operations/OperationalBoardController'
import { resolveOperationalWorkboardDefinition } from '../src/workspaces/operations/operationalWorkboardRegistry'

const RESOURCE_DESCRIPTORS = [
  {
    resource_key: 'invoices' as const,
    filters: ['trade_id'],
    sort_fields: ['invoice_date desc'],
    actions: ['create'],
    surface: {
      title: 'Invoice Ledger',
      description: 'Dedicated invoice records drive issuance and settlement rollups.',
      board_section: 'Queue',
      primary_action: {
        key: 'issue_invoice',
        label: 'Issue invoice',
        detail: 'Create the first invoice record for the trade.',
      },
      empty_state: {
        title: 'No invoice ledger',
        detail: 'Trades that need invoicing will appear here once settlement work opens on the active book.',
      },
      summary_stats: [
        {
          key: 'first_issue',
          label: 'First issue pending',
          detail: 'Spot trades that still need their first invoice record.',
        },
      ],
    },
  },
  {
    resource_key: 'confirmations' as const,
    filters: ['trade_id'],
    sort_fields: ['created_at desc'],
    actions: ['create', 'issue'],
    surface: {
      title: 'Confirmation Ledger',
      description: 'Dedicated confirmation records drive draft and issue handling.',
      board_section: 'Trade Confirmation',
      primary_action: {
        key: 'issue_current_draft',
        label: 'Issue current draft',
        detail: 'Promote the latest ready draft.',
      },
      empty_state: {
        title: 'No confirmation queue',
        detail: 'There is no current confirmation work.',
      },
      summary_stats: [
        {
          key: 'draft_versions',
          label: 'Draft versions',
          detail: 'Track draft and amended versions inside one ledger.',
        },
      ],
    },
  },
  {
    resource_key: 'work_items' as const,
    filters: ['queue'],
    sort_fields: ['attention_rank'],
    actions: ['update'],
    surface: {
      title: 'Operational Work Queue',
      description: 'The queue stays focused on ownership and due date decisions.',
      board_section: 'Critical Path',
      primary_action: {
        key: 'create_handoff',
        label: 'Create handoff',
        detail: 'Open the next operational workflow item.',
      },
      empty_state: {
        title: 'No open work queue',
        detail: 'There is no workflow work yet.',
      },
      summary_stats: [
        {
          key: 'unassigned_handoffs',
          label: 'Unassigned handoffs',
          detail: 'Keep ownerless tasks visible before they age into risk.',
        },
      ],
    },
  },
] satisfies OperationalResourceDescriptor[]

describe('OperationalBoardController', () => {
  it('renders descriptor-owned empty-state copy by default', () => {
    const workboard = resolveOperationalWorkboardDefinition('invoiceLedger', RESOURCE_DESCRIPTORS)
    const markup = renderToStaticMarkup(
      createElement(
        OperationalBoardController,
        {
          workboard,
          isEmpty: true,
        },
        createElement('div', null, 'Invoice board body'),
      ),
    )

    expect(markup).toContain('No invoice ledger')
    expect(markup).toContain('Trades that need invoicing will appear here once settlement work opens on the active book.')
    expect(markup).not.toContain('Invoice board body')
  })

  it('allows workspace-level empty-state overrides for multi-resource workboards', () => {
    const workboard = resolveOperationalWorkboardDefinition('tradeOperationalProjection', RESOURCE_DESCRIPTORS)
    const markup = renderToStaticMarkup(
      createElement(
        OperationalBoardController,
        {
          workboard,
          isEmpty: true,
          emptyStateTitle: 'No trades match the current view',
          emptyStateDetail: 'Clear the local filter to reopen the broader blotter.',
        },
        createElement('div', null, 'Trade blotter'),
      ),
    )

    expect(markup).toContain('No trades match the current view')
    expect(markup).toContain('Clear the local filter to reopen the broader blotter.')
    expect(markup).not.toContain('Trade blotter')
  })

  it('renders the board body when records are available', () => {
    const workboard = resolveOperationalWorkboardDefinition('workflowQueue', RESOURCE_DESCRIPTORS)
    const markup = renderToStaticMarkup(
      createElement(
        OperationalBoardController,
        {
          workboard,
          bannerVariant: 'chips',
        },
        createElement('div', { className: 'workflow-editor' }, 'Workflow editor'),
      ),
    )

    expect(markup).toContain('Workflow editor')
    expect(markup).toContain('Operational Work Queue')
    expect(markup).not.toContain('No open work queue')
  })

  it('passes custom summary and detail regions through for split workboards', () => {
    const workboard = resolveOperationalWorkboardDefinition('invoiceLedger', RESOURCE_DESCRIPTORS)
    const markup = renderToStaticMarkup(
      createElement(
        OperationalBoardController,
        {
          workboard,
          className: 'shipment-workbench',
          detailClassName: 'shipment-editor-panel',
          summary: createElement('div', { className: 'shipment-card-actions shipment-sync-actions' }, 'Sync From Trades'),
          detail: createElement('div', { className: 'scheduler-detail-stack' }, 'Editor panel'),
        },
        createElement('div', { className: 'position-list' }, 'Queue rows'),
      ),
    )

    expect(markup).toContain('Sync From Trades')
    expect(markup).toContain('Queue rows')
    expect(markup).toContain('Editor panel')
    expect(markup).toContain('shipment-editor-panel')
  })
})
