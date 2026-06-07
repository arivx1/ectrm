import { fetchJson, patchJson, postJson, putJson } from '../../shared/api'
import { buildMutationHeaders, getMutationContext } from '../../shared/mutation'
import type {
  CounterpartyCreditPreviewRecord,
  CounterpartyCreditSnapshotCandidate,
  ExternalDataRunRecord,
} from '../../shared/models'
import type { ExternalDataSyncProvider } from './workspaceDataShared'

export type TradingSourceSeedResult = {
  total_rows: number
  created_count: number
  updated_count: number
}

export type AssistantAgentSeedResult = {
  requested_by: string
  total_profiles: number
  /** @deprecated Use total_profiles; retained for older API responses. */
  total_templates: number
  created_count: number
  updated_count: number
  agent_ids: string[]
}

export type IntegrationAuthStatus = 'none' | 'partial' | 'configured'

export type AnthropicRuntimeSettings = {
  enabled: boolean
  configured: boolean
  provider: 'anthropic_admin_api'
  auth_status: IntegrationAuthStatus
  base_url: string
  api_version: string
  tracked_api_key_id: string | null
  missing_configuration: string[]
}

export type AnthropicApiKeyActor = {
  id: string
  type: string
}

export type AnthropicApiKeyRecord = {
  id: string
  created_at: string
  created_by: AnthropicApiKeyActor
  expires_at: string | null
  name: string
  partial_key_hint: string
  status: 'active' | 'inactive' | 'archived' | 'expired'
  type: 'api_key'
  workspace_id: string | null
}

export type AnthropicApiKeyLookup = {
  provider: 'anthropic_admin_api'
  status: 'connected'
  api_key: AnthropicApiKeyRecord
  warnings: string[]
}

export type CodexTaskStatus = 'QUEUED' | 'DISPATCHED' | 'RUNNING' | 'COMPLETED' | 'STOPPED' | 'FAILED' | 'CANCELLED'
export type CodexTaskRunMode = 'SINGLE_TASK' | 'LONG_RUNNING'

export type CodexTaskSettings = {
  enabled: boolean
  configured: boolean
  provider: 'github_actions'
  repository: string | null
  workflow_id: string | null
  default_ref: string
  prompt_input_name: string
  long_running_default_max_iterations: number
  long_running_max_iterations: number
  long_running_default_continuation_prompt: string
  missing_configuration: string[]
}

export type CodexTaskRecord = {
  id: number
  status: CodexTaskStatus
  provider: 'github_actions'
  title: string
  prompt: string
  run_mode: CodexTaskRunMode
  max_iterations: number
  continuation_prompt: string | null
  stop_conditions: string[]
  target_ref: string
  repository: string | null
  workflow_id: string | null
  dispatch_url: string | null
  callback_url: string | null
  external_url: string | null
  workflow_run_id: string | null
  workflow_run_url: string | null
  branch_name: string | null
  pull_request_url: string | null
  artifact_url: string | null
  iteration_count: number
  iteration_summaries: Record<string, unknown>[]
  result_summary: string | null
  stop_reason: string | null
  provider_response: Record<string, unknown> | null
  error_detail: string | null
  requested_by: string
  requester_role: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type CreateCodexTaskInput = {
  title: string
  prompt: string
  run_mode?: CodexTaskRunMode
  max_iterations?: number
  continuation_prompt?: string
  target_ref?: string
}

export type JobScheduleStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
export type JobTriggerType = 'TIME' | 'EVENT'
export type JobExecutionMode = 'DETERMINISTIC' | 'AGENTIC' | 'HYBRID'
export type JobMaxAuthority = 'OBSERVE' | 'EXPLAIN' | 'DRAFT' | 'STAGE'
export type JobRecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type JobWeekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'
export type JobRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'SKIPPED'

export type JobRecurrence = {
  frequency: JobRecurrenceFrequency
  interval?: number
  by_weekday?: JobWeekday[] | null
  until_at?: string | null
  count?: number | null
}

export type TimeJobTrigger = {
  starts_at: string
  timezone: string
  recurrence?: JobRecurrence | null
}

export type EventJobTrigger = {
  event_source: string
  event_type: string
  event_filter?: Record<string, unknown>
}

export type JobExecutionPlan = {
  mode: JobExecutionMode
  deterministic_task_key?: string | null
  agent_id?: string | null
  allowed_action_types?: string[]
  max_authority?: JobMaxAuthority
  payload?: Record<string, unknown>
}

export type JobScheduleRecord = {
  id: number
  name: string
  description: string | null
  status: JobScheduleStatus
  trigger_type: JobTriggerType
  time_trigger: TimeJobTrigger | null
  event_trigger: EventJobTrigger | null
  execution_plan: JobExecutionPlan
  next_run_at: string | null
  last_run_at: string | null
  is_user_enabled: boolean
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

export type JobRunRecord = {
  id: number
  schedule_id: number
  status: JobRunStatus
  trigger_type: JobTriggerType
  scheduled_for: string | null
  event_source: string | null
  event_type: string | null
  trigger_ref: string | null
  event_payload: Record<string, unknown> | null
  idempotency_key: string
  execution_plan: JobExecutionPlan
  schedule_version: number
  attempt_count: number
  started_at: string | null
  completed_at: string | null
  action_request_ids: number[]
  result: Record<string, unknown> | null
  error_detail: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
}

export type JobRunBatchRecord = {
  count: number
  items: JobRunRecord[]
}

export type DeterministicJobCatalogEntry = {
  key: string
  label: string
  description: string
  risk_level: string
  expected_output: string
  authority_note: string
}

export type CreateJobScheduleInput = {
  name: string
  description?: string | null
  trigger_type: JobTriggerType
  time_trigger?: TimeJobTrigger | null
  event_trigger?: EventJobTrigger | null
  execution_plan: JobExecutionPlan
}

export type UpdateJobScheduleInput = {
  name?: string
  description?: string | null
  status?: JobScheduleStatus
  time_trigger?: TimeJobTrigger | null
  event_trigger?: EventJobTrigger | null
  execution_plan?: JobExecutionPlan
}

export type MaterializeDueJobRunsInput = {
  as_of?: string
  limit?: number
}

export type EnqueueEventJobRunsInput = {
  event_source: string
  event_type: string
  event_ref?: string | null
  occurred_at?: string | null
  event_payload?: Record<string, unknown>
  limit?: number
}

export type UpdateJobRunStatusInput = {
  status: JobRunStatus
  result?: Record<string, unknown> | null
  action_request_ids?: number[]
  error_detail?: string | null
}

export type ProjectionAlertChannel = 'ADMIN_WORKSPACE' | 'EMAIL' | 'SLACK' | 'INCIDENT_QUEUE'
export type ProjectionAutoCleanMode = 'disabled' | 'clean_auto_cleanable'
export type ProjectionMonitoringHealthStatus = 'disabled' | 'healthy' | 'attention' | 'critical'
export type ProjectionMonitoringDeliveryStatus = 'queued' | 'delivered' | 'failed' | 'skipped'
export type ProjectionMonitoringCycleStatus =
  | 'idle'
  | 'skipped'
  | 'healthy'
  | 'issues_detected'
  | 'issues_auto_cleaned'

export type TradeProjectionMonitoringSchedule = {
  enabled: boolean
  cadence_minutes: number
  auto_clean_mode: ProjectionAutoCleanMode
  max_cleanup_trades_per_run: number
}

export type TradeProjectionMonitoringAlerting = {
  enabled: boolean
  issue_count_threshold: number
  impacted_trade_threshold: number
  minimum_alert_interval_minutes: number
  channels: ProjectionAlertChannel[]
  routing_note: string
}

export type TradeProjectionMonitoringDocument = {
  policy_key: string
  schedule: TradeProjectionMonitoringSchedule
  alerting: TradeProjectionMonitoringAlerting
}

export type TradeProjectionMonitoringRuntimeRecord = {
  last_evaluated_at: string | null
  last_evaluated_by: string | null
  last_issue_count: number
  last_structural_issue_count: number
  last_invariant_issue_count: number
  last_impacted_trade_count: number
  last_auto_cleaned_trade_count: number
  last_auto_cleaned_trade_ids: string[]
  last_cycle_status: ProjectionMonitoringCycleStatus
  last_alert_at: string | null
  last_alert_reason: string | null
  last_alert_severity: 'warning' | 'critical' | null
}

export type TradeProjectionMonitoringAlertRecord = {
  alert_id: string
  created_at: string
  severity: 'warning' | 'critical'
  reason: string
  messages: string[]
  channels: ProjectionAlertChannel[]
  issue_count: number
  structural_issue_count: number
  invariant_issue_count: number
  impacted_trade_count: number
  auto_cleaned_trade_ids: string[]
}

export type TradeProjectionMonitoringDeliveryRecord = {
  delivery_id: string
  alert_id: string
  channel: ProjectionAlertChannel
  status: ProjectionMonitoringDeliveryStatus
  target: string
  title: string
  body: string
  recipients: string[]
  created_at: string
  delivered_at: string | null
  error: string | null
}

export type TradeProjectionMonitoringLiveStatusRecord = {
  health_status: ProjectionMonitoringHealthStatus
  evaluation_due: boolean
  next_evaluation_at: string | null
  live_issue_count: number
  live_structural_issue_count: number
  live_invariant_issue_count: number
  live_impacted_trade_count: number
  should_alert: boolean
  alert_messages: string[]
  last_evaluated_at: string | null
  last_evaluated_by: string | null
  last_alert_at: string | null
  last_alert_reason: string | null
}

export type TradeProjectionMonitoringRevisionRecord = {
  revision_id: number
  version: number
  created_at: string
  created_by: string
  change_summary: string[]
  restored_from_revision_id: number | null
}

export type TradeProjectionMonitoringAdminRecord = {
  document: TradeProjectionMonitoringDocument
  updated_at: string | null
  updated_by: string | null
  version: number
  is_default: boolean
  recent_revisions: TradeProjectionMonitoringRevisionRecord[]
  runtime: TradeProjectionMonitoringRuntimeRecord
  recent_alerts: TradeProjectionMonitoringAlertRecord[]
  recent_deliveries: TradeProjectionMonitoringDeliveryRecord[]
  live_status: TradeProjectionMonitoringLiveStatusRecord
}

export type TradeProjectionMonitoringRunResult = {
  cycle_status: ProjectionMonitoringCycleStatus
  executed: boolean
  requested_by: string
  evaluated_at: string
  issue_count_before: number
  issue_count_after: number
  structural_issue_count_before: number
  invariant_issue_count_before: number
  structural_issue_count_after: number
  invariant_issue_count_after: number
  impacted_trade_count_after: number
  auto_cleaned_trade_ids: string[]
  emitted_alerts: TradeProjectionMonitoringAlertRecord[]
  emitted_deliveries: TradeProjectionMonitoringDeliveryRecord[]
  summary: string
  next_evaluation_at: string | null
}

export const externalDataSyncRouteByProvider = {
  EIA: 'eia',
  EIA_FUNDAMENTALS: 'eia-fundamentals',
  FRED: 'fred',
  ALPHA_VANTAGE: 'alpha-vantage',
  BLS_PPI: 'bls-ppi',
  WORLD_BANK: 'world-bank',
  USDA_NASS: 'usda-nass',
  EIA_WHOLESALE_POWER: 'eia-wholesale-power',
  CFTC: 'cftc',
  CAISO: 'caiso',
  ERCOT: 'ercot',
  MISO: 'miso',
  NYISO: 'nyiso',
  KALSHI: 'kalshi',
} as const satisfies Record<ExternalDataSyncProvider, string>

export function isExternalDataSyncProvider(provider: string): provider is ExternalDataSyncProvider {
  return Object.prototype.hasOwnProperty.call(externalDataSyncRouteByProvider, provider)
}

function adminMutationHeaders(): Headers {
  return buildMutationHeaders()
}

function authorizationHeaders(accessToken: string): Headers {
  return new Headers({ Authorization: `Bearer ${accessToken}` })
}

function adminIntegrationHeaders(accessToken?: string): Headers {
  return accessToken ? authorizationHeaders(accessToken) : adminMutationHeaders()
}

export async function loadAnthropicIntegrationSettings(
  apiBase: string,
  accessToken?: string,
): Promise<AnthropicRuntimeSettings> {
  return fetchJson<AnthropicRuntimeSettings>(`${apiBase}/admin/integrations/anthropic/settings`, {
    headers: adminIntegrationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function getAnthropicIntegrationApiKey(
  apiBase: string,
  accessToken?: string,
): Promise<AnthropicApiKeyLookup> {
  return fetchJson<AnthropicApiKeyLookup>(`${apiBase}/admin/integrations/anthropic/api-key`, {
    headers: adminIntegrationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function runExternalDataSync(
  apiBase: string,
  provider: ExternalDataSyncProvider,
  options?: {
    requestedBy?: string
    headers?: HeadersInit
  },
): Promise<ExternalDataRunRecord> {
  const requestedBy = options?.requestedBy ?? getMutationContext().actorId
  const headers = options?.headers ? new Headers(options.headers) : adminMutationHeaders()

  return postJson<ExternalDataRunRecord>(
    `${apiBase}/admin/external-data/${externalDataSyncRouteByProvider[provider]}/sync`,
    { requested_by: requestedBy },
    { headers },
  )
}

export async function previewCounterpartyCreditImport(
  apiBase: string,
  rows: unknown[],
  options?: { defaultLimitCurrencyCode?: string },
): Promise<CounterpartyCreditPreviewRecord> {
  return postJson<CounterpartyCreditPreviewRecord>(
    `${apiBase}/admin/external-data/dnb/counterparty-credit/preview`,
    {
      rows,
      default_limit_currency_code: options?.defaultLimitCurrencyCode ?? 'USD',
    },
    { headers: adminMutationHeaders() },
  )
}

export async function importCounterpartyCreditSnapshots(
  apiBase: string,
  snapshots: CounterpartyCreditSnapshotCandidate[],
): Promise<ExternalDataRunRecord> {
  const { actorId } = getMutationContext()

  return postJson<ExternalDataRunRecord>(
    `${apiBase}/admin/external-data/counterparty-credit/import`,
    {
      provider: 'DNB',
      snapshots,
      requested_by: actorId,
    },
    { headers: adminMutationHeaders() },
  )
}

export async function seedTradingSources(
  apiBase: string,
  options?: { replaceExisting?: boolean },
): Promise<TradingSourceSeedResult> {
  const { actorId } = getMutationContext()

  return postJson<TradingSourceSeedResult>(
    `${apiBase}/admin/trading-sources/seed`,
    {
      requested_by: actorId,
      replace_existing: options?.replaceExisting ?? true,
    },
    { headers: adminMutationHeaders() },
  )
}

export async function seedAssistantAgents(apiBase: string): Promise<AssistantAgentSeedResult> {
  const { actorId } = getMutationContext()

  return postJson<AssistantAgentSeedResult>(
    `${apiBase}/admin/data/assistant-agents/seed`,
    {
      requested_by: actorId,
    },
    { headers: adminMutationHeaders() },
  )
}

export async function loadCodexTaskSettings(apiBase: string): Promise<CodexTaskSettings> {
  return fetchJson<CodexTaskSettings>(`${apiBase}/admin/codex/settings`, {
    headers: adminMutationHeaders(),
    cache: 'no-store',
  })
}

export async function listCodexTasks(apiBase: string, options?: { limit?: number }): Promise<CodexTaskRecord[]> {
  const params = new URLSearchParams()
  if (typeof options?.limit === 'number') {
    params.set('limit', String(options.limit))
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return fetchJson<CodexTaskRecord[]>(`${apiBase}/admin/codex/tasks${suffix}`, {
    headers: adminMutationHeaders(),
    cache: 'no-store',
  })
}

export async function createCodexTask(
  apiBase: string,
  payload: CreateCodexTaskInput,
): Promise<CodexTaskRecord> {
  return postJson<CodexTaskRecord>(
    `${apiBase}/admin/codex/tasks`,
    {
      title: payload.title.trim(),
      prompt: payload.prompt.trim(),
      ...(payload.run_mode ? { run_mode: payload.run_mode } : {}),
      ...(typeof payload.max_iterations === 'number' ? { max_iterations: payload.max_iterations } : {}),
      ...(payload.continuation_prompt?.trim() ? { continuation_prompt: payload.continuation_prompt.trim() } : {}),
      ...(payload.target_ref?.trim() ? { target_ref: payload.target_ref.trim() } : {}),
    },
    {
      headers: adminMutationHeaders(),
    },
  )
}

export async function listDeterministicJobCatalog(apiBase: string): Promise<DeterministicJobCatalogEntry[]> {
  return fetchJson<DeterministicJobCatalogEntry[]>(
    `${apiBase}/admin/job-scheduling/catalog/deterministic-jobs`,
    {
      headers: adminMutationHeaders(),
      cache: 'no-store',
    },
  )
}

export async function listJobSchedules(
  apiBase: string,
  options?: { status?: JobScheduleStatus; triggerType?: JobTriggerType; limit?: number; offset?: number },
): Promise<JobScheduleRecord[]> {
  const params = new URLSearchParams()
  if (options?.status) {
    params.set('status', options.status)
  }
  if (options?.triggerType) {
    params.set('trigger_type', options.triggerType)
  }
  if (typeof options?.limit === 'number') {
    params.set('limit', String(options.limit))
  }
  if (typeof options?.offset === 'number') {
    params.set('offset', String(options.offset))
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''

  return fetchJson<JobScheduleRecord[]>(`${apiBase}/admin/job-scheduling/schedules${suffix}`, {
    headers: adminMutationHeaders(),
    cache: 'no-store',
  })
}

export async function createJobSchedule(
  apiBase: string,
  payload: CreateJobScheduleInput,
): Promise<JobScheduleRecord> {
  return postJson<JobScheduleRecord>(
    `${apiBase}/admin/job-scheduling/schedules`,
    {
      name: payload.name.trim(),
      ...(payload.description?.trim() ? { description: payload.description.trim() } : {}),
      trigger_type: payload.trigger_type,
      ...(payload.time_trigger ? { time_trigger: payload.time_trigger } : {}),
      ...(payload.event_trigger ? { event_trigger: payload.event_trigger } : {}),
      execution_plan: payload.execution_plan,
    },
    { headers: adminMutationHeaders() },
  )
}

export async function updateJobSchedule(
  apiBase: string,
  scheduleId: number,
  payload: UpdateJobScheduleInput,
): Promise<JobScheduleRecord> {
  return patchJson<JobScheduleRecord>(
    `${apiBase}/admin/job-scheduling/schedules/${scheduleId}`,
    {
      ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
      ...(payload.description !== undefined
        ? { description: payload.description?.trim() ? payload.description.trim() : null }
        : {}),
      ...(payload.status ? { status: payload.status } : {}),
      ...(payload.time_trigger !== undefined ? { time_trigger: payload.time_trigger } : {}),
      ...(payload.event_trigger !== undefined ? { event_trigger: payload.event_trigger } : {}),
      ...(payload.execution_plan ? { execution_plan: payload.execution_plan } : {}),
    },
    { headers: adminMutationHeaders() },
  )
}

export async function materializeDueJobRuns(
  apiBase: string,
  payload?: MaterializeDueJobRunsInput,
): Promise<JobRunBatchRecord> {
  return postJson<JobRunBatchRecord>(
    `${apiBase}/admin/job-scheduling/runs/materialize-due`,
    {
      ...(payload?.as_of ? { as_of: payload.as_of } : {}),
      ...(typeof payload?.limit === 'number' ? { limit: payload.limit } : {}),
    },
    { headers: adminMutationHeaders() },
  )
}

export async function enqueueEventJobRuns(
  apiBase: string,
  payload: EnqueueEventJobRunsInput,
): Promise<JobRunBatchRecord> {
  return postJson<JobRunBatchRecord>(
    `${apiBase}/admin/job-scheduling/runs/enqueue-event`,
    {
      event_source: payload.event_source.trim(),
      event_type: payload.event_type.trim(),
      ...(payload.event_ref?.trim() ? { event_ref: payload.event_ref.trim() } : {}),
      ...(payload.occurred_at ? { occurred_at: payload.occurred_at } : {}),
      event_payload: payload.event_payload ?? {},
      ...(typeof payload.limit === 'number' ? { limit: payload.limit } : {}),
    },
    { headers: adminMutationHeaders() },
  )
}

export async function listJobRuns(
  apiBase: string,
  options?: { scheduleId?: number; status?: JobRunStatus; limit?: number; offset?: number },
): Promise<JobRunRecord[]> {
  const params = new URLSearchParams()
  if (typeof options?.scheduleId === 'number') {
    params.set('schedule_id', String(options.scheduleId))
  }
  if (options?.status) {
    params.set('status', options.status)
  }
  if (typeof options?.limit === 'number') {
    params.set('limit', String(options.limit))
  }
  if (typeof options?.offset === 'number') {
    params.set('offset', String(options.offset))
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''

  return fetchJson<JobRunRecord[]>(`${apiBase}/admin/job-scheduling/runs${suffix}`, {
    headers: adminMutationHeaders(),
    cache: 'no-store',
  })
}

export async function updateJobRunStatus(
  apiBase: string,
  runId: number,
  payload: UpdateJobRunStatusInput,
): Promise<JobRunRecord> {
  return patchJson<JobRunRecord>(
    `${apiBase}/admin/job-scheduling/runs/${runId}/status`,
    {
      status: payload.status,
      ...(payload.result ? { result: payload.result } : {}),
      ...(payload.action_request_ids ? { action_request_ids: payload.action_request_ids } : {}),
      ...(payload.error_detail?.trim() ? { error_detail: payload.error_detail.trim() } : {}),
    },
    { headers: adminMutationHeaders() },
  )
}

export async function loadTradeProjectionMonitoring(
  apiBase: string,
  accessToken: string,
): Promise<TradeProjectionMonitoringAdminRecord> {
  return fetchJson<TradeProjectionMonitoringAdminRecord>(`${apiBase}/admin/data/projection-monitoring`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function saveTradeProjectionMonitoring(
  apiBase: string,
  accessToken: string,
  document: TradeProjectionMonitoringDocument,
  updatedBy: string,
): Promise<TradeProjectionMonitoringAdminRecord> {
  return putJson<TradeProjectionMonitoringAdminRecord>(
    `${apiBase}/admin/data/projection-monitoring`,
    {
      document,
      updated_by: updatedBy,
    },
    {
      headers: authorizationHeaders(accessToken),
    },
  )
}

export async function runTradeProjectionMonitoring(
  apiBase: string,
  options?: { force?: boolean },
): Promise<TradeProjectionMonitoringRunResult> {
  const { actorId } = getMutationContext()

  return postJson<TradeProjectionMonitoringRunResult>(
    `${apiBase}/admin/data/projection-monitoring/run`,
    {
      requested_by: actorId,
      force: options?.force ?? true,
    },
    { headers: adminMutationHeaders() },
  )
}

export async function runNwsWeatherSync(apiBase: string): Promise<ExternalDataRunRecord> {
  const { actorId } = getMutationContext()

  return postJson<ExternalDataRunRecord>(
    `${apiBase}/admin/weather/sync/nws`,
    { requested_by: actorId },
    { headers: adminMutationHeaders() },
  )
}
