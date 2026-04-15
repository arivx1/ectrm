import { type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useMemo, useState } from 'react'

import { shouldHandleClientSideNavigation } from '../../app/navigation'
import { loadRoadmapDocument, type RoadmapDocumentData } from '../../entities/roadmap/api'
import type { ViewKey } from '../../shared/models'
import { appConfig } from '../../shared/config'
import userManualMarkdown from '../../../../../docs/user-manual.md?raw'
import { RoadmapDocument, RoadmapSidebar } from './RoadmapDocument'

export type DocumentationDocumentKey = 'guide' | 'roadmap'
export const DEFAULT_DOCUMENTATION_DOCUMENT_KEY: DocumentationDocumentKey = 'guide'

type DocumentationWorkspaceProps = {
  activeDocumentKey: DocumentationDocumentKey
  getViewHref: (view: Exclude<ViewKey, 'guide'>) => string
  onDocumentKeyChange: (key: DocumentationDocumentKey) => void
  onOpenView: (view: Exclude<ViewKey, 'guide'>) => void
  roadmapRefreshVersion: number
}

export type DocumentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'unordered_list'; items: string[] }
  | { type: 'ordered_list'; items: string[] }
  | { type: 'subheading'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }

export type DocumentSection = {
  id: string
  title: string
  blocks: DocumentBlock[]
}

export type ParsedDocument = {
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
    eyebrow: 'Investigate',
    label: 'Open Activity Feed',
    detail: 'Trace what changed before you chase the trade.',
    view: 'events',
  },
  {
    eyebrow: 'Capture',
    label: 'Open Trades',
    detail: 'Book, inspect, amend, or cancel a deal.',
    view: 'trades',
  },
  {
    eyebrow: 'Watch',
    label: 'Open Exposure',
    detail: 'Check concentration, pricing gaps, and option risk.',
    view: 'risk',
  },
  {
    eyebrow: 'Queue',
    label: 'Open Work Queue',
    detail: 'Clear confirmations, blockers, and downstream handoffs.',
    view: 'operations',
  },
  {
    eyebrow: 'Access',
    label: 'Open Settings',
    detail: 'Sign in or bootstrap the first admin.',
    view: 'settings',
  },
] as const

const GUIDE_START_ACTIONS: Array<{
  eyebrow: string
  title: string
  detail: string
  actionLabel: string
  view: Exclude<ViewKey, 'guide'>
}> = [
  {
    eyebrow: 'Capture',
    title: 'Book a trade',
    detail: 'Open the trade ticket when you need to book a new position, amend economics, or inspect the active blotter.',
    actionLabel: 'Open Trade Capture',
    view: 'trades',
  },
  {
    eyebrow: 'Investigate',
    title: 'Investigate a trade issue',
    detail: 'Open the activity feed first when you need to see what changed, who changed it, and which trade needs follow-up.',
    actionLabel: 'Open Activity Feed',
    view: 'events',
  },
  {
    eyebrow: 'Watch',
    title: 'Check exposure',
    detail: 'Open exposure when the question is concentration, stale pricing, or option expiry risk.',
    actionLabel: 'Open Exposure',
    view: 'risk',
  },
  {
    eyebrow: 'Queue',
    title: 'Run the work queue',
    detail: 'Open operations when the job is confirmations, blockers, approvals, or post-trade handoffs.',
    actionLabel: 'Open Work Queue',
    view: 'operations',
  },
  {
    eyebrow: 'Practice',
    title: 'Practice the workflow safely',
    detail: 'Run the walkthrough when you want a local-only scenario that explains the lifecycle without touching live data.',
    actionLabel: 'Open Walkthrough',
    view: 'demo',
  },
] as const

const TASK_PLAYBOOKS: Array<{
  eyebrow: string
  title: string
  detail: string
  trigger: string
  view: Exclude<ViewKey, 'guide'>
  actionLabel: string
  steps: string[]
}> = [
  {
    eyebrow: 'Capture',
    title: 'Book a trade',
    detail: 'Use this when the job is entering a new deal cleanly enough that downstream queues do not have to reconstruct intent.',
    trigger: 'Best for new bookings, first-pass economics capture, and immediate verification after submit.',
    view: 'trades',
    actionLabel: 'Open Trade Capture',
    steps: [
      'Pick the correct book, commodity, and structure before entering economics.',
      'Complete counterparty, pricing, quantity, and delivery details carefully enough that operations can trust the record.',
      'Submit and confirm the saved state in the overview before leaving the ticket.',
    ],
  },
  {
    eyebrow: 'Amend',
    title: 'Amend or cancel a trade',
    detail: 'Use this when a live trade needs correction and the safe path is to change the existing record instead of rebooking.',
    trigger: 'Best for urgent trade amendments, cancellations, and verifying what changed after save.',
    view: 'trades',
    actionLabel: 'Open Trade Capture',
    steps: [
      'Select the exact live trade before editing any economics.',
      'Use the amend or cancel action path instead of creating a replacement trade.',
      'Confirm the resulting event history so the desk has an explicit audit trail.',
    ],
  },
  {
    eyebrow: 'Investigate',
    title: 'Investigate a mismatch',
    detail: 'Use this when the current trade, position, exposure, confirmation, or cash state does not match what someone expects.',
    trigger: 'Best for blotter mismatches, exposure surprises, and tracing where a divergence first appears.',
    view: 'events',
    actionLabel: 'Open Activity Feed',
    steps: [
      'Find the relevant trade, time window, or workflow item in Activity Feed first.',
      'Cross-check the current state in Trade Capture, Exposure, or Net Positions depending on the symptom.',
      'Continue into Operations or Settlement if the mismatch is already a downstream blocker.',
    ],
  },
  {
    eyebrow: 'Cash',
    title: 'Clear a settlement blocker',
    detail: 'Use this when an invoice is missing, a payment is late, cash is unreconciled, or queue ownership is unclear.',
    trigger: 'Best for invoice issuance, payment follow-up, aging review, and deciding whether the blocker belongs in settlement or operations.',
    view: 'settlement',
    actionLabel: 'Open Settlement',
    steps: [
      'Inspect the exact invoice or payment record before escalating the issue.',
      'Confirm whether the problem is issuance, payment status, aging, or reconciliation.',
      'Hand the issue into Operations only when the blocker needs explicit ownership or approval.',
    ],
  },
  {
    eyebrow: 'Access',
    title: 'Fix access issues',
    detail: 'Use this when sign-in fails, the console behaves like read-only software, or a user cannot reach the workspace they own.',
    trigger: 'Best for session recovery, bootstrap questions, and deciding when to escalate into privileged controls.',
    view: 'settings',
    actionLabel: 'Open Settings',
    steps: [
      'Confirm the session is active in Settings before assuming the workflow is misconfigured.',
      'Retry the blocked action after sign-in so you separate access failures from workflow bugs.',
      'Move into Admin only when the issue is role policy, bootstrap state, or runtime control.',
    ],
  },
] as const

const MANUAL_SEARCH_SUGGESTIONS = [
  'trade amendment',
  'invoice missing',
  'confirmation stalled',
  'sign-in',
  'pricing mismatch',
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
    label: 'User Manual',
    eyebrow: 'Manual',
    title: 'User Manual',
    heroDetail: 'Use this as the dedicated in-product manual for onboarding, workflow questions, and choosing the right workspace for the job in front of you.',
    sidebarDetail: 'Start with the job cards, then search or browse the manual for deeper workflow context.',
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
  getViewHref,
  onDocumentKeyChange,
  onOpenView,
  roadmapRefreshVersion,
}: DocumentationWorkspaceProps) {
  const guide = useMemo(() => parseMarkdownDocument(userManualMarkdown), [])
  const [activeSectionId, setActiveSectionId] = useState<string>(guide.sections[0]?.id ?? '')
  const [manualQuery, setManualQuery] = useState('')
  const [roadmap, setRoadmap] = useState<RoadmapDocumentData | null>(null)
  const [roadmapLoading, setRoadmapLoading] = useState(false)
  const [roadmapError, setRoadmapError] = useState('')
  const [lastLoadedRoadmapVersion, setLastLoadedRoadmapVersion] = useState(-1)

  const activeDocumentDefinition = DOCUMENT_DEFINITIONS[activeDocumentKey]
  const activeDocumentTitle = activeDocumentKey === 'guide' ? guide.title : activeDocumentDefinition.title
  const shouldLoadRoadmap = activeDocumentKey === 'roadmap' || roadmap !== null
  const filteredGuideSections = useMemo(
    () => filterGuideSections(guide.sections, manualQuery),
    [guide.sections, manualQuery],
  )
  const visibleGuideSections = activeDocumentKey === 'guide' ? filteredGuideSections : guide.sections
  const hasManualQuery = manualQuery.trim().length > 0
  const manualStatusLabel = hasManualQuery
    ? `${visibleGuideSections.length.toLocaleString()} of ${guide.sections.length.toLocaleString()} sections match`
    : `All ${guide.sections.length.toLocaleString()} manual sections in view`

  function handleWorkspaceLinkClick(
    event: ReactMouseEvent<HTMLAnchorElement>,
    view: Exclude<ViewKey, 'guide'>,
  ) {
    if (!shouldHandleClientSideNavigation(event)) {
      return
    }

    event.preventDefault()
    onOpenView(view)
  }

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
      return
    }

    if (visibleGuideSections.length === 0) {
      if (activeSectionId !== '') {
        setActiveSectionId('')
      }
      return
    }

    if (!visibleGuideSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(visibleGuideSections[0].id)
    }
  }, [activeDocumentKey, activeSectionId, visibleGuideSections])

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
      return visibleGuideSections.some((section) => section.id === hash) ? hash : null
    }

    function updateActiveSection() {
      const topOffset = 180
      let nextSectionId = visibleGuideSections[0]?.id ?? ''

      for (const section of visibleGuideSections) {
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
  }, [activeDocumentKey, visibleGuideSections])

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
          <section className="surface workspace-local-filter docs-search-surface">
            <div className="workspace-local-filter-copy">
              <div>
                <span className="eyebrow">Search</span>
                <h3>Search the manual</h3>
              </div>
              <p>Find the right section by task, symptom, workspace, or support question without scanning the full table of contents first.</p>
            </div>

            <div className="workspace-local-filter-controls">
              <label className="field workspace-local-filter-field">
                <span>Search manual topics</span>
                <input
                  className="control"
                  type="search"
                  value={manualQuery}
                  onChange={(event) => setManualQuery(event.target.value)}
                  placeholder="Trade amendment, invoice missing, sign-in, settlement blocker, exposure mismatch"
                />
              </label>

              <div className="workspace-local-filter-actions">
                <span className="entity-chip entity-chip-soft">{manualStatusLabel}</span>
                {hasManualQuery ? (
                  <button type="button" className="button button-ghost" onClick={() => setManualQuery('')}>
                    Clear Search
                  </button>
                ) : null}
              </div>
            </div>

            <div className="docs-search-suggestions" aria-label="Suggested manual searches">
              {MANUAL_SEARCH_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={`button button-ghost docs-search-suggestion ${manualQuery.trim() === suggestion ? 'is-active' : ''}`}
                  onClick={() => setManualQuery(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {activeDocumentKey === 'guide' ? (
          <article className="surface docs-section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Start Here</span>
                <h3>Pick the job in front of you</h3>
              </div>
              <p>Use these routes when you want the shortest path from onboarding into the real workspace that owns the job.</p>
            </div>

            <div className="dashboard-report-grid">
              {GUIDE_START_ACTIONS.map((action) => (
                <article key={action.title} className="dashboard-report-card section-start-card">
                  <div className="section-start-card-copy">
                    <span>{action.eyebrow}</span>
                    <strong>{action.title}</strong>
                    <p>{action.detail}</p>
                  </div>

                  <div className="section-start-card-actions">
                    <a
                      href={getViewHref(action.view)}
                      className="button button-secondary button-link"
                      onClick={(event) => handleWorkspaceLinkClick(event, action.view)}
                    >
                      {action.actionLabel}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </article>
        ) : null}

        {activeDocumentKey === 'guide' ? (
          visibleGuideSections.length > 0 ? (
            visibleGuideSections.map((section) => (
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

                {renderGuideSectionEnhancement({
                  getViewHref,
                  onHandleWorkspaceLinkClick: handleWorkspaceLinkClick,
                  sectionId: section.id,
                })}
              </article>
            ))
          ) : (
            <article className="surface docs-section empty-state">
              <strong>No manual sections matched that search.</strong>
              <p>
                Try a workspace name, symptom, or job such as <code>trade amendment</code>,{' '}
                <code>invoice missing</code>, <code>confirmation stalled</code>, or <code>sign-in</code>.
              </p>
            </article>
          )
        ) : (
          renderRoadmapContent({
            getViewHref,
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
              {visibleGuideSections.map((section, index) => (
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
              <a
                key={action.label}
                href={getViewHref(action.view)}
                className="button button-ghost button-link docs-action-button"
                onClick={(event) => handleWorkspaceLinkClick(event, action.view)}
              >
                <span className="docs-action-copy">
                  <span>{action.eyebrow}</span>
                  <strong>{action.label}</strong>
                </span>
                <small>{action.detail}</small>
              </a>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

function renderGuideSectionEnhancement({
  getViewHref,
  onHandleWorkspaceLinkClick,
  sectionId,
}: {
  getViewHref: (view: Exclude<ViewKey, 'guide'>) => string
  onHandleWorkspaceLinkClick: (
    event: ReactMouseEvent<HTMLAnchorElement>,
    view: Exclude<ViewKey, 'guide'>,
  ) => void
  sectionId: string
}) {
  if (sectionId !== 'task-playbooks') {
    return null
  }

  return (
    <div className="docs-playbook-grid">
      {TASK_PLAYBOOKS.map((playbook) => (
        <article key={playbook.title} className="docs-playbook-card">
          <div className="section-start-card-copy">
            <span>{playbook.eyebrow}</span>
            <strong>{playbook.title}</strong>
            <p>{playbook.detail}</p>
          </div>

          <p className="docs-playbook-trigger">{playbook.trigger}</p>

          <ol className="docs-list docs-list-ordered">
            {playbook.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <div className="docs-playbook-actions">
            <a
              href={getViewHref(playbook.view)}
              className="button button-secondary button-link"
              onClick={(event) => onHandleWorkspaceLinkClick(event, playbook.view)}
            >
              {playbook.actionLabel}
            </a>
          </div>
        </article>
      ))}
    </div>
  )
}

function renderRoadmapContent({
  getViewHref,
  roadmap,
  loading,
  error,
  onOpenView,
}: {
  getViewHref: (view: Exclude<ViewKey, 'guide'>) => string
  roadmap: RoadmapDocumentData | null
  loading: boolean
  error: string
  onOpenView: (view: Exclude<ViewKey, 'guide'>) => void
}) {
  if (roadmap) {
    return <RoadmapDocument roadmap={roadmap} getViewHref={getViewHref} onOpenView={onOpenView} />
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
