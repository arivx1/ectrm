import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { AssistantToolCallList } from '../src/entities/assistant/AssistantToolCallList'

test('assistant tool call list renders delegated managed-agent traces with run and action details', () => {
  const markup = renderToStaticMarkup(
    createElement(AssistantToolCallList, {
      callerAgentName: 'Control Tower Agent',
      selectedRunId: 99,
      onOpenRun: () => undefined,
      toolCalls: [
        {
          tool_name: 'enlist_managed_agent',
          summary: 'Delegated Trade Capture Agent. Executed 1 governed action.',
          arguments: {
            agent_id: 'trade-capture-agent',
            task: 'Cancel trade T-1001 if it is still active and report the outcome.',
            workspace: 'assistant',
          },
          record_count: 1,
          output_preview: {
            agent_id: 'trade-capture-agent',
            agent_name: 'Trade Capture Agent',
            workspace: 'assistant',
            answer: 'Trade Capture Agent handled the delegated trade lifecycle task.',
            run_id: 142,
            action_request_count: 1,
            executed_action_count: 1,
            pending_action_count: 0,
            failed_action_count: 0,
          },
        },
      ],
    }),
  )

  assert.match(markup, /Delegated execution/)
  assert.match(markup, /Control Tower Agent -&gt; Trade Capture Agent/)
  assert.match(markup, /Delegated task/)
  assert.match(markup, /Cancel trade T-1001 if it is still active and report the outcome\./)
  assert.match(markup, /Returned answer/)
  assert.match(markup, /delegated trade lifecycle task/)
  assert.match(markup, /Delegated run #142/)
  assert.match(markup, /Action requests: 1/)
  assert.match(markup, /Executed: 1/)
  assert.match(markup, />Open delegated run</)
})

test('assistant tool call list keeps generic tool traces compact', () => {
  const markup = renderToStaticMarkup(
    createElement(AssistantToolCallList, {
      toolCalls: [
        {
          tool_name: 'search_codebase',
          summary: 'Found 2 codebase matches for application access summary.',
          arguments: { query: 'build_application_access_summary' },
          record_count: 1,
          evidence_items: [
            {
              kind: 'code_search_hit',
              title: 'apps/api/app/domains/assistant/services/app_context_catalog.py',
              locator: 'apps/api/app/domains/assistant/services/app_context_catalog.py:45',
              summary: 'build_application_access_summary() describes app introspection surfaces.',
              badges: ['api', 'build_application_access_summary'],
              metadata: {},
            },
          ],
        },
      ],
    }),
  )

  assert.match(markup, /search_codebase/)
  assert.match(markup, /Record count: 1/)
  assert.match(markup, /Found 2 codebase matches for application access summary\./)
  assert.match(markup, /build_application_access_summary/)
  assert.match(markup, /apps\/api\/app\/domains\/assistant\/services\/app_context_catalog\.py:45/)
  assert.match(markup, /code search hit/)
  assert.doesNotMatch(markup, /Delegated execution/)
})
