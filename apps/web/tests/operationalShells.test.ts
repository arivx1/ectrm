import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { OperationalBoardShell } from '../src/workspaces/operations/OperationalBoardShell'
import {
  OperationalInspectorShell,
  type OperationalInspectorMetric,
} from '../src/workspaces/operations/OperationalInspectorShell'
import { resolveOperationalWorkboardDefinition } from '../src/workspaces/operations/operationalWorkboardRegistry'

const RESOURCE_DESCRIPTORS = [
  {
    resource_key: 'deliveries' as const,
    filters: ['delivery_status'],
    sort_fields: ['delivery_start'],
    actions: ['sync_from_trades'],
    surface: {
      title: 'Delivery Board',
      description: 'One cross-mode board spans delivery obligations and shipment detail.',
      board_section: 'Logistics',
      primary_action: {
        key: 'sync_trade_obligations',
        label: 'Sync trade obligations',
        detail: 'Refresh the delivery projection from the trade book.',
      },
      empty_state: {
        title: 'No delivery board',
        detail: 'Create active physical trades to start populating the board.',
      },
      summary_stats: [
        {
          key: 'hot_windows',
          label: 'Hot windows',
          detail: 'Keep near-term delivery windows visible.',
        },
      ],
    },
  },
  {
    resource_key: 'shipments' as const,
    filters: ['execution_status'],
    sort_fields: ['updated_at desc'],
    actions: ['upsert_actualization'],
    surface: {
      title: 'Execution Actualization',
      description: 'Execution actualization is a first-class operational resource.',
      board_section: 'Execution',
      primary_action: {
        key: 'record_actualization',
        label: 'Record actualization',
        detail: 'Capture executed quantity and timing.',
      },
      empty_state: {
        title: 'No execution actuals',
        detail: 'Delivery obligations will expose actualization controls here.',
      },
      summary_stats: [
        {
          key: 'pending_actualization',
          label: 'Pending actualization',
          detail: 'Highlight obligations still missing executed quantity.',
        },
      ],
    },
  },
  {
    resource_key: 'work_items' as const,
    filters: ['queue'],
    sort_fields: ['attention_rank'],
    actions: ['update', 'book_underlying'],
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
        detail: 'There are no invoice records yet.',
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
    resource_key: 'payments' as const,
    filters: ['invoice_id'],
    sort_fields: ['payment_date desc'],
    actions: ['create'],
    surface: {
      title: 'Payment Ledger',
      description: 'Cash collection and settlement now run from dedicated payment records.',
      board_section: 'Queue',
      primary_action: {
        key: 'record_payment',
        label: 'Record payment',
        detail: 'Capture due dates, receipts, and reconciliation state.',
      },
      empty_state: {
        title: 'No payment ledger',
        detail: 'Issued invoices will populate payment records here.',
      },
      summary_stats: [
        {
          key: 'cash_due',
          label: 'Cash due',
          detail: 'Keep due and upcoming receipts visible.',
        },
      ],
    },
  },
]

describe('operational shells', () => {
  it('renders the shared board shell with split queue/detail regions', () => {
    const workboard = resolveOperationalWorkboardDefinition('schedulingWorkbench', RESOURCE_DESCRIPTORS)
    const markup = renderToStaticMarkup(
      createElement(
        OperationalBoardShell,
        {
          workboard,
          className: 'scheduler-workbench',
          mainClassName: 'scheduler-workbench-queue',
          detailClassName: 'scheduler-detail-panel',
          summary: createElement('div', { className: 'shipment-card-actions' }, '42 rows in view'),
          detail: createElement('div', { className: 'scheduler-detail-stack' }, 'Detail panel'),
        },
        createElement('div', { className: 'scheduler-stage-stack' }, 'Queue stack'),
      ),
    )

    expect(markup).toContain('Scheduling Workbench')
    expect(markup).toContain('42 rows in view')
    expect(markup).toContain('Queue stack')
    expect(markup).toContain('Detail panel')
    expect(markup).toContain('deliveries filter delivery status')
  })

  it('renders the shared inspector shell with notes, links, and metrics', () => {
    const workboard = resolveOperationalWorkboardDefinition('tradeOperationalProjection', RESOURCE_DESCRIPTORS)
    const metrics: OperationalInspectorMetric[] = [
      { label: 'Price', value: '$10.00' },
      { label: 'Volume', value: '1,000' },
    ]
    const markup = renderToStaticMarkup(
      createElement(
        OperationalInspectorShell,
        {
          eyebrow: 'Active Ticket',
          title: 'WTI',
          subtitle: 'BUY • LINEAR • PHYSICAL • CRUDE',
          statusRow: createElement('span', { className: 'entity-chip entity-chip-soft' }, 'Pricing PRICED'),
          workboard,
          notices: createElement('p', { className: 'form-note' }, 'Projection note'),
          related: createElement('div', { className: 'shipment-card-meta' }, 'Linked Underlying TRD-10001'),
          metrics,
        },
        createElement('div', { className: 'tab-row' }, 'Inspector body'),
      ),
    )

    expect(markup).toContain('Active Ticket')
    expect(markup).toContain('WTI')
    expect(markup).toContain('Projection note')
    expect(markup).toContain('Linked Underlying TRD-10001')
    expect(markup).toContain('Price')
    expect(markup).toContain('Inspector body')
    expect(markup).toContain('confirmations action create')
  })

  it('renders backend-owned summary stat cards when the board shell has no custom summary', () => {
    const workboard = resolveOperationalWorkboardDefinition('workflowQueue', RESOURCE_DESCRIPTORS)
    const markup = renderToStaticMarkup(
      createElement(
        OperationalBoardShell,
        {
          workboard,
          bannerVariant: 'chips',
        },
        createElement('div', { className: 'detail-list' }, 'Workflow editor'),
      ),
    )

    expect(markup).toContain('Primary actions')
    expect(markup).toContain('Operational Work Queue: Create handoff')
    expect(markup).toContain('Unassigned handoffs')
    expect(markup).toContain('Workflow editor')
  })
})
