import { describe, expect, it } from 'vitest'

import { parseWikiMarkdownLinks, renderWikiMarkdownHtml } from '../src/workspaces/docs/wikiMarkdown'

describe('renderWikiMarkdownHtml', () => {
  it('renders headings, lists, and code safely', () => {
    const html = renderWikiMarkdownHtml(`# Desk Handbook

- Review PDFs
- Compare economics

\`trade_id\`
`)

    expect(html).toContain('<h2>Desk Handbook</h2>')
    expect(html).toContain('<ul class="docs-list">')
    expect(html).toContain('<code>trade_id</code>')
  })

  it('escapes raw html before previewing it', () => {
    const html = renderWikiMarkdownHtml('<script>alert(1)</script>')

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('renders internal wiki links and custom labels through the resolver', () => {
    const html = renderWikiMarkdownHtml(
      'Open [[Confirmations]] and [[Queue Runbook|wiki-settlement]].',
      {
        resolvePageLink: (target) => {
          if (target === 'Confirmations') {
            return { pageId: 'wiki-confirmations', title: 'Confirmations', isArchived: false }
          }
          if (target === 'wiki-settlement') {
            return { pageId: 'wiki-settlement', title: 'Settlement', isArchived: true }
          }
          return null
        },
      },
    )

    expect(html).toContain('data-wiki-page-id="wiki-confirmations"')
    expect(html).toContain('>Confirmations</a>')
    expect(html).toContain('data-wiki-page-id="wiki-settlement"')
    expect(html).toContain('wiki-page-link-archived')
    expect(html).toContain('>Queue Runbook</a>')
  })

  it('marks unresolved internal wiki links without turning them into live navigation', () => {
    const html = renderWikiMarkdownHtml('Investigate [[Missing Runbook]].')

    expect(html).toContain('wiki-page-link-missing')
    expect(html).not.toContain('data-wiki-page-id=')
  })
})

describe('parseWikiMarkdownLinks', () => {
  it('returns page-link labels and stable targets for graph analysis', () => {
    expect(parseWikiMarkdownLinks('See [[Confirmations]] and [[Queue Runbook|wiki-settlement]].')).toEqual([
      { label: 'Confirmations', target: 'Confirmations' },
      { label: 'Queue Runbook', target: 'wiki-settlement' },
    ])
  })
})
