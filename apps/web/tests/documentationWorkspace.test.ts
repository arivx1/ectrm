import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DocumentationWorkspace } from '../src/workspaces/docs/DocumentationWorkspace'

describe('documentation workspace', () => {
  it('renders the searchable manual surface and task playbooks', () => {
    const markup = renderToStaticMarkup(
      createElement(DocumentationWorkspace, {
        activeDocumentKey: 'guide',
        getViewHref: (view: string) => `/?view=${view}`,
        onDocumentKeyChange: () => undefined,
        onOpenView: () => undefined,
        roadmapRefreshVersion: 0,
      }),
    )

    expect(markup).toContain('User Manual')
    expect(markup).toContain('Search the manual')
    expect(markup).toContain('trade amendment')
    expect(markup).toContain('Task Playbooks')
    expect(markup).toContain('Book a trade')
    expect(markup).toContain('Clear a settlement blocker')
    expect(markup).toContain('Fix access issues')
  })
})
