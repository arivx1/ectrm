import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  listAdminHomeViewDefinitions,
  restoreHomeViewDefinition,
  retireHomeViewDefinition,
  type HomeViewDefinition,
} from '../../entities/home-views/api'
import { appConfig } from '../../shared/config'
import type { StoredAuthSession } from '../../shared/mutation'

type HomeViewAdminPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenSettings: () => void
}

function hasAdminAccess(authSession: StoredAuthSession | null): boolean {
  const role = authSession?.user.role?.trim().toUpperCase()
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function formatHomeViewScope(definition: HomeViewDefinition): string {
  if (definition.scope === 'PERSONAL') {
    return `Personal · ${definition.scope_owner_key}`
  }
  if (definition.scope === 'TEAM') {
    return `Team · ${definition.scope_owner_key.replace(/^team:/, '')}`
  }
  return 'Organization'
}

function formatHomeViewValidationSummary(definition: HomeViewDefinition): string {
  if (definition.validation_warnings.length === 0) {
    return 'Validation clear'
  }
  return `${definition.validation_warnings.length} warning${definition.validation_warnings.length === 1 ? '' : 's'}`
}

export function HomeViewAdminPanel({
  authSession,
  formatDate,
  onOpenSettings,
}: HomeViewAdminPanelProps) {
  const adminEnabled = hasAdminAccess(authSession)
  const [definitions, setDefinitions] = useState<HomeViewDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [mutatingDefinitionId, setMutatingDefinitionId] = useState<number | null>(null)

  const loadInventory = useCallback(async () => {
    if (!adminEnabled || !authSession) {
      setDefinitions([])
      setError('')
      setSuccess('')
      return
    }

    setLoading(true)
    setError('')
    try {
      const payload = await listAdminHomeViewDefinitions(appConfig.apiBase, authSession.accessToken)
      setDefinitions(payload)
    } catch (loadError) {
      setDefinitions([])
      setError(loadError instanceof Error ? loadError.message : 'Could not load Home view inventory.')
    } finally {
      setLoading(false)
    }
  }, [adminEnabled, authSession])

  useEffect(() => {
    void loadInventory()
  }, [loadInventory])

  const summary = useMemo(() => {
    const sharedDefinitions = definitions.filter((definition) => definition.is_shared)
    return {
      total: definitions.length,
      shared: sharedDefinitions.length,
      active: definitions.filter((definition) => definition.status === 'ACTIVE').length,
      draft: definitions.filter((definition) => definition.status === 'DRAFT').length,
      retired: definitions.filter((definition) => definition.status === 'RETIRED').length,
      warnings: definitions.filter((definition) => definition.validation_warnings.length > 0).length,
    }
  }, [definitions])

  async function retireDefinition(definition: HomeViewDefinition) {
    if (!authSession || !definition.can_retire) {
      return
    }

    setMutatingDefinitionId(definition.definition_id)
    setError('')
    setSuccess('')
    try {
      const updated = await retireHomeViewDefinition(
        appConfig.apiBase,
        authSession.accessToken,
        definition.definition_id,
      )
      setDefinitions((current) =>
        current.map((candidate) =>
          candidate.definition_id === updated.definition_id ? updated : candidate,
        ),
      )
      setSuccess(`${updated.name} retired.`)
    } catch (retireError) {
      setError(retireError instanceof Error ? retireError.message : 'Could not retire the shared Home view.')
    } finally {
      setMutatingDefinitionId(null)
    }
  }

  async function restoreDefinition(definition: HomeViewDefinition) {
    if (!authSession || !definition.can_restore) {
      return
    }

    setMutatingDefinitionId(definition.definition_id)
    setError('')
    setSuccess('')
    try {
      const updated = await restoreHomeViewDefinition(
        appConfig.apiBase,
        authSession.accessToken,
        definition.definition_id,
      )
      setDefinitions((current) =>
        current.map((candidate) =>
          candidate.definition_id === updated.definition_id ? updated : candidate,
        ),
      )
      setSuccess(`${updated.name} restored.`)
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Could not restore the shared Home view.')
    } finally {
      setMutatingDefinitionId(null)
    }
  }

  return (
    <section className="surface feature-panel">
      <div className="admin-sync-head">
        <div>
          <span className="eyebrow">Home Governance</span>
          <h3>Shared Home Inventory</h3>
        </div>
        <div className="admin-sync-head-actions">
          {adminEnabled ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void loadInventory()}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          ) : (
            <button type="button" className="button button-secondary" onClick={onOpenSettings}>
              Sign In
            </button>
          )}
        </div>
      </div>
      <p>
        Inspect personal and shared Home definitions, lifecycle state, owners, versions, and compatibility warnings before a shared view becomes desk convention.
      </p>

      {!adminEnabled ? (
        <div className="roadmap-admin-lock">
          <p>Sign in with an administrative session to inspect or govern shared Home definitions.</p>
        </div>
      ) : (
        <div className="stack">
          <div className="admin-sync-status-grid">
            <article className="admin-card">
              <strong>Inventory</strong>
              <p>{summary.total} Home definition{summary.total === 1 ? '' : 's'} are tracked.</p>
              <span>{summary.shared} shared · {summary.active} active</span>
            </article>
            <article className="admin-card">
              <strong>Lifecycle</strong>
              <p>{summary.draft} draft · {summary.retired} retired</p>
              <span>Published shared views stay immutable until retired.</span>
            </article>
            <article className="admin-card">
              <strong>Compatibility</strong>
              <p>{summary.warnings} definition{summary.warnings === 1 ? '' : 's'} need review.</p>
              <span>Warnings are checked against the current card registry and reference catalogs.</span>
            </article>
          </div>

          {error ? <div className="feedback-banner feedback-banner-error">{error}</div> : null}
          {success ? <div className="feedback-banner feedback-banner-success">{success}</div> : null}

          <div className="admin-run-list">
            {definitions.length === 0 ? (
              <div className="detail-row">
                <span>{loading ? 'Loading Home view inventory.' : 'No Home view definitions are currently stored.'}</span>
              </div>
            ) : (
              definitions.map((definition) => (
                <article key={definition.definition_id} className="admin-run-row">
                  <div>
                    <strong>{definition.name}</strong>
                    <p>
                      {formatHomeViewScope(definition)} · {definition.status} · v{definition.version}
                    </p>
                    <span>
                      {definition.cards.length} app{definition.cards.length === 1 ? '' : 's'} · updated by {definition.updated_by} · {formatDate(definition.updated_at)}
                    </span>
                    <div className="chip-row">
                      <span className="entity-chip entity-chip-soft">
                        {formatHomeViewValidationSummary(definition)}
                      </span>
                      {definition.validation_warnings.map((warning) => (
                        <span key={`${definition.definition_id}-${warning}`} className="entity-chip">
                          {warning}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="admin-run-meta">
                    <span>{definition.definition_key}</span>
                    <span>Created by {definition.created_by}</span>
                    {definition.can_retire ? (
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => void retireDefinition(definition)}
                        disabled={mutatingDefinitionId === definition.definition_id}
                      >
                        Retire
                      </button>
                    ) : null}
                    {definition.can_restore ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void restoreDefinition(definition)}
                        disabled={mutatingDefinitionId === definition.definition_id}
                      >
                        Restore
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  )
}
