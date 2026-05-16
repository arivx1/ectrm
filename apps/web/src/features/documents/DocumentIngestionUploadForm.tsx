import type { DragEvent, FormEvent, KeyboardEvent, MutableRefObject } from 'react'
import type {
  DocumentGmailInboxRuntimeSettingsRecord,
  DocumentProcessorProviderStatusRecord,
  DocumentProcessorRuntimeSettingsRecord,
  DocumentSchemaRegistryRecord,
} from '../../shared/models'
import { formatBytes } from './documentIngestionUtils'

type DocumentIngestionUploadFormProps = {
  compact?: boolean
  displayName: string
  processorSettings: DocumentProcessorRuntimeSettingsRecord | null
  selectedProcessorProvider: 'builtin' | 'openai' | 'anthropic' | 'google' | ''
  selectedProcessorModel: string
  selectedFile: File | null
  schemaRegistry: DocumentSchemaRegistryRecord | null
  uploading: boolean
  uploadError: string
  gmailInboxSettings: DocumentGmailInboxRuntimeSettingsRecord | null
  gmailImporting: boolean
  gmailImportError: string
  gmailImportSummary: string
  isDragActive: boolean
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  onDisplayNameChange: (value: string) => void
  onProcessorProviderChange: (value: 'builtin' | 'openai' | 'anthropic' | 'google' | '') => void
  onProcessorModelChange: (value: string) => void
  onFileChange: (file: File | null) => void
  onOpenFilePicker: () => void
  onDropzoneKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onDropzoneDragEnter: (event: DragEvent<HTMLDivElement>) => void
  onDropzoneDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDropzoneDragLeave: (event: DragEvent<HTMLDivElement>) => void
  onDropzoneDrop: (event: DragEvent<HTMLDivElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onImportGmailInbox: () => Promise<void>
}

function resolveProcessorProviderDisplayModel(provider: DocumentProcessorProviderStatusRecord): string {
  return provider.default_model || provider.available_models?.[0] || 'setup required'
}

function resolveProcessorProviderOptionLabel(provider: DocumentProcessorProviderStatusRecord): string {
  const modelLabel = resolveProcessorProviderDisplayModel(provider)
  return provider.configured ? `${provider.label} (${modelLabel})` : `${provider.label} (${modelLabel} placeholder)`
}

function formatProcessorPlaceholderLabels(providers: DocumentProcessorProviderStatusRecord[]): string {
  const labels = providers.map((provider) => provider.label)
  if (labels.length <= 1) {
    return labels[0] ?? ''
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

export function DocumentIngestionUploadForm({
  compact = false,
  displayName,
  processorSettings,
  selectedProcessorProvider,
  selectedProcessorModel,
  selectedFile,
  schemaRegistry,
  uploading,
  uploadError,
  gmailInboxSettings,
  gmailImporting,
  gmailImportError,
  gmailImportSummary,
  isDragActive,
  fileInputRef,
  onDisplayNameChange,
  onProcessorProviderChange,
  onProcessorModelChange,
  onFileChange,
  onOpenFilePicker,
  onDropzoneKeyDown,
  onDropzoneDragEnter,
  onDropzoneDragOver,
  onDropzoneDragLeave,
  onDropzoneDrop,
  onSubmit,
  onImportGmailInbox,
}: DocumentIngestionUploadFormProps) {
  const availableProviders = processorSettings?.providers ?? []
  const unconfiguredProviders = availableProviders.filter((provider) => !provider.configured)
  const selectedProvider = availableProviders.find((provider) => provider.provider === selectedProcessorProvider) ?? null
  const selectedProviderModels =
    selectedProvider?.available_models?.length
      ? selectedProvider.available_models
      : selectedProvider?.default_model
        ? [selectedProvider.default_model]
        : []
  const shouldShowProviderSelector = availableProviders.length > 0
  const gmailInboxConfigured = Boolean(gmailInboxSettings?.enabled && gmailInboxSettings?.configured)
  const gmailInboxQuery = gmailInboxSettings?.query?.trim() ?? ''
  const placeholderProviderLabels = formatProcessorPlaceholderLabels(unconfiguredProviders)

  return (
    <form className={`document-ingestion-form${compact ? ' document-ingestion-form-compact' : ''}`} onSubmit={onSubmit}>
      <div className="document-ingestion-form-grid">
        <div
          className={[
            'document-dropzone',
            compact ? 'document-dropzone-compact' : '',
            isDragActive ? 'document-dropzone-active' : '',
            selectedFile ? 'document-dropzone-has-file' : '',
            uploading ? 'document-dropzone-disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="button"
          tabIndex={uploading ? -1 : 0}
          aria-disabled={uploading}
          aria-label="Drop a PDF here or click to browse"
          onClick={onOpenFilePicker}
          onKeyDown={onDropzoneKeyDown}
          onDragEnter={onDropzoneDragEnter}
          onDragOver={onDropzoneDragOver}
          onDragLeave={onDropzoneDragLeave}
          onDrop={onDropzoneDrop}
        >
          <input
            ref={fileInputRef}
            className="document-dropzone-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            disabled={uploading}
          />
          <span className="document-dropzone-eyebrow">PDF</span>
          <strong>{selectedFile ? selectedFile.name : 'Drop PDF Here'}</strong>
          <p>
            {selectedFile
              ? `Ready to upload • ${formatBytes(selectedFile.size)}`
              : 'Drag a PDF into this area, or click to browse from your machine.'}
          </p>
        </div>
        <label>
          <span>Display Name</span>
          <input
            className="control"
            type="text"
            value={displayName}
            placeholder="Optional desk-friendly label"
            onChange={(event) => onDisplayNameChange(event.target.value)}
            disabled={uploading}
          />
        </label>
        {shouldShowProviderSelector ? (
          <label>
            <span>Processing API</span>
            <select
              className="control"
              value={selectedProcessorProvider}
              onChange={(event) =>
                onProcessorProviderChange(event.target.value as 'builtin' | 'openai' | 'anthropic' | 'google' | '')
              }
              disabled={uploading}
            >
              <option value="builtin">Built-in Parser Only</option>
              {availableProviders.map((provider) => (
                <option key={provider.provider} value={provider.provider} disabled={!provider.configured}>
                  {resolveProcessorProviderOptionLabel(provider)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {selectedProcessorProvider !== 'builtin' && selectedProviderModels.length > 0 ? (
          <label>
            <span>Processing Model</span>
            <select
              className="control"
              value={selectedProcessorModel}
              onChange={(event) => onProcessorModelChange(event.target.value)}
              disabled={uploading}
            >
              {selectedProviderModels.map((modelOption) => (
                <option key={modelOption} value={modelOption}>
                  {modelOption}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="document-ingestion-form-actions">
        <button type="submit" className="button button-primary" disabled={uploading || !selectedFile}>
          {uploading ? 'Uploading…' : 'Upload PDF'}
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void onImportGmailInbox()}
          disabled={uploading || gmailImporting || !gmailInboxConfigured}
        >
          {gmailImporting ? 'Importing Gmail…' : 'Import Gmail PDFs'}
        </button>
        <span className="workflow-editor-note">
          {compact
            ? 'Upload stores the source PDF and queues page analysis.'
            : 'Upload stores the source PDF, creates one record per page, and queues background classification plus extraction.'}
          {selectedProcessorProvider === 'builtin'
            ? ' Built-in parsing only will run for this upload.'
            : selectedProvider
            ? ` ${selectedProvider.label}${selectedProcessorModel ? ` (${selectedProcessorModel})` : ''} will be used for document processing when the background job runs.`
            : ' No document-processing APIs are configured on this API yet, so the built-in parser will run.'}
          {unconfiguredProviders.length > 0
            ? ` ${placeholderProviderLabels} placeholder${unconfiguredProviders.length === 1 ? ' is' : 's are'} visible here and will unlock once those API providers are configured.`
            : ''}
          {gmailInboxSettings?.enabled
            ? gmailInboxConfigured
              ? ` Gmail inbox import is ready${gmailInboxSettings.account_email ? ` for ${gmailInboxSettings.account_email}` : ''}${gmailInboxQuery ? ` using query "${gmailInboxQuery}".` : '.'}`
              : ' Gmail inbox import is enabled but not fully configured on the API yet.'
            : ''}
          {schemaRegistry ? ` Review contract ${schemaRegistry.version}.` : ''}
        </span>
      </div>
      {uploadError ? <p className="field-error">{uploadError}</p> : null}
      {gmailImportError ? <p className="field-error">{gmailImportError}</p> : null}
      {gmailImportSummary ? <p className="form-note">{gmailImportSummary}</p> : null}
    </form>
  )
}
