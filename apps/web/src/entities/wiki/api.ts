import { fetchJson, patchJson, postJson } from '../../shared/api'

export type WikiPageRevision = {
  revision_id: number
  version: number
  parent_page_id: string | null
  title: string
  sort_order: number
  change_summary: string[]
  created_at: string
  created_by: string
  restored_from_revision_id: number | null
}

export type WikiPageSummary = {
  page_id: string
  parent_page_id: string | null
  title: string
  summary: string
  child_count: number
  word_count: number
  sort_order: number
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

export type WikiPageDetail = WikiPageSummary & {
  content_markdown: string
  recent_revisions: WikiPageRevision[]
}

export type WikiPageIndex = {
  pages: WikiPageSummary[]
}

type WikiPageCreatePayload = {
  title: string
  parent_page_id: string | null
  content_markdown: string
}

type WikiPageUpdatePayload = {
  title: string
  parent_page_id: string | null
  content_markdown: string
}

function authorizationHeaders(accessToken: string): Headers {
  return new Headers({ Authorization: `Bearer ${accessToken}` })
}

export async function loadWikiPageIndex(apiBase: string, accessToken: string): Promise<WikiPageIndex> {
  return fetchJson<WikiPageIndex>(`${apiBase}/wiki/pages`, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function loadWikiPageDetail(
  apiBase: string,
  accessToken: string,
  pageId: string,
): Promise<WikiPageDetail> {
  return fetchJson<WikiPageDetail>(`${apiBase}/wiki/pages/${pageId}`, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function createWikiPage(
  apiBase: string,
  accessToken: string,
  payload: WikiPageCreatePayload,
): Promise<WikiPageDetail> {
  return postJson<WikiPageDetail>(`${apiBase}/wiki/pages`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function updateWikiPage(
  apiBase: string,
  accessToken: string,
  pageId: string,
  payload: WikiPageUpdatePayload,
): Promise<WikiPageDetail> {
  return patchJson<WikiPageDetail>(`${apiBase}/wiki/pages/${pageId}`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function restoreWikiPageRevision(
  apiBase: string,
  accessToken: string,
  pageId: string,
  revisionId: number,
  restoredBy: string,
): Promise<WikiPageDetail> {
  return postJson<WikiPageDetail>(
    `${apiBase}/wiki/pages/${pageId}/revisions/${revisionId}/restore`,
    { restored_by: restoredBy },
    {
      headers: authorizationHeaders(accessToken),
    },
  )
}
