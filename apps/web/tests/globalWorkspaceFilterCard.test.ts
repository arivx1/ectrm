import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import { GlobalWorkspaceFilterCard } from '../src/shared/ui/GlobalWorkspaceFilterCard'

test('renders the global workspace filter controls when expanded', () => {
  const html = renderToStaticMarkup(
    createElement(GlobalWorkspaceFilterCard, {
      value: '',
      onChange: () => undefined,
      totalCount: 17,
      matchedCount: 17,
      defaultCollapsed: false,
    }),
  )

  assert.match(html, /Global Workspace Filter/)
  assert.match(html, /Hide filter/)
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /Narrow the left nav and the current workspace with one shared text filter\./)
  assert.match(html, /Search all workspaces/)
  assert.match(html, /Search across 17 workspaces and the current screen/)
  assert.match(html, /<div class="nav-global-filter-summary" hidden="">/)
})

test('defaults to a compact status summary when collapsed', () => {
  const html = renderToStaticMarkup(
    createElement(GlobalWorkspaceFilterCard, {
      value: 'T-AMEND-100',
      onChange: () => undefined,
      totalCount: 17,
      matchedCount: 1,
    }),
  )

  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /Show filter/)
  assert.match(html, /id="global-workspace-filter-panel" class="workspace-local-filter-controls" hidden=""/)
  assert.doesNotMatch(html, /<span>Search<\/span>/)
  assert.match(html, /1 of 17 workspaces match/)
  assert.match(html, /Current filter/)
  assert.match(html, /&quot;T-AMEND-100&quot;/)
  assert.match(html, /Clear Global/)
})
