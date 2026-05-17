import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { buildMessagingInboxMessages } from "../src/workspaces/messages/messagingInboxData";
import { MessagingInboxPanel } from "../src/workspaces/messages/MessagingInboxPanel";

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
