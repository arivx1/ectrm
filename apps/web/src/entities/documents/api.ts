import { fetchJson, patchJson, postFormData, postJson, requestOk } from '../../shared/api'
import type { StoredAuthSession } from '../../shared/mutation'
import type {
  DocumentGmailInboxBrowseResultRecord,
  DocumentGmailInboxMessageDetailRecord,
  DocumentIngestionRecord,
  DocumentProcessorRuntimeSettingsRecord,
  DocumentSchemaRegistryRecord,
} from '../../shared/models'

export type DocumentExtractedFieldInput = {
  field_key: string
  label?: string | null
  value?: string | null
  confidence?: number | null
  source?: string | null
}

export type DocumentTableBlockInput = {
  template_key?: string | null
  title?: string | null
  columns: string[]
  rows: Array<Record<string, string | null>>
  header_row_detected?: boolean
  source?: string | null
}

export type UpdateDocumentIngestionInput = {
  display_name?: string | null
  document_kind?: string | null
  review_status?: string | null
  review_notes?: string | null
}

export type UpdateDocumentPageInput = {
  document_kind?: string | null
  document_subtype?: string | null
  header_fields?: DocumentExtractedFieldInput[]
  table_blocks?: DocumentTableBlockInput[]
  review_status?: string | null
  review_notes?: string | null
}

export type ImportGmailInboxDocumentsInput = {
  query?: string | null
  max_messages?: number | null
}

export type GmailImportedDocument = {
  document_id: string
  display_name: string
  original_filename: string
  gmail_message_id: string
  gmail_thread_id: string | null
  gmail_subject: string | null
  gmail_sender: string | null
}

export type GmailInboxImportResult = {
  query: string
  requested_max_messages: number
  matched_message_count: number
  matched_attachment_count: number
  imported_count: number
  skipped_count: number
  imported_documents: GmailImportedDocument[]
  warnings: string[]
}

export type ListGmailInboxMessagesInput = {
  query?: string | null
  page_size?: number | null
  page_token?: string | null
}

function documentHeaders(session: StoredAuthSession): Headers {
  return new Headers({ Authorization: `Bearer ${session.accessToken}` })
}

export async function listDocumentSchemaRegistry(
  apiBase: string,
  session: StoredAuthSession,
): Promise<DocumentSchemaRegistryRecord> {
  return fetchJson<DocumentSchemaRegistryRecord>(`${apiBase}/documents/schema-registry`, {
    headers: documentHeaders(session),
    cache: 'no-store',
  })
}

export async function getDocumentProcessorSettings(
  apiBase: string,
  session: StoredAuthSession,
): Promise<DocumentProcessorRuntimeSettingsRecord> {
  return fetchJson<DocumentProcessorRuntimeSettingsRecord>(`${apiBase}/documents/settings`, {
    headers: documentHeaders(session),
    cache: 'no-store',
  })
}

export async function listDocumentIngestions(
  apiBase: string,
  session: StoredAuthSession,
): Promise<DocumentIngestionRecord[]> {
  return fetchJson<DocumentIngestionRecord[]>(`${apiBase}/documents`, {
    headers: documentHeaders(session),
    cache: 'no-store',
  })
}

export async function uploadPdfDocument(
  apiBase: string,
  session: StoredAuthSession,
  file: File,
  displayName?: string,
  processorProvider?: 'builtin' | 'openai' | 'anthropic' | 'google' | null,
  processorModel?: string | null,
): Promise<DocumentIngestionRecord> {
  const formData = new FormData()
  formData.append('file', file)
  if (displayName?.trim()) {
    formData.append('display_name', displayName.trim())
  }
  if (processorProvider?.trim()) {
    formData.append('processor_provider', processorProvider.trim())
  }
  if (processorModel?.trim()) {
    formData.append('processor_model', processorModel.trim())
  }

  return postFormData<DocumentIngestionRecord>(`${apiBase}/documents/uploads`, formData, {
    headers: documentHeaders(session),
  })
}

export async function updateDocumentIngestion(
  apiBase: string,
  session: StoredAuthSession,
  documentId: string,
  payload: UpdateDocumentIngestionInput,
): Promise<DocumentIngestionRecord> {
  return patchJson<DocumentIngestionRecord>(
    `${apiBase}/documents/${documentId}`,
    payload as Record<string, unknown>,
    {
      headers: documentHeaders(session),
    },
  )
}

export async function updateDocumentPage(
  apiBase: string,
  session: StoredAuthSession,
  documentId: string,
  pageId: number,
  payload: UpdateDocumentPageInput,
): Promise<DocumentIngestionRecord> {
  return patchJson<DocumentIngestionRecord>(
    `${apiBase}/documents/${documentId}/pages/${pageId}`,
    payload as Record<string, unknown>,
    {
      headers: documentHeaders(session),
    },
  )
}

export async function reprocessDocumentIngestion(
  apiBase: string,
  session: StoredAuthSession,
  documentId: string,
  processorProvider?: 'builtin' | 'openai' | 'anthropic' | 'google' | null,
  processorModel?: string | null,
): Promise<DocumentIngestionRecord> {
  const payload: Record<string, unknown> = {}
  if (processorProvider) {
    payload.processor_provider = processorProvider
  }
  if (processorModel?.trim()) {
    payload.processor_model = processorModel.trim()
  }
  return postJson<DocumentIngestionRecord>(
    `${apiBase}/documents/${documentId}/reprocess`,
    payload,
    {
      headers: documentHeaders(session),
    },
  )
}

export async function importGmailInboxDocuments(
  apiBase: string,
  session: StoredAuthSession,
  payload: ImportGmailInboxDocumentsInput = {},
): Promise<GmailInboxImportResult> {
  return postJson<GmailInboxImportResult>(
    `${apiBase}/documents/imports/gmail`,
    payload as Record<string, unknown>,
    {
      headers: documentHeaders(session),
    },
  )
}

export async function listGmailInboxMessages(
  apiBase: string,
  session: StoredAuthSession,
  payload: ListGmailInboxMessagesInput = {},
): Promise<DocumentGmailInboxBrowseResultRecord> {
  const searchParams = new URLSearchParams()
  if (payload.query?.trim()) {
    searchParams.set('query', payload.query.trim())
  }
  if (typeof payload.page_size === 'number' && Number.isFinite(payload.page_size)) {
    searchParams.set('page_size', String(payload.page_size))
  }
  if (payload.page_token?.trim()) {
    searchParams.set('page_token', payload.page_token.trim())
  }
  const querySuffix = searchParams.size > 0 ? `?${searchParams.toString()}` : ''

  return fetchJson<DocumentGmailInboxBrowseResultRecord>(`${apiBase}/documents/gmail/messages${querySuffix}`, {
    headers: documentHeaders(session),
    cache: 'no-store',
  })
}

export async function getGmailInboxMessageDetail(
  apiBase: string,
  session: StoredAuthSession,
  messageId: string,
): Promise<DocumentGmailInboxMessageDetailRecord> {
  return fetchJson<DocumentGmailInboxMessageDetailRecord>(`${apiBase}/documents/gmail/messages/${encodeURIComponent(messageId)}`, {
    headers: documentHeaders(session),
    cache: 'no-store',
  })
}

export async function executeDocumentActionPlan(
  apiBase: string,
  session: StoredAuthSession,
  documentId: string,
): Promise<DocumentIngestionRecord> {
  return postJson<DocumentIngestionRecord>(
    `${apiBase}/documents/${documentId}/execute-action-plan`,
    {},
    {
      headers: documentHeaders(session),
    },
  )
}

export async function fetchDocumentPagePreview(
  apiBase: string,
  session: StoredAuthSession,
  documentId: string,
  pageId: number,
): Promise<Blob> {
  const response = await requestOk(`${apiBase}/documents/${documentId}/pages/${pageId}/preview`, {
    headers: documentHeaders(session),
    cache: 'no-store',
  })
  return response.blob()
}

export async function fetchDocumentSource(
  apiBase: string,
  session: StoredAuthSession,
  documentId: string,
): Promise<Blob> {
  const response = await requestOk(`${apiBase}/documents/${documentId}/source`, {
    headers: documentHeaders(session),
    cache: 'no-store',
  })
  return response.blob()
}
