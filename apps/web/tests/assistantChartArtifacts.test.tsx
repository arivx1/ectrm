import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { AssistantChartArtifactList } from '../src/shared/AssistantChartArtifactList'
import {
  parseAssistantChartArtifacts,
  splitAssistantMessageText,
} from '../src/shared/assistantChartArtifacts'

test('assistant chart artifacts parse fenced chart blocks and render visual markup', () => {
  const content = [
    'Here is the document mix.',
    '```ectrm-chart',
    JSON.stringify({
      artifact_type: 'ectrm.chart',
      version: 1,
      chart_type: 'pie',
      title: 'Documents by document type',
      value_label: 'Documents',
      segments: [
        { document_kind: 'INVOICE', label: 'Invoice', count: 2 },
        { document_kind: 'TRADE_CONFIRMATION', label: 'Trade Confirmation', count: 1 },
      ],
    }),
    '```',
  ].join('\n')

  const parsed = parseAssistantChartArtifacts(content)

  assert.equal(parsed.text, 'Here is the document mix.')
  assert.equal(parsed.charts.length, 1)
  assert.equal(parsed.charts[0]?.title, 'Documents by document type')
  assert.equal(parsed.charts[0]?.segments[0]?.value, 2)
  assert.deepEqual(splitAssistantMessageText(parsed.text), ['Here is the document mix.'])

  const markup = renderToStaticMarkup(
    createElement(AssistantChartArtifactList, { charts: parsed.charts }),
  )

  assert.match(markup, /assistant-chart-card/)
  assert.match(markup, /assistant-chart-pie/)
  assert.match(markup, /Documents by document type/)
  assert.match(markup, /Trade Confirmation/)
  assert.doesNotMatch(markup, /ectrm-chart/)
})

test('assistant chart artifacts render line charts and histograms', () => {
  const content = [
    'Two chart examples.',
    '```ectrm-chart',
    JSON.stringify({
      artifact_type: 'ectrm.chart',
      version: 1,
      chart_type: 'line',
      title: 'Documents processed over time',
      value_label: 'Documents',
      x_label: 'Day',
      y_label: 'Documents',
      points: [
        { x: 'Mon', value: 2 },
        { x: 'Tue', value: 5 },
        { x: 'Wed', value: 3 },
      ],
    }),
    '```',
    '```ectrm-chart',
    JSON.stringify({
      artifact_type: 'ectrm.chart',
      version: 1,
      chart_type: 'histogram',
      title: 'Document page-count distribution',
      value_label: 'Documents',
      bins: [
        { start: 1, end: 2, count: 4 },
        { start: 3, end: 4, count: 2 },
        { start: 5, end: 6, count: 1 },
      ],
    }),
    '```',
  ].join('\n')

  const parsed = parseAssistantChartArtifacts(content)

  assert.equal(parsed.charts.length, 2)
  assert.equal(parsed.charts[0]?.chartType, 'line')
  assert.equal(parsed.charts[0]?.points.length, 3)
  assert.equal(parsed.charts[1]?.chartType, 'histogram')
  assert.equal(parsed.charts[1]?.segments[0]?.label, '1-2')

  const markup = renderToStaticMarkup(
    createElement(AssistantChartArtifactList, { charts: parsed.charts }),
  )

  assert.match(markup, /assistant-chart-line/)
  assert.match(markup, /assistant-chart-histogram/)
  assert.match(markup, /Documents processed over time/)
  assert.match(markup, /Document page-count distribution/)
})

test('assistant chart artifacts keep invalid fenced blocks visible as text', () => {
  const content = ['Before', '```ectrm-chart', '{not-json', '```', 'After'].join('\n')
  const parsed = parseAssistantChartArtifacts(content)

  assert.equal(parsed.charts.length, 0)
  assert.match(parsed.text, /```ectrm-chart/)
  assert.match(parsed.text, /\{not-json/)
})
