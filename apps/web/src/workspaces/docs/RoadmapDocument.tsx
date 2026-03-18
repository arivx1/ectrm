import type { ViewKey } from '../../shared/models'
import type { RoadmapDocumentData, RoadmapItem, RoadmapStatus } from '../../entities/roadmap/api'

type RoadmapDocumentProps = {
  roadmap: RoadmapDocumentData
  onOpenView: (view: Exclude<ViewKey, 'guide'>) => void
}

type RoadmapSidebarProps = {
  roadmap: RoadmapDocumentData | null
  loading: boolean
  error: string
}

type StatusCounts = Record<RoadmapStatus, number>

const ROADMAP_STATUS_META: Record<
  RoadmapStatus,
  {
    label: string
    tone: 'planned' | 'in-progress' | 'blocked' | 'shipped'
    weight: number
  }
> = {
  planned: {
    label: 'Planned',
    tone: 'planned',
    weight: 0,
  },
  in_progress: {
    label: 'In Progress',
    tone: 'in-progress',
    weight: 0.55,
  },
  blocked: {
    label: 'Blocked',
    tone: 'blocked',
    weight: 0.2,
  },
  shipped: {
    label: 'Shipped',
    tone: 'shipped',
    weight: 1,
  },
}

const ROADMAP_SECTION_LINKS = [
  {
    id: 'roadmap-overview',
    title: 'Overview',
    detail: 'Weighted progress, current focus, and the next gate.',
  },
  {
    id: 'roadmap-horizons',
    title: 'Now / Next / Later',
    detail: 'See the rollout grouped by current planning horizon.',
  },
  {
    id: 'roadmap-phases',
    title: 'Phase Cards',
    detail: 'Inspect owners, targets, source IDs, and direct workspace links.',
  },
  {
    id: 'roadmap-milestones',
    title: 'Milestones',
    detail: 'Track the exit criteria that convert roadmap work into delivery gates.',
  },
  {
    id: 'roadmap-source',
    title: 'Source Notes',
    detail: 'See where the checked-in narrative and inferred status metadata come from.',
  },
] as const

export function RoadmapDocument({ roadmap, onOpenView }: RoadmapDocumentProps) {
  const items = roadmap.phases.flatMap((phase) => phase.items)
  const statusCounts = countStatuses(items)
  const weightedProgress = calculateCompletion(items)
  const nowItems = items.filter((item) => item.horizon === 'now')
  const nowStatusCounts = countStatuses(nowItems)
  const nextMilestone =
    roadmap.milestones.find((milestone) => deriveMilestoneStatus(resolveItems(roadmap, milestone.item_ids)) !== 'shipped') ?? null

  return (
    <>
      <article id="roadmap-overview" className="surface docs-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Overview</span>
            <h3>Execution Snapshot</h3>
          </div>
          <p>The roadmap now reads like a plan of record instead of a static note: current status, current owners, and current jump points all live here.</p>
        </div>

        <div className="docs-summary-grid" aria-label="Roadmap execution summary">
          <article className="docs-summary-card">
            <span>Weighted Progress</span>
            <strong>{weightedProgress}%</strong>
            <p>
              {statusCounts.shipped} shipped, {statusCounts.in_progress} in progress, and {statusCounts.planned} still planned across {items.length} tracked items.
            </p>
          </article>

          <article className="docs-summary-card">
            <span>Focus Right Now</span>
            <strong>{nowItems.length} items</strong>
            <p>
              {nowStatusCounts.in_progress} are actively moving, while {nowStatusCounts.shipped} are already live in the current horizon.
            </p>
          </article>

          <article className="docs-summary-card">
            <span>Next Gate</span>
            <strong>{nextMilestone ? nextMilestone.id.toUpperCase() : 'Done'}</strong>
            <p>{nextMilestone ? `${nextMilestone.title.replace(/^M\d+:\s*/, '')} targeting ${nextMilestone.target}.` : 'Every tracked milestone is currently marked as shipped.'}</p>
          </article>
        </div>
      </article>

      <article id="roadmap-horizons" className="surface docs-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Horizons</span>
            <h3>Now / Next / Later</h3>
          </div>
          <p>Use this board when you need the planning sequence faster than the detailed phase cards below.</p>
        </div>

        <div className="roadmap-board">
          {roadmap.horizons.map((horizon) => {
            const horizonItems = items.filter((item) => item.horizon === horizon.key)
            const counts = countStatuses(horizonItems)

            return (
              <article key={horizon.key} className="roadmap-board-card">
                <div className="roadmap-board-head">
                  <div>
                    <span className="eyebrow">{horizon.label}</span>
                    <h4>{horizonItems.length} tracked item{horizonItems.length === 1 ? '' : 's'}</h4>
                  </div>
                  <span className="roadmap-board-metric">{counts.in_progress + counts.blocked}</span>
                </div>

                <p>{horizon.detail}</p>
                <p className="roadmap-inline-note">{formatStatusMix(counts)}</p>

                <div className="roadmap-board-list">
                  {horizonItems.map((item) => (
                    <div key={item.id} className="roadmap-board-item">
                      <div className="roadmap-board-item-head">
                        <strong>{item.title}</strong>
                        <span className={`status-pill status-pill-${ROADMAP_STATUS_META[item.status].tone}`}>{ROADMAP_STATUS_META[item.status].label}</span>
                      </div>
                      <small>{item.target}</small>
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </article>

      <article id="roadmap-phases" className="surface docs-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Phases</span>
            <h3>Phase Progress</h3>
          </div>
          <p>Each phase card now carries owners, targets, source IDs, status, and direct workspace links so the plan is actionable inside the tool.</p>
        </div>

        <div className="roadmap-phase-grid">
          {roadmap.phases.map((phase) => {
            const completion = calculateCompletion(phase.items)
            const counts = countStatuses(phase.items)

            return (
              <article key={phase.id} className="roadmap-phase-card">
                <div className="roadmap-phase-head">
                  <div>
                    <span className="eyebrow">{phase.priority}</span>
                    <h4>{phase.title}</h4>
                  </div>
                  <strong>{completion}%</strong>
                </div>

                <p>{phase.summary}</p>

                <div className="roadmap-progress">
                  <div className="roadmap-progress-track" aria-hidden="true">
                    <div className="roadmap-progress-fill" style={{ width: `${completion}%` }} />
                  </div>
                  <small>{formatStatusMix(counts)}</small>
                </div>

                <div className="roadmap-item-list">
                  {phase.items.map((item) => (
                    <article key={item.id} className="roadmap-item-card">
                      <div className="roadmap-item-head">
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.summary}</p>
                        </div>
                        <span className={`status-pill status-pill-${ROADMAP_STATUS_META[item.status].tone}`}>{ROADMAP_STATUS_META[item.status].label}</span>
                      </div>

                      <div className="roadmap-meta-row">
                        <span>Owner: {item.owner}</span>
                        <span>Target: {item.target}</span>
                      </div>

                      <div className="chip-row">
                        {item.source_ids.map((sourceId) => (
                          <span key={sourceId} className="entity-chip entity-chip-soft">
                            {sourceId}
                          </span>
                        ))}
                      </div>

                      <div className="roadmap-link-row">
                        {item.links.map((link, index) => (
                          <button
                            key={link.label}
                            type="button"
                            className={`button ${index === 0 ? 'button-secondary' : 'button-ghost'} roadmap-link-button`}
                            onClick={() => onOpenView(link.view)}
                          >
                            {link.label}
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </article>

      <article id="roadmap-milestones" className="surface docs-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Milestones</span>
            <h3>Exit Gates</h3>
          </div>
          <p>Milestones convert roadmap work into delivery checkpoints. Their status is inferred from the items they depend on.</p>
        </div>

        <div className="roadmap-milestone-grid">
          {roadmap.milestones.map((milestone) => {
            const milestoneItems = resolveItems(roadmap, milestone.item_ids)
            const completion = calculateCompletion(milestoneItems)
            const status = deriveMilestoneStatus(milestoneItems)

            return (
              <article key={milestone.id} className="roadmap-milestone-card">
                <div className="roadmap-item-head">
                  <div>
                    <span className="eyebrow">{milestone.id.toUpperCase()}</span>
                    <h4>{milestone.title}</h4>
                  </div>
                  <span className={`status-pill status-pill-${ROADMAP_STATUS_META[status].tone}`}>{ROADMAP_STATUS_META[status].label}</span>
                </div>

                <p>{milestone.summary}</p>

                <div className="roadmap-meta-row">
                  <span>Owner: {milestone.owner}</span>
                  <span>Target: {milestone.target}</span>
                </div>

                <div className="roadmap-progress">
                  <div className="roadmap-progress-track" aria-hidden="true">
                    <div className="roadmap-progress-fill" style={{ width: `${completion}%` }} />
                  </div>
                  <small>{completion}% weighted completion across {milestoneItems.length} linked item{milestoneItems.length === 1 ? '' : 's'}</small>
                </div>

                <ul className="docs-list">
                  {milestone.exit_criteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>

                <div className="chip-row">
                  {milestoneItems.map((item) => (
                    <span key={item.id} className="entity-chip">
                      {item.title}
                    </span>
                  ))}
                </div>

                <div className="roadmap-link-row">
                  {milestone.links.map((link, index) => (
                    <button
                      key={link.label}
                      type="button"
                      className={`button ${index === 0 ? 'button-secondary' : 'button-ghost'} roadmap-link-button`}
                      onClick={() => onOpenView(link.view)}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </article>

      <article id="roadmap-source" className="surface docs-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Source Notes</span>
            <h3>How To Read This View</h3>
          </div>
          <p>This structured layer keeps the roadmap visible in-product, while staying anchored to the checked-in narrative that lives in the repo.</p>
        </div>

        <div className="docs-prose">
          <p>
            Source of truth narrative: <code>{roadmap.source_path}</code>
          </p>
          <p>Status values are inferred from the surfaces and workflows currently present in this repository, not from a persisted delivery tracking system yet.</p>
          <p>Deep-link buttons jump directly into the workspace that best matches the item or milestone you are reviewing.</p>
        </div>
      </article>
    </>
  )
}

export function RoadmapSidebar({ roadmap, loading, error }: RoadmapSidebarProps) {
  const items = roadmap ? roadmap.phases.flatMap((phase) => phase.items) : []
  const counts = countStatuses(items)

  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">Contents</span>
          <h3>Implementation Roadmap</h3>
        </div>
        <p>Jump between the execution summary, horizon board, phase cards, and milestone gates.</p>
      </div>

      <nav className="docs-toc roadmap-section-nav" aria-label="Roadmap sections">
        {ROADMAP_SECTION_LINKS.map((section, index) => (
          <a key={section.id} className="docs-toc-link" href={`#${section.id}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{section.title}</strong>
            <small>{section.detail}</small>
          </a>
        ))}
      </nav>

      <div className="docs-actions">
        <div className="section-head">
          <div>
            <span className="eyebrow">Status Mix</span>
            <h3>Current Signal</h3>
          </div>
          <p>These counts come from the live roadmap document currently served by the API.</p>
        </div>

        {loading && <p className="roadmap-inline-note">Loading roadmap status mix...</p>}
        {!loading && error && <p className="roadmap-inline-note">{error}</p>}
        {!loading && !error && roadmap && (
          <div className="roadmap-status-list">
            {(
              [
                ['shipped', counts.shipped],
                ['in_progress', counts.in_progress],
                ['planned', counts.planned],
                ['blocked', counts.blocked],
              ] as const
            ).map(([status, count]) => (
              <div key={status} className="roadmap-status-row">
                <span className={`status-pill status-pill-${ROADMAP_STATUS_META[status].tone}`}>{ROADMAP_STATUS_META[status].label}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="docs-actions">
        <div className="section-head">
          <div>
            <span className="eyebrow">Source</span>
            <h3>Checked-In Narrative</h3>
          </div>
          <p>
            <code>{roadmap?.source_path ?? 'docs/engineering/trading-source-roadmap.md'}</code>
          </p>
        </div>
      </div>
    </>
  )
}

function countStatuses(items: RoadmapItem[]): StatusCounts {
  return items.reduce<StatusCounts>(
    (counts, item) => {
      counts[item.status] += 1
      return counts
    },
    {
      planned: 0,
      in_progress: 0,
      blocked: 0,
      shipped: 0,
    },
  )
}

function calculateCompletion(items: RoadmapItem[]): number {
  if (items.length === 0) {
    return 0
  }

  const weight = items.reduce((sum, item) => sum + ROADMAP_STATUS_META[item.status].weight, 0)
  return Math.round((weight / items.length) * 100)
}

function resolveItems(roadmap: RoadmapDocumentData, itemIds: string[]): RoadmapItem[] {
  const itemIndex = new Map(roadmap.phases.flatMap((phase) => phase.items).map((item) => [item.id, item]))
  return itemIds.flatMap((itemId) => {
    const item = itemIndex.get(itemId)
    return item ? [item] : []
  })
}

function deriveMilestoneStatus(items: RoadmapItem[]): RoadmapStatus {
  if (items.length === 0) {
    return 'planned'
  }

  if (items.every((item) => item.status === 'shipped')) {
    return 'shipped'
  }

  if (items.some((item) => item.status === 'blocked')) {
    return 'blocked'
  }

  if (items.some((item) => item.status === 'in_progress' || item.status === 'shipped')) {
    return 'in_progress'
  }

  return 'planned'
}

function formatStatusMix(counts: StatusCounts): string {
  const parts = [
    counts.shipped > 0 ? `${counts.shipped} shipped` : '',
    counts.in_progress > 0 ? `${counts.in_progress} in progress` : '',
    counts.planned > 0 ? `${counts.planned} planned` : '',
    counts.blocked > 0 ? `${counts.blocked} blocked` : '',
  ].filter(Boolean)

  return parts.join(', ')
}
