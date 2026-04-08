import type { DragEvent, FormEvent, KeyboardEvent, MutableRefObject } from 'react'
import type { DocumentSchemaRegistryRecord } from '../../shared/models'
import { formatBytes } from './documentIngestionUtils'

type DocumentIngestionUploadFormProps = {
  compact?: boolean
  displayName: string
  selectedFile: File | null
  schemaRegistry: DocumentSchemaRegistryRecord | null
  uploading: boolean
  uploadError: string
  isDragActive: boolean
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  onDisplayNameChange: (value: string) => void
  onFileChange: (file: File | null) => void
  onOpenFilePicker: () => void
  onDropzoneKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onDropzoneDragEnter: (event: DragEvent<HTMLDivElement>) => void
  onDropzoneDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDropzoneDragLeave: (event: DragEvent<HTMLDivElement>) => void
  onDropzoneDrop: (event: DragEvent<HTMLDivElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}

export function DocumentIngestionUploadForm({
  compact = false,
  displayName,
  selectedFile,
  schemaRegistry,
  uploading,
  uploadError,
  isDragActive,
  fileInputRef,
  onDisplayNameChange,
  onFileChange,
  onOpenFilePicker,
  onDropzoneKeyDown,
  onDropzoneDragEnter,
  onDropzoneDragOver,
  onDropzoneDragLeave,
  onDropzoneDrop,
  onSubmit,
}: DocumentIngestionUploadFormProps) {
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
      </div>
      <div className="document-ingestion-form-actions">
        <button type="submit" className="button button-primary" disabled={uploading || !selectedFile}>
          {uploading ? 'Uploading…' : 'Upload PDF'}
        </button>
        <span className="workflow-editor-note">
          {compact
            ? 'Upload stores the source PDF and queues page analysis.'
            : 'Upload stores the source PDF, creates one record per page, and queues background classification plus extraction.'}
          {schemaRegistry ? ` Review contract ${schemaRegistry.version}.` : ''}
        </span>
      </div>
      {uploadError ? <p className="field-error">{uploadError}</p> : null}
    </form>
  )
}
