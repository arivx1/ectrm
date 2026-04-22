import { fetchJson, patchJson, postJson, requestOk } from '../../shared/api'
import type {
  PreTradeGovernanceAuditExportRecord,
  PreTradeGovernanceItemsRecord,
  PreTradeGovernanceSummaryRecord,
  PreTradeRecommendationSourceAdapterRecord,
  PreTradeRecommendationRunRecord,
  PreTradeRecommendationSourceSnapshotRecord,
  PreTradeReviewItemRecord,
  PreTradeReviewStatus,
  PreTradeScenarioDraft,
  PreTradeScenarioRecord,
} from '../../shared/models'

function authorizationHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` }
}

export type CreatePreTradeScenarioPayload = {
  name: string
  thesis?: string | null
  draft: PreTradeScenarioDraft
}

export type UpdatePreTradeScenarioPayload = {
  name?: string | null
  thesis?: string | null
  draft?: PreTradeScenarioDraft
}

export type CreatePreTradeReviewItemPayload = {
  name: string
  thesis?: string | null
  draft: PreTradeScenarioDraft
  source_scenario_id?: number | null
  recommendation_run_id?: number | null
  owner?: string | null
  due_at?: string | null
  review_notes?: string | null
}

export type UpdatePreTradeReviewItemPayload = {
  name?: string | null
  thesis?: string | null
  draft?: PreTradeScenarioDraft
  recommendation_run_id?: number | null
  recommendation_override_reason?: string | null
  review_status?: PreTradeReviewStatus
  owner?: string | null
  due_at?: string | null
  review_notes?: string | null
  activity_comment?: string | null
}

export type CreatePreTradeReviewActivityPayload = {
  comment: string
}

export type CreatePreTradeRecommendationRunPayload = {
  name?: string | null
  thesis?: string | null
  draft?: PreTradeScenarioDraft | null
  source_scenario_id?: number | null
  source_review_id?: number | null
  input_snapshots?: PreTradeRecommendationSourceSnapshotRecord[]
}

export async function loadPreTradeScenarios(
  apiBase: string,
  accessToken: string,
): Promise<PreTradeScenarioRecord[]> {
  return fetchJson<PreTradeScenarioRecord[]>(`${apiBase}/pretrade/scenarios`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function createPreTradeScenario(
  apiBase: string,
  accessToken: string,
  payload: CreatePreTradeScenarioPayload,
): Promise<PreTradeScenarioRecord> {
  return postJson<PreTradeScenarioRecord>(`${apiBase}/pretrade/scenarios`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function updatePreTradeScenario(
  apiBase: string,
  accessToken: string,
  scenarioId: number,
  payload: UpdatePreTradeScenarioPayload,
): Promise<PreTradeScenarioRecord> {
  return patchJson<PreTradeScenarioRecord>(`${apiBase}/pretrade/scenarios/${scenarioId}`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function deletePreTradeScenario(
  apiBase: string,
  accessToken: string,
  scenarioId: number,
): Promise<void> {
  await requestOk(`${apiBase}/pretrade/scenarios/${scenarioId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  })
}

export async function loadPreTradeReviewItems(
  apiBase: string,
  accessToken: string,
): Promise<PreTradeReviewItemRecord[]> {
  return fetchJson<PreTradeReviewItemRecord[]>(`${apiBase}/pretrade/reviews`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function loadPreTradeGovernanceSummary(
  apiBase: string,
  accessToken: string,
): Promise<PreTradeGovernanceSummaryRecord> {
  return fetchJson<PreTradeGovernanceSummaryRecord>(`${apiBase}/pretrade/governance/summary`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function loadPreTradeGovernanceItems(
  apiBase: string,
  accessToken: string,
): Promise<PreTradeGovernanceItemsRecord> {
  return fetchJson<PreTradeGovernanceItemsRecord>(`${apiBase}/pretrade/governance/items`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function loadPreTradeGovernanceAuditExport(
  apiBase: string,
  accessToken: string,
): Promise<PreTradeGovernanceAuditExportRecord> {
  return fetchJson<PreTradeGovernanceAuditExportRecord>(`${apiBase}/pretrade/governance/export`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function loadPreTradeRecommendationSourceAdapters(
  apiBase: string,
  accessToken: string,
): Promise<PreTradeRecommendationSourceAdapterRecord[]> {
  return fetchJson<PreTradeRecommendationSourceAdapterRecord[]>(`${apiBase}/pretrade/recommendations/source-adapters`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function loadPreTradeRecommendationRuns(
  apiBase: string,
  accessToken: string,
  params: { sourceScenarioId?: number | null; sourceReviewId?: number | null; limit?: number } = {},
): Promise<PreTradeRecommendationRunRecord[]> {
  const searchParams = new URLSearchParams()
  if (params.sourceScenarioId) {
    searchParams.set('source_scenario_id', String(params.sourceScenarioId))
  }
  if (params.sourceReviewId) {
    searchParams.set('source_review_id', String(params.sourceReviewId))
  }
  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }
  const query = searchParams.toString()
  return fetchJson<PreTradeRecommendationRunRecord[]>(`${apiBase}/pretrade/recommendations/runs${query ? `?${query}` : ''}`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function loadPreTradeRecommendationRun(
  apiBase: string,
  accessToken: string,
  runId: number,
): Promise<PreTradeRecommendationRunRecord> {
  return fetchJson<PreTradeRecommendationRunRecord>(`${apiBase}/pretrade/recommendations/runs/${runId}`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function loadPreTradeReviewItem(
  apiBase: string,
  accessToken: string,
  reviewId: number,
): Promise<PreTradeReviewItemRecord> {
  return fetchJson<PreTradeReviewItemRecord>(`${apiBase}/pretrade/reviews/${reviewId}`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function createPreTradeReviewItem(
  apiBase: string,
  accessToken: string,
  payload: CreatePreTradeReviewItemPayload,
): Promise<PreTradeReviewItemRecord> {
  return postJson<PreTradeReviewItemRecord>(`${apiBase}/pretrade/reviews`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function updatePreTradeReviewItem(
  apiBase: string,
  accessToken: string,
  reviewId: number,
  payload: UpdatePreTradeReviewItemPayload,
): Promise<PreTradeReviewItemRecord> {
  return patchJson<PreTradeReviewItemRecord>(`${apiBase}/pretrade/reviews/${reviewId}`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function createPreTradeReviewActivity(
  apiBase: string,
  accessToken: string,
  reviewId: number,
  payload: CreatePreTradeReviewActivityPayload,
): Promise<PreTradeReviewItemRecord> {
  return postJson<PreTradeReviewItemRecord>(`${apiBase}/pretrade/reviews/${reviewId}/activity`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function createPreTradeRecommendationRun(
  apiBase: string,
  accessToken: string,
  payload: CreatePreTradeRecommendationRunPayload,
): Promise<PreTradeRecommendationRunRecord> {
  return postJson<PreTradeRecommendationRunRecord>(`${apiBase}/pretrade/recommendations/runs`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}
