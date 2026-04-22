import { fetchJson, postJson, putJson } from '../../shared/api'
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

const externalDataSyncRouteByProvider = {
  EIA: 'eia',
  EIA_FUNDAMENTALS: 'eia-fundamentals',
  FRED: 'fred',
  CFTC: 'cftc',
  CAISO: 'caiso',
  ERCOT: 'ercot',
  KALSHI: 'kalshi',
} as const satisfies Record<ExternalDataSyncProvider, string>

function adminMutationHeaders(): Headers {
  return buildMutationHeaders()
}

function authorizationHeaders(accessToken: string): Headers {
  return new Headers({ Authorization: `Bearer ${accessToken}` })
}

export async function runExternalDataSync(
  apiBase: string,
  provider: ExternalDataSyncProvider,
): Promise<ExternalDataRunRecord> {
  const { actorId } = getMutationContext()

  return postJson<ExternalDataRunRecord>(
    `${apiBase}/admin/external-data/${externalDataSyncRouteByProvider[provider]}/sync`,
    { requested_by: actorId },
    { headers: adminMutationHeaders() },
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
