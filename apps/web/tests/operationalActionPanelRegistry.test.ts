import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { OperationalResourceDescriptor } from '../src/entities/app/api'
import {
  OperationalActionPanelFrame,
  resolveOperationalActionPanelDefinition,
} from '../src/workspaces/operations/operationalActionPanelRegistry'

const RESOURCE_DESCRIPTORS = [
  {
    resource_key: 'deliveries' as const,
    filters: [],
    sort_fields: ['delivery_status_rank'],
    actions: ['sync_from_trades', 'update', 'append_event'],
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
      summary_stats: [],
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
      summary_stats: [],
    },
  },
  {
    resource_key: 'work_items' as const,
    filters: ['queue'],
    sort_fields: ['attention_rank'],
    actions: ['create', 'update', 'book_underlying'],
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
      summary_stats: [],
    },
  },
] satisfies OperationalResourceDescriptor[]

describe('operational action panel registry', () => {
  it('resolves action panels against resource descriptors', () => {
    const panel = resolveOperationalActionPanelDefinition('deliveryActualization', RESOURCE_DESCRIPTORS)

    expect(panel.resourceKey).toBe('shipments')
    expect(panel.action).toBe('upsert_actualization')
    expect(panel.resourceTitle).toBe('Execution Actualization')
    expect(panel.contractChips).toContain('Record actualization')
    expect(panel.contractChips).toContain('Execution')
  })

  it('renders a shared action panel frame with contract chips', () => {
    const panel = resolveOperationalActionPanelDefinition('schedulerWorkflow', RESOURCE_DESCRIPTORS)
    const markup = renderToStaticMarkup(
      createElement(
        OperationalActionPanelFrame,
        { panel },
        createElement('div', { className: 'workflow-editor-stack' }, 'Workflow editor body'),
      ),
    )

    expect(markup).toContain('Scheduler Workflow')
    expect(markup).toContain('Assign work, set due dates, and advance the open lifecycle items')
    expect(markup).toContain('Operational Work Queue')
    expect(markup).toContain('Update scheduler workflow')
    expect(markup).toContain('Workflow editor body')
  })
})
