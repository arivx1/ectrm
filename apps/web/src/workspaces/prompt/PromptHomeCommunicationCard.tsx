import { useEffect, useMemo, useState } from "react";

import {
  loadMessagingSlackSettings,
  syncMessagingSlackWorkspace,
  type MessagingSlackRuntimeSettings,
} from "../../entities/messages/api";
import { appConfig } from "../../shared/config";
import { usePersistentCollapsibleCardState } from "../../shared/collapsibleCardState";
import type { StoredAuthSession } from "../../shared/mutation";
import { MessagingInboxPanel } from "../messages/MessagingInboxPanel";
import {
  buildMessagingInboxMessages,
  type MessagingInboxMessage,
} from "../messages/messagingInboxData";
import {
  mergePromptHomeClassNames,
  usePromptHomeCardDragHandle,
} from "./promptHomeCardDrag.ts";
import type { PromptHomeCounts } from "./promptHomeStarters";

type PromptHomeCommunicationCardProps = {
  instanceId?: string;
  authSession: StoredAuthSession | null;
  counts: PromptHomeCounts;
  sourceMessages?: MessagingInboxMessage[];
  sourceMessagesLoading?: boolean;
  sourceMessagesError?: string;
  onOpenMessagesWorkspace?: (() => void) | null;
  onRefreshSourceMessages?: (() => Promise<void> | void) | null;
  initialSettingsOpen?: boolean;
};

const PROMPT_HOME_COMMUNICATION_PANEL_ID = "prompt-home-communication-panel";
const PROMPT_HOME_COMMUNICATION_SETTINGS_DIALOG_ID =
  "prompt-home-communication-settings-dialog";
const PROMPT_HOME_COMMUNICATION_CONNECTIONS_STORAGE_KEY =
  "ectrm.prompt-home.communication-connections.v1";

type PromptHomeCommunicationConnectionKey =
  | "slack"
  | "teams"
  | "email"
  | "app-messages";

type PromptHomeCommunicationConnectionState = {
  connected: boolean;
  visible: boolean;
};

type PromptHomeCommunicationConnectionSnapshot = Record<
  PromptHomeCommunicationConnectionKey,
  PromptHomeCommunicationConnectionState
>;

type PromptHomeCommunicationConnectionDefinition = {
  key: PromptHomeCommunicationConnectionKey;
  label: string;
  provider: string;
  detail: string;
  type: "External" | "Internal";
};

const PROMPT_HOME_COMMUNICATION_CONNECTION_DEFINITIONS: PromptHomeCommunicationConnectionDefinition[] =
  [
    {
      key: "slack",
      label: "Slack",
      provider: "Slack Web API",
      detail: "Channels and DMs mirrored through Messages",
      type: "External",
    },
    {
      key: "teams",
      label: "Microsoft Teams",
      provider: "Teams connector",
      detail: "Teams channels and chats",
      type: "External",
    },
    {
      key: "email",
      label: "Email",
      provider: "Shared inbox",
      detail: "Counterparty email lanes",
      type: "External",
    },
    {
      key: "app-messages",
      label: "App Messages",
      provider: "ECTRM",
      detail: "Assistant and system notifications",
      type: "Internal",
    },
  ];

const PROMPT_HOME_COMMUNICATION_DEFAULT_CONNECTIONS: PromptHomeCommunicationConnectionSnapshot =
  {
    slack: { connected: false, visible: true },
    teams: { connected: false, visible: true },
    email: { connected: true, visible: true },
    "app-messages": { connected: true, visible: true },
  };

function promptHomeSafeDomIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "app";
}

function promptHomeInstanceScopedId(
  baseId: string,
  instanceId: string,
  baseInstanceId: string,
): string {
  return instanceId === baseInstanceId
    ? baseId
    : `${baseId}-${promptHomeSafeDomIdPart(instanceId)}`;
}

function promptHomeInstanceStorageKey(
  baseKey: string,
  instanceId: string,
  baseInstanceId: string,
): string {
  return instanceId === baseInstanceId
    ? baseKey
    : `${baseKey}.${instanceId}`;
}

function normalizePromptHomeCommunicationConnectionState(
  value: unknown,
  fallback: PromptHomeCommunicationConnectionState,
): PromptHomeCommunicationConnectionState {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }

  const candidate = value as Partial<PromptHomeCommunicationConnectionState>;
  return {
    connected:
      typeof candidate.connected === "boolean"
        ? candidate.connected
        : fallback.connected,
    visible:
      typeof candidate.visible === "boolean" ? candidate.visible : fallback.visible,
  };
}

function normalizePromptHomeCommunicationConnectionSnapshot(
  value: unknown,
): PromptHomeCommunicationConnectionSnapshot {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    slack: normalizePromptHomeCommunicationConnectionState(
      (candidate as { slack?: unknown }).slack,
      PROMPT_HOME_COMMUNICATION_DEFAULT_CONNECTIONS.slack,
    ),
    teams: normalizePromptHomeCommunicationConnectionState(
      (candidate as { teams?: unknown }).teams,
      PROMPT_HOME_COMMUNICATION_DEFAULT_CONNECTIONS.teams,
    ),
    email: normalizePromptHomeCommunicationConnectionState(
      (candidate as { email?: unknown }).email,
      PROMPT_HOME_COMMUNICATION_DEFAULT_CONNECTIONS.email,
    ),
    "app-messages": normalizePromptHomeCommunicationConnectionState(
      (candidate as { "app-messages"?: unknown })["app-messages"],
      PROMPT_HOME_COMMUNICATION_DEFAULT_CONNECTIONS["app-messages"],
    ),
  };
}

function getPromptHomeCommunicationConnectionSnapshot(): PromptHomeCommunicationConnectionSnapshot {
  if (typeof window === "undefined") {
    return { ...PROMPT_HOME_COMMUNICATION_DEFAULT_CONNECTIONS };
  }

  const storedValue = window.localStorage.getItem(
    PROMPT_HOME_COMMUNICATION_CONNECTIONS_STORAGE_KEY,
  );
  if (!storedValue) {
    return { ...PROMPT_HOME_COMMUNICATION_DEFAULT_CONNECTIONS };
  }

  try {
    return normalizePromptHomeCommunicationConnectionSnapshot(
      JSON.parse(storedValue),
    );
  } catch {
    return { ...PROMPT_HOME_COMMUNICATION_DEFAULT_CONNECTIONS };
  }
}

function savePromptHomeCommunicationConnectionSnapshot(
  snapshot: PromptHomeCommunicationConnectionSnapshot,
): PromptHomeCommunicationConnectionSnapshot {
  const normalizedSnapshot =
    normalizePromptHomeCommunicationConnectionSnapshot(snapshot);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      PROMPT_HOME_COMMUNICATION_CONNECTIONS_STORAGE_KEY,
      JSON.stringify(normalizedSnapshot),
    );
  }

  return normalizedSnapshot;
}

function formatSlackRuntimeStatus(
  settings: MessagingSlackRuntimeSettings | null,
  loading: boolean,
  error: string,
): string {
  if (loading) {
    return "Checking";
  }
  if (error) {
    return "Unavailable";
  }
  if (!settings) {
    return "Not checked";
  }
  if (!settings.enabled) {
    return "Disabled";
  }
  if (!settings.configured) {
    return "Needs API setup";
  }
  return `${settings.configured_channel_count.toLocaleString()} channels`;
}

export function PromptHomeCommunicationCard({
  instanceId = "communication",
  authSession,
  counts,
  sourceMessages = [],
  sourceMessagesLoading = false,
  sourceMessagesError = "",
  onOpenMessagesWorkspace = null,
  onRefreshSourceMessages = null,
  initialSettingsOpen = false,
}: PromptHomeCommunicationCardProps) {
  const panelId = promptHomeInstanceScopedId(
    PROMPT_HOME_COMMUNICATION_PANEL_ID,
    instanceId,
    "communication",
  );
  const communicationExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      "prompt-home.communication-card",
      instanceId,
      "communication",
    ),
    true,
  );
  const settingsDialogId = promptHomeInstanceScopedId(
    PROMPT_HOME_COMMUNICATION_SETTINGS_DIALOG_ID,
    instanceId,
    "communication",
  );
  const settingsDialogTitleId = `${settingsDialogId}-title`;
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen);
  const [connectionSettings, setConnectionSettings] = useState(() =>
    getPromptHomeCommunicationConnectionSnapshot(),
  );
  const [slackSettings, setSlackSettings] =
    useState<MessagingSlackRuntimeSettings | null>(null);
  const [slackSettingsLoading, setSlackSettingsLoading] = useState(false);
  const [slackSettingsError, setSlackSettingsError] = useState("");
  const [slackSyncing, setSlackSyncing] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const signedIn = Boolean(authSession);
  const effectiveConnectionSettings = useMemo(() => {
    const nextSettings = {
      ...connectionSettings,
      slack: {
        ...connectionSettings.slack,
        connected:
          connectionSettings.slack.connected || sourceMessages.length > 0,
      },
    };
    return nextSettings;
  }, [connectionSettings, sourceMessages.length]);
  const localMessages = buildMessagingInboxMessages(counts).filter((message) => {
    if (message.type === "Email") {
      return (
        effectiveConnectionSettings.email.connected &&
        effectiveConnectionSettings.email.visible
      );
    }
    if (message.type === "App Message") {
      return (
        effectiveConnectionSettings["app-messages"].connected &&
        effectiveConnectionSettings["app-messages"].visible
      );
    }
    return true;
  });
  const displayedSourceMessages =
    effectiveConnectionSettings.slack.connected &&
    effectiveConnectionSettings.slack.visible
      ? sourceMessages
      : [];
  const messages = [...displayedSourceMessages, ...localMessages];
  const sourceMessageCount = displayedSourceMessages.length;
  const connectedSourceLabels =
    PROMPT_HOME_COMMUNICATION_CONNECTION_DEFINITIONS.filter(
      (definition) => effectiveConnectionSettings[definition.key].connected,
    ).map((definition) => definition.label);
  const connectedSourceCount = connectedSourceLabels.length;
  const connectedSourcesLabel =
    connectedSourceCount > 0
      ? connectedSourceLabels.join(", ")
      : "No connected sources";
  const sourceMessagesLabel =
    sourceMessageCount === 1 ? "1 synced Slack message" : `${sourceMessageCount.toLocaleString()} synced Slack messages`;
  const footerNote = sourceMessagesLoading
    ? "Checking synced message sources for this Home inbox."
    : sourceMessagesError
      ? sourceMessagesError
      : sourceMessageCount > 0
        ? `${sourceMessagesLabel} are included beside the local Home inbox lanes.`
        : effectiveConnectionSettings.slack.connected
          ? "Sync Slack from the settings view to bring live channel rows into this Home inbox."
        : signedIn
          ? "Connect Slack, Teams, email, or app messages from Settings."
          : "These are sample inbox rows for now. After sign-in, synced Slack rows can appear beside the local Home inbox lanes.";
  const {
    className: dragHandleClassName,
    ...dragHandleAttributes
  } = usePromptHomeCardDragHandle<HTMLDivElement>();

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    let active = true;
    setSlackSettingsLoading(true);
    setSlackSettingsError("");

    void loadMessagingSlackSettings(appConfig.apiBase)
      .then((settings) => {
        if (!active) {
          return;
        }
        setSlackSettings(settings);
        setSlackSettingsError("");
        setSlackSettingsLoading(false);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setSlackSettings(null);
        setSlackSettingsError(
          error instanceof Error
            ? error.message
            : "Could not load Slack messaging connector settings.",
        );
        setSlackSettingsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settingsOpen]);

  function updateConnectionSettings(
    key: PromptHomeCommunicationConnectionKey,
    patch: Partial<PromptHomeCommunicationConnectionState>,
    options: { preserveStatus?: boolean } = {},
  ) {
    setConnectionSettings((current) => {
      const nextSettings = savePromptHomeCommunicationConnectionSnapshot({
        ...current,
        [key]: {
          ...current[key],
          ...patch,
        },
      });
      return nextSettings;
    });
    if (!options.preserveStatus) {
      setSettingsStatus("");
    }
  }

  async function handleSyncSlack() {
    if (!authSession?.accessToken) {
      setSettingsStatus("Sign in before syncing Slack.");
      return;
    }
    if (!slackSettings?.configured) {
      setSettingsStatus("Slack Web API is not configured.");
      return;
    }

    setSlackSyncing(true);
    setSettingsStatus("");
    try {
      const result = await syncMessagingSlackWorkspace(appConfig.apiBase, {
        accessToken: authSession.accessToken,
      });
      await onRefreshSourceMessages?.();
      setSettingsStatus(
        `Synced ${result.synced_channel_count.toLocaleString()} Slack conversation${result.synced_channel_count === 1 ? "" : "s"} with ${result.imported_message_count.toLocaleString()} new message${result.imported_message_count === 1 ? "" : "s"}.`,
      );
      updateConnectionSettings(
        "slack",
        { connected: true, visible: true },
        { preserveStatus: true },
      );
    } catch (error) {
      setSettingsStatus(
        error instanceof Error ? error.message : "Could not sync Slack messages.",
      );
    } finally {
      setSlackSyncing(false);
    }
  }

  return (
    <section
      className={`prompt-home-communication-card ${communicationExpandedState.expanded ? "is-expanded" : "is-collapsed"}`}
    >
      <div
        {...dragHandleAttributes}
        className={mergePromptHomeClassNames(
          "prompt-home-communication-card-head",
          dragHandleClassName,
        )}
      >
        <div className="prompt-home-communication-card-copy">
          <span className="eyebrow">Communication</span>
          <strong>Communication center</strong>
        </div>

        {communicationExpandedState.expanded ? (
          <div
            className="prompt-home-communication-card-head-actions"
            aria-label="Communication actions"
          >
            <button
              type="button"
              className="button button-secondary prompt-home-communication-settings-button"
              aria-controls={settingsDialogId}
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </button>
          </div>
        ) : null}

        <div className="prompt-home-communication-card-side">
          <button
            type="button"
            className="prompt-home-communication-card-toggle"
            aria-label={
              communicationExpandedState.expanded
                ? "Collapse Communication center"
                : "Expand Communication center"
            }
            aria-expanded={communicationExpandedState.expanded}
            aria-controls={panelId}
            onClick={() =>
              communicationExpandedState.setExpanded((current) => !current)
            }
          >
            <div className="prompt-home-communication-card-toggle-meta">
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
        id={panelId}
        className="prompt-home-communication-card-body"
        hidden={!communicationExpandedState.expanded}
      >
        <MessagingInboxPanel
          messages={messages}
          footer={
            <div className="prompt-home-communication-footer">
              <p className="form-note">{footerNote}</p>
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
      {settingsOpen ? (
        <div
          className="prompt-home-communication-settings-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSettingsOpen(false);
            }
          }}
        >
          <section
            id={settingsDialogId}
            className="prompt-home-communication-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={settingsDialogTitleId}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSettingsOpen(false);
              }
            }}
          >
            <header className="prompt-home-communication-settings-head">
              <div>
                <span className="eyebrow">Communication</span>
                <h3 id={settingsDialogTitleId}>Messaging Settings</h3>
                <p>{connectedSourcesLabel}</p>
              </div>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setSettingsOpen(false)}
              >
                Close
              </button>
            </header>

            <div className="prompt-home-communication-settings-body">
              <section className="prompt-home-communication-settings-section">
                <div className="prompt-home-communication-settings-section-head">
                  <strong>Connected sources</strong>
                  <span>
                    {connectedSourceCount.toLocaleString()} active
                  </span>
                </div>
                <div className="prompt-home-communication-source-list">
                  {PROMPT_HOME_COMMUNICATION_CONNECTION_DEFINITIONS.map(
                    (definition) => {
                      const connection =
                        effectiveConnectionSettings[definition.key];
                      const isSlack = definition.key === "slack";
                      const slackRuntimeStatus = isSlack
                        ? formatSlackRuntimeStatus(
                            slackSettings,
                            slackSettingsLoading,
                            slackSettingsError,
                          )
                        : null;

                      return (
                        <article
                          key={definition.key}
                          className={`prompt-home-communication-source-row ${connection.connected ? "is-connected" : "is-disconnected"}`}
                        >
                          <div className="prompt-home-communication-source-copy">
                            <span>
                              {definition.type} · {definition.provider}
                            </span>
                            <strong>{definition.label}</strong>
                            <p>
                              {definition.detail}
                              {slackRuntimeStatus
                                ? ` · ${slackRuntimeStatus}`
                                : ""}
                            </p>
                          </div>
                          <div className="prompt-home-communication-source-actions">
                            <label className="prompt-home-communication-source-toggle">
                              <input
                                type="checkbox"
                                checked={connection.connected && connection.visible}
                                disabled={!connection.connected}
                                onChange={(event) =>
                                  updateConnectionSettings(definition.key, {
                                    visible: event.currentTarget.checked,
                                  })
                                }
                              />
                              <span>Show</span>
                            </label>
                            {isSlack ? (
                              <button
                                type="button"
                                className="button button-secondary"
                                disabled={slackSyncing}
                                onClick={() => void handleSyncSlack()}
                              >
                                {slackSyncing ? "Syncing..." : "Sync"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={
                                connection.connected
                                  ? "button button-ghost"
                                  : "button button-secondary"
                              }
                              onClick={() =>
                                updateConnectionSettings(definition.key, {
                                  connected: !connection.connected,
                                  visible: connection.connected
                                    ? connection.visible
                                    : true,
                                })
                              }
                            >
                              {connection.connected ? "Disconnect" : "Connect"}
                            </button>
                          </div>
                        </article>
                      );
                    },
                  )}
                </div>
              </section>
              {settingsStatus || slackSettingsError ? (
                <p
                  className={`prompt-home-communication-settings-note ${slackSettingsError ? "is-error" : ""}`}
                >
                  {settingsStatus || slackSettingsError}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
