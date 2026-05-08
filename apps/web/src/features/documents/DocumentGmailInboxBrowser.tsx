import type {
  DocumentGmailInboxMessageDetailRecord,
  DocumentGmailInboxMessageSummaryRecord,
  DocumentGmailInboxRuntimeSettingsRecord,
} from '../../shared/models'
import { formatBytes } from './documentIngestionUtils'

type DocumentGmailInboxBrowserProps = {
  compact?: boolean
  gmailInboxSettings: DocumentGmailInboxRuntimeSettingsRecord | null
  gmailMessageQuery: string
  gmailMessages: DocumentGmailInboxMessageSummaryRecord[]
  gmailMessagesLoading: boolean
  gmailMessagesError: string
  gmailNextPageToken: string | null
  selectedGmailMessageId: string | null
  selectedGmailMessage: DocumentGmailInboxMessageDetailRecord | null
  selectedGmailMessageLoading: boolean
  selectedGmailMessageError: string
  formatDate: (value: string | null | undefined) => string
  onGmailMessageQueryChange: (value: string) => void
  onRefreshGmailMessages: () => Promise<void>
  onLoadMoreGmailMessages: () => Promise<void>
  onSelectGmailMessage: (messageId: string) => Promise<void>
}

function attachmentStatusCopy(
  message: DocumentGmailInboxMessageSummaryRecord,
): string {
  if (message.pdf_attachment_count === 0) {
    return message.attachment_count === 0
      ? 'No attachments'
      : `${message.attachment_count} attachment${message.attachment_count === 1 ? '' : 's'}`
  }
  if (message.imported_pdf_attachment_count > 0) {
    return `${message.imported_pdf_attachment_count}/${message.pdf_attachment_count} PDF${message.pdf_attachment_count === 1 ? '' : 's'} imported`
  }
  return `${message.pdf_attachment_count} PDF${message.pdf_attachment_count === 1 ? '' : 's'} ready`
}

export function DocumentGmailInboxBrowser({
  compact = false,
  gmailInboxSettings,
  gmailMessageQuery,
  gmailMessages,
  gmailMessagesLoading,
  gmailMessagesError,
  gmailNextPageToken,
  selectedGmailMessageId,
  selectedGmailMessage,
  selectedGmailMessageLoading,
  selectedGmailMessageError,
  formatDate,
  onGmailMessageQueryChange,
  onRefreshGmailMessages,
  onLoadMoreGmailMessages,
  onSelectGmailMessage,
}: DocumentGmailInboxBrowserProps) {
  if (!gmailInboxSettings?.enabled) {
    return null
  }

  const browserReady = gmailInboxSettings.configured

  return (
    <section className={`document-gmail-browser${compact ? ' document-gmail-browser-compact' : ''}`}>
      <div className="document-gmail-browser-head">
        <div>
          <span className="eyebrow">Gmail Inbox</span>
          <strong>Browse Inbox</strong>
          <p className="workflow-editor-note">
            {browserReady
              ? `Connected to ${gmailInboxSettings.account_email ?? 'the configured mailbox'}.`
              : 'Gmail browsing stays unavailable until the API mailbox auth is fully configured.'}
          </p>
        </div>
        <div className="document-gmail-browser-actions">
          <input
            className="control"
            type="text"
            value={gmailMessageQuery}
            placeholder={gmailInboxSettings.query}
            onChange={(event) => onGmailMessageQueryChange(event.target.value)}
            disabled={!browserReady || gmailMessagesLoading}
          />
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void onRefreshGmailMessages()}
            disabled={!browserReady || gmailMessagesLoading}
          >
            {gmailMessagesLoading ? 'Loading Inbox…' : 'Refresh Inbox'}
          </button>
        </div>
      </div>

      {!browserReady ? (
        <div className="empty-state">
          <strong>Gmail mailbox auth is not ready</strong>
          <p>Finish the API Gmail setup first. The browser will appear here automatically once the runtime is configured.</p>
        </div>
      ) : (
        <div className="document-gmail-browser-layout">
          <div className="document-gmail-browser-list">
            {gmailMessagesError ? <p className="field-error">{gmailMessagesError}</p> : null}
            {gmailMessages.length === 0 && !gmailMessagesLoading ? (
              <div className="empty-state">
                <strong>No messages matched</strong>
                <p>Try a broader Gmail search query or refresh the inbox with a different filter.</p>
              </div>
            ) : null}
            {gmailMessages.map((message) => {
              const selected = selectedGmailMessageId === message.message_id
              return (
                <button
                  key={message.message_id}
                  type="button"
                  className={`document-gmail-message-row${selected ? ' document-gmail-message-row-selected' : ''}`}
                  onClick={() => void onSelectGmailMessage(message.message_id)}
                >
                  <div className="document-gmail-message-row-head">
                    <strong>{message.subject?.trim() || '(No subject)'}</strong>
                    {message.unread ? <span className="status-pill status-pill-active">UNREAD</span> : null}
                  </div>
                  <span>{message.sender ?? 'Unknown sender'}</span>
                  <span>{formatDate(message.received_at)}</span>
                  <p>{message.snippet ?? 'No preview text available.'}</p>
                  <div className="document-ingestion-chip-row">
                    <span className="entity-chip entity-chip-soft">{attachmentStatusCopy(message)}</span>
                    {message.attachment_count > message.pdf_attachment_count ? (
                      <span className="entity-chip entity-chip-soft">
                        {message.attachment_count - message.pdf_attachment_count} non-PDF
                      </span>
                    ) : null}
                  </div>
                </button>
              )
            })}
            {gmailNextPageToken ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void onLoadMoreGmailMessages()}
                disabled={gmailMessagesLoading}
              >
                Load More
              </button>
            ) : null}
          </div>

          <div className="document-gmail-browser-detail">
            {selectedGmailMessageError ? <p className="field-error">{selectedGmailMessageError}</p> : null}
            {selectedGmailMessageLoading && !selectedGmailMessage ? (
              <div className="empty-state">
                <strong>Loading message</strong>
                <p>Pulling the selected Gmail message into the in-app reader.</p>
              </div>
            ) : null}
            {!selectedGmailMessageLoading && !selectedGmailMessage ? (
              <div className="empty-state">
                <strong>Select a message</strong>
                <p>Pick a Gmail message from the inbox list to read it here without leaving the app.</p>
              </div>
            ) : null}
            {selectedGmailMessage ? (
              <article className="document-gmail-message-detail">
                <div className="document-section-head">
                  <div>
                    <strong>{selectedGmailMessage.subject?.trim() || '(No subject)'}</strong>
                    <p className="workflow-editor-note">
                      {selectedGmailMessage.sender ?? 'Unknown sender'}
                      {selectedGmailMessage.to_recipients ? ` → ${selectedGmailMessage.to_recipients}` : ''}
                    </p>
                  </div>
                  <span className="entity-chip entity-chip-soft">{formatDate(selectedGmailMessage.received_at)}</span>
                </div>
                <div className="document-ingestion-chip-row">
                  {selectedGmailMessage.unread ? <span className="status-pill status-pill-active">UNREAD</span> : null}
                  <span className="entity-chip entity-chip-soft">
                    {selectedGmailMessage.attachments.length} attachment{selectedGmailMessage.attachments.length === 1 ? '' : 's'}
                  </span>
                </div>
                {selectedGmailMessage.snippet ? (
                  <p className="document-ingestion-summary">{selectedGmailMessage.snippet}</p>
                ) : null}
                <pre className="document-gmail-message-body">
                  {selectedGmailMessage.body_text ?? 'No plain-text body was available for this message.'}
                </pre>
                {selectedGmailMessage.body_truncated ? (
                  <p className="workflow-editor-note">Message body preview truncated for the in-app reader.</p>
                ) : null}
                <div className="document-gmail-attachment-list">
                  {selectedGmailMessage.attachments.map((attachment) => (
                    <div key={attachment.part_token} className="document-gmail-attachment-card">
                      <strong>{attachment.filename}</strong>
                      <span>
                        {attachment.mime_type} • {formatBytes(attachment.size_bytes)}
                      </span>
                      <div className="document-ingestion-chip-row">
                        {attachment.importable ? (
                          <span className="entity-chip entity-chip-soft">PDF importable</span>
                        ) : (
                          <span className="entity-chip entity-chip-soft">Preview only</span>
                        )}
                        {attachment.already_imported ? (
                          <span className="status-pill status-pill-active">Already Imported</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
