import { usePersistentCollapsibleCardState } from "../../shared/collapsibleCardState";
import type { StoredAuthSession } from "../../shared/mutation";
import { MessagingInboxPanel } from "../messages/MessagingInboxPanel";
import { buildMessagingInboxMessages } from "../messages/messagingInboxData";
import type { PromptHomeCounts } from "./promptHomeStarters";

type PromptHomeCommunicationCardProps = {
  authSession: StoredAuthSession | null;
  counts: PromptHomeCounts;
  onOpenMessagesWorkspace?: (() => void) | null;
};

const PROMPT_HOME_COMMUNICATION_PANEL_ID = "prompt-home-communication-panel";

function formatCountLabel(
  value: number | null,
  singular: string,
  plural = `${singular}s`,
): string {
  if (typeof value !== "number") {
    return `No ${plural} loaded`;
  }

  const noun = value === 1 ? singular : plural;
  return `${value.toLocaleString()} ${noun}`;
}

export function PromptHomeCommunicationCard({
  authSession,
  counts,
  onOpenMessagesWorkspace = null,
}: PromptHomeCommunicationCardProps) {
  const communicationExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.communication-card",
    true,
  );
  const messages = buildMessagingInboxMessages(counts);
  const signedIn = Boolean(authSession);
  const collapsedSummary = [
    `${messages.length.toLocaleString()} inbox items`,
    formatCountLabel(counts.openWorkItems, "open work item"),
    formatCountLabel(counts.attentionItems, "attention item"),
  ].join(" | ");

  return (
    <section
      className={`prompt-home-communication-card ${communicationExpandedState.expanded ? "is-expanded" : "is-collapsed"}`}
    >
      <div className="prompt-home-communication-card-head">
        <div className="prompt-home-communication-card-copy">
          <span className="eyebrow">Communication</span>
          <strong>Communication center</strong>
          <p>
            {communicationExpandedState.expanded
              ? "One inbox for email, work follow-through, issues, and app messages. Expand a row only when you need the detail."
              : collapsedSummary}
          </p>
        </div>

        <div className="prompt-home-communication-card-side">
          <button
            type="button"
            className="prompt-home-communication-card-toggle"
            aria-expanded={communicationExpandedState.expanded}
            aria-controls={PROMPT_HOME_COMMUNICATION_PANEL_ID}
            onClick={() =>
              communicationExpandedState.setExpanded((current) => !current)
            }
          >
            <div className="prompt-home-communication-card-toggle-meta">
              <small>
                {communicationExpandedState.expanded ? "Hide card" : "Show card"}
              </small>
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {communicationExpandedState.expanded ? "−" : "+"}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div
        id={PROMPT_HOME_COMMUNICATION_PANEL_ID}
        className="prompt-home-communication-card-body"
        hidden={!communicationExpandedState.expanded}
      >
        <MessagingInboxPanel
          messages={messages}
          footer={
            <div className="prompt-home-communication-footer">
              <p className="form-note">
                {signedIn
                  ? "These are sample inbox rows for now. The next step is swapping each type onto live records without changing the Home inbox shape."
                  : "These are sample inbox rows for now. After sign-in, the same inbox shape can be filled with live communication records."}
              </p>
              {onOpenMessagesWorkspace ? (
                <div className="prompt-home-starter-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={onOpenMessagesWorkspace}
                  >
                    Open Messages Workspace
                  </button>
                </div>
              ) : null}
            </div>
          }
        />
      </div>
    </section>
  );
}
