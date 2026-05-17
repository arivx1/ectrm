function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export type ResolvedWikiPageLink = {
  pageId: string
  title: string
  isArchived: boolean
}

export type ParsedWikiPageLink = {
  label: string
  target: string
}

type RenderWikiMarkdownOptions = {
  resolvePageLink?: (target: string) => ResolvedWikiPageLink | null
}

const wikiPageLinkPattern = /\[\[([^[\]|]+)\|([^[\]]+)\]\]|\[\[([^[\]]+)\]\]/g

export function parseWikiMarkdownLinks(markdown: string): ParsedWikiPageLink[] {
  const links: ParsedWikiPageLink[] = []

  for (const match of markdown.matchAll(wikiPageLinkPattern)) {
    if (typeof match[1] === 'string' && typeof match[2] === 'string') {
      links.push({
        label: match[1].trim(),
        target: match[2].trim(),
      })
      continue
    }

    if (typeof match[3] === 'string') {
      const label = match[3].trim()
      links.push({
        label,
        target: label,
      })
    }
  }

  return links
}

function renderResolvedWikiPageLink(
  label: string,
  target: string,
  options: RenderWikiMarkdownOptions,
): string {
  const normalizedLabel = label.trim()
  const normalizedTarget = target.trim()
  const resolvedPage = options.resolvePageLink?.(normalizedTarget) ?? null

  if (!resolvedPage) {
    return `<span class="wiki-page-link wiki-page-link-missing">${escapeHtml(normalizedLabel)}</span>`
  }

  const className = resolvedPage.isArchived
    ? 'wiki-page-link wiki-page-link-archived'
    : 'wiki-page-link'
  const title = resolvedPage.isArchived
    ? `${resolvedPage.title} (archived)`
    : resolvedPage.title

  return `<a class="${className}" href="#" data-wiki-page-id="${escapeHtml(
    resolvedPage.pageId,
  )}" title="${escapeHtml(title)}">${escapeHtml(normalizedLabel)}</a>`
}

function formatInline(text: string, options: RenderWikiMarkdownOptions): string {
  const tokenPattern =
    /`([^`]+)`|\[\[([^[\]|]+)\|([^[\]]+)\]\]|\[\[([^[\]]+)\]\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let html = ''
  let nextStartIndex = 0

  for (const match of text.matchAll(tokenPattern)) {
    const matchIndex = match.index ?? 0
    html += escapeHtml(text.slice(nextStartIndex, matchIndex))

    if (typeof match[1] === 'string') {
      html += `<code>${escapeHtml(match[1])}</code>`
    } else if (typeof match[2] === 'string' && typeof match[3] === 'string') {
      html += renderResolvedWikiPageLink(match[2], match[3], options)
    } else if (typeof match[4] === 'string') {
      html += renderResolvedWikiPageLink(match[4], match[4], options)
    } else if (typeof match[5] === 'string' && typeof match[6] === 'string') {
      html += `<a class="docs-link" href="${escapeHtml(match[6])}" target="_blank" rel="noreferrer">${escapeHtml(
        match[5],
      )}</a>`
    }

    nextStartIndex = matchIndex + match[0].length
  }

  html += escapeHtml(text.slice(nextStartIndex))
  return html
}

function renderParagraph(lines: string[], options: RenderWikiMarkdownOptions): string {
  return `<p>${formatInline(lines.join(' '), options)}</p>`
}

export function renderWikiMarkdownHtml(
  markdown: string,
  options: RenderWikiMarkdownOptions = {},
): string {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const blocks: string[] = []
  let paragraphLines: string[] = []
  let listItems: string[] = []
  let listType: 'ordered' | 'unordered' | null = null
  let codeFenceLanguage: string | null = null
  let codeFenceLines: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return
    }
    blocks.push(renderParagraph(paragraphLines, options))
    paragraphLines = []
  }

  const flushList = () => {
    if (listType === null || listItems.length === 0) {
      return
    }

    const tagName = listType === 'ordered' ? 'ol' : 'ul'
    const className = listType === 'ordered' ? 'docs-list docs-list-ordered' : 'docs-list'
    blocks.push(
      `<${tagName} class="${className}">${listItems
        .map((item) => `<li>${formatInline(item, options)}</li>`)
        .join('')}</${tagName}>`,
    )
    listItems = []
    listType = null
  }

  const flushCodeFence = () => {
    if (codeFenceLanguage === null && codeFenceLines.length === 0) {
      return
    }

    const languageLabel = codeFenceLanguage ? `<span>${escapeHtml(codeFenceLanguage)}</span>` : ''
    blocks.push(
      `<div class="wiki-code-block">${languageLabel}<pre><code>${escapeHtml(
        codeFenceLines.join('\n'),
      )}</code></pre></div>`,
    )
    codeFenceLanguage = null
    codeFenceLines = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (codeFenceLanguage !== null || line.startsWith('```')) {
      flushParagraph()
      flushList()

      if (line.startsWith('```')) {
        if (codeFenceLanguage === null) {
          codeFenceLanguage = line.slice(3).trim() || ''
          continue
        }
        flushCodeFence()
        continue
      }

      codeFenceLines.push(rawLine)
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      const level = Math.min(4, headingMatch[1].length + 1)
      blocks.push(`<h${level}>${formatInline(headingMatch[2], options)}</h${level}>`)
      continue
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/)
    if (unorderedMatch) {
      flushParagraph()
      if (listType !== 'unordered') {
        flushList()
        listType = 'unordered'
      }
      listItems.push(unorderedMatch[1])
      continue
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/)
    if (orderedMatch) {
      flushParagraph()
      if (listType !== 'ordered') {
        flushList()
        listType = 'ordered'
      }
      listItems.push(orderedMatch[1])
      continue
    }

    const quoteMatch = line.match(/^>\s?(.+)$/)
    if (quoteMatch) {
      flushParagraph()
      flushList()
      blocks.push(`<blockquote class="wiki-quote">${formatInline(quoteMatch[1], options)}</blockquote>`)
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }

    flushList()
    paragraphLines.push(line.trim())
  }

  flushParagraph()
  flushList()
  flushCodeFence()

  if (blocks.length === 0) {
    return '<p>Start typing in markdown to build this page.</p>'
  }

  return blocks.join('')
}
