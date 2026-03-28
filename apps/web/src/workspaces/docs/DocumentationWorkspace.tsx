import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { loadRoadmapDocument, type RoadmapDocumentData } from '../../entities/roadmap/api'
import type { ViewKey } from '../../shared/models'
import { appConfig } from '../../shared/config'
import operatorGuideMarkdown from '../../../../../docs/operator-guide.md?raw'
import { RoadmapDocument, RoadmapSidebar } from './RoadmapDocument'

export type DocumentationDocumentKey = 'guide' | 'roadmap'
export const DEFAULT_DOCUMENTATION_DOCUMENT_KEY: DocumentationDocumentKey = 'guide'

type DocumentationWorkspaceProps = {
  activeDocumentKey: DocumentationDocumentKey
  onDocumentKeyChange: (key: DocumentationDocumentKey) => void
  onOpenView: (view: Exclude<ViewKey, 'guide'>) => void
  roadmapRefreshVersion: number
}

type DocumentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'unordered_list'; items: string[] }
  | { type: 'ordered_list'; items: string[] }
  | { type: 'subheading'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }

type DocumentSection = {
  id: string
  title: string
  blocks: DocumentBlock[]
}

type ParsedDocument = {
  title: string
  preamble: DocumentBlock[]
  sections: DocumentSection[]
}

const QUICK_ACTIONS: Array<{
  eyebrow: string
  label: string
  detail: string
  view: Exclude<ViewKey, 'guide'>
}> = [
  {
    eyebrow: 'Start',
    label: 'Open Dashboard',
    detail: 'See the operating picture first.',
    view: 'dashboard',
  },
  {
    eyebrow: 'Lifecycle',
    label: 'Open Trades',
    detail: 'Inspect, amend, or cancel a deal.',
    view: 'trades',
  },
  {
    eyebrow: 'Master Data',
    label: 'Open Reference Data',
    detail: 'Maintain books, commodities, and pricing records.',
    view: 'reference',
  },
  {
    eyebrow: 'Access',
    label: 'Open Settings',
    detail: 'Sign in or bootstrap the first admin.',
    view: 'settings',
  },
  {
    eyebrow: 'Governance',
    label: 'Open Admin',
    detail: 'Inspect protected controls and explainability surfaces.',
    view: 'admin',
  },
] as const

const DOCUMENT_ORDER: DocumentationDocumentKey[] = ['guide', 'roadmap']

const DOCUMENT_DEFINITIONS: Record<
  DocumentationDocumentKey,
  {
    label: string
    eyebrow: string
    title: string
    heroDetail: string
    sidebarDetail: string
  }
> = {
  guide: {
    label: 'Operator Guide',
    eyebrow: 'Guide',
    title: 'Operator Guide',
    heroDetail: 'Read the checked-in operator guide without leaving the console. This view stays aligned with the repo documentation.',
    sidebarDetail: 'Use this like an in-product handbook for onboarding, workflow questions, and quick context.',
  },
  roadmap: {
    label: 'Implementation Roadmap',
    eyebrow: 'Roadmap',
    title: 'Implementation Roadmap',
    heroDetail: 'Review the execution plan in a structured product view with status, progress, owners, and direct workspace links.',
    sidebarDetail: 'Track the rollout sequence without leaving the app. This view augments the checked-in roadmap with live planning metadata.',
  },
}

export function DocumentationWorkspace({
  activeDocumentKey,
  onDocumentKeyChange,
  onOpenView,
  roadmapRefreshVersion,
}: DocumentationWorkspaceProps) {
  const guide = useMemo(() => parseMarkdownDocument(operatorGuideMarkdown), [])
  const [activeSectionId, setActiveSectionId] = useState<string>(guide.sections[0]?.id ?? '')
  const [roadmap, setRoadmap] = useState<RoadmapDocumentData | null>(null)
  const [roadmapLoading, setRoadmapLoading] = useState(false)
  const [roadmapError, setRoadmapError] = useState('')
  const [lastLoadedRoadmapVersion, setLastLoadedRoadmapVersion] = useState(-1)

  const activeDocumentDefinition = DOCUMENT_DEFINITIONS[activeDocumentKey]
  const activeDocumentTitle = activeDocumentKey === 'guide' ? guide.title : activeDocumentDefinition.title
  const shouldLoadRoadmap = activeDocumentKey === 'roadmap' || roadmap !== null

  useEffect(() => {
    if (!shouldLoadRoadmap) {
      return
    }

    if (roadmap !== null && lastLoadedRoadmapVersion === roadmapRefreshVersion) {
      return
    }

    let cancelled = false

    async function refreshRoadmap() {
      setRoadmapLoading(true)
      setRoadmapError('')

      try {
        const payload = await loadRoadmapDocument(appConfig.apiBase)
        if (!cancelled) {
          setRoadmap(payload)
          setLastLoadedRoadmapVersion(roadmapRefreshVersion)
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setRoadmapError(error instanceof Error ? error.message : 'Could not load roadmap.')
        }
      } finally {
        if (!cancelled) {
          setRoadmapLoading(false)
        }
      }
    }

    void refreshRoadmap()

    return () => {
      cancelled = true
    }
  }, [lastLoadedRoadmapVersion, roadmap, roadmapRefreshVersion, shouldLoadRoadmap])

  useEffect(() => {
    if (activeDocumentKey !== 'guide') {
      const frameId = window.requestAnimationFrame(() => {
        setActiveSectionId('')
      })

      return () => {
        window.cancelAnimationFrame(frameId)
      }
    }

    let animationFrameId = 0

    function sectionIdFromHash(): string | null {
      const hash = window.location.hash.replace(/^#/, '').trim()
      return guide.sections.some((section) => section.id === hash) ? hash : null
    }

    function updateActiveSection() {
      const topOffset = 180
      let nextSectionId = guide.sections[0]?.id ?? ''

      for (const section of guide.sections) {
        const element = document.getElementById(section.id)
        if (!element) {
          continue
        }

        if (element.getBoundingClientRect().top <= topOffset) {
          nextSectionId = section.id
          continue
        }

        break
      }

      const hashedSectionId = sectionIdFromHash()
      if (hashedSectionId) {
        const hashedElement = document.getElementById(hashedSectionId)
        if (hashedElement) {
          const { top, bottom } = hashedElement.getBoundingClientRect()
          if (top <= topOffset && bottom > topOffset / 2) {
            nextSectionId = hashedSectionId
          }
        }
      }

      setActiveSectionId(nextSectionId)
    }

    function scheduleUpdate() {
      if (animationFrameId !== 0) {
        return
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = 0
        updateActiveSection()
      })
    }

    const hashedSectionId = sectionIdFromHash()
    if (hashedSectionId) {
      window.requestAnimationFrame(() => {
        document.getElementById(hashedSectionId)?.scrollIntoView()
        updateActiveSection()
      })
    } else {
      updateActiveSection()
    }

    window.addEventListener('hashchange', scheduleUpdate)
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, { passive: true })

    return () => {
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId)
      }
      window.removeEventListener('hashchange', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate)
    }
  }, [activeDocumentKey, guide.sections])

  return (
    <div className="workspace-grid docs-workspace">
      <section className="stack">
        <article className="surface feature-panel docs-intro-surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">{activeDocumentDefinition.eyebrow}</span>
              <h3>{activeDocumentTitle}</h3>
            </div>
            <p>{activeDocumentDefinition.heroDetail}</p>
          </div>

          <div className="tab-row docs-document-tabs" role="tablist" aria-label="Documentation views">
            {DOCUMENT_ORDER.map((documentKey) => {
              const definition = DOCUMENT_DEFINITIONS[documentKey]
              return (
                <button
                  key={documentKey}
                  type="button"
                  role="tab"
                  aria-selected={activeDocumentKey === documentKey}
                  className={`tab-pill ${activeDocumentKey === documentKey ? 'is-active' : ''}`}
                  onClick={() => onDocumentKeyChange(documentKey)}
                >
                  {definition.label}
                </button>
              )
            })}
          </div>

          {activeDocumentKey === 'guide' && (
            <div className="docs-prose">
              {guide.preamble.map((block, index) => renderBlock(block, `${activeDocumentKey}-preamble-${index}`))}
            </div>
          )}
        </article>

        {activeDocumentKey === 'guide' ? (
          guide.sections.map((section) => (
            <article key={section.id} id={section.id} className="surface docs-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Section</span>
                  <h3>{section.title}</h3>
                </div>
                <p>{summarizeSection(section)}</p>
              </div>

              <div className="docs-prose">
                {section.blocks.map((block, index) => renderBlock(block, `${section.id}-${index}`))}
              </div>
            </article>
          ))
        ) : (
          renderRoadmapContent({
            roadmap,
            loading: roadmapLoading,
            error: roadmapError,
            onOpenView,
          })
        )}
      </section>

      <aside className="surface docs-sidebar inspector-panel">
        {activeDocumentKey === 'guide' ? (
          <>
            <div className="section-head">
              <div>
                <span className="eyebrow">Contents</span>
                <h3>{activeDocumentDefinition.label}</h3>
              </div>
              <p>{activeDocumentDefinition.sidebarDetail}</p>
            </div>

            <nav className="docs-toc" aria-label={`${guide.title} sections`}>
              {guide.sections.map((section, index) => (
                <a
                  key={section.id}
                  className={`docs-toc-link ${activeSectionId === section.id ? 'is-active' : ''}`}
                  href={`#${section.id}`}
                  aria-current={activeSectionId === section.id ? 'location' : undefined}
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{section.title}</strong>
                  <small>{summarizeSection(section)}</small>
                </a>
              ))}
            </nav>
          </>
        ) : (
          <RoadmapSidebar roadmap={roadmap} loading={roadmapLoading} error={roadmapError} />
        )}

        <div className="docs-actions">
          <div className="section-head">
            <div>
              <span className="eyebrow">Workspace Links</span>
              <h3>Open A Surface</h3>
            </div>
            <p>Move from documentation to the working area you need without losing context.</p>
          </div>

          <div className="stack">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className="button button-ghost docs-action-button"
                onClick={() => onOpenView(action.view)}
              >
                <span className="docs-action-copy">
                  <span>{action.eyebrow}</span>
                  <strong>{action.label}</strong>
                </span>
                <small>{action.detail}</small>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

function renderRoadmapContent({
  roadmap,
  loading,
  error,
  onOpenView,
}: {
  roadmap: RoadmapDocumentData | null
  loading: boolean
  error: string
  onOpenView: (view: Exclude<ViewKey, 'guide'>) => void
}) {
  if (roadmap) {
    return <RoadmapDocument roadmap={roadmap} onOpenView={onOpenView} />
  }

  return (
    <article className="surface docs-section">
      <div className="section-head">
        <div>
          <span className="eyebrow">Roadmap</span>
          <h3>{loading ? 'Loading roadmap...' : 'Roadmap unavailable'}</h3>
        </div>
        <p>{loading ? 'Fetching the latest roadmap from the API.' : 'The roadmap endpoint did not return data for the docs workspace.'}</p>
      </div>

      {loading ? (
        <div className="feedback-banner feedback-banner-success">Loading roadmap data from the API...</div>
      ) : (
        <div className="feedback-banner feedback-banner-error">{error || 'Could not load roadmap.'}</div>
      )}
    </article>
  )
}

function parseMarkdownDocument(markdown: string): ParsedDocument {
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

function summarizeSection(section: DocumentSection): string {
  const firstParagraph = section.blocks.find((block) => block.type === 'paragraph')
  if (!firstParagraph || firstParagraph.type !== 'paragraph') {
    const firstList = section.blocks.find((block) => block.type === 'ordered_list' || block.type === 'unordered_list')
    if (firstList && (firstList.type === 'ordered_list' || firstList.type === 'unordered_list')) {
      return `Follow ${firstList.items.length} outlined ${firstList.items.length === 1 ? 'step' : 'steps'} in this sequence.`
    }

    const firstTable = section.blocks.find((block) => block.type === 'table')
    if (firstTable && firstTable.type === 'table') {
      return `Review ${firstTable.rows.length} structured ${firstTable.rows.length === 1 ? 'row' : 'rows'} in this section.`
    }

    return 'Open this section for the full guidance.'
  }

  const firstSentenceMatch = firstParagraph.text.match(/^.*?[.!?](?:\s|$)/)
  const summary = (firstSentenceMatch?.[0] ?? firstParagraph.text).trim()
  return summary.length > 140 ? `${summary.slice(0, 137).trimEnd()}...` : summary
}

function renderBlock(block: DocumentBlock, key: string): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return <p key={key}>{renderInline(block.text, key)}</p>
    case 'unordered_list':
      return (
        <ul key={key} className="docs-list">
          {block.items.map((item, index) => (
            <li key={`${key}-${index}`}>{renderInline(item, `${key}-${index}`)}</li>
          ))}
        </ul>
      )
    case 'ordered_list':
      return (
        <ol key={key} className="docs-list docs-list-ordered">
          {block.items.map((item, index) => (
            <li key={`${key}-${index}`}>{renderInline(item, `${key}-${index}`)}</li>
          ))}
        </ol>
      )
    case 'subheading':
      return <h4 key={key}>{renderInline(block.text, key)}</h4>
    case 'table':
      return (
        <div key={key} className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                {block.headers.map((header, index) => (
                  <th key={`${key}-head-${index}`}>{renderInline(header, `${key}-head-${index}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${key}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-cell-${rowIndex}-${cellIndex}`}>{renderInline(cell, `${key}-cell-${rowIndex}-${cellIndex}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const inlinePattern = /(`[^`]+`)|(\[([^\]]+)\]\(([^)]+)\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (match[1]) {
      nodes.push(<code key={`${keyPrefix}-${match.index}`}>{match[1].slice(1, -1)}</code>)
    } else {
      const label = match[3]
      const href = match[4]
      if (/^https?:\/\//.test(href)) {
        nodes.push(
          <a
            key={`${keyPrefix}-${match.index}`}
            className="docs-link"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {label}
          </a>,
        )
      } else {
        nodes.push(
          <span key={`${keyPrefix}-${match.index}`} className="docs-inline-link">
            {label}
          </span>,
        )
      }
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
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
