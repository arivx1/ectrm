import { describe, expect, it } from 'vitest'

import {
  OPERATIONAL_WORKBOARD_REGISTRY,
  resolveOperationalWorkboardDefinition,
} from '../src/workspaces/operations/operationalWorkboardRegistry'

describe('operational workboard registry', () => {
  it('covers every backend operational resource through configured workboards', () => {
    const resourceKeys = new Set(
      Object.values(OPERATIONAL_WORKBOARD_REGISTRY).flatMap((definition) => definition.resourceKeys),
    )

    expect(resourceKeys).toEqual(
      new Set(['confirmations', 'deliveries', 'shipments', 'invoices', 'payments', 'work_items']),
    )
  })

  it('extends the shared registry into scheduling and trading projection surfaces', () => {
    expect(OPERATIONAL_WORKBOARD_REGISTRY.schedulingWorkbench.resourceKeys).toEqual([
      'deliveries',
      'shipments',
      'work_items',
    ])
    expect(OPERATIONAL_WORKBOARD_REGISTRY.tradeOperationalProjection.resourceKeys).toEqual([
      'confirmations',
      'deliveries',
      'work_items',
      'invoices',
      'payments',
    ])
  })

  it('resolves merged delivery metadata from the shared backend descriptor contract', () => {
    const workboard = resolveOperationalWorkboardDefinition('deliveryBoard', [
      {
        resource_key: 'deliveries',
        filters: [],
        sort_fields: ['delivery_status_rank', 'delivery_start'],
        actions: ['sync_from_trades', 'append_event'],
      },
      {
        resource_key: 'shipments',
        filters: [],
        sort_fields: ['delivery_status_rank', 'delivery_start'],
        actions: ['upsert_actualization'],
      },
    ])

    expect(workboard.resources).toHaveLength(2)
    expect(workboard.title).toBe('Delivery Board')
    expect(workboard.metadataChips).toContain('deliveries action sync from trades')
    expect(workboard.metadataChips).toContain('deliveries action append event')
    expect(workboard.metadataChips).toContain('shipments action upsert actualization')
    expect(workboard.metadataChips).toContain('deliveries sort delivery status rank')
  })

  it('can build action-focused trading projection metadata without duplicating resource labels', () => {
    const workboard = resolveOperationalWorkboardDefinition('tradeOperationalProjection', [
      {
        resource_key: 'confirmations',
        filters: ['trade_id'],
        sort_fields: ['created_at desc'],
        actions: ['create', 'update', 'issue'],
      },
      {
        resource_key: 'work_items',
        filters: ['queue'],
        sort_fields: ['attention_rank'],
        actions: ['create', 'update', 'book_underlying'],
      },
    ])

    expect(workboard.metadataChips).toEqual([
      'confirmations action create',
      'confirmations action update',
      'confirmations action issue',
      'work items action create',
      'work items action update',
      'work items action book underlying',
    ])
  })
})
