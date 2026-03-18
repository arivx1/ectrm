import type { ViewKey } from '../../shared/models'
import { fetchJson, putJson } from '../../shared/api'

export type RoadmapStatus = 'planned' | 'in_progress' | 'blocked' | 'shipped'
export type RoadmapHorizonKey = 'now' | 'next' | 'later'

export type RoadmapLink = {
  label: string
  view: Exclude<ViewKey, 'guide'>
}

export type RoadmapItem = {
  id: string
  title: string
  summary: string
  status: RoadmapStatus
  horizon: RoadmapHorizonKey
  owner: string
  target: string
  source_ids: string[]
  links: RoadmapLink[]
}

export type RoadmapPhase = {
  id: string
  title: string
  priority: string
  summary: string
  items: RoadmapItem[]
}

export type RoadmapMilestone = {
  id: string
  title: string
  summary: string
  owner: string
  target: string
  item_ids: string[]
  exit_criteria: string[]
  links: RoadmapLink[]
}

export type RoadmapHorizon = {
  key: RoadmapHorizonKey
  label: string
  detail: string
}

export type RoadmapDocumentData = {
  source_path: string
  horizons: RoadmapHorizon[]
  phases: RoadmapPhase[]
  milestones: RoadmapMilestone[]
}

export type AdminRoadmapDocumentData = {
  document: RoadmapDocumentData
  updated_at: string | null
  updated_by: string | null
  version: number
  is_default: boolean
  recent_revisions: RoadmapRevision[]
}

export type RoadmapRevision = {
  revision_id: number
  version: number
  created_at: string
  created_by: string
  change_summary: string[]
  restored_from_revision_id: number | null
}

function authorizationHeaders(accessToken: string): Headers {
  return new Headers({ Authorization: `Bearer ${accessToken}` })
}

export async function loadRoadmapDocument(apiBase: string): Promise<RoadmapDocumentData> {
  return fetchJson<RoadmapDocumentData>(`${apiBase}/roadmap`)
}

export async function loadAdminRoadmapDocument(
  apiBase: string,
  accessToken: string,
): Promise<AdminRoadmapDocumentData> {
  return fetchJson<AdminRoadmapDocumentData>(`${apiBase}/admin/roadmap`, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function saveAdminRoadmapDocument(
  apiBase: string,
  accessToken: string,
  document: RoadmapDocumentData,
  updatedBy: string,
): Promise<AdminRoadmapDocumentData> {
  return putJson<AdminRoadmapDocumentData>(
    `${apiBase}/admin/roadmap`,
    { document, updated_by: updatedBy },
    { headers: authorizationHeaders(accessToken) },
  )
}

export async function restoreAdminRoadmapRevision(
  apiBase: string,
  accessToken: string,
  revisionId: number,
  updatedBy: string,
): Promise<AdminRoadmapDocumentData> {
  return fetchJson<AdminRoadmapDocumentData>(`${apiBase}/admin/roadmap/revisions/${revisionId}/restore`, {
    method: 'POST',
    headers: new Headers({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ updated_by: updatedBy }),
  })
}
