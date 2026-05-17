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

const initialWorkspaceState = {
  conversations: [
    {
      conversation_id: "ectrm-assistant",
      section: "Starred" as const,
      kind: "channel" as const,
      label: "#ectrm-assistant",
      connected_workspace: "Assistant Console",
      assistant_workspace: "assistant",
      description: "Governed assistant drafts, approvals, and operator replies stay in one lane.",
      topic:
        "Keep governed assistant activity in the same feed as desk work, approval follow-through, and counterparty context.",
      composer_hint:
        "Reply here to keep assistant guidance threaded beside the operational follow-up it affects.",
      sort_order: 10,
      preview: "Approval packet is ready with owner, inputs, outputs, stop conditions, audit hooks, and rollback notes.",
      unread_count: 1,
      latest_activity_at: "2026-05-16T17:14:00Z",
      highlights: [
        "Action draft AR-204 is staged for review.",
        "Prompt context and tool evidence are ready in the assistant console.",
      ],
      metrics: [
        { label: "Governed drafts", value: "1 new" },
        { label: "Desk attention", value: "5" },
        { label: "Open work", value: "7" },
      ],
      members: [
        {
          name: "ECTRM Desk",
          title: "System notification",
          presence: "Watching the desk",
          initials: "EC",
          tone: "desk" as const,
        },
        {
          name: "Mia Chen",
          title: "Scheduler",
          presence: "Online",
          initials: "MC",
          tone: "human" as const,
        },
        {
          name: "Approvals Bot",
          title: "Action request lane",
          presence: "Reviewing",
          initials: "AB",
          tone: "system" as const,
        },
      ],
      timeline: [
        {
          id: "assistant-day",
          kind: "system" as const,
          created_at: "2026-05-16T17:05:00Z",
          source: "SYSTEM",
          label: "Today",
          detail: "Action draft AR-204 moved into governed review.",
          author: null,
          body: [],
          reactions: [],
          attachment: null,
          parent_message_id: null,
          thread_root_message_id: null,
          reply_count: 0,
          thread_participants: [],
          created_by_user_id: null,
          created_by_role: null,
          edited_at: null,
          deleted_at: null,
          pinned_at: null,
        },
        {
          id: "assistant-msg-1",
          kind: "message" as const,
          created_at: "2026-05-16T17:07:00Z",
          source: "human",
          label: null,
          detail: null,
          author: {
            name: "ECTRM Desk",
            title: "System notification",
            presence: "Watching the desk",
            initials: "EC",
            tone: "desk" as const,
          },
          body: [
            "Assistant staged a governed action draft for the Northshore timing exception.",
            "The recommendation keeps approval, provenance, and rollback expectations attached to the proposed workflow item.",
          ],
          reactions: ["ack 3", "needs review 1"],
          attachment: {
            label: "Action draft",
            title: "AR-204 governed action draft",
            summary:
              "Owner: Desk Ops. Stop conditions: missing counterparty confirmation, settlement conflict, or delivery variance without explanation.",
            footnote:
              "Open Assistant Console for prompt context, evidence, and the approval record.",
          },
          parent_message_id: null,
          thread_root_message_id: "assistant-msg-1",
          reply_count: 1,
          thread_participants: ["Mia Chen"],
          created_by_user_id: null,
          created_by_role: null,
          edited_at: null,
          deleted_at: null,
          pinned_at: "2026-05-16T17:16:00Z",
        },
        {
          id: "assistant-msg-2",
          kind: "message" as const,
          created_at: "2026-05-16T17:12:00Z",
          source: "human",
          label: null,
          detail: null,
          author: {
            name: "Mia Chen",
            title: "Scheduler",
            presence: "Online",
            initials: "MC",
            tone: "human" as const,
          },
          body: [
            "Keep this threaded with the nomination conversation so Operations can react without switching screens.",
          ],
          reactions: ["aligned 2"],
          attachment: null,
          parent_message_id: "assistant-msg-1",
          thread_root_message_id: "assistant-msg-1",
          reply_count: 0,
          thread_participants: [],
          created_by_user_id: "mia.chen",
          created_by_role: "OPERATIONS",
          edited_at: null,
          deleted_at: null,
          pinned_at: null,
        },
      ],
    },
    {
      conversation_id: "counterparty-email",
      section: "Channels" as const,
      kind: "channel" as const,
      label: "#counterparty-email",
      connected_workspace: "Operations",
      assistant_workspace: "operations",
      description: "Counterparty communication stays readable like chat while still carrying email context.",
      topic:
        "Use this lane for external timing notes, commercial clarifications, and the handoff back into operations or settlement.",
      composer_hint:
        "Reply with desk confirmation or route the lane into Operations without losing the message context.",
      sort_order: 20,
      preview:
        "Northshore asked for desk confirmation before 3 PM and attached a revised timing note for the next nomination window.",
      unread_count: 2,
      latest_activity_at: "2026-05-16T19:04:00Z",
      highlights: [
        "Counterparty deadline: confirm by 3 PM.",
        "Revised delivery window can flow straight into Operations once acknowledged.",
      ],
      metrics: [
        { label: "Ops queue", value: "3" },
        { label: "Settlement queue", value: "2" },
        { label: "Payments due", value: "1" },
      ],
      members: [
        {
          name: "Northshore LNG",
          title: "Counterparty contact",
          presence: "Awaiting reply",
          initials: "NL",
          tone: "human" as const,
        },
        {
          name: "Mia Chen",
          title: "Scheduler",
          presence: "Online",
          initials: "MC",
          tone: "human" as const,
        },
      ],
      timeline: [
        {
          id: "northshore-day",
          kind: "system" as const,
          created_at: "2026-05-16T18:55:00Z",
          source: "SYSTEM",
          label: "Today",
          detail: "Northshore revised the delivery note and requested confirmation.",
          author: null,
          body: [],
          reactions: [],
          attachment: null,
          parent_message_id: null,
          thread_root_message_id: null,
          reply_count: 0,
          thread_participants: [],
          created_by_user_id: null,
          created_by_role: null,
          edited_at: null,
          deleted_at: null,
          pinned_at: null,
        },
        {
          id: "northshore-msg-1",
          kind: "message" as const,
          created_at: "2026-05-16T18:57:00Z",
          source: "human",
          label: null,
          detail: null,
          author: {
            name: "Northshore LNG",
            title: "Counterparty contact",
            presence: "Awaiting reply",
            initials: "NL",
            tone: "human" as const,
          },
          body: [
            "We revised the delivery window for the next nomination cycle and need desk confirmation before 3 PM.",
          ],
          reactions: [],
          attachment: null,
          parent_message_id: null,
          thread_root_message_id: "northshore-msg-1",
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
  ],
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
      onSelectConversation: () => undefined,
      selectedConversationId: "ectrm-assistant",
      initialWorkspaceState,
    }),
  );

  assert.match(markup, /Message #ectrm-assistant/);
  assert.match(markup, /Conversation list/);
  assert.match(markup, /Thread details/);
  assert.match(markup, /Send message/);
  assert.match(markup, /Clear draft/);
  assert.match(markup, /Let messaging agent decide/);
  assert.match(markup, /@Mention/);
  assert.match(markup, /Emoji/);
  assert.match(markup, /Attach/);
  assert.match(markup, /Reply in thread/);
  assert.match(markup, /Quote/);
  assert.match(markup, /Open Assistant Console/);
  assert.match(markup, /Open Work Queue/);
  assert.match(markup, /Open Settlement/);
  assert.match(markup, /Action draft AR-204 moved into governed review/);
  assert.match(markup, /AR-204 governed action draft/);
  assert.doesNotMatch(markup, /Desk Messages/);
  assert.doesNotMatch(markup, /Desk channels/);
  assert.doesNotMatch(markup, /Jump to a channel or thread/);
  assert.doesNotMatch(markup, /Slack-style desk surface/);
});

test("messaging workspace honors the selected conversation instead of hard-wiring the first lane", () => {
  const markup = renderToStaticMarkup(
    createElement(MessagingWorkspace, {
      authSession: null,
      counts: defaultCounts,
      onSessionSync: () => undefined,
      onOpenPrompt: () => undefined,
      onOpenAssistant: () => undefined,
      onOpenOperations: () => undefined,
      onOpenSettlement: () => undefined,
      onSelectConversation: () => undefined,
      selectedConversationId: "counterparty-email",
      initialWorkspaceState,
    }),
  );

  assert.match(markup, /Message #counterparty-email/);
  assert.match(markup, /Northshore revised the delivery note and requested confirmation/);
  assert.doesNotMatch(markup, /Message #ectrm-assistant/);
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
    createdByUserId: "ops.admin",
    createdByRole: "OPS_ADMIN",
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
    assert.equal(lastTimelineItem.threadRootMessageId, "local-post-1");
  }
});

test("appendMessagingWorkspacePost keeps threaded replies attached to their root message", () => {
  const channel = buildMessagingWorkspaceChannels(defaultCounts)[0];
  const withRoot = appendMessagingWorkspacePost(channel, {
    id: "root-post-1",
    author: {
      name: "Admin",
      title: "Desk operator",
      presence: "You",
      initials: "AD",
      tone: "human",
    },
    timestamp: "3:45 PM",
    body: "Root message",
  });
  const withReply = appendMessagingWorkspacePost(withRoot, {
    id: "reply-post-1",
    author: {
      name: "Analyst",
      title: "Desk operator",
      presence: "Online",
      initials: "AN",
      tone: "human",
    },
    timestamp: "3:46 PM",
    body: "Thread reply",
    parentMessageId: "root-post-1",
    threadRootMessageId: "root-post-1",
  });

  const rootMessage = withReply.timeline.find(
    (item) => item.kind === "message" && item.id === "root-post-1",
  );
  const replyMessage = withReply.timeline.find(
    (item) => item.kind === "message" && item.id === "reply-post-1",
  );

  assert.equal(rootMessage?.kind, "message");
  assert.equal(replyMessage?.kind, "message");
  if (rootMessage?.kind === "message") {
    assert.equal(rootMessage.replyCount, 1);
    assert.deepEqual(rootMessage.threadParticipants, ["Analyst"]);
  }
  if (replyMessage?.kind === "message") {
    assert.equal(replyMessage.parentMessageId, "root-post-1");
    assert.equal(replyMessage.threadRootMessageId, "root-post-1");
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
      parent_message_id: null,
      thread_root_message_id: "msg-7",
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
      reactions: ["👍"],
      attachment: {
        label: "Attachment",
        title: "timing-note.pdf",
        summary: "application/pdf • 42 KB",
        footnote: "Added from the desk composer.",
      },
      edited_at: null,
      deleted_at: null,
      pinned_at: null,
      created_at: "2026-05-16T20:00:00Z",
    },
    "4:00 PM",
  );

  assert.equal(post.id, "msg-7");
  assert.equal(post.author.name, "ECTRM Assistant");
  assert.equal(post.author.tone, "system");
  assert.equal(post.timestamp, "4:00 PM");
  assert.equal(post.body, "Drafting a governed reply.");
  assert.equal(post.threadRootMessageId, "msg-7");
  assert.deepEqual(post.reactions, ["👍"]);
  assert.equal(post.attachment?.title, "timing-note.pdf");
});
