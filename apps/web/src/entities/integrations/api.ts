import { fetchJson, postJson, requestOk } from '../../shared/api'

function authorizationHeaders(accessToken: string): Headers {
  return new Headers({ Authorization: `Bearer ${accessToken}` })
}

export type AttioClientMatchedRecord = {
  object_slug: 'companies'
  record_id: string
  label: string
  web_url: string | null
  domains: string[]
  description: string | null
  status: string | null
}

export type AttioClientContactRecord = {
  record_id: string
  name: string
  title: string | null
  email: string | null
  phone: string | null
  web_url: string | null
}

export type AttioClientDealRecord = {
  record_id: string
  name: string
  stage: string | null
  value: string | null
  close_date: string | null
  disqualification_reason: string | null
  web_url: string | null
}

export type AttioClientEnrichmentRecord = {
  provider: 'attio_rest_api'
  configured: boolean
  client_name: string
  matched: boolean
  match_basis: 'exact_name' | 'search' | 'none'
  company: AttioClientMatchedRecord | null
  contacts: AttioClientContactRecord[]
  deals: AttioClientDealRecord[]
  required_scopes: string[]
  warnings: string[]
}

export type NexusClientType = 'Client' | 'Churned' | 'Prospect' | 'Other'

export type AttioSyncedClientRecord = {
  object_slug: 'companies'
  record_id: string
  name: string
  type: NexusClientType
  relationship?: string
  deal_count: number
  closed_deal_count: number
  open_deal_count: number
  deal_statuses: string[]
  disqualified_deal_count: number
  lost_deal_count: number
  on_hold_deal_count: number
  disqualification_reason: string | null
  total_arr: string | null
  closed_arr: string | null
  open_arr: string | null
  web_url: string | null
  domains: string[]
  description: string | null
  status: string | null
}

export type AttioClientSyncRecord = {
  provider: 'attio_rest_api'
  configured: boolean
  object_slug: 'companies'
  requested_limit: number
  scanned_record_count: number
  skipped_record_count: number
  returned_client_count: number
  clients: AttioSyncedClientRecord[]
  required_scopes: string[]
  warnings: string[]
}

export type NexusContactSource = 'manual' | 'attio'

export type NexusContactRecord = {
  contact_id: string
  client_name: string
  name: string
  title: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
  time_at_role: string | null
  previous_role: string | null
  university: string | null
  university_2: string | null
  location: string | null
  email: string | null
  phone: string | null
  web_url: string | null
  source: NexusContactSource
  external_provider: string | null
  external_record_id: string | null
  created_at: string
  updated_at: string
  version: number
}

export type NotionClientPageRecord = {
  object: 'page'
  page_id: string
  title: string | null
  url: string | null
  created_time?: string | null
  last_edited_time?: string | null
  parent_type?: string | null
  relevance_confidence?: number | null
  relevance_basis?: string[] | null
}

export type NotionClientPagesRecord = {
  provider: 'notion_api'
  configured: boolean
  client_name: string
  query: string
  matched: boolean
  confidence_threshold: number
  candidate_page_count: number
  rejected_page_count: number
  returned_page_count: number
  has_more: boolean
  pages: NotionClientPageRecord[]
  required_capabilities: string[]
  warnings: string[]
}

export type GrainRecordingSummaryRecord = {
  id: string
  title: string | null
  url: string | null
  source: string | null
  media_type: string | null
  start_time: string | null
  end_time: string | null
  duration_seconds: number | null
  participant_count: number | null
}

export type GrainClientRecordingsRecord = {
  provider: 'grain_api'
  configured: boolean
  client_name: string
  query: string
  matched: boolean
  recording_count: number
  returned_recording_count: number
  cursor: string | null
  recordings: GrainRecordingSummaryRecord[]
  required_capabilities: string[]
  warnings: string[]
}

export type LinearIssueSummaryRecord = {
  id: string
  identifier: string
  title: string
  url: string | null
  description: string | null
  priority: number | null
  priority_label: string | null
  state_name: string | null
  state_type: string | null
  team_key: string | null
  team_name: string | null
  assignee_name: string | null
  assignee_email: string | null
  project_name: string | null
  project_url: string | null
  label_names: string[]
  created_at: string | null
  updated_at: string | null
  due_date: string | null
}

export type LinearClientIssuesRecord = {
  provider: 'linear_api'
  configured: boolean
  client_name: string
  query: string
  matched: boolean
  issue_count: number
  returned_issue_count: number
  issues: LinearIssueSummaryRecord[]
  required_capabilities: string[]
  warnings: string[]
}

export type NexusClientEngagementProvider = 'gmail' | 'slack'
export type NexusClientEngagementSourceSurface = 'gmail_api' | 'messages_workspace_mirror'

export type NexusClientEngagementRecord = {
  provider: NexusClientEngagementProvider
  source_surface: NexusClientEngagementSourceSurface
  external_id: string
  title: string
  snippet: string | null
  occurred_at: string | null
  author: string | null
  matched_basis: string[]
  conversation_id: string | null
  url: string | null
  metadata: Record<string, unknown>
}

export type NexusClientEngagementsRecord = {
  client_name: string
  lookback_days: number
  requested_limit: number
  matched_count: number
  returned_count: number
  source_counts: Record<string, number>
  gmail_query: string | null
  items: NexusClientEngagementRecord[]
  warnings: string[]
  read_only: boolean
}

export async function loadAttioClientEnrichment(
  apiBase: string,
  accessToken: string,
  clientName: string,
): Promise<AttioClientEnrichmentRecord> {
  return postJson<AttioClientEnrichmentRecord>(
    `${apiBase}/integrations/attio/client-enrichment`,
    { client_name: clientName },
    {
      headers: authorizationHeaders(accessToken),
      cache: 'no-store',
    },
  )
}

export async function syncAttioNexusClients(
  apiBase: string,
  accessToken: string,
  clientNames: string[] = [],
  excludedClientNames: string[] = [],
  limit?: number,
): Promise<AttioClientSyncRecord> {
  return postJson<AttioClientSyncRecord>(
    `${apiBase}/integrations/attio/client-sync`,
    {
      client_names: clientNames,
      excluded_client_names: excludedClientNames,
      ...(typeof limit === 'number' ? { limit } : {}),
    },
    {
      headers: authorizationHeaders(accessToken),
      cache: 'no-store',
    },
  )
}

export async function loadGrainClientRecordings(
  apiBase: string,
  accessToken: string,
  clientName: string,
): Promise<GrainClientRecordingsRecord> {
  return postJson<GrainClientRecordingsRecord>(
    `${apiBase}/integrations/grain/client-recordings`,
    { client_name: clientName },
    {
      headers: authorizationHeaders(accessToken),
      cache: 'no-store',
    },
  )
}

export async function loadLinearClientIssues(
  apiBase: string,
  accessToken: string,
  clientName: string,
): Promise<LinearClientIssuesRecord> {
  return postJson<LinearClientIssuesRecord>(
    `${apiBase}/integrations/linear/client-issues`,
    { client_name: clientName },
    {
      headers: authorizationHeaders(accessToken),
      cache: 'no-store',
    },
  )
}

export async function loadNexusClientEngagements(
  apiBase: string,
  accessToken: string,
  payload: {
    client_name: string
    domains?: string[]
    contact_emails?: string[]
    lookback_days?: number
    limit?: number
  },
): Promise<NexusClientEngagementsRecord> {
  return postJson<NexusClientEngagementsRecord>(
    `${apiBase}/integrations/nexus/client-engagements`,
    payload,
    {
      headers: authorizationHeaders(accessToken),
      cache: 'no-store',
    },
  )
}

export async function loadNexusContacts(apiBase: string, accessToken: string): Promise<NexusContactRecord[]> {
  return fetchJson<NexusContactRecord[]>(`${apiBase}/integrations/nexus/contacts`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function createNexusContact(
  apiBase: string,
  accessToken: string,
  payload: {
    client_name: string
    name: string
    title?: string | null
    first_name?: string | null
    last_name?: string | null
    role?: string | null
    time_at_role?: string | null
    previous_role?: string | null
    university?: string | null
    university_2?: string | null
    location?: string | null
    email?: string | null
    phone?: string | null
    web_url?: string | null
  },
): Promise<NexusContactRecord> {
  return postJson<NexusContactRecord>(`${apiBase}/integrations/nexus/contacts`, payload, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function importAttioNexusContacts(
  apiBase: string,
  accessToken: string,
  clientName: string,
  contacts: AttioClientContactRecord[],
): Promise<NexusContactRecord[]> {
  return postJson<NexusContactRecord[]>(
    `${apiBase}/integrations/nexus/contacts/import-attio`,
    {
      client_name: clientName,
      contacts,
    },
    {
      headers: authorizationHeaders(accessToken),
      cache: 'no-store',
    },
  )
}

export async function deleteNexusContact(apiBase: string, accessToken: string, contactId: string): Promise<void> {
  await requestOk(`${apiBase}/integrations/nexus/contacts/${encodeURIComponent(contactId)}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function loadNotionClientPages(
  apiBase: string,
  accessToken: string,
  clientName: string,
): Promise<NotionClientPagesRecord> {
  return postJson<NotionClientPagesRecord>(
    `${apiBase}/integrations/notion/client-pages`,
    { client_name: clientName },
    {
      headers: authorizationHeaders(accessToken),
      cache: 'no-store',
    },
  )
}
