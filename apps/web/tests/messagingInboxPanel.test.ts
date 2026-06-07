import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import {
  buildMessagingInboxMessages,
  buildSlackMessagingInboxMessages,
} from "../src/workspaces/messages/messagingInboxData";
import { MessagingInboxPanel } from "../src/workspaces/messages/MessagingInboxPanel";
import { PromptHomeCommunicationCard } from "../src/workspaces/prompt/PromptHomeCommunicationCard";

const defaultCounts = {
  activeTrades: 12,
  openWorkItems: 7,
  operationsQueueItems: 3,
  settlementQueueItems: 2,
  pendingInvoices: 4,
  paymentsDue: 1,
  attentionItems: 5,
  stalePricingItems: 2,
  pendingPricingTrades: 3,
  pendingSettlementTrades: 6,
};

test("messaging inbox panel renders compact expandable records", () => {
  const markup = renderToStaticMarkup(
    createElement(MessagingInboxPanel, {
      messages: buildMessagingInboxMessages(defaultCounts),
    }),
  );

  assert.match(markup, /aria-label="Communication inbox"/);
  assert.match(markup, /class="prompt-home-communication-record-list"/);
  assert.doesNotMatch(markup, /class="prompt-home-communication-record is-expanded"/);
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="prompt-home-communication-record-panel-email"/,
  );
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="prompt-home-communication-record-panel-todo"/,
  );
  assert.match(
    markup,
    /id="prompt-home-communication-record-panel-email" class="prompt-home-communication-record-panel" aria-label="Communication details: Northshore sent a revised delivery window" hidden=""/,
  );
  assert.match(
    markup,
    /id="prompt-home-communication-record-panel-todo" class="prompt-home-communication-record-panel" aria-label="Communication details: 7 open work items waiting for follow-through" hidden=""/,
  );
  assert.match(markup, /Counterparty email · Example inbox row/);
  assert.match(markup, /Reply lane/);
  assert.doesNotMatch(markup, /Selected communication thread/);
});

test("messaging inbox can render Slack as an additional Home source", () => {
  const slackMessages = buildSlackMessagingInboxMessages([
    {
      conversation_id: "slack-C123SLACK",
      section: "Channels",
      kind: "channel",
      label: "#desk-ops",
      connected_workspace: "Slack",
      assistant_workspace: "assistant",
      description: "Synced from Slack.",
      topic: "Desk operations.",
      composer_hint: "Messages sent here post to Slack and are mirrored locally.",
      sort_order: 900,
      preview: "Older Slack preview.",
      unread_count: 1,
      latest_activity_at: "2026-02-02T10:00:00Z",
      highlights: [],
      metrics: [],
      members: [],
      source_provider: "slack",
      timeline: [
        {
          id: "slack-C123SLACK-1770000000_000100",
          kind: "message",
          created_at: "2026-02-02T10:00:00Z",
          source: "human",
          label: null,
          detail: null,
          author: {
            name: "Slack Operator",
            title: "Slack user",
            presence: "Synced from Slack",
            initials: "SO",
            tone: "human",
          },
          body: ["Can @[Desk Ops] confirm the revised delivery note?"],
          reactions: [],
          attachment: null,
          parent_message_id: null,
          thread_root_message_id: "slack-C123SLACK-1770000000_000100",
          reply_count: 0,
          thread_participants: [],
          created_by_user_id: null,
          created_by_role: null,
          edited_at: null,
          deleted_at: null,
          pinned_at: null,
        },
      ],
    },
  ]);
  const markup = renderToStaticMarkup(
    createElement(MessagingInboxPanel, {
      messages: slackMessages,
    }),
  );

  assert.equal(slackMessages.length, 1);
  assert.equal(slackMessages[0]?.type, "Slack");
  assert.equal(slackMessages[0]?.lane, "#desk-ops");
  assert.equal(
    slackMessages[0]?.subject,
    "Slack Operator posted in #desk-ops",
  );
  assert.match(markup, /data-message-type="Slack"/);
  assert.match(markup, /Can @Desk Ops confirm the revised delivery note\?/);
  assert.match(markup, /Slack · #desk-ops/);
  assert.match(markup, /Unread/);
});

test("communication card renders messaging connection settings as a pop-out", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeCommunicationCard, {
      authSession: null,
      counts: defaultCounts,
      initialSettingsOpen: true,
    }),
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /Messaging Settings/);
  assert.match(markup, /Connected sources/);
  assert.match(markup, /Slack Web API/);
  assert.match(markup, /Microsoft Teams/);
  assert.match(markup, /Shared inbox/);
  assert.match(markup, /App Messages/);
  assert.match(markup, />Sync<\/button>/);
  assert.match(markup, />Connect<\/button>/);
  assert.match(markup, />Disconnect<\/button>/);
});
