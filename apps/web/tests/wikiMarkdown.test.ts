import { describe, expect, it } from 'vitest'

import { renderWikiMarkdownHtml } from '../src/workspaces/docs/wikiMarkdown'

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
})
