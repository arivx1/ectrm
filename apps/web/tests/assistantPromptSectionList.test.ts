import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { AssistantPromptSectionList } from '../src/entities/assistant/AssistantPromptSectionList'

test('assistant prompt section list renders section metadata and condensed content', () => {
  const markup = renderToStaticMarkup(
    createElement(AssistantPromptSectionList, {
      sections: [
        {
          key: 'application-access-surface',
          title: 'Application Access Surface',
          source: 'application',
          scope: 'REQUEST',
          kind: 'GENERATED',
          owner: 'assistant-runtime',
          freshness: 'LIVE',
          contract_key: 'app-access',
          uses_fallback: false,
          owner_reference: 'apps/api/app/domains/assistant/services/prompt_context.py',
          content:
            'Use get_application_catalog, get_data_schema_catalog, search_codebase, and read_codebase_file when the user asks how ECTRM is wired.',
        },
      ],
    }),
  )

  assert.match(markup, /Application Access Surface/)
  assert.match(markup, /application/)
  assert.match(markup, /REQUEST/)
  assert.match(markup, /assistant-runtime/)
  assert.match(markup, /contract app-access/)
  assert.match(markup, /get_application_catalog/)
  assert.match(markup, /prompt_context\.py/)
})

test('assistant prompt section list shows the empty message when no sections are present', () => {
  const markup = renderToStaticMarkup(
    createElement(AssistantPromptSectionList, {
      sections: [],
      emptyMessage: 'No prompt sections are available yet.',
    }),
  )

  assert.match(markup, /No prompt sections are available yet\./)
})
