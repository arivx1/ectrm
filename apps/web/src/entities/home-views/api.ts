import { fetchJson, patchJson, postJson, requestOk } from '../../shared/api'
import type { AssistantPersona } from '../../shared/models'
import type {
  PromptHomeCardKey,
  PromptHomeCardKind,
  PromptHomeCardPlacement,
  PromptHomeTemplateCard,
} from '../../workspaces/prompt/promptHomeCards'

function authorizationHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` }
}

export type HomeViewCardPlacementPayload = {
  order: number
  column_span: PromptHomeCardPlacement['columnSpan']
  row_span: PromptHomeCardPlacement['rowSpan']
  collapsed_column_span?: PromptHomeCardPlacement['collapsedColumnSpan']
  collapsed_row_span?: PromptHomeCardPlacement['collapsedRowSpan']
  expanded_column_span?: PromptHomeCardPlacement['expandedColumnSpan']
  expanded_row_span?: PromptHomeCardPlacement['expandedRowSpan']
}

export type HomeViewCardPayload = {
  instance_id: string
  card_id: PromptHomeCardKey
  kind?: PromptHomeCardKind | null
  label?: string | null
  visible: boolean
  placement: HomeViewCardPlacementPayload
  parameters: Record<string, unknown>
  filters: Record<string, unknown>
  data_bindings: string[]
}

export type HomeViewDefinition = {
  definition_id: number
  definition_key: string
  name: string
  scope: 'PERSONAL' | 'TEAM' | 'ORGANIZATION'
  scope_owner_key: string
  base_template_key: 'system_home'
  base_template_version: 1
  persona_hint: AssistantPersona | null
  cards: HomeViewCardPayload[]
  global_filters: Record<string, unknown>
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED'
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
  can_edit: boolean
  can_duplicate: boolean
  can_publish: boolean
  can_retire: boolean
  can_restore: boolean
  is_shared: boolean
  validation_warnings: string[]
}

export type HomeViewSystemTemplate = {
  template_key: 'system_home'
  template_version: 1
  label: string
  immutable: true
  cards: HomeViewCardPayload[]
}

export type HomeViewDefinitionCreatePayload = {
  name: string
  scope: 'PERSONAL'
  base_template_key: 'system_home'
  base_template_version: 1
  persona_hint?: AssistantPersona | null
  cards: HomeViewCardPayload[]
  global_filters: Record<string, unknown>
}

export type HomeViewDefinitionUpdatePayload = {
  name?: string
  persona_hint?: AssistantPersona | null
  cards?: HomeViewCardPayload[]
  global_filters?: Record<string, unknown>
}

export type HomeViewDefinitionPublishPayload = {
  name?: string
  scope: 'TEAM' | 'ORGANIZATION'
  team_key?: string | null
}

export type HomeViewDefinitionDuplicatePayload = {
  name?: string
}

export function toHomeViewCardPayload(card: PromptHomeTemplateCard): HomeViewCardPayload {
  return {
    instance_id: card.instanceId,
    card_id: card.cardId,
    visible: card.visible,
    placement: {
      order: card.placement.order,
      column_span: card.placement.columnSpan,
      row_span: card.placement.rowSpan,
      collapsed_column_span: card.placement.collapsedColumnSpan,
      collapsed_row_span: card.placement.collapsedRowSpan,
      expanded_column_span: card.placement.expandedColumnSpan,
      expanded_row_span: card.placement.expandedRowSpan,
    },
    parameters: { ...card.parameters },
    filters: { ...card.filters },
    data_bindings: [...card.dataBindings],
  }
}

export function homeViewCardPayloadToPromptHomeCard(card: HomeViewCardPayload): Record<string, unknown> {
  const placement: Record<string, unknown> = {
    order: card.placement.order,
    columnSpan: card.placement.column_span,
    rowSpan: card.placement.row_span,
  }
  if (card.placement.collapsed_column_span !== undefined) {
    placement.collapsedColumnSpan = card.placement.collapsed_column_span
  }
  if (card.placement.collapsed_row_span !== undefined) {
    placement.collapsedRowSpan = card.placement.collapsed_row_span
  }
  if (card.placement.expanded_column_span !== undefined) {
    placement.expandedColumnSpan = card.placement.expanded_column_span
  }
  if (card.placement.expanded_row_span !== undefined) {
    placement.expandedRowSpan = card.placement.expanded_row_span
  }

  return {
    instanceId: card.instance_id ?? card.card_id,
    cardId: card.card_id,
    kind: card.kind ?? undefined,
    label: card.label ?? undefined,
    visible: card.visible,
    placement,
    parameters: { ...card.parameters },
    filters: { ...card.filters },
    dataBindings: [...card.data_bindings],
  }
}

export async function loadHomeViewSystemTemplate(
  apiBase: string,
  accessToken: string,
): Promise<HomeViewSystemTemplate> {
  return fetchJson<HomeViewSystemTemplate>(`${apiBase}/home-view-definitions/system-template`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function listHomeViewDefinitions(
  apiBase: string,
  accessToken: string,
): Promise<HomeViewDefinition[]> {
  return fetchJson<HomeViewDefinition[]>(`${apiBase}/home-view-definitions`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function listAdminHomeViewDefinitions(
  apiBase: string,
  accessToken: string,
): Promise<HomeViewDefinition[]> {
  return fetchJson<HomeViewDefinition[]>(`${apiBase}/home-view-definitions/admin/inventory`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function createHomeViewDefinition(
  apiBase: string,
  accessToken: string,
  payload: HomeViewDefinitionCreatePayload,
): Promise<HomeViewDefinition> {
  return postJson<HomeViewDefinition>(`${apiBase}/home-view-definitions`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function updateHomeViewDefinition(
  apiBase: string,
  accessToken: string,
  definitionId: number,
  payload: HomeViewDefinitionUpdatePayload,
): Promise<HomeViewDefinition> {
  return patchJson<HomeViewDefinition>(`${apiBase}/home-view-definitions/${definitionId}`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function resetHomeViewDefinition(
  apiBase: string,
  accessToken: string,
  definitionId: number,
): Promise<HomeViewDefinition> {
  return postJson<HomeViewDefinition>(
    `${apiBase}/home-view-definitions/${definitionId}/reset`,
    {},
    {
      headers: authorizationHeaders(accessToken),
    },
  )
}

export async function publishHomeViewDefinition(
  apiBase: string,
  accessToken: string,
  definitionId: number,
  payload: HomeViewDefinitionPublishPayload,
): Promise<HomeViewDefinition> {
  return postJson<HomeViewDefinition>(
    `${apiBase}/home-view-definitions/${definitionId}/publish`,
    payload,
    {
      headers: authorizationHeaders(accessToken),
    },
  )
}

export async function duplicateHomeViewDefinition(
  apiBase: string,
  accessToken: string,
  definitionId: number,
  payload: HomeViewDefinitionDuplicatePayload,
): Promise<HomeViewDefinition> {
  return postJson<HomeViewDefinition>(
    `${apiBase}/home-view-definitions/${definitionId}/duplicate`,
    payload,
    {
      headers: authorizationHeaders(accessToken),
    },
  )
}

export async function retireHomeViewDefinition(
  apiBase: string,
  accessToken: string,
  definitionId: number,
): Promise<HomeViewDefinition> {
  return postJson<HomeViewDefinition>(
    `${apiBase}/home-view-definitions/${definitionId}/retire`,
    {},
    {
      headers: authorizationHeaders(accessToken),
    },
  )
}

export async function restoreHomeViewDefinition(
  apiBase: string,
  accessToken: string,
  definitionId: number,
): Promise<HomeViewDefinition> {
  return postJson<HomeViewDefinition>(
    `${apiBase}/home-view-definitions/${definitionId}/restore`,
    {},
    {
      headers: authorizationHeaders(accessToken),
    },
  )
}

export async function deleteHomeViewDefinition(
  apiBase: string,
  accessToken: string,
  definitionId: number,
): Promise<void> {
  await requestOk(`${apiBase}/home-view-definitions/${definitionId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  })
}
