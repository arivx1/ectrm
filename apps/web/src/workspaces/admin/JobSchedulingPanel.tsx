import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import {
  createJobSchedule,
  enqueueEventJobRuns,
  listDeterministicJobCatalog,
  listJobRuns,
  listJobSchedules,
  materializeDueJobRuns,
  updateJobSchedule,
  type DeterministicJobCatalogEntry,
  type JobExecutionPlan,
  type JobExecutionMode,
  type JobMaxAuthority,
  type JobRecurrence,
  type JobRecurrenceFrequency,
  type JobRunRecord,
  type JobRunStatus,
  type JobScheduleRecord,
  type JobScheduleStatus,
  type JobTriggerType,
  type JobWeekday,
} from '../../entities/app/adminApi'
import { appConfig } from '../../shared/config'
import { type StoredAuthSession } from '../../shared/mutation'

type JobSchedulingPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenSettings: () => void
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

type RecurrenceChoice = 'NONE' | JobRecurrenceFrequency

const DEFAULT_DETERMINISTIC_CATALOG: DeterministicJobCatalogEntry[] = [
  {
    key: 'trading_eod_readiness',
    label: 'Trading EOD readiness',
    description: 'Check end-of-day operational readiness.',
    risk_level: 'medium',
    expected_output: 'Readiness findings and staged follow-up actions.',
    authority_note: 'Stage only unless promoted by governance.',
  },
  {
    key: 'control_tower_digest',
    label: 'Control tower digest',
    description: 'Prepare the assistant operations digest.',
    risk_level: 'low',
    expected_output: 'Digest payload for review.',
    authority_note: 'Observation and drafting only.',
  },
  {
    key: 'external_data_sync',
    label: 'External data sync',
    description: 'Queue reference data synchronization.',
    risk_level: 'medium',
    expected_output: 'Sync request and audit metadata.',
    authority_note: 'Runs through typed admin services.',
  },
  {
    key: 'projection_rebuild',
    label: 'Projection rebuild',
    description: 'Queue deterministic projection maintenance.',
    risk_level: 'medium',
    expected_output: 'Projection rebuild request.',
    authority_note: 'Business writes remain behind services.',
  },
  {
    key: 'document_reprocessing_scan',
    label: 'Document reprocessing scan',
    description: 'Find documents that need reprocessing.',
    risk_level: 'low',
    expected_output: 'Reviewable document worklist.',
    authority_note: 'Staged review queue.',
  },
]

const WEEKDAYS: Array<{ key: JobWeekday; label: string }> = [
  { key: 'MO', label: 'Mon' },
  { key: 'TU', label: 'Tue' },
  { key: 'WE', label: 'Wed' },
  { key: 'TH', label: 'Thu' },
  { key: 'FR', label: 'Fri' },
  { key: 'SA', label: 'Sat' },
  { key: 'SU', label: 'Sun' },
]

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function defaultStartsAt(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function toIsoFromDateTimeLocal(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Start time must be a valid date and time.')
  }
  return date.toISOString()
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) {
    return {}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`${label} must be valid JSON.`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }

  return parsed as Record<string, unknown>
}

function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, items) => Boolean(item) && items.indexOf(item) === index)
}

function formatEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function scheduleStatusTone(status: JobScheduleStatus): 'active' | 'blocked' | 'planned' {
  if (status === 'ACTIVE') {
    return 'active'
  }
  if (status === 'ARCHIVED') {
    return 'blocked'
  }
  return 'planned'
}

function runStatusTone(status: JobRunStatus): 'active' | 'blocked' | 'planned' | 'shipped' {
  switch (status) {
    case 'RUNNING':
      return 'active'
    case 'FAILED':
    case 'CANCELLED':
      return 'blocked'
    case 'SUCCEEDED':
      return 'shipped'
    default:
      return 'planned'
  }
}

function scheduleTriggerSummary(schedule: JobScheduleRecord, formatDate: JobSchedulingPanelProps['formatDate']): string {
  if (schedule.trigger_type === 'TIME' && schedule.time_trigger) {
    const recurrence = schedule.time_trigger.recurrence
      ? `${formatEnum(schedule.time_trigger.recurrence.frequency)} every ${schedule.time_trigger.recurrence.interval ?? 1}`
      : 'One-time'
    return `${recurrence} from ${formatDate(schedule.time_trigger.starts_at)} (${schedule.time_trigger.timezone})`
  }

  if (schedule.event_trigger) {
    return `${schedule.event_trigger.event_source} / ${schedule.event_trigger.event_type}`
  }

  return formatEnum(schedule.trigger_type)
}

function executionPlanSummary(plan: JobExecutionPlan): string {
  const parts = [formatEnum(plan.mode)]
  if (plan.deterministic_task_key) {
    parts.push(plan.deterministic_task_key)
  }
  if (plan.agent_id) {
    parts.push(plan.agent_id)
  }
  parts.push(`Authority ${formatEnum(plan.max_authority ?? 'DRAFT')}`)
  return parts.join(' - ')
}

function executionSummary(schedule: JobScheduleRecord): string {
  return executionPlanSummary(schedule.execution_plan)
}

function runTriggerSummary(run: JobRunRecord, formatDate: JobSchedulingPanelProps['formatDate']): string {
  if (run.trigger_type === 'TIME') {
    return run.scheduled_for ? `Scheduled for ${formatDate(run.scheduled_for)}` : 'Manual time materialization'
  }
  return `${run.event_source ?? 'event'} / ${run.event_type ?? 'unknown'}${run.trigger_ref ? ` - ${run.trigger_ref}` : ''}`
}

export function JobSchedulingPanel({ authSession, formatDate, onOpenSettings }: JobSchedulingPanelProps) {
  const adminEnabled = hasAdministrativeAccess(authSession)
  const [catalog, setCatalog] = useState<DeterministicJobCatalogEntry[]>([])
  const [schedules, setSchedules] = useState<JobScheduleRecord[]>([])
  const [runs, setRuns] = useState<JobRunRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [queueing, setQueueing] = useState(false)
  const [flash, setFlash] = useState<FlashMessage | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<JobTriggerType>('TIME')
  const [startsAt, setStartsAt] = useState(defaultStartsAt)
  const [timezone, setTimezone] = useState(defaultTimezone)
  const [recurrenceChoice, setRecurrenceChoice] = useState<RecurrenceChoice>('DAILY')
  const [recurrenceInterval, setRecurrenceInterval] = useState(1)
  const [recurrenceCount, setRecurrenceCount] = useState(30)
  const [weekdays, setWeekdays] = useState<JobWeekday[]>(['MO', 'TU', 'WE', 'TH', 'FR'])
  const [eventSource, setEventSource] = useState('trade')
  const [eventType, setEventType] = useState('trade.created')
  const [eventFilterJson, setEventFilterJson] = useState('{}')

  const [mode, setMode] = useState<JobExecutionMode>('DETERMINISTIC')
  const [deterministicTaskKey, setDeterministicTaskKey] = useState('trading_eod_readiness')
  const [agentId, setAgentId] = useState('')
  const [maxAuthority, setMaxAuthority] = useState<JobMaxAuthority>('DRAFT')
  const [allowedActionTypes, setAllowedActionTypes] = useState('')
  const [payloadJson, setPayloadJson] = useState('{\n  "dry_run": true\n}')

  const [eventRef, setEventRef] = useState('')
  const [eventPayloadJson, setEventPayloadJson] = useState('{\n  "aggregate_id": "T-1001"\n}')

  const catalogOptions = catalog.length > 0 ? catalog : DEFAULT_DETERMINISTIC_CATALOG

  const activeSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.status === 'ACTIVE').length,
    [schedules],
  )
  const queuedRuns = useMemo(() => runs.filter((run) => run.status === 'QUEUED').length, [runs])
  const nextDueAt = useMemo(
    () =>
      schedules
        .map((schedule) => schedule.next_run_at)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null,
    [schedules],
  )

  const requiresDeterministicTask = mode === 'DETERMINISTIC' || mode === 'HYBRID'
  const requiresAgent = mode === 'AGENTIC' || mode === 'HYBRID'
  const planReady = (!requiresDeterministicTask || Boolean(deterministicTaskKey.trim())) && (!requiresAgent || Boolean(agentId.trim()))
  const triggerReady =
    triggerType === 'TIME'
      ? Boolean(startsAt && timezone.trim())
      : Boolean(eventSource.trim() && eventType.trim())
  const canSubmit = adminEnabled && !submitting && Boolean(name.trim()) && planReady && triggerReady

  const refreshLists = useCallback(async () => {
    const [nextSchedules, nextRuns] = await Promise.all([
      listJobSchedules(appConfig.apiBase, { limit: 12 }),
      listJobRuns(appConfig.apiBase, { limit: 12 }),
    ])
    setSchedules(nextSchedules)
    setRuns(nextRuns)
  }, [])

  const refreshJobScheduling = useCallback(async () => {
    if (!adminEnabled) {
      return
    }
    setLoading(true)
    setFlash(null)
    try {
      const [nextCatalog, nextSchedules, nextRuns] = await Promise.all([
        listDeterministicJobCatalog(appConfig.apiBase),
        listJobSchedules(appConfig.apiBase, { limit: 12 }),
        listJobRuns(appConfig.apiBase, { limit: 12 }),
      ])
      setCatalog(nextCatalog)
      setSchedules(nextSchedules)
      setRuns(nextRuns)
      setDeterministicTaskKey((current) =>
        current && nextCatalog.some((entry) => entry.key === current) ? current : nextCatalog[0]?.key ?? current,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job scheduling controls did not load.'
      setFlash({ tone: 'error', message })
    } finally {
      setLoading(false)
    }
  }, [adminEnabled])

  useEffect(() => {
    void refreshJobScheduling()
  }, [refreshJobScheduling])

  function buildRecurrence(): JobRecurrence | undefined {
    if (recurrenceChoice === 'NONE') {
      return undefined
    }

    const recurrence: JobRecurrence = {
      frequency: recurrenceChoice,
      interval: Math.max(1, Math.trunc(recurrenceInterval) || 1),
    }

    if (recurrenceChoice === 'WEEKLY') {
      recurrence.by_weekday = WEEKDAYS.map((weekday) => weekday.key).filter((weekday) => weekdays.includes(weekday))
    }

    if (recurrenceCount > 0) {
      recurrence.count = Math.trunc(recurrenceCount)
    }

    return recurrence
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      return
    }

    setSubmitting(true)
    setFlash(null)
    try {
      const planPayload = parseJsonObject(payloadJson, 'Payload')
      const actionTypes = parseList(allowedActionTypes)
      if (actionTypes.length > 0 && maxAuthority !== 'STAGE') {
        throw new Error('Allowed action types require stage authority.')
      }
      if (requiresAgent && !agentId.trim()) {
        throw new Error('Agentic and hybrid jobs require an agent ID.')
      }

      const created = await createJobSchedule(appConfig.apiBase, {
        name,
        description: description || null,
        trigger_type: triggerType,
        ...(triggerType === 'TIME'
          ? {
              time_trigger: {
                starts_at: toIsoFromDateTimeLocal(startsAt),
                timezone: timezone.trim() || 'UTC',
                recurrence: buildRecurrence(),
              },
            }
          : {
              event_trigger: {
                event_source: eventSource,
                event_type: eventType,
                event_filter: parseJsonObject(eventFilterJson, 'Event filter'),
              },
            }),
        execution_plan: {
          mode,
          ...(requiresDeterministicTask ? { deterministic_task_key: deterministicTaskKey } : {}),
          ...(requiresAgent ? { agent_id: agentId.trim() } : {}),
          max_authority: maxAuthority,
          allowed_action_types: actionTypes,
          payload: planPayload,
        },
      })

      setSchedules((current) => [created, ...current.filter((schedule) => schedule.id !== created.id)].slice(0, 12))
      setName('')
      setDescription('')
      setFlash({ tone: 'success', message: `Schedule ${created.id} created.` })
      await refreshLists()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job schedule creation failed.'
      setFlash({ tone: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusChange(schedule: JobScheduleRecord, status: JobScheduleStatus) {
    setQueueing(true)
    setFlash(null)
    try {
      const updated = await updateJobSchedule(appConfig.apiBase, schedule.id, { status })
      setSchedules((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setFlash({ tone: 'success', message: `Schedule ${updated.id} ${formatEnum(updated.status).toLowerCase()}.` })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Schedule update failed.'
      setFlash({ tone: 'error', message })
    } finally {
      setQueueing(false)
    }
  }

  async function handleMaterializeDue() {
    setQueueing(true)
    setFlash(null)
    try {
      const batch = await materializeDueJobRuns(appConfig.apiBase, { limit: 50 })
      await refreshLists()
      setFlash({ tone: 'success', message: `${batch.count} due time run${batch.count === 1 ? '' : 's'} queued.` })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Due time runs could not be queued.'
      setFlash({ tone: 'error', message })
    } finally {
      setQueueing(false)
    }
  }

  async function handleEnqueueEvent() {
    if (!eventSource.trim() || !eventType.trim()) {
      setFlash({ tone: 'error', message: 'Event source and type are required.' })
      return
    }

    setQueueing(true)
    setFlash(null)
    try {
      const batch = await enqueueEventJobRuns(appConfig.apiBase, {
        event_source: eventSource,
        event_type: eventType,
        event_ref: eventRef || null,
        event_payload: parseJsonObject(eventPayloadJson, 'Event payload'),
        limit: 50,
      })
      await refreshLists()
      setFlash({ tone: 'success', message: `${batch.count} event run${batch.count === 1 ? '' : 's'} queued.` })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Event-driven runs could not be queued.'
      setFlash({ tone: 'error', message })
    } finally {
      setQueueing(false)
    }
  }

  function toggleWeekday(weekday: JobWeekday) {
    setWeekdays((current) =>
      current.includes(weekday) ? current.filter((item) => item !== weekday) : [...current, weekday],
    )
  }

  return (
    <section className="surface feature-panel assistant-admin-panel" id="job-scheduling">
      <div className="section-head">
        <div>
          <p className="eyebrow">Job Scheduling</p>
          <h2>Scheduled jobs</h2>
          <p>Create time and event driven work that queues deterministic, agentic, or hybrid runs.</p>
        </div>
        <div className="toolbar settings-actions">
          <button className="secondary-button" type="button" onClick={() => void refreshJobScheduling()} disabled={loading || !adminEnabled}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="secondary-button" type="button" onClick={() => void handleMaterializeDue()} disabled={queueing || !adminEnabled}>
            Run Due Time Triggers
          </button>
        </div>
      </div>

      {!adminEnabled ? (
        <div className="roadmap-admin-lock">
          <p>Administrative session required to create and schedule jobs.</p>
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
              <span>Schedules</span>
              <strong>{schedules.length}</strong>
              <p>{activeSchedules} active definitions loaded.</p>
            </article>
            <article className="admin-summary-card">
              <span>Queued runs</span>
              <strong>{queuedRuns}</strong>
              <p>{runs.length} recent runs loaded.</p>
            </article>
            <article className="admin-summary-card">
              <span>Next due</span>
              <strong>{nextDueAt ? formatDate(nextDueAt) : 'None'}</strong>
              <p>Time triggers materialize into queued runs.</p>
            </article>
            <article className="admin-summary-card">
              <span>Catalog</span>
              <strong>{catalogOptions.length}</strong>
              <p>Deterministic tasks available for schedules.</p>
            </article>
          </div>

          <div className="assistant-admin-grid job-scheduling-grid">
            <div className="assistant-admin-column">
              <div className="assistant-admin-section-head">
                <div>
                  <h3>Create schedule</h3>
                  <p>Schedules record trigger, execution plan, authority, and payload.</p>
                </div>
              </div>

              <form className="assistant-admin-form" onSubmit={handleSubmit}>
                <label>
                  <span>Name</span>
                  <input
                    className="control"
                    value={name}
                    maxLength={160}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Trading EOD readiness"
                  />
                </label>
                <label>
                  <span>Description</span>
                  <input
                    className="control"
                    value={description}
                    maxLength={4000}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Optional runbook context"
                  />
                </label>

                <div className="assistant-admin-option-group">
                  <span>Trigger</span>
                  <div className="toolbar settings-actions">
                    <button
                      className={triggerType === 'TIME' ? 'primary-button' : 'secondary-button'}
                      type="button"
                      onClick={() => setTriggerType('TIME')}
                    >
                      Time
                    </button>
                    <button
                      className={triggerType === 'EVENT' ? 'primary-button' : 'secondary-button'}
                      type="button"
                      onClick={() => setTriggerType('EVENT')}
                    >
                      Event
                    </button>
                  </div>
                </div>

                {triggerType === 'TIME' ? (
                  <div className="assistant-admin-form-grid">
                    <label>
                      <span>Start time</span>
                      <input
                        className="control"
                        type="datetime-local"
                        value={startsAt}
                        onChange={(event) => setStartsAt(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Timezone</span>
                      <input
                        className="control"
                        value={timezone}
                        maxLength={60}
                        onChange={(event) => setTimezone(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Recurrence</span>
                      <select
                        className="control"
                        value={recurrenceChoice}
                        onChange={(event) => setRecurrenceChoice(event.target.value as RecurrenceChoice)}
                      >
                        <option value="NONE">One-time</option>
                        <option value="DAILY">Daily</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                        <option value="YEARLY">Yearly</option>
                      </select>
                    </label>
                    <label>
                      <span>Interval</span>
                      <input
                        className="control"
                        type="number"
                        min={1}
                        max={366}
                        value={recurrenceInterval}
                        onChange={(event) => setRecurrenceInterval(Number(event.target.value))}
                        disabled={recurrenceChoice === 'NONE'}
                      />
                    </label>
                    <label>
                      <span>Run count</span>
                      <input
                        className="control"
                        type="number"
                        min={1}
                        max={5000}
                        value={recurrenceCount}
                        onChange={(event) => setRecurrenceCount(Number(event.target.value))}
                        disabled={recurrenceChoice === 'NONE'}
                      />
                    </label>
                    {recurrenceChoice === 'WEEKLY' && (
                      <div className="assistant-admin-option-group job-weekday-group">
                        <span>Weekdays</span>
                        <div className="job-weekday-row">
                          {WEEKDAYS.map((weekday) => (
                            <label key={weekday.key} className="job-weekday-toggle">
                              <input
                                type="checkbox"
                                checked={weekdays.includes(weekday.key)}
                                onChange={() => toggleWeekday(weekday.key)}
                              />
                              <span>{weekday.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="assistant-admin-form-grid">
                    <label>
                      <span>Event source</span>
                      <input
                        className="control"
                        value={eventSource}
                        maxLength={80}
                        onChange={(event) => setEventSource(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Event type</span>
                      <input
                        className="control"
                        value={eventType}
                        maxLength={120}
                        onChange={(event) => setEventType(event.target.value)}
                      />
                    </label>
                    <label className="job-json-field">
                      <span>Event filter JSON</span>
                      <textarea
                        className="control assistant-admin-prompt job-json-control"
                        value={eventFilterJson}
                        onChange={(event) => setEventFilterJson(event.target.value)}
                      />
                    </label>
                  </div>
                )}

                <div className="assistant-admin-option-group">
                  <span>Execution</span>
                  <div className="toolbar settings-actions">
                    {(['DETERMINISTIC', 'AGENTIC', 'HYBRID'] as const).map((candidate) => (
                      <button
                        key={candidate}
                        className={mode === candidate ? 'primary-button' : 'secondary-button'}
                        type="button"
                        onClick={() => setMode(candidate)}
                      >
                        {formatEnum(candidate)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="assistant-admin-form-grid">
                  {requiresDeterministicTask && (
                    <label>
                      <span>Deterministic task</span>
                      <select
                        className="control"
                        value={deterministicTaskKey}
                        onChange={(event) => setDeterministicTaskKey(event.target.value)}
                      >
                        {catalogOptions.map((entry) => (
                          <option key={entry.key} value={entry.key}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {requiresAgent && (
                    <label>
                      <span>Agent ID</span>
                      <input
                        className="control"
                        value={agentId}
                        maxLength={64}
                        onChange={(event) => setAgentId(event.target.value)}
                        placeholder="control-tower-agent"
                      />
                    </label>
                  )}
                  <label>
                    <span>Max authority</span>
                    <select
                      className="control"
                      value={maxAuthority}
                      onChange={(event) => setMaxAuthority(event.target.value as JobMaxAuthority)}
                    >
                      <option value="OBSERVE">Observe</option>
                      <option value="EXPLAIN">Explain</option>
                      <option value="DRAFT">Draft</option>
                      <option value="STAGE">Stage</option>
                    </select>
                  </label>
                  <label>
                    <span>Allowed action types</span>
                    <input
                      className="control"
                      value={allowedActionTypes}
                      onChange={(event) => setAllowedActionTypes(event.target.value)}
                      placeholder="trade_amendment, document_reprocess"
                    />
                  </label>
                  <label className="job-json-field">
                    <span>Payload JSON</span>
                    <textarea
                      className="control assistant-admin-prompt job-json-control"
                      value={payloadJson}
                      onChange={(event) => setPayloadJson(event.target.value)}
                    />
                  </label>
                </div>

                {!planReady && (
                  <div className="feedback-banner feedback-banner-error">
                    The selected execution mode needs {requiresDeterministicTask ? 'a deterministic task' : 'an agent'}.
                  </div>
                )}

                <button className="primary-button" type="submit" disabled={!canSubmit}>
                  {submitting ? 'Creating...' : 'Create schedule'}
                </button>
              </form>
            </div>

            <div className="assistant-admin-column">
              <div className="assistant-admin-section-head">
                <div>
                  <h3>Schedules</h3>
                  <p>{schedules.length === 0 ? 'No schedules have been recorded.' : `${schedules.length} schedule definitions loaded.`}</p>
                </div>
              </div>

              <div className="admin-run-list">
                {schedules.map((schedule) => (
                  <article key={schedule.id} className="admin-run-row job-schedule-row">
                    <div>
                      <span className={`status-pill status-pill-${scheduleStatusTone(schedule.status)}`}>
                        {formatEnum(schedule.status)}
                      </span>
                      <strong>{schedule.name}</strong>
                      <p>{scheduleTriggerSummary(schedule, formatDate)}</p>
                      <p>{executionSummary(schedule)}</p>
                    </div>
                    <div className="admin-run-meta job-schedule-actions">
                      <span>{schedule.next_run_at ? `Next ${formatDate(schedule.next_run_at)}` : 'No next run'}</span>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void handleStatusChange(schedule, schedule.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
                        disabled={queueing || schedule.status === 'ARCHIVED'}
                      >
                        {schedule.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void handleStatusChange(schedule, 'ARCHIVED')}
                        disabled={queueing || schedule.status === 'ARCHIVED'}
                      >
                        Archive
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="assistant-admin-section-head job-event-enqueue-head">
                <div>
                  <h3>Event enqueue</h3>
                  <p>Queue matching event-driven schedules for the source and type above.</p>
                </div>
              </div>
              <div className="assistant-admin-form job-event-enqueue">
                <label>
                  <span>Event ref</span>
                  <input
                    className="control"
                    value={eventRef}
                    maxLength={240}
                    onChange={(event) => setEventRef(event.target.value)}
                    placeholder="trade:T-1001"
                  />
                </label>
                <label>
                  <span>Event payload JSON</span>
                  <textarea
                    className="control assistant-admin-prompt job-json-control"
                    value={eventPayloadJson}
                    onChange={(event) => setEventPayloadJson(event.target.value)}
                  />
                </label>
                <button className="secondary-button" type="button" onClick={() => void handleEnqueueEvent()} disabled={queueing}>
                  Queue Matching Event
                </button>
              </div>

              <div className="assistant-admin-section-head">
                <div>
                  <h3>Recent Runs</h3>
                  <p>{runs.length === 0 ? 'No scheduled runs have been queued.' : `${runs.length} recent runs are loaded.`}</p>
                </div>
              </div>
              <div className="admin-run-list">
                {runs.map((run) => (
                  <article key={run.id} className="admin-run-row">
                    <div>
                      <span className={`status-pill status-pill-${runStatusTone(run.status)}`}>{formatEnum(run.status)}</span>
                      <strong>Run {run.id}</strong>
                      <p>{runTriggerSummary(run, formatDate)}</p>
                      <p>{executionPlanSummary(run.execution_plan)}</p>
                      {run.error_detail && <p>{run.error_detail}</p>}
                    </div>
                    <div className="admin-run-meta">
                      <span>{formatDate(run.completed_at ?? run.started_at ?? run.created_at)}</span>
                      <span>Schedule {run.schedule_id}</span>
                      <span>Attempt {run.attempt_count}</span>
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
