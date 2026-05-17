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

export type WikiPageLink = {
  label: string
  target: string
}

export type WikiPageSummary = {
  page_id: string
  parent_page_id: string | null
  title: string
  summary: string
  links: WikiPageLink[]
  child_count: number
  word_count: number
  sort_order: number
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  is_archived: boolean
  archived_at: string | null
  archived_by: string | null
  version: number
}

export type WikiPageDetail = WikiPageSummary & {
  content_markdown: string
  recent_revisions: WikiPageRevision[]
}

export type WikiPageIndex = {
  pages: WikiPageSummary[]
}

export type WikiPageSearchResult = {
  page: WikiPageSummary
  score: number
  snippet: string
  matched_terms: string[]
  match_reasons: string[]
}

export type WikiPageSearchIndex = {
  query: string
  result_count: number
  results: WikiPageSearchResult[]
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

export async function loadWikiPageIndex(
  apiBase: string,
  accessToken: string,
  options: {
    includeArchived?: boolean
  } = {},
): Promise<WikiPageIndex> {
  const searchParams = new URLSearchParams()
  if (options.includeArchived) {
    searchParams.set('include_archived', 'true')
  }

  return fetchJson<WikiPageIndex>(`${apiBase}/wiki/pages${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`, {
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

export async function searchWikiPages(
  apiBase: string,
  accessToken: string,
  query: string,
  options: {
    includeArchived?: boolean
    limit?: number
  } = {},
): Promise<WikiPageSearchIndex> {
  const searchParams = new URLSearchParams({ q: query })
  if (options.includeArchived) {
    searchParams.set('include_archived', 'true')
  }
  if (typeof options.limit === 'number') {
    searchParams.set('limit', String(options.limit))
  }

  return fetchJson<WikiPageSearchIndex>(`${apiBase}/wiki/pages/search?${searchParams.toString()}`, {
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

export async function archiveWikiPage(
  apiBase: string,
  accessToken: string,
  pageId: string,
): Promise<WikiPageDetail> {
  return postJson<WikiPageDetail>(`${apiBase}/wiki/pages/${pageId}/archive`, {}, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function restoreArchivedWikiPage(
  apiBase: string,
  accessToken: string,
  pageId: string,
): Promise<WikiPageDetail> {
  return postJson<WikiPageDetail>(`${apiBase}/wiki/pages/${pageId}/unarchive`, {}, {
    headers: authorizationHeaders(accessToken),
  })
}
