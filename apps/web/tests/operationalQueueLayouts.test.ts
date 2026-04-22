import { describe, expect, it } from 'vitest'

import { buildOperationalQueueSections } from '../src/workspaces/operations/operationalQueueLayouts'

describe('operational queue layouts', () => {
  it('groups rows by descriptor-owned sections and sorts within each section', () => {
    const sections = buildOperationalQueueSections(
      [
        {
          delivery: {
            delivery_id: 'DLV-2',
            scheduling_stage: 'BLOCKED',
            delivery_start: '2026-04-09',
            trade_id: 'TRD-2',
            leg_no: 2,
          },
          dueAt: '2026-04-09T12:00:00Z',
        },
        {
          delivery: {
            delivery_id: 'DLV-1',
            scheduling_stage: 'BLOCKED',
            delivery_start: '2026-04-08',
            trade_id: 'TRD-1',
            leg_no: 1,
          },
          dueAt: '2026-04-08T12:00:00Z',
        },
        {
          delivery: {
            delivery_id: 'DLV-3',
            scheduling_stage: 'READY',
            delivery_start: '2026-04-10',
            trade_id: 'TRD-3',
            leg_no: 1,
          },
          dueAt: null,
        },
      ],
      {
        key: 'scheduling_workbench',
        resource_key: 'deliveries',
        resource_label: 'Delivery Board',
        field_path: 'delivery.scheduling_stage',
        sections: [
          {
            key: 'BLOCKED',
            label: 'Blocked',
            detail: 'Blocked rows.',
            tone: 'blocked',
            match_values: ['BLOCKED'],
          },
          {
            key: 'READY',
            label: 'Ready',
            detail: 'Ready rows.',
            tone: 'active',
            match_values: ['READY'],
          },
        ],
        sort_rules: [
          {
            field_path: 'delivery.scheduling_stage',
            direction: 'asc',
            value_order: ['BLOCKED', 'READY'],
            nulls_last: true,
          },
          {
            field_path: 'dueAt',
            direction: 'asc',
            value_order: [],
            nulls_last: true,
          },
          {
            field_path: 'delivery.delivery_start',
            direction: 'asc',
            value_order: [],
            nulls_last: true,
          },
        ],
      },
    )

    expect(sections.map((section) => section.label)).toEqual(['Blocked', 'Ready'])
    expect(sections[0]?.items.map((item) => item.delivery.delivery_id)).toEqual(['DLV-1', 'DLV-2'])
    expect(sections[1]?.items.map((item) => item.delivery.delivery_id)).toEqual(['DLV-3'])
  })

  it('keeps unmatched rows visible in a trailing uncategorized section', () => {
    const sections = buildOperationalQueueSections(
      [
        { status: 'BLOCKED', trade_id: 'TRD-1' },
        { status: 'ESCALATED', trade_id: 'TRD-2' },
      ],
      {
        key: 'delivery_board',
        resource_key: 'deliveries',
        resource_label: 'Delivery Board',
        field_path: 'status',
        sections: [
          {
            key: 'BLOCKED',
            label: 'Blocked',
            detail: 'Blocked obligations.',
            tone: 'blocked',
            match_values: ['BLOCKED'],
          },
        ],
        sort_rules: [
          {
            field_path: 'trade_id',
            direction: 'asc',
            value_order: [],
            nulls_last: true,
          },
        ],
      },
    )

    expect(sections.map((section) => section.label)).toEqual(['Blocked', 'Other'])
    expect(sections[1]?.items[0]).toEqual({ status: 'ESCALATED', trade_id: 'TRD-2' })
  })
})
