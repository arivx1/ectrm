import { fetchJson, patchJson, postFormData, postJson, requestOk } from '../../shared/api'
import type { StoredAuthSession } from '../../shared/mutation'
import type {
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
): Promise<DocumentIngestionRecord> {
  const formData = new FormData()
  formData.append('file', file)
  if (displayName?.trim()) {
    formData.append('display_name', displayName.trim())
  }
  if (processorProvider?.trim()) {
    formData.append('processor_provider', processorProvider.trim())
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
): Promise<DocumentIngestionRecord> {
  return postJson<DocumentIngestionRecord>(
    `${apiBase}/documents/${documentId}/reprocess`,
    processorProvider ? { processor_provider: processorProvider } : {},
    {
      headers: documentHeaders(session),
    },
  )
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
