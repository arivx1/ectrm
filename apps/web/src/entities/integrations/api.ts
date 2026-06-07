import { postJson } from '../../shared/api'

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
