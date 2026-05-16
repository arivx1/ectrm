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

export function MessagingInboxPanel({
  messages,
  ariaLabel = "Communication inbox",
  threadAriaLabel = "Selected communication thread",
  footer = null,
}: MessagingInboxPanelProps) {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    () => messages[0]?.id ?? null,
  );
  const selectedMessage =
    messages.find((message) => message.id === selectedMessageId) ?? messages[0];

  return (
    <div className="prompt-home-communication-shell">
      <div className="prompt-home-communication-inbox" aria-label={ariaLabel}>
        {messages.map((message) => {
          const selected = message.id === selectedMessage?.id;

          return (
            <button
              key={message.id}
              type="button"
              className={`prompt-home-communication-inbox-item ${selected ? "is-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => setSelectedMessageId(message.id)}
            >
              <div className="prompt-home-communication-inbox-item-head">
                <MessagingInboxTypeBadge type={message.type} />
                <span className="prompt-home-communication-lane">
                  {message.lane}
                </span>
                <small>{message.timestamp}</small>
              </div>
              <div className="prompt-home-communication-inbox-item-copy">
                <strong>{message.subject}</strong>
                <p>{message.preview}</p>
              </div>
              <div className="prompt-home-communication-inbox-item-foot">
                <span>{message.sender}</span>
                <span
                  className={`prompt-home-communication-status ${message.unread ? "is-unread" : ""}`}
                >
                  {message.status}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedMessage ? (
        <article
          className="prompt-home-communication-thread"
          aria-label={threadAriaLabel}
        >
          <div className="prompt-home-communication-thread-head">
            <div className="prompt-home-communication-thread-copy">
              <div className="prompt-home-communication-thread-meta">
                <MessagingInboxTypeBadge type={selectedMessage.type} />
                <span>{selectedMessage.lane}</span>
              </div>
              <strong>{selectedMessage.subject}</strong>
              <p>
                {selectedMessage.sender} · {selectedMessage.meta}
              </p>
            </div>
            <div className="prompt-home-communication-thread-side">
              <span
                className={`prompt-home-communication-status ${selectedMessage.unread ? "is-unread" : ""}`}
              >
                {selectedMessage.status}
              </span>
              <small>{selectedMessage.timestamp}</small>
            </div>
          </div>

          <div className="prompt-home-communication-thread-message">
            <div
              className="prompt-home-communication-thread-avatar"
              aria-hidden="true"
            >
              {selectedMessage.sender.slice(0, 2).toUpperCase()}
            </div>
            <div className="prompt-home-communication-thread-bubble">
              <div className="prompt-home-communication-thread-message-head">
                <strong>{selectedMessage.sender}</strong>
                <span>{selectedMessage.timestamp}</span>
              </div>
              {selectedMessage.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="prompt-home-communication-thread-reply">
            <strong>Reply lane</strong>
            <p>{selectedMessage.replyHint}</p>
            <small>
              This keeps inbox review and thread context in one place so the app
              reads more like Slack than a reporting table.
            </small>
          </div>
        </article>
      ) : null}

      {footer}
    </div>
  );
}
