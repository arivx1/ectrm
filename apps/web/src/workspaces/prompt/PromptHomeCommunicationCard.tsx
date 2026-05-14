import { usePersistentCollapsibleCardState } from "../../shared/collapsibleCardState";
import type { StoredAuthSession } from "../../shared/mutation";
import type { PromptHomeCounts } from "./promptHomeStarters";

type PromptHomeCommunicationCardProps = {
  authSession: StoredAuthSession | null;
  counts: PromptHomeCounts;
  onOpenAssistantWorkspace: () => void;
  onOpenOperationsWorkspace: () => void;
  onOpenDashboardWorkspace: () => void;
  onSignIn: () => void;
};

type PromptHomeCommunicationItemProps = {
  eyebrow: string;
  title: string;
  metric: string;
  detail: string;
  note: string;
  actionLabel?: string;
  onAction?: () => void;
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

function buildTodoDetail(counts: PromptHomeCounts): string {
  const totalSentence =
    typeof counts.openWorkItems === "number"
      ? `${formatCountLabel(counts.openWorkItems, "open work item")} ${counts.openWorkItems === 1 ? "is" : "are"} currently tracked across the app.`
      : "Open work items will appear here once queue data is loaded.";
  const operationsSentence =
    typeof counts.operationsQueueItems === "number"
      ? `${formatCountLabel(counts.operationsQueueItems, "operations queue item")} ${counts.operationsQueueItems === 1 ? "sits" : "sit"} in operations.`
      : "Operations queue counts are not loaded yet.";
  const settlementSentence =
    typeof counts.settlementQueueItems === "number"
      ? `${formatCountLabel(counts.settlementQueueItems, "settlement queue item")} ${counts.settlementQueueItems === 1 ? "sits" : "sit"} in settlement.`
      : "Settlement queue counts are not loaded yet.";
  return `${totalSentence} ${operationsSentence} ${settlementSentence}`;
}

function buildIssueDetail(counts: PromptHomeCounts): string {
  const attentionSentence =
    typeof counts.attentionItems === "number"
      ? `${formatCountLabel(counts.attentionItems, "attention item")} ${counts.attentionItems === 1 ? "is" : "are"} surfaced for review right now.`
      : "Attention items will appear here once the dashboard summary is loaded.";
  const stalePricingSentence =
    typeof counts.stalePricingItems === "number"
      ? `${formatCountLabel(counts.stalePricingItems, "stale pricing item")} ${counts.stalePricingItems === 1 ? "is" : "are"} tied to pricing follow-through.`
      : "Pricing follow-through counts are not loaded yet.";
  return `${attentionSentence} ${stalePricingSentence}`;
}

function PromptHomeCommunicationItem({
  eyebrow,
  title,
  metric,
  detail,
  note,
  actionLabel,
  onAction,
}: PromptHomeCommunicationItemProps) {
  return (
    <article className="prompt-home-communication-item">
      <div className="prompt-home-communication-item-copy">
        <span className="eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
        <span className="prompt-home-communication-item-metric">{metric}</span>
        <p>{detail}</p>
      </div>
      <div className="prompt-home-communication-item-side">
        <small>{note}</small>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function PromptHomeCommunicationCard({
  authSession,
  counts,
  onOpenAssistantWorkspace,
  onOpenOperationsWorkspace,
  onOpenDashboardWorkspace,
  onSignIn,
}: PromptHomeCommunicationCardProps) {
  const communicationExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.communication-card",
    true,
  );
  const signedIn = Boolean(authSession);
  const collapsedSummary = signedIn
    ? `${formatCountLabel(counts.openWorkItems, "open work item")} | ${formatCountLabel(counts.attentionItems, "attention item")} | In-app and Gmail follow-through`
    : "Sign in to review in-app messages, integrated email, to-do items, and issues.";

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
              ? "Incoming messages, integrated email, to-do items, and issues stay grouped here before you jump into the owning workspace."
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
        <div className="prompt-home-communication-grid">
          <PromptHomeCommunicationItem
            eyebrow="In-App"
            title="Incoming messages"
            metric="Assistant inbox and governed follow-through"
            detail="Assistant responses, approval requests, and route handoffs stay visible inside the app instead of getting buried in chat."
            note={
              signedIn
                ? "Open the runtime console and review inbox."
                : "Sign in to review the in-app inbox."
            }
            actionLabel={signedIn ? "Open Assistant Console" : undefined}
            onAction={signedIn ? onOpenAssistantWorkspace : undefined}
          />
          <PromptHomeCommunicationItem
            eyebrow="Email"
            title="Integrated email"
            metric="Gmail intake and document follow-through"
            detail="Gmail attachments and email-connected documents can enter from Home, then move into the governed work queue for review."
            note={
              signedIn
                ? "Use Home for quick intake or Operations for full review."
                : "Sign in to import Gmail attachments."
            }
            actionLabel={signedIn ? "Open Work Queue" : undefined}
            onAction={signedIn ? onOpenOperationsWorkspace : undefined}
          />
          <PromptHomeCommunicationItem
            eyebrow="To-Do"
            title="To-do items"
            metric={formatCountLabel(counts.openWorkItems, "open work item")}
            detail={buildTodoDetail(counts)}
            note={
              signedIn
                ? "Operations and settlement follow-through stay in their owning queues."
                : "Sign in to review queue follow-through."
            }
            actionLabel={signedIn ? "Open Operations" : undefined}
            onAction={signedIn ? onOpenOperationsWorkspace : undefined}
          />
          <PromptHomeCommunicationItem
            eyebrow="Issues"
            title="Issues and attention"
            metric={formatCountLabel(counts.attentionItems, "attention item")}
            detail={buildIssueDetail(counts)}
            note={
              signedIn
                ? "Dashboard attention and pricing signals stay reviewable."
                : "Sign in to review current issues."
            }
            actionLabel={signedIn ? "Open Dashboard" : undefined}
            onAction={signedIn ? onOpenDashboardWorkspace : undefined}
          />
        </div>

        <div className="prompt-home-communication-footer">
          <p className="form-note">
            Home keeps the communication surfaces together, but the actual work
            still stays governed in each owning workspace.
          </p>
          {!signedIn ? (
            <button
              type="button"
              className="button button-primary"
              onClick={onSignIn}
            >
              Sign In to Review Communication
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
