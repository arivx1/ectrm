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
  },
  {
    resource_key: 'shipments' as const,
    filters: ['execution_status'],
    sort_fields: ['updated_at desc'],
    actions: ['upsert_actualization'],
  },
  {
    resource_key: 'work_items' as const,
    filters: ['queue'],
    sort_fields: ['attention_rank'],
    actions: ['update', 'book_underlying'],
  },
  {
    resource_key: 'confirmations' as const,
    filters: ['trade_id'],
    sort_fields: ['created_at desc'],
    actions: ['create', 'issue'],
  },
  {
    resource_key: 'invoices' as const,
    filters: ['trade_id'],
    sort_fields: ['invoice_date desc'],
    actions: ['create'],
  },
  {
    resource_key: 'payments' as const,
    filters: ['invoice_id'],
    sort_fields: ['payment_date desc'],
    actions: ['create'],
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
})
