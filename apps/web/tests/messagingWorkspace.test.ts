import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { MessagingWorkspace } from "../src/workspaces/messages/MessagingWorkspace";
import { shouldSendMessageOnKeyDown } from "../src/workspaces/messages/messagingComposerKeybindings";
import {
  appendMessagingWorkspacePost,
  buildMessagingWorkspacePostFromRecord,
  buildMessagingWorkspaceChannels,
} from "../src/workspaces/messages/messagingInboxData";

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

test("messaging workspace renders the dedicated unified inbox view", () => {
  const markup = renderToStaticMarkup(
    createElement(MessagingWorkspace, {
      authSession: null,
      counts: defaultCounts,
      onSessionSync: () => undefined,
      onOpenPrompt: () => undefined,
      onOpenAssistant: () => undefined,
      onOpenOperations: () => undefined,
      onOpenSettlement: () => undefined,
    }),
  );

  assert.match(markup, /Message #ectrm-assistant/);
  assert.match(markup, /Thread details/);
  assert.match(markup, /Send message/);
  assert.match(markup, /Clear draft/);
  assert.match(markup, /Let messaging agent decide/);
  assert.match(markup, /Open Assistant Console/);
  assert.match(markup, /Open Work Queue/);
  assert.match(markup, /Open Settlement/);
  assert.match(markup, /Action draft AR-204 moved into governed review/);
  assert.match(markup, /AR-204 governed action draft/);
  assert.doesNotMatch(markup, /Desk Messages/);
  assert.doesNotMatch(markup, /Desk channels/);
  assert.doesNotMatch(markup, /Jump to a channel or thread/);
  assert.doesNotMatch(markup, /#counterparty-email/);
  assert.doesNotMatch(markup, /Slack-style desk surface/);
});

test("appendMessagingWorkspacePost adds a sent message to the selected thread shape", () => {
  const channel = buildMessagingWorkspaceChannels(defaultCounts)[0];
  assert.equal(channel.assistantWorkspace, "assistant");
  const updated = appendMessagingWorkspacePost(channel, {
    id: "local-post-1",
    author: {
      name: "Admin",
      title: "Desk operator",
      presence: "You",
      initials: "AD",
      tone: "human",
    },
    timestamp: "3:45 PM",
    body: "Hello\n\nThis is a test reply.",
  });

  assert.equal(updated.preview, "Hello");
  assert.equal(updated.timestamp, "3:45 PM");
  assert.equal(updated.unreadCount, 0);
  assert.match(updated.timeline[updated.timeline.length - 1]?.id ?? "", /local-post-1/);
  assert.equal(updated.members.some((member) => member.name === "Admin"), true);

  const lastTimelineItem = updated.timeline[updated.timeline.length - 1];
  assert.equal(lastTimelineItem?.kind, "message");
  if (lastTimelineItem?.kind === "message") {
    assert.deepEqual(lastTimelineItem.body, ["Hello", "This is a test reply."]);
  }
});

test("plain Enter sends while Shift+Enter keeps multiline drafting", () => {
  assert.equal(
    shouldSendMessageOnKeyDown({
      key: "Enter",
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: false,
    }),
    true,
  );

  assert.equal(
    shouldSendMessageOnKeyDown({
      key: "Enter",
      shiftKey: true,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: false,
    }),
    false,
  );

  assert.equal(
    shouldSendMessageOnKeyDown({
      key: "Enter",
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: true,
    }),
    false,
  );
});

test("buildMessagingWorkspacePostFromRecord preserves durable author metadata for thread rendering", () => {
  const post = buildMessagingWorkspacePostFromRecord(
    {
      message_id: "msg-7",
      conversation_id: "ectrm-assistant",
      source: "assistant",
      body: "Drafting a governed reply.",
      author: {
        name: "ECTRM Assistant",
        title: "Managed agent · Assistant Console",
        presence: "Responding in thread",
        initials: "EA",
        tone: "system",
      },
      assistant_run_id: 77,
      assistant_agent_id: "desk-ops-agent",
      assistant_agent_name: "Desk Ops Agent",
      created_by_user_id: "ops.admin",
      created_by_session_id: "session-1",
      created_by_role: "OPS_ADMIN",
      created_at: "2026-05-16T20:00:00Z",
    },
    "4:00 PM",
  );

  assert.equal(post.id, "msg-7");
  assert.equal(post.author.name, "ECTRM Assistant");
  assert.equal(post.author.tone, "system");
  assert.equal(post.timestamp, "4:00 PM");
  assert.equal(post.body, "Drafting a governed reply.");
});
