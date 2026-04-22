import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import {
  createCodexTask,
  listCodexTasks,
  loadCodexTaskSettings,
  type CodexTaskRecord,
  type CodexTaskRunMode,
  type CodexTaskSettings,
} from '../../entities/app/adminApi'
import { appConfig } from '../../shared/config'
import { type StoredAuthSession } from '../../shared/mutation'

type CodexTaskPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenSettings: () => void
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function statusLabel(status: CodexTaskRecord['status']): string {
  switch (status) {
    case 'DISPATCHED':
      return 'Dispatched'
    case 'RUNNING':
      return 'Running'
    case 'COMPLETED':
      return 'Completed'
    case 'STOPPED':
      return 'Stopped'
    case 'FAILED':
      return 'Failed'
    case 'CANCELLED':
      return 'Cancelled'
    case 'QUEUED':
      return 'Queued'
    default:
      return status
  }
}

function statusTone(status: CodexTaskRecord['status']): 'active' | 'blocked' | 'planned' {
  switch (status) {
    case 'DISPATCHED':
    case 'RUNNING':
      return 'active'
    case 'FAILED':
    case 'CANCELLED':
      return 'blocked'
    case 'COMPLETED':
    case 'STOPPED':
      return 'planned'
    default:
      return 'planned'
  }
}

function modeLabel(mode: CodexTaskRunMode): string {
  return mode === 'LONG_RUNNING' ? 'Long-running' : 'Single task'
}

function configurationSummary(settings: CodexTaskSettings | null): string {
  if (!settings) {
    return 'Not loaded'
  }
  if (!settings.enabled) {
    return 'Disabled'
  }
  return settings.configured ? 'Ready' : 'Needs config'
}

export function CodexTaskPanel({ authSession, formatDate, onOpenSettings }: CodexTaskPanelProps) {
  const adminEnabled = hasAdministrativeAccess(authSession)
  const [settings, setSettings] = useState<CodexTaskSettings | null>(null)
  const [tasks, setTasks] = useState<CodexTaskRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [flash, setFlash] = useState<FlashMessage | null>(null)
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [targetRef, setTargetRef] = useState('')
  const [runMode, setRunMode] = useState<CodexTaskRunMode>('SINGLE_TASK')
  const [maxIterations, setMaxIterations] = useState(5)
  const [continuationPrompt, setContinuationPrompt] = useState('What is the next recommended task?')

  const validIterationCount =
    runMode === 'SINGLE_TASK' ||
    (maxIterations >= 2 && (!settings || maxIterations <= settings.long_running_max_iterations))

  const canSubmit = useMemo(
    () =>
      Boolean(
        adminEnabled &&
          settings?.enabled &&
          settings.configured &&
          title.trim() &&
          prompt.trim() &&
          validIterationCount &&
          !submitting,
      ),
    [adminEnabled, prompt, settings, submitting, title, validIterationCount],
  )

  const refreshCodexTasks = useCallback(async () => {
    if (!adminEnabled) {
      return
    }
    setLoading(true)
    setFlash(null)
    try {
      const [nextSettings, nextTasks] = await Promise.all([
        loadCodexTaskSettings(appConfig.apiBase),
        listCodexTasks(appConfig.apiBase, { limit: 8 }),
      ])
      setSettings(nextSettings)
      setTasks(nextTasks)
      setMaxIterations((current) =>
        current >= 2 && current <= nextSettings.long_running_max_iterations
          ? current
          : nextSettings.long_running_default_max_iterations,
      )
      setContinuationPrompt((current) => current.trim() || nextSettings.long_running_default_continuation_prompt)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Codex task controls did not load.'
      setFlash({ tone: 'error', message })
    } finally {
      setLoading(false)
    }
  }, [adminEnabled])

  useEffect(() => {
    void refreshCodexTasks()
  }, [refreshCodexTasks])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      return
    }
    setSubmitting(true)
    setFlash(null)
    try {
      const created = await createCodexTask(appConfig.apiBase, {
        title,
        prompt,
        run_mode: runMode,
        max_iterations: runMode === 'LONG_RUNNING' ? maxIterations : 1,
        continuation_prompt: runMode === 'LONG_RUNNING' ? continuationPrompt : undefined,
        target_ref: targetRef || settings?.default_ref,
      })
      setTasks((current) => [created, ...current.filter((task) => task.id !== created.id)].slice(0, 8))
      setTitle('')
      setPrompt('')
      setTargetRef('')
      setFlash({
        tone: created.status === 'DISPATCHED' ? 'success' : 'error',
        message:
          created.status === 'DISPATCHED'
            ? `Codex task ${created.id} dispatched.`
            : `Codex task ${created.id} was recorded but did not dispatch.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Codex task dispatch failed.'
      setFlash({ tone: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="surface feature-panel assistant-admin-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Codex Tasks</p>
          <h2>Engineering task dispatch</h2>
          <p>Start governed Codex work through the configured repository workflow.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refreshCodexTasks()} disabled={loading || !adminEnabled}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {!adminEnabled ? (
        <div className="roadmap-admin-lock">
          <p>Sign in with an administrative session to start and inspect Codex tasks.</p>
          <button className="primary-button" type="button" onClick={onOpenSettings}>
            Open settings
          </button>
        </div>
      ) : (
        <>
          {flash && (
            <div className={`feedback-banner feedback-banner-${flash.tone === 'success' ? 'success' : 'error'}`}>
              {flash.message}
            </div>
          )}

          <div className="assistant-admin-summary-grid">
            <article className="admin-summary-card">
              <span>Status</span>
              <strong>{configurationSummary(settings)}</strong>
              <p>{settings?.enabled ? 'Dispatch gate is enabled.' : 'Dispatch gate is off.'}</p>
            </article>
            <article className="admin-summary-card">
              <span>Repository</span>
              <strong>{settings?.repository ?? 'Unconfigured'}</strong>
              <p>{settings?.workflow_id ? `Workflow ${settings.workflow_id}` : 'Workflow is not configured.'}</p>
            </article>
            <article className="admin-summary-card">
              <span>Default ref</span>
              <strong>{settings?.default_ref ?? 'main'}</strong>
              <p>{settings?.prompt_input_name ? `Prompt input ${settings.prompt_input_name}` : 'Prompt input is not loaded.'}</p>
            </article>
            <article className="admin-summary-card">
              <span>Long-running cap</span>
              <strong>{settings?.long_running_max_iterations ?? 10}</strong>
              <p>Default {settings?.long_running_default_max_iterations ?? 5} iterations.</p>
            </article>
          </div>

          {settings && settings.missing_configuration.length > 0 && (
            <div className="feedback-banner feedback-banner-error">
              Missing Codex configuration: {settings.missing_configuration.join(', ')}
            </div>
          )}

          <div className="assistant-admin-grid">
            <div className="assistant-admin-column">
              <div className="assistant-admin-section-head">
                <div>
                  <h3>New task</h3>
                  <p>Dispatch uses the backend-held GitHub token and records the result here.</p>
                </div>
              </div>
              <form className="assistant-admin-form" onSubmit={handleSubmit}>
                <label>
                  <span>Title</span>
                  <input
                    className="control"
                    value={title}
                    maxLength={160}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Fix failing CI check"
                  />
                </label>
                <label>
                  <span>Target ref</span>
                  <input
                    className="control"
                    value={targetRef}
                    maxLength={160}
                    onChange={(event) => setTargetRef(event.target.value)}
                    placeholder={settings?.default_ref ?? 'main'}
                  />
                </label>
                <div className="assistant-admin-option-group">
                  <span>Run mode</span>
                  <div className="toolbar settings-actions">
                    <button
                      className={runMode === 'SINGLE_TASK' ? 'primary-button' : 'secondary-button'}
                      type="button"
                      onClick={() => setRunMode('SINGLE_TASK')}
                    >
                      Single task
                    </button>
                    <button
                      className={runMode === 'LONG_RUNNING' ? 'primary-button' : 'secondary-button'}
                      type="button"
                      onClick={() => setRunMode('LONG_RUNNING')}
                    >
                      Long-running
                    </button>
                  </div>
                </div>
                {runMode === 'LONG_RUNNING' && (
                  <>
                    <label>
                      <span>Max iterations</span>
                      <input
                        className="control"
                        type="number"
                        min={2}
                        max={settings?.long_running_max_iterations ?? 10}
                        value={maxIterations}
                        onChange={(event) => setMaxIterations(Number(event.target.value))}
                      />
                    </label>
                    <label>
                      <span>Continuation question</span>
                      <input
                        className="control"
                        value={continuationPrompt}
                        maxLength={500}
                        onChange={(event) => setContinuationPrompt(event.target.value)}
                        placeholder={settings?.long_running_default_continuation_prompt ?? 'What is the next recommended task?'}
                      />
                    </label>
                    {!validIterationCount && (
                      <div className="feedback-banner feedback-banner-error">
                        Long-running tasks must stay between 2 and {settings?.long_running_max_iterations ?? 10} iterations.
                      </div>
                    )}
                  </>
                )}
                <label>
                  <span>Prompt</span>
                  <textarea
                    className="control assistant-admin-prompt"
                    value={prompt}
                    maxLength={20_000}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Describe the codebase task Codex should perform."
                  />
                </label>
                <button className="primary-button" type="submit" disabled={!canSubmit}>
                  {submitting ? 'Dispatching...' : 'Start Codex task'}
                </button>
              </form>
            </div>

            <div className="assistant-admin-column">
              <div className="assistant-admin-section-head">
                <div>
                  <h3>Recent tasks</h3>
                  <p>{tasks.length === 0 ? 'No Codex tasks have been recorded.' : `${tasks.length} recent tasks are loaded.`}</p>
                </div>
              </div>
              <div className="admin-run-list">
                {tasks.map((task) => (
                  <article key={task.id} className="admin-run-row">
                    <div>
                      <span className={`status-pill status-pill-${statusTone(task.status)}`}>{statusLabel(task.status)}</span>
                      <strong>{task.title}</strong>
                      <p>
                        {task.error_detail ??
                          `${modeLabel(task.run_mode)} requested by ${task.requested_by} for ${task.target_ref}.`}
                      </p>
                      {task.run_mode === 'LONG_RUNNING' && (
                        <p>
                          {task.iteration_count > 0
                            ? `${task.iteration_count} iteration${task.iteration_count === 1 ? '' : 's'} reported.`
                            : `Loop can continue until no recommendation remains or ${task.max_iterations} iterations complete.`}
                        </p>
                      )}
                      {task.result_summary && <p>{task.result_summary}</p>}
                      {task.stop_reason && <p>{task.stop_reason}</p>}
                    </div>
                    <div className="admin-run-meta">
                      <span>{formatDate(task.completed_at ?? task.started_at ?? task.created_at)}</span>
                      {task.pull_request_url && (
                        <a href={task.pull_request_url} target="_blank" rel="noreferrer">
                          PR
                        </a>
                      )}
                      {task.workflow_run_url && (
                        <a href={task.workflow_run_url} target="_blank" rel="noreferrer">
                          Run
                        </a>
                      )}
                      {task.artifact_url && (
                        <a href={task.artifact_url} target="_blank" rel="noreferrer">
                          Artifact
                        </a>
                      )}
                      {task.external_url && (
                        <a href={task.external_url} target="_blank" rel="noreferrer">
                          Workflow
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
