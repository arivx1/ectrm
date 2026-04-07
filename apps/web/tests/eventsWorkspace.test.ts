import { describe, expect, it } from 'vitest'

import { formatEventScopeLabel, isTradeLinkedEvent } from '../src/workspaces/events/eventHelpers'

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
})
