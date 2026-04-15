import { fetchJson, patchJson, postJson, requestOk } from '../../shared/api'
import type {
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
  owner?: string | null
  due_at?: string | null
  review_notes?: string | null
}

export type UpdatePreTradeReviewItemPayload = {
  name?: string | null
  thesis?: string | null
  draft?: PreTradeScenarioDraft
  review_status?: PreTradeReviewStatus
  owner?: string | null
  due_at?: string | null
  review_notes?: string | null
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
