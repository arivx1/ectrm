import { describe, expect, it } from 'vitest'

import {
  ALL_EVENT_TYPES,
  buildEventTypeOptions,
  filterEventRows,
  formatEventScopeLabel,
  isTradeLinkedEvent,
} from '../src/workspaces/events/eventHelpers'

describe('events workspace helpers', () => {
  it('marks trade-backed rows as directly actionable', () => {
    expect(
      isTradeLinkedEvent({
        aggregate_type: 'trade',
        aggregate_id: 'TRD-10001',
      }),
    ).toBe(true)

    expect(
      isTradeLinkedEvent({
        aggregate_type: 'position',
        aggregate_id: 'POS-10001',
      }),
    ).toBe(false)

    expect(
      isTradeLinkedEvent({
        aggregate_type: 'trade',
        aggregate_id: '   ',
      }),
    ).toBe(false)
  })

  it('makes the selected-trade scope explicit in the events UI', () => {
    expect(formatEventScopeLabel('SELECTED', 'TRD-10001')).toBe('Selected trade (TRD-10001)')
    expect(formatEventScopeLabel('SELECTED', null)).toBe('Selected trade (none selected)')
    expect(formatEventScopeLabel('TradeCreated', 'TRD-10001')).toBe('TradeCreated')
  })

  it('builds event type options in count order', () => {
    expect(
      buildEventTypeOptions([
        { event_type: 'TradeAmended' },
        { event_type: 'TradeCreated' },
        { event_type: 'TradeCreated' },
        { event_type: 'TradeCancelled' },
      ]),
    ).toEqual([
      { value: 'TradeCreated', count: 2 },
      { value: 'TradeAmended', count: 1 },
      { value: 'TradeCancelled', count: 1 },
    ])
  })

  it('filters event rows by event type and search tokens', () => {
    const rows = [
      {
        aggregate_type: 'trade',
        aggregate_id: 'TRD-30020',
        event_type: 'TradeCreated',
        actor_id: 'system-scenario',
        correlation_id: 'corr-30020',
        causation_id: null,
        event_id: 'evt-30020',
        schema_version: 1,
      },
      {
        aggregate_type: 'trade',
        aggregate_id: 'TRD-10004',
        event_type: 'TradeCancelled',
        actor_id: 'ops-user',
        correlation_id: 'corr-10004',
        causation_id: null,
        event_id: 'evt-10004',
        schema_version: 1,
      },
    ]

    expect(
      filterEventRows(rows, {
        eventTypeFilter: ALL_EVENT_TYPES,
        searchQuery: 'TRD-30020 system',
      }),
    ).toEqual([rows[0]])

    expect(
      filterEventRows(rows, {
        eventTypeFilter: 'TradeCancelled',
        searchQuery: 'ops corr-10004',
      }),
    ).toEqual([rows[1]])

    expect(
      filterEventRows(rows, {
        eventTypeFilter: 'TradeCreated',
        searchQuery: 'ops-user',
      }),
    ).toEqual([])
  })
})
