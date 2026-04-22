import { describe, expect, it } from 'vitest'

import {
  normalizePromptNavigationIntent,
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
      sourceRunId: 42,
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
})
