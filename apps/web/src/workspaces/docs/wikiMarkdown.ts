function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatInline(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a class="docs-link" href="$2" target="_blank" rel="noreferrer">$1</a>',
  )
  return html
}

function renderParagraph(lines: string[]): string {
  return `<p>${formatInline(lines.join(' '))}</p>`
}

export function renderWikiMarkdownHtml(markdown: string): string {
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
    blocks.push(renderParagraph(paragraphLines))
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
        .map((item) => `<li>${formatInline(item)}</li>`)
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
      blocks.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`)
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
      blocks.push(`<blockquote class="wiki-quote">${formatInline(quoteMatch[1])}</blockquote>`)
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
