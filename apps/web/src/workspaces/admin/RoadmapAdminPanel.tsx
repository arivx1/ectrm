import { useEffect, useMemo, useState } from 'react'

import {
  loadAdminRoadmapDocument,
  restoreAdminRoadmapRevision,
  saveAdminRoadmapDocument,
  type AdminRoadmapDocumentData,
  type RoadmapDocumentData,
  type RoadmapHorizonKey,
  type RoadmapRevision,
  type RoadmapStatus,
} from '../../entities/roadmap/api'
import { appConfig } from '../../shared/config'
import { type StoredAuthSession } from '../../shared/mutation'

type RoadmapAdminPanelProps = {
  authSession: StoredAuthSession | null
  onOpenSettings: () => void
  onRoadmapPublished: () => void
  formatDate: (value: string | null | undefined) => string
}

type EditableRoadmapItemField = 'status' | 'horizon' | 'owner' | 'target'
type EditableRoadmapMilestoneField = 'owner' | 'target'

const STATUS_META: Record<RoadmapStatus, { label: string; tone: 'planned' | 'in-progress' | 'blocked' | 'shipped' }> = {
  planned: { label: 'Planned', tone: 'planned' },
  in_progress: { label: 'In Progress', tone: 'in-progress' },
  blocked: { label: 'Blocked', tone: 'blocked' },
  shipped: { label: 'Shipped', tone: 'shipped' },
}

const STATUS_OPTIONS: RoadmapStatus[] = ['planned', 'in_progress', 'blocked', 'shipped']
const HORIZON_OPTIONS: Array<{ value: RoadmapHorizonKey; label: string }> = [
  { value: 'now', label: 'Now' },
  { value: 'next', label: 'Next' },
  { value: 'later', label: 'Later' },
]

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function cloneRoadmapDocument(document: RoadmapDocumentData): RoadmapDocumentData {
  return JSON.parse(JSON.stringify(document)) as RoadmapDocumentData
}

function summarizeRevisionChange(revision: RoadmapRevision): string {
  if (revision.change_summary.length === 0) {
    return 'No recorded change summary.'
  }
  if (revision.change_summary.length === 1) {
    return revision.change_summary[0]
  }
  return `${revision.change_summary[0]} ${revision.change_summary.length - 1} more change${revision.change_summary.length - 1 === 1 ? '' : 's'}.`
}

export function RoadmapAdminPanel({
  authSession,
  onOpenSettings,
  onRoadmapPublished,
  formatDate,
}: RoadmapAdminPanelProps) {
  const [roadmapRecord, setRoadmapRecord] = useState<AdminRoadmapDocumentData | null>(null)
  const [roadmapDraft, setRoadmapDraft] = useState<RoadmapDocumentData | null>(null)
  const [roadmapLoading, setRoadmapLoading] = useState(false)
  const [roadmapSaving, setRoadmapSaving] = useState(false)
  const [restoringRevisionId, setRestoringRevisionId] = useState<number | null>(null)
  const [roadmapError, setRoadmapError] = useState('')
  const [roadmapSuccess, setRoadmapSuccess] = useState('')
  const [loadVersion, setLoadVersion] = useState(0)

  const adminEnabled = hasAdministrativeAccess(authSession)

  useEffect(() => {
    if (!adminEnabled || !authSession) {
      setRoadmapRecord(null)
      setRoadmapDraft(null)
      setRoadmapLoading(false)
      setRoadmapError('')
      setRoadmapSuccess('')
      return
    }

    let cancelled = false

    setRoadmapLoading(true)
    setRoadmapError('')

    loadAdminRoadmapDocument(appConfig.apiBase, authSession.accessToken)
      .then((payload) => {
        if (!cancelled) {
          setRoadmapRecord(payload)
          setRoadmapDraft(cloneRoadmapDocument(payload.document))
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRoadmapError(error instanceof Error ? error.message : 'Could not load roadmap controls.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRoadmapLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [adminEnabled, authSession, loadVersion])

  const roadmapItems = useMemo(() => roadmapDraft?.phases.flatMap((phase) => phase.items) ?? [], [roadmapDraft])

  const statusCounts = useMemo(
    () =>
      roadmapItems.reduce<Record<RoadmapStatus, number>>(
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
      ),
    [roadmapItems],
  )

  const hasUnsavedChanges = useMemo(() => {
    if (!roadmapRecord || !roadmapDraft) {
      return false
    }
    return JSON.stringify(roadmapDraft) !== JSON.stringify(roadmapRecord.document)
  }, [roadmapDraft, roadmapRecord])

  function updateRoadmapItem(itemId: string, field: EditableRoadmapItemField, value: string) {
    setRoadmapSuccess('')
    setRoadmapDraft((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        phases: current.phases.map((phase) => ({
          ...phase,
          items: phase.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  [field]:
                    field === 'status'
                      ? (value as RoadmapStatus)
                      : field === 'horizon'
                        ? (value as RoadmapHorizonKey)
                        : value,
                }
              : item,
          ),
        })),
      }
    })
  }

  function updateRoadmapMilestone(milestoneId: string, field: EditableRoadmapMilestoneField, value: string) {
    setRoadmapSuccess('')
    setRoadmapDraft((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        milestones: current.milestones.map((milestone) =>
          milestone.id === milestoneId
            ? {
                ...milestone,
                [field]: value,
              }
            : milestone,
        ),
      }
    })
  }

  function resetRoadmapDraft() {
    if (!roadmapRecord) {
      return
    }
    setRoadmapSuccess('')
    setRoadmapError('')
    setRoadmapDraft(cloneRoadmapDocument(roadmapRecord.document))
  }

  function applyPublishedRoadmap(payload: AdminRoadmapDocumentData, successMessage: string) {
    setRoadmapRecord(payload)
    setRoadmapDraft(cloneRoadmapDocument(payload.document))
    setRoadmapSuccess(successMessage)
    onRoadmapPublished()
  }

  async function handleSaveRoadmap() {
    if (!roadmapDraft || !authSession) {
      return
    }

    setRoadmapSaving(true)
    setRoadmapError('')
    setRoadmapSuccess('')

    try {
      const payload = await saveAdminRoadmapDocument(
        appConfig.apiBase,
        authSession.accessToken,
        roadmapDraft,
        authSession.user.user_id,
      )
      applyPublishedRoadmap(
        payload,
        `Roadmap saved to the API as version ${payload.version} by ${payload.updated_by ?? authSession.user.user_id}.`,
      )
    } catch (error) {
      setRoadmapError(error instanceof Error ? error.message : 'Could not save roadmap.')
    } finally {
      setRoadmapSaving(false)
    }
  }

  async function handleRestoreRevision(revision: RoadmapRevision) {
    if (!authSession) {
      return
    }

    setRestoringRevisionId(revision.revision_id)
    setRoadmapError('')
    setRoadmapSuccess('')

    try {
      const payload = await restoreAdminRoadmapRevision(
        appConfig.apiBase,
        authSession.accessToken,
        revision.revision_id,
        authSession.user.user_id,
      )
      applyPublishedRoadmap(payload, `Restored roadmap revision ${revision.version} and published version ${payload.version}.`)
    } catch (error) {
      setRoadmapError(error instanceof Error ? error.message : 'Could not restore roadmap revision.')
    } finally {
      setRestoringRevisionId(null)
    }
  }

  return (
    <section className="surface feature-panel roadmap-admin-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Planning</span>
          <h3>Roadmap Control</h3>
        </div>
        <p>Update the in-product roadmap from Admin so status, timing, and ownership stay live without a code edit.</p>
      </div>

      {!adminEnabled && (
        <div className="roadmap-admin-lock">
          <p>Sign in with an administrative session to edit roadmap status, horizon, owners, and targets.</p>
          <button type="button" className="button button-secondary" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      )}

      {adminEnabled && (
        <>
          <div className="roadmap-admin-toolbar">
            <div className="stack">
              <span className={`editor-state-pill ${hasUnsavedChanges ? 'is-dirty' : 'is-clean'}`}>
                {hasUnsavedChanges ? 'Unsaved changes' : roadmapRecord?.is_default ? 'Using defaults' : 'Saved to API'}
              </span>
              <p className="roadmap-admin-note">
                {roadmapRecord?.is_default
                  ? 'No admin override exists yet. Your first save will create the stored roadmap document.'
                  : `Last saved ${formatDate(roadmapRecord?.updated_at)} by ${roadmapRecord?.updated_by ?? 'unknown'}.`}
              </p>
            </div>

            <div className="toolbar">
              <button
                type="button"
                className="button button-ghost"
                onClick={resetRoadmapDraft}
                disabled={!hasUnsavedChanges || roadmapSaving || roadmapLoading || restoringRevisionId !== null}
              >
                Reset Changes
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => void handleSaveRoadmap()}
                disabled={!roadmapDraft || !hasUnsavedChanges || roadmapSaving || roadmapLoading || restoringRevisionId !== null}
              >
                {roadmapSaving ? 'Saving Roadmap...' : 'Save Roadmap'}
              </button>
            </div>
          </div>

          <div className="roadmap-admin-meta-grid">
            <article className="admin-card">
              <strong>Planning Surface</strong>
              <p>{roadmapItems.length} roadmap items are currently editable from Admin.</p>
              <span>{roadmapDraft?.source_path ?? 'docs/engineering/trading-source-roadmap.md'}</span>
            </article>
            <article className="admin-card">
              <strong>Active Work</strong>
              <p>{statusCounts.in_progress + statusCounts.blocked} items still need active operator attention.</p>
              <span>
                {statusCounts.in_progress} in progress · {statusCounts.blocked} blocked
              </span>
            </article>
            <article className="admin-card">
              <strong>Stored Version</strong>
              <p>{roadmapRecord?.is_default ? 'The API is currently serving the seeded default roadmap.' : `Version ${roadmapRecord?.version ?? 0} is now the live product roadmap.`}</p>
              <span>{roadmapRecord?.is_default ? 'First save creates persistence' : formatDate(roadmapRecord?.updated_at)}</span>
            </article>
            <article className="admin-card">
              <strong>Revision Trail</strong>
              <p>{roadmapRecord?.recent_revisions.length ?? 0} published revisions are available for quick restore.</p>
              <span>{hasUnsavedChanges ? 'Save or reset draft changes before restoring history' : 'Restore always creates a new published version'}</span>
            </article>
          </div>

          {roadmapLoading && <div className="feedback-banner feedback-banner-success">Loading roadmap controls from the admin API...</div>}
          {roadmapError ? <div className="feedback-banner feedback-banner-error">{roadmapError}</div> : null}
          {roadmapSuccess ? <div className="feedback-banner feedback-banner-success">{roadmapSuccess}</div> : null}

          {!roadmapLoading && !roadmapDraft && !roadmapError && (
            <div className="roadmap-admin-lock">
              <p>Roadmap controls did not return data. Try loading the admin document again.</p>
              <button type="button" className="button button-secondary" onClick={() => setLoadVersion((current) => current + 1)}>
                Retry Load
              </button>
            </div>
          )}

          {roadmapDraft && (
            <>
              <div className="roadmap-admin-phase-grid">
                {roadmapDraft.phases.map((phase) => (
                  <article key={phase.id} className="roadmap-admin-phase-card">
                    <div className="roadmap-admin-phase-head">
                      <div>
                        <span className="eyebrow">{phase.priority}</span>
                        <h4>{phase.title}</h4>
                      </div>
                      <span>{phase.items.length} items</span>
                    </div>
                    <p>{phase.summary}</p>

                    <div className="roadmap-admin-item-stack">
                      {phase.items.map((item) => (
                        <article key={item.id} className="roadmap-admin-item-card">
                          <div className="roadmap-admin-item-head">
                            <div>
                              <strong>{item.title}</strong>
                              <p>{item.summary}</p>
                            </div>
                            <span className={`status-pill status-pill-${STATUS_META[item.status].tone}`}>
                              {STATUS_META[item.status].label}
                            </span>
                          </div>

                          <div className="roadmap-admin-field-grid">
                            <label className="field">
                              <span>Status</span>
                              <select
                                className="control control-compact"
                                value={item.status}
                                onChange={(event) => updateRoadmapItem(item.id, 'status', event.target.value)}
                              >
                                {STATUS_OPTIONS.map((status) => (
                                  <option key={status} value={status}>
                                    {STATUS_META[status].label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="field">
                              <span>Horizon</span>
                              <select
                                className="control control-compact"
                                value={item.horizon}
                                onChange={(event) => updateRoadmapItem(item.id, 'horizon', event.target.value)}
                              >
                                {HORIZON_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="field">
                              <span>Owner</span>
                              <input
                                className="control control-compact"
                                value={item.owner}
                                onChange={(event) => updateRoadmapItem(item.id, 'owner', event.target.value)}
                              />
                            </label>

                            <label className="field">
                              <span>Target</span>
                              <input
                                className="control control-compact"
                                value={item.target}
                                onChange={(event) => updateRoadmapItem(item.id, 'target', event.target.value)}
                              />
                            </label>
                          </div>

                          <div className="roadmap-admin-item-footer">
                            <small>{item.links.length} workspace links stay attached to this item.</small>
                            <small>{item.source_ids.length} source ids remain in the narrative layer.</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <div className="section-head roadmap-admin-section-head">
                <div>
                  <span className="eyebrow">Milestones</span>
                  <h3>Delivery Gates</h3>
                </div>
                <p>Milestones still derive progress from the linked items, but ownership and target windows can now be tuned here.</p>
              </div>

              <div className="roadmap-admin-milestone-grid">
                {roadmapDraft.milestones.map((milestone) => (
                  <article key={milestone.id} className="roadmap-admin-milestone-card">
                    <div className="roadmap-admin-item-head">
                      <div>
                        <strong>{milestone.title}</strong>
                        <p>{milestone.summary}</p>
                      </div>
                      <span>{milestone.item_ids.length} items</span>
                    </div>

                    <div className="roadmap-admin-field-grid roadmap-admin-field-grid-compact">
                      <label className="field">
                        <span>Owner</span>
                        <input
                          className="control control-compact"
                          value={milestone.owner}
                          onChange={(event) => updateRoadmapMilestone(milestone.id, 'owner', event.target.value)}
                        />
                      </label>

                      <label className="field">
                        <span>Target</span>
                        <input
                          className="control control-compact"
                          value={milestone.target}
                          onChange={(event) => updateRoadmapMilestone(milestone.id, 'target', event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="stack">
                      {milestone.exit_criteria.map((criterion) => (
                        <div key={criterion} className="detail-row">
                          <span>{criterion}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <div className="section-head roadmap-admin-section-head">
                <div>
                  <span className="eyebrow">History</span>
                  <h3>Recent Changes</h3>
                </div>
                <p>Each publish is kept as a revision so changes are traceable and safe to roll back.</p>
              </div>

              <div className="roadmap-admin-history-list">
                {roadmapRecord?.recent_revisions.length ? (
                  roadmapRecord.recent_revisions.map((revision) => (
                    <article key={revision.revision_id} className="roadmap-admin-history-card">
                      <div className="roadmap-admin-history-head">
                        <div>
                          <strong>Version {revision.version}</strong>
                          <p>{summarizeRevisionChange(revision)}</p>
                        </div>
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => void handleRestoreRevision(revision)}
                          disabled={hasUnsavedChanges || roadmapSaving || roadmapLoading || restoringRevisionId !== null}
                        >
                          {restoringRevisionId === revision.revision_id ? 'Restoring...' : 'Restore'}
                        </button>
                      </div>

                      <div className="roadmap-admin-history-meta">
                        <span>{formatDate(revision.created_at)}</span>
                        <span>{revision.created_by}</span>
                        {revision.restored_from_revision_id !== null ? (
                          <span>Restored from revision {revision.restored_from_revision_id}</span>
                        ) : null}
                      </div>

                      <div className="stack">
                        {revision.change_summary.map((line, index) => (
                          <div key={`${revision.revision_id}-${index}`} className="detail-row">
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="roadmap-admin-lock">
                    <p>The revision trail starts with the first published roadmap change.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
