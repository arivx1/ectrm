import { fetchJson, patchJson, postJson, requestOk } from '../../shared/api'
import type {
  PreTradeGovernanceAuditExportRecord,
  PreTradeHedgeRecommendationRecord,
  PreTradeGovernanceItemsRecord,
  PreTradeMarketOpportunityRecord,
  PreTradeNettingSetRecord,
  PreTradePromotionOutcomeSummaryRecord,
  PreTradeRecommendationDraftAnalysisRecord,
  PreTradeGovernanceSummaryRecord,
  PreTradeRecommendationSourceAdapterRecord,
  PreTradeRecommendationRunRecord,
  PreTradeRecommendationSourceSnapshotRecord,
  PreTradeReviewDriftRecord,
  PreTradeReviewItemRecord,
  PreTradeReviewStatus,
  PreTradeRiskScenarioRecord,
  PreTradeScenarioDraft,
  PreTradeScenarioEnrichmentRecord,
  PreTradeScenarioRecord,
} from '../../shared/models'

function authorizationHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` }
}

export type CreatePreTradeScenarioPayload = {
  name: string
  thesis?: string | null
  draft: PreTradeScenarioDraft
  enrichment?: PreTradeScenarioEnrichmentRecord | null
}

export type UpdatePreTradeScenarioPayload = {
  name?: string | null
  thesis?: string | null
  draft?: PreTradeScenarioDraft
  enrichment?: PreTradeScenarioEnrichmentRecord | null
}

export type CreatePreTradeReviewItemPayload = {
  name: string
  thesis?: string | null
  draft: PreTradeScenarioDraft
  source_scenario_id?: number | null
  recommendation_run_id?: number | null
  enrichment?: PreTradeScenarioEnrichmentRecord | null
  owner?: string | null
  due_at?: string | null
  review_notes?: string | null
}

export type UpdatePreTradeReviewItemPayload = {
  name?: string | null
  thesis?: string | null
  draft?: PreTradeScenarioDraft
  recommendation_run_id?: number | null
  enrichment?: PreTradeScenarioEnrichmentRecord | null
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

export type AnalyzePreTradeRecommendationDraftPayload = {
  thesis?: string | null
  draft: PreTradeScenarioDraft
  source_scenario_id?: number | null
  source_review_id?: number | null
  input_snapshots?: PreTradeRecommendationSourceSnapshotRecord[]
}

export type PromotePreTradeNettingSetPayload = {
  owner?: string | null
  review_note?: string | null
}

export type PromotePreTradeHedgeRecommendationPayload = {
  owner?: string | null
  review_note?: string | null
}

export type PromotePreTradeRiskScenarioPayload = {
  owner?: string | null
  review_note?: string | null
}

export type PromotePreTradeMarketOpportunityPayload = {
  owner?: string | null
  review_note?: string | null
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

export async function loadPreTradePromotionOutcomes(
  apiBase: string,
  accessToken: string,
): Promise<PreTradePromotionOutcomeSummaryRecord> {
  return fetchJson<PreTradePromotionOutcomeSummaryRecord>(`${apiBase}/pretrade/promotion-outcomes`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function loadPreTradeNettingSets(
  apiBase: string,
  accessToken: string,
): Promise<PreTradeNettingSetRecord[]> {
  return fetchJson<PreTradeNettingSetRecord[]>(`${apiBase}/pretrade/netting-sets`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function promotePreTradeNettingSetFromGovernance(
  apiBase: string,
  accessToken: string,
  payload: PromotePreTradeNettingSetPayload = {},
): Promise<PreTradeNettingSetRecord> {
  return postJson<PreTradeNettingSetRecord>(`${apiBase}/pretrade/netting-sets/from-promotion`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function loadPreTradeHedgeRecommendations(
  apiBase: string,
  accessToken: string,
): Promise<PreTradeHedgeRecommendationRecord[]> {
  return fetchJson<PreTradeHedgeRecommendationRecord[]>(`${apiBase}/pretrade/hedge-recommendations`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function promotePreTradeHedgeRecommendationFromGovernance(
  apiBase: string,
  accessToken: string,
  payload: PromotePreTradeHedgeRecommendationPayload = {},
): Promise<PreTradeHedgeRecommendationRecord> {
  return postJson<PreTradeHedgeRecommendationRecord>(`${apiBase}/pretrade/hedge-recommendations/from-promotion`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function loadPreTradeRiskScenarios(
  apiBase: string,
  accessToken: string,
): Promise<PreTradeRiskScenarioRecord[]> {
  return fetchJson<PreTradeRiskScenarioRecord[]>(`${apiBase}/pretrade/risk-scenarios`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function promotePreTradeRiskScenarioFromGovernance(
  apiBase: string,
  accessToken: string,
  payload: PromotePreTradeRiskScenarioPayload = {},
): Promise<PreTradeRiskScenarioRecord> {
  return postJson<PreTradeRiskScenarioRecord>(`${apiBase}/pretrade/risk-scenarios/from-promotion`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function loadPreTradeMarketOpportunities(
  apiBase: string,
  accessToken: string,
): Promise<PreTradeMarketOpportunityRecord[]> {
  return fetchJson<PreTradeMarketOpportunityRecord[]>(`${apiBase}/pretrade/market-opportunities`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function promotePreTradeMarketOpportunityFromGovernance(
  apiBase: string,
  accessToken: string,
  payload: PromotePreTradeMarketOpportunityPayload = {},
): Promise<PreTradeMarketOpportunityRecord> {
  return postJson<PreTradeMarketOpportunityRecord>(`${apiBase}/pretrade/market-opportunities/from-promotion`, payload, {
    headers: authorizationHeaders(accessToken),
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

export async function loadPreTradeReviewDrift(
  apiBase: string,
  accessToken: string,
  reviewId: number,
): Promise<PreTradeReviewDriftRecord> {
  return fetchJson<PreTradeReviewDriftRecord>(`${apiBase}/pretrade/reviews/${reviewId}/drift`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function analyzePreTradeRecommendationDraft(
  apiBase: string,
  accessToken: string,
  payload: AnalyzePreTradeRecommendationDraftPayload,
): Promise<PreTradeRecommendationDraftAnalysisRecord> {
  return postJson<PreTradeRecommendationDraftAnalysisRecord>(
    `${apiBase}/pretrade/recommendations/draft-analysis`,
    payload,
    {
      headers: authorizationHeaders(accessToken),
    },
  )
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
