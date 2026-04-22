import type { DocumentBlock, DocumentSection, ParsedDocument } from './DocumentationWorkspace'

export function parseMarkdownDocument(markdown: string): ParsedDocument {
  const lines = markdown.split(/\r?\n/)
  const preamble: DocumentBlock[] = []
  const sections: DocumentSection[] = []
  const usedIds = new Set<string>()

  let title = 'Documentation'
  let currentSection: DocumentSection | null = null
  let paragraphBuffer: string[] = []
  let listType: 'unordered_list' | 'ordered_list' | null = null
  let listItems: string[] = []
  let tableLines: string[] = []

  function targetBlocks(): DocumentBlock[] {
    return currentSection ? currentSection.blocks : preamble
  }

  function pushBlock(block: DocumentBlock): void {
    targetBlocks().push(block)
  }

  function flushParagraph(): void {
    if (paragraphBuffer.length === 0) {
      return
    }

    pushBlock({
      type: 'paragraph',
      text: paragraphBuffer.join(' '),
    })
    paragraphBuffer = []
  }

  function flushTable(): void {
    if (tableLines.length === 0) {
      return
    }

    const parsedTable = parseTableBlock(tableLines)
    if (parsedTable) {
      pushBlock(parsedTable)
    } else {
      for (const tableLine of tableLines) {
        pushBlock({ type: 'paragraph', text: tableLine })
      }
    }

    tableLines = []
  }

  function flushList(): void {
    if (!listType || listItems.length === 0) {
      listType = null
      listItems = []
      return
    }

    pushBlock({
      type: listType,
      items: [...listItems],
    })
    listType = null
    listItems = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      flushTable()
      continue
    }

    if (line.startsWith('# ')) {
      flushParagraph()
      flushList()
      flushTable()
      title = line.slice(2).trim()
      continue
    }

    if (line.startsWith('## ')) {
      flushParagraph()
      flushList()
      flushTable()
      const sectionTitle = line.slice(3).trim()
      currentSection = {
        id: createSectionId(sectionTitle, usedIds),
        title: sectionTitle,
        blocks: [],
      }
      sections.push(currentSection)
      continue
    }

    if (line.startsWith('### ')) {
      flushParagraph()
      flushList()
      flushTable()
      pushBlock({
        type: 'subheading',
        text: line.slice(4).trim(),
      })
      continue
    }

    if (isTableLine(line)) {
      flushParagraph()
      flushList()
      tableLines.push(line)
      continue
    }

    flushTable()

    const unorderedListMatch = /^-\s+(.*)$/.exec(line)
    if (unorderedListMatch) {
      flushParagraph()
      if (listType && listType !== 'unordered_list') {
        flushList()
      }
      listType = 'unordered_list'
      listItems.push(unorderedListMatch[1])
      continue
    }

    const orderedListMatch = /^\d+\.\s+(.*)$/.exec(line)
    if (orderedListMatch) {
      flushParagraph()
      if (listType && listType !== 'ordered_list') {
        flushList()
      }
      listType = 'ordered_list'
      listItems.push(orderedListMatch[1])
      continue
    }

    flushList()
    paragraphBuffer.push(line)
  }

  flushParagraph()
  flushList()
  flushTable()

  return {
    title,
    preamble,
    sections,
  }
}

export function filterGuideSections(sections: DocumentSection[], query: string): DocumentSection[] {
  const queryTerms = tokenizeManualSearchValue(query)
  if (queryTerms.length === 0) {
    return sections
  }

  return sections.filter((section) => {
    const searchWords = tokenizeManualSearchValue(
      [
        section.title,
        ...section.blocks.map((block) => documentBlockSearchText(block)),
      ].join(' '),
    )

    return queryTerms.every((term) => searchWords.some((word) => word.includes(term)))
  })
}

function createSectionId(title: string, usedIds: Set<string>): string {
  const baseId = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section'

  let candidate = baseId
  let index = 2

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${index}`
    index += 1
  }

  usedIds.add(candidate)
  return candidate
}

function documentBlockSearchText(block: DocumentBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'subheading':
      return block.text
    case 'unordered_list':
    case 'ordered_list':
      return block.items.join(' ')
    case 'table':
      return [...block.headers, ...block.rows.flat()].join(' ')
  }
}

function isTableLine(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|') && line.slice(1, -1).includes('|')
}

function parseTableBlock(lines: string[]): Extract<DocumentBlock, { type: 'table' }> | null {
  if (lines.length < 2) {
    return null
  }

  const headers = parseTableCells(lines[0])
  const divider = parseTableCells(lines[1])

  if (
    headers.length === 0 ||
    divider.length !== headers.length ||
    !divider.every((cell) => /^:?-{3,}:?$/.test(cell))
  ) {
    return null
  }

  const rows = lines
    .slice(2)
    .map((line) => parseTableCells(line))
    .filter((cells) => cells.some((cell) => cell.length > 0))
    .map((cells) => headers.map((_, index) => cells[index] ?? ''))

  return {
    type: 'table',
    headers,
    rows,
  }
}

function parseTableCells(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function tokenizeManualSearchValue(query: string): string[] {
  return normalizeManualSearchText(query)
    .split(' ')
    .map((term) => normalizeManualSearchToken(term.trim()))
    .filter((term) => term.length >= 3)
}

function normalizeManualSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeManualSearchToken(term: string): string {
  for (const suffix of ['ments', 'ment', 'ings', 'ing', 'ied', 'ies', 'ed', 'es', 's']) {
    if (term.length > suffix.length + 3 && term.endsWith(suffix)) {
      return term.slice(0, -suffix.length)
    }
  }

  return term
}
