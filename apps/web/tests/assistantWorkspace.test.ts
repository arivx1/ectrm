import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { AssistantWorkspace } from "../src/workspaces/assistant/AssistantWorkspace";

test("assistant workspace renders the grounded prompt console on the server", () => {
  const markup = renderToStaticMarkup(
    createElement(AssistantWorkspace, {
      authSession: null,
      globalFilter: "",
      health: "ok",
      trades: [],
      events: [],
      positions: [],
      selectedTrade: null,
      selectedTradeEvents: [],
      onOpenSettings: () => undefined,
      onRefreshData: async () => undefined,
    }),
  );

  assert.match(markup, /Grounded Prompt Console/);
  assert.match(markup, />Voice Unavailable</);
});
