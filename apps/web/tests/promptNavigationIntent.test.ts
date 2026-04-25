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

  it('fails closed for invalid navigation_intent blocks and raises a warning', () => {
    const parsed = parsePromptNavigationIntentsFromAssistantContent(
      [
        'Stay in Prompt Home for now while we confirm the route.',
        '```navigation_intent',
        JSON.stringify({
          kind: 'open_workspace',
          target_view: 'not-a-real-workspace',
          label: 'Broken Handoff',
        }),
        '```',
      ].join('\n'),
    )

    expect(parsed.content).toBe('Stay in Prompt Home for now while we confirm the route.')
    expect(parsed.intents).toEqual([])
    expect(parsed.warnings).toEqual([
      'A workspace handoff suggestion could not be applied and was ignored.',
    ])
  })
})
