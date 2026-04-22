import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { WorkspaceHandoffFocusBanner } from '../src/shared/ui/WorkspaceHandoffFocusBanner'

test('workspace handoff focus banner exposes source, focus, filter, and reset action', () => {
  const markup = renderToStaticMarkup(
    createElement(WorkspaceHandoffFocusBanner, {
      currentView: 'operations',
      handoff: {
        source: 'assistant',
        tradeId: 'TRD-1001',
        focus: {
          type: 'trade',
          id: 'TRD-1001',
          label: 'TRD-1001',
        },
        tradeInspectorTab: 'events',
        eventType: null,
        label: 'Open Work Queue',
        rationale: 'Review the matching queue item before changing trade state.',
        filter: 'TRD-1001',
        sourceRunId: 8801,
        sourceConversationId: 902,
        sourceActionRequestId: null,
      },
      onClear: () => {},
      clearLabel: 'Show Full Queue',
    }),
  )

  assert.match(markup, /Open Work Queue/)
  assert.match(markup, /Assistant run #8801/)
  assert.match(markup, /Trade: TRD-1001/)
  assert.match(markup, /Filter: TRD-1001/)
  assert.match(markup, /Inspector: events/)
  assert.match(markup, /Show Full Queue/)
})
