import { describe, expect, it } from 'vitest'

import {
  findActiveWikiPageMention,
  parseWikiMarkdownLinks,
  renderWikiMarkdownHtml,
  replaceActiveWikiPageMention,
  rewriteWikiMarkdownLinkTarget,
} from '../src/workspaces/docs/wikiMarkdown'

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

describe('rewriteWikiMarkdownLinkTarget', () => {
  it('rewrites matching unresolved title links to stable page IDs', () => {
    const markdown = 'See [[Missing Runbook]] and [[Other Page]]. Also [[Missing Runbook]].'

    expect(
      rewriteWikiMarkdownLinkTarget(
        markdown,
        { label: 'Missing Runbook', target: 'Missing Runbook' },
        'wiki-missing-runbook',
      ),
    ).toBe(
      'See [[Missing Runbook|wiki-missing-runbook]] and [[Other Page]]. Also [[Missing Runbook|wiki-missing-runbook]].',
    )
  })

  it('preserves custom labels while replacing missing targets', () => {
    const markdown = 'Escalate with [[cash checklist|Settlement Handoff]].'

    expect(
      rewriteWikiMarkdownLinkTarget(
        markdown,
        { label: 'cash checklist', target: 'Settlement Handoff' },
        'wiki-settlement-handoff',
      ),
    ).toBe('Escalate with [[cash checklist|wiki-settlement-handoff]].')
  })
})

describe('wiki page mention helpers', () => {
  it('detects an open wiki mention before the cursor', () => {
    expect(findActiveWikiPageMention('See [[Conf', 10)).toEqual({
      startIndex: 4,
      endIndex: 10,
      query: 'Conf',
      label: null,
    })
  })

  it('preserves a custom label when replacing an active mention', () => {
    const mention = findActiveWikiPageMention('See [[queue owner|Conf before escalation', 22)

    expect(mention).toEqual({
      startIndex: 4,
      endIndex: 22,
      query: 'Conf',
      label: 'queue owner',
    })

    expect(
      replaceActiveWikiPageMention(
        'See [[queue owner|Conf before escalation',
        mention!,
        { title: 'Confirmations', pageId: 'wiki-confirmations' },
      ),
    ).toEqual({
      markdown: 'See [[queue owner|wiki-confirmations]] before escalation',
      cursorIndex: 38,
    })
  })

  it('ignores closed, multiline, and malformed mention fragments', () => {
    expect(findActiveWikiPageMention('See [[Confirmations]] now', 21)).toBeNull()
    expect(findActiveWikiPageMention('See [[Confirmations\nnext', 24)).toBeNull()
    expect(findActiveWikiPageMention('See [[A|B|C', 11)).toBeNull()
  })
})
