import assert from "node:assert/strict";

import { test } from "vitest";

import {
  createHomeViewDefinition,
  deleteHomeViewDefinition,
  listHomeViewDefinitions,
  resetHomeViewDefinition,
  toHomeViewCardPayload,
  updateHomeViewDefinition,
} from "../src/entities/home-views/api";
import { buildPromptHomeCardsFromOrderAndHidden } from "../src/workspaces/prompt/promptHomeCardVisibility";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function homeViewResponse() {
  return {
    definition_id: 7,
    definition_key: "home_view_7",
    name: "My Home",
    scope: "PERSONAL",
    base_template_key: "system_home",
    base_template_version: 1,
    persona_hint: "trader",
    cards: [
      {
        card_id: "prompt",
        kind: "assistant_prompt",
        label: "Ask the desk assistant",
        visible: true,
        placement: { order: 0, column_span: 2, row_span: 1 },
        parameters: {},
        filters: {},
        data_bindings: ["assistant_conversation", "operator_attention_counts"],
      },
    ],
    global_filters: {},
    status: "ACTIVE",
    created_at: "2026-05-24T12:00:00Z",
    created_by: "trader_1",
    updated_at: "2026-05-24T12:00:00Z",
    updated_by: "trader_1",
    version: 1,
    can_edit: true,
  };
}

test("home view API uses authenticated typed definition endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const method = init?.method ?? "GET";
    const payload = method === "GET" ? [homeViewResponse()] : homeViewResponse();

    return new Response(JSON.stringify(payload), {
      status: method === "POST" && String(url).endsWith("/home-view-definitions") ? 201 : 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const cards = buildPromptHomeCardsFromOrderAndHidden(["prompt", "prices"], [
      "prices",
    ]);
    const cardPayload = cards.map(toHomeViewCardPayload);

    await listHomeViewDefinitions("http://localhost:8000", "token-1");
    await createHomeViewDefinition("http://localhost:8000", "token-1", {
      name: "My Home",
      scope: "PERSONAL",
      base_template_key: "system_home",
      base_template_version: 1,
      persona_hint: "trader",
      cards: cardPayload,
      global_filters: {},
    });
    await updateHomeViewDefinition("http://localhost:8000", "token-1", 7, {
      cards: cardPayload,
    });
    await resetHomeViewDefinition("http://localhost:8000", "token-1", 7);
    await deleteHomeViewDefinition("http://localhost:8000", "token-1", 7);

    assert.deepEqual(
      calls.map((call) => call.url),
      [
        "http://localhost:8000/home-view-definitions",
        "http://localhost:8000/home-view-definitions",
        "http://localhost:8000/home-view-definitions/7",
        "http://localhost:8000/home-view-definitions/7/reset",
        "http://localhost:8000/home-view-definitions/7",
      ],
    );
    assert.deepEqual(
      calls.map((call) => call.init?.method ?? "GET"),
      ["GET", "POST", "PATCH", "POST", "DELETE"],
    );

    for (const call of calls) {
      assert.equal(new Headers(call.init?.headers).get("Authorization"), "Bearer token-1");
    }

    const createBody = JSON.parse(String(calls[1]?.init?.body)) as {
      cards: Array<{
        card_id: string;
        visible: boolean;
        placement: { column_span: number; row_span: number };
      }>;
    };
    assert.equal(createBody.cards[0]?.card_id, "prompt");
    assert.equal(createBody.cards[1]?.card_id, "prices");
    assert.equal(createBody.cards[1]?.visible, false);
    assert.deepEqual(createBody.cards[0]?.placement, {
      order: 0,
      column_span: 2,
      row_span: 1,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
