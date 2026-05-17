import { useState, type ReactNode } from "react";

import type {
  MessagingInboxMessage,
  MessagingInboxMessageType,
} from "./messagingInboxData";

function MessagingInboxTypeBadge({
  type,
}: {
  type: MessagingInboxMessageType;
}) {
  return (
    <span
      className="prompt-home-communication-type-badge"
      data-message-type={type}
    >
      {type}
    </span>
  );
}

type MessagingInboxPanelProps = {
  messages: MessagingInboxMessage[];
  ariaLabel?: string;
  threadAriaLabel?: string;
  footer?: ReactNode;
};

function buildMessagePanelId(messageId: string): string {
  return `prompt-home-communication-record-panel-${messageId.replace(/[^a-z0-9_-]/gi, "-")}`;
}

export function MessagingInboxPanel({
  messages,
  ariaLabel = "Communication inbox",
  threadAriaLabel = "Communication details",
  footer = null,
}: MessagingInboxPanelProps) {
  const [expandedMessageIds, setExpandedMessageIds] = useState<
    Record<string, boolean>
  >({});

  return (
    <div className="prompt-home-communication-shell">
      <div
        className="prompt-home-communication-record-list"
        aria-label={ariaLabel}
      >
        {messages.map((message) => {
          const expanded = Boolean(expandedMessageIds[message.id]);
          const panelId = buildMessagePanelId(message.id);

          return (
            <article
              key={message.id}
              className={`prompt-home-communication-record ${expanded ? "is-expanded" : ""}`}
            >
              <button
                type="button"
                className="prompt-home-communication-record-toggle"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() =>
                  setExpandedMessageIds((current) => ({
                    ...current,
                    [message.id]: !current[message.id],
                  }))
                }
              >
                <div className="prompt-home-communication-record-meta">
                  <MessagingInboxTypeBadge type={message.type} />
                  <span className="prompt-home-communication-lane">
                    {message.lane}
                  </span>
                </div>

                <div className="prompt-home-communication-record-copy">
                  <strong>{message.subject}</strong>
                </div>

                <div className="prompt-home-communication-record-side">
                  <span
                    className={`prompt-home-communication-status ${message.unread ? "is-unread" : ""}`}
                  >
                    {message.status}
                  </span>
                  <small>{message.timestamp}</small>
                  <span
                    className="prompt-home-communication-record-indicator"
                    aria-hidden="true"
                  >
                    {expanded ? "−" : "+"}
                  </span>
                </div>
              </button>

              <section
                id={panelId}
                className="prompt-home-communication-record-panel"
                aria-label={`${threadAriaLabel}: ${message.subject}`}
                hidden={!expanded}
              >
                <div className="prompt-home-communication-record-panel-head">
                  <div className="prompt-home-communication-record-panel-copy">
                    <strong>{message.sender}</strong>
                    <p>{message.meta}</p>
                  </div>
                  <small>{message.timestamp}</small>
                </div>

                <p className="prompt-home-communication-record-panel-preview">
                  {message.preview}
                </p>

                <div className="prompt-home-communication-record-panel-message">
                  {message.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                <div className="prompt-home-communication-record-panel-reply">
                  <strong>Reply lane</strong>
                  <p>{message.replyHint}</p>
                  <small>
                    This keeps inbox review and thread context in one place so
                    the app reads more like Slack than a reporting table.
                  </small>
                </div>
              </section>
            </article>
          );
        })}
      </div>

      {footer}
    </div>
  );
}
