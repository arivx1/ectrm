import { DocumentIngestionDocumentCard } from '../../features/documents/DocumentIngestionDocumentCard'
import { DocumentIngestionUploadForm } from '../../features/documents/DocumentIngestionUploadForm'
import { useDocumentIngestionController } from '../../features/documents/useDocumentIngestionController'
import type { StoredAuthSession } from '../../shared/mutation'

type DocumentIngestionPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  compact?: boolean
}

export function DocumentIngestionPanel({ authSession, formatDate, compact = false }: DocumentIngestionPanelProps) {
  const controller = useDocumentIngestionController({ authSession })

  if (!authSession) {
    return (
      <div className="empty-state">
        <strong>Document intake is protected</strong>
        <p>Sign in from Settings to upload and review PDFs, page classifications, and extracted header or table scaffolding.</p>
      </div>
    )
  }

  return (
    <div className={`stack document-ingestion-panel${compact ? ' document-ingestion-panel-compact' : ''}`}>
      <DocumentIngestionUploadForm
        compact={compact}
        displayName={controller.displayName}
        selectedFile={controller.selectedFile}
        schemaRegistry={controller.schemaRegistry}
        uploading={controller.uploading}
        uploadError={controller.uploadError}
        isDragActive={controller.isDragActive}
        fileInputRef={controller.fileInputRef}
        onDisplayNameChange={controller.setDisplayName}
        onFileChange={controller.updateSelectedFile}
        onOpenFilePicker={controller.openFilePicker}
        onDropzoneKeyDown={controller.handleDropzoneKeyDown}
        onDropzoneDragEnter={controller.handleDropzoneDragEnter}
        onDropzoneDragOver={controller.handleDropzoneDragOver}
        onDropzoneDragLeave={controller.handleDropzoneDragLeave}
        onDropzoneDrop={controller.handleDropzoneDrop}
        onSubmit={controller.handleSubmit}
      />

      {controller.loading ? (
        <div className="empty-state">
          <strong>Loading document intake</strong>
          <p>Fetching recent PDF ingestions, schema definitions, and review state.</p>
        </div>
      ) : controller.loadError ? (
        <div className="empty-state">
          <strong>Document intake could not load</strong>
          <p>{controller.loadError}</p>
        </div>
      ) : controller.documents.length > 0 ? (
        <div className={`document-ingestion-list${compact ? ' document-ingestion-list-compact' : ''}`}>
          {controller.documents.map((document) => (
            <DocumentIngestionDocumentCard
              key={document.document_id}
              controller={controller}
              document={document}
              formatDate={formatDate}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No PDFs uploaded yet</strong>
          <p>The first upload will create the stored source file, page-level stubs, and a queued analysis job for classification plus extraction.</p>
        </div>
      )}
    </div>
  )
}
