import assert from "node:assert/strict";

import { test } from "vitest";

import {
  buildPromptHomeSystemTemplate,
  getPromptHomeCardDefinition,
  getPromptHomeCardLabel,
  isPromptHomeCardKey,
  listPromptHomeCardDefinitions,
  normalizePromptHomeTemplateCards,
  PROMPT_HOME_CARD_KEYS,
  PROMPT_HOME_CARD_VISIBILITY_OPTIONS,
  PROMPT_HOME_SYSTEM_TEMPLATE,
  PROMPT_HOME_SYSTEM_TEMPLATE_KEY,
  PROMPT_HOME_SYSTEM_TEMPLATE_VERSION,
} from "../src/workspaces/prompt/promptHomeCards";

test("prompt home card registry keeps stable card ids and labels", () => {
  assert.deepEqual(PROMPT_HOME_CARD_KEYS, [
    "timeframe",
    "prices",
    "map",
    "documents",
    "communication",
    "prompt",
  ]);
  assert.deepEqual(
    PROMPT_HOME_CARD_VISIBILITY_OPTIONS.map((option) => option.label),
    [
      "Desk Time",
      "Market Prices",
      "Asset map",
      "Upload documents",
      "Communication center",
      "Ask the desk assistant",
    ],
  );
  assert.equal(getPromptHomeCardLabel("prices"), "Market Prices");
  assert.equal(getPromptHomeCardDefinition("map").kind, "asset_map");
  assert.equal(isPromptHomeCardKey("communication"), true);
  assert.equal(isPromptHomeCardKey("old-card"), false);
});

test("prompt home system template is built from the registry", () => {
  const template = buildPromptHomeSystemTemplate();

  assert.equal(template.templateKey, PROMPT_HOME_SYSTEM_TEMPLATE_KEY);
  assert.equal(template.templateVersion, PROMPT_HOME_SYSTEM_TEMPLATE_VERSION);
  assert.equal(template.label, "System Home");
  assert.equal(template.immutable, true);
  assert.deepEqual(
    template.cards.map((card) => card.cardId),
    PROMPT_HOME_CARD_KEYS,
  );
  assert.deepEqual(
    template.cards.map((card) => card.placement.order),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    template.cards.map((card) => card.visible),
    [true, true, true, true, true, true],
  );
  assert.deepEqual(PROMPT_HOME_SYSTEM_TEMPLATE, template);
  assert.equal(Object.isFrozen(PROMPT_HOME_SYSTEM_TEMPLATE), true);
  assert.equal(Object.isFrozen(PROMPT_HOME_SYSTEM_TEMPLATE.cards), true);
  assert.equal(Object.isFrozen(PROMPT_HOME_SYSTEM_TEMPLATE.cards[0]), true);
  assert.equal(
    Object.isFrozen(PROMPT_HOME_SYSTEM_TEMPLATE.cards[0]?.placement),
    true,
  );
});

test("prompt home template normalization drops unknown cards and appends new defaults", () => {
  const cards = normalizePromptHomeTemplateCards({
    cards: [
      {
        cardId: "prices",
        visible: false,
        placement: {
          order: 99,
          columnSpan: 1,
          rowSpan: 2,
        },
        parameters: {
          price_sort: "updated_desc",
        },
        filters: {
          price_index_code: "HH_NATGAS",
        },
      },
      {
        cardId: "old-card",
        visible: true,
      },
      {
        cardId: "prices",
        visible: true,
      },
      {
        cardId: "map",
        visible: true,
        placement: {
          columnSpan: 2,
          rowSpan: 2,
        },
      },
    ],
  });

  assert.deepEqual(
    cards.map((card) => card.cardId),
    ["prices", "map", "timeframe", "documents", "communication", "prompt"],
  );
  assert.deepEqual(
    cards.map((card) => card.placement.order),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(cards[0]?.visible, false);
  assert.deepEqual(cards[0]?.parameters, {
    price_sort: "updated_desc",
  });
  assert.deepEqual(cards[0]?.filters, {
    price_index_code: "HH_NATGAS",
  });
  assert.equal(cards[0]?.placement.columnSpan, 1);
  assert.equal(cards[0]?.placement.rowSpan, 2);
  assert.equal(cards[1]?.placement.columnSpan, 2);
  assert.equal(cards[1]?.placement.rowSpan, 2);
});

test("prompt home registry definitions expose allowed parameters and data bindings", () => {
  const definitions = listPromptHomeCardDefinitions();
  const prices = definitions.find((definition) => definition.cardId === "prices");
  const prompt = definitions.find((definition) => definition.cardId === "prompt");

  assert.ok(prices);
  assert.ok(prompt);
  assert.deepEqual(prices.allowedFilterFields, [
    "commodity_code",
    "location_code",
    "price_index_code",
    "provider",
    "quote_type",
  ]);
  assert.deepEqual(prices.dataBindings, [
    "latest_price_marks",
    "market_price_indices",
  ]);
  assert.deepEqual(prompt.allowedParameters, [
    "default_summary_targets",
    "starter_kit",
  ]);
});
