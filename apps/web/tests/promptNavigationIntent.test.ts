import { describe, expect, it } from 'vitest'

import {
  buildPromptNavigationIntentKey,
  buildPromptNavigationRouteHandoff,
  normalizePromptNavigationIntent,
  parsePromptNavigationIntentsFromAssistantContent,
  promptNavigationIntentDetail,
  promptNavigationIntentLabel,
} from '../src/entities/app/promptNavigationIntent'

describe('prompt navigation intents', () => {
  it('normalizes a safe workspace navigation intent', () => {
    expect(
      normalizePromptNavigationIntent({
        kind: 'open_workspace',
        targetView: 'trades',
        label: 'Open Trade Capture',
        rationale: 'Review the selected trade in the old console.',
        sourceRunId: 42,
      }),
    ).toEqual({
      kind: 'open_workspace',
      targetView: 'trades',
      label: 'Open Trade Capture',
      rationale: 'Review the selected trade in the old console.',
      filter: undefined,
      focus: undefined,
      inspectorTab: undefined,
      sourceRunId: 42,
      sourceConversationId: undefined,
      sourceActionRequestId: undefined,
    })
  })

  it('rejects unsupported routes and non-navigation payloads', () => {
    expect(
      normalizePromptNavigationIntent({
        kind: 'open_workspace',
        targetView: 'not-a-view',
      }),
    ).toBeNull()
    expect(
      normalizePromptNavigationIntent({
        kind: 'cancel_trade',
        targetView: 'trades',
      }),
    ).toBeNull()
  })

  it('renders fallback labels and detail without mutating business state', () => {
    const intent = normalizePromptNavigationIntent({
      kind: 'open_workspace',
      targetView: 'operations',
      focus: {
        type: 'trade',
        id: 'TRD-1001',
        label: 'TRD-1001',
      },
    })

    expect(intent).not.toBeNull()
    expect(promptNavigationIntentLabel(intent!)).toBe('Open Work Queue')
    expect(promptNavigationIntentDetail(intent!)).toBe('Open Work Queue focused on TRD-1001.')
  })

  it('builds a deterministic key for prompt handoff outcome tracking', () => {
    const intent = normalizePromptNavigationIntent({
      kind: 'open_workspace',
      targetView: 'operations',
      label: 'Open Work Queue',
      focus: {
        type: 'trade',
        id: 'TRD-1001',
        label: 'TRD-1001',
      },
    })

    expect(intent).not.toBeNull()
    expect(buildPromptNavigationIntentKey(intent!)).toBe(
      'open_workspace|operations|trade|TRD-1001|||Open Work Queue',
    )
  })

  it('extracts assistant navigation intent blocks without showing control JSON', () => {
    const parsed = parsePromptNavigationIntentsFromAssistantContent(
      [
        'The confirmation blocker belongs in Operations.',
        '```navigation_intent',
        JSON.stringify({
          kind: 'open_workspace',
          target_view: 'operations',
          label: 'Open Work Queue',
          rationale: 'Review the blocker with the operations owner.',
          focus: {
            type: 'trade',
            id: 'TRD-1001',
            label: 'TRD-1001',
          },
          inspector_tab: 'events',
        }),
        '```',
      ].join('\n'),
      {
        sourceRunId: 99,
        sourceConversationId: 12,
      },
    )

    expect(parsed.content).toBe('The confirmation blocker belongs in Operations.')
    expect(parsed.intents).toEqual([
      {
        kind: 'open_workspace',
        targetView: 'operations',
        label: 'Open Work Queue',
        rationale: 'Review the blocker with the operations owner.',
        filter: undefined,
        focus: {
          type: 'trade',
          id: 'TRD-1001',
          label: 'TRD-1001',
        },
        inspectorTab: 'events',
        sourceRunId: 99,
        sourceConversationId: 12,
        sourceActionRequestId: undefined,
      },
    ])
    expect(parsed.warnings).toEqual([])
  })

  it('builds assistant route handoff metadata from focused intents', () => {
    const intent = normalizePromptNavigationIntent({
      kind: 'open_workspace',
      targetView: 'trades',
      label: 'Open Trade Capture',
      rationale: 'Inspect the latest amendment trail.',
      focus: {
        type: 'trade',
        id: 'TRD-1001',
        label: 'TRD-1001',
      },
      inspectorTab: 'amend',
      sourceRunId: 101,
    })

    expect(intent).not.toBeNull()
    expect(buildPromptNavigationRouteHandoff(intent!)).toEqual({
      source: 'assistant',
      tradeId: 'TRD-1001',
      focus: {
        type: 'trade',
        id: 'TRD-1001',
        label: 'TRD-1001',
      },
      tradeInspectorTab: 'amend',
      eventType: null,
      label: 'Open Trade Capture',
      rationale: 'Inspect the latest amendment trail.',
      filter: null,
      sourceRunId: 101,
      sourceConversationId: null,
      sourceActionRequestId: null,
    })
  })

  it('builds assistant terminal-dashboard handoffs for supported market instruments', () => {
    const intent = normalizePromptNavigationIntent({
      kind: 'open_workspace',
      targetView: 'dashboard',
      label: 'Open Henry Hub IFERC brief',
      rationale: 'Review the curve beside related trades, exposure, and activity.',
      filter: 'HH_IFERC',
      focus: {
        type: 'market_instrument',
        id: 'price_index:HH_IFERC',
        label: 'Henry Hub IFERC',
      },
      sourceRunId: 202,
      sourceConversationId: 33,
    })

    expect(intent).not.toBeNull()
    expect(buildPromptNavigationRouteHandoff(intent!)).toEqual({
      source: 'assistant',
      tradeId: 'price_index:HH_IFERC',
      focus: {
        type: 'market_instrument',
        id: 'price_index:HH_IFERC',
        label: 'Henry Hub IFERC',
      },
      tradeInspectorTab: null,
      eventType: null,
      label: 'Open Henry Hub IFERC brief',
      rationale: 'Review the curve beside related trades, exposure, and activity.',
      filter: 'HH_IFERC',
      sourceRunId: 202,
      sourceConversationId: 33,
      sourceActionRequestId: null,
    })
  })

  it('fails closed when assistant terminal handoffs include unsupported focus metadata', () => {
    const parsed = parsePromptNavigationIntentsFromAssistantContent(
      [
        'I can explain where to look, but this handoff should not run.',
        '```navigation_intent',
        JSON.stringify({
          kind: 'open_workspace',
          target_view: 'dashboard',
          label: 'Open Custom Terminal Formula',
          focus: {
            type: 'arbitrary_expression',
            id: 'price > moving_average(20)',
            label: 'Custom formula',
          },
        }),
        '```',
      ].join('\n'),
    )

    expect(parsed.content).toBe('I can explain where to look, but this handoff should not run.')
    expect(parsed.intents).toEqual([])
    expect(parsed.warnings).toEqual([
      'A workspace handoff suggestion could not be applied and was ignored.',
    ])
  })

  it('fails closed for invalid navigation_intent blocks and raises a warning', () => {
    const parsed = parsePromptNavigationIntentsFromAssistantContent(
      [
        'Stay on Home for now while we confirm the route.',
        '```navigation_intent',
        JSON.stringify({
          kind: 'open_workspace',
          target_view: 'not-a-real-workspace',
          label: 'Broken Handoff',
        }),
        '```',
      ].join('\n'),
    )

    expect(parsed.content).toBe('Stay on Home for now while we confirm the route.')
    expect(parsed.intents).toEqual([])
    expect(parsed.warnings).toEqual([
      'A workspace handoff suggestion could not be applied and was ignored.',
    ])
  })
})
