import assert from "node:assert/strict";

import { afterEach, test } from "vitest";

import {
  buildPromptHomeCardsFromLocalPreferences,
  buildPromptHomeCardsFromOrderAndHidden,
  getPromptHomeCardOrderSnapshot,
  getPromptHomeHiddenCardKeysSnapshot,
  normalizePromptHomeCardOrder,
  normalizePromptHomeHiddenCardKeys,
  promptHomeTemplateCardsToOrderAndHidden,
  PROMPT_HOME_CARD_ORDER_STORAGE_KEY,
  PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY,
  savePromptHomeCardOrder,
  savePromptHomeHiddenCardKeys,
} from "../src/workspaces/prompt/promptHomeCardVisibility";

type LocalStorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const originalWindow = globalThis.window;

function installWindowWithStorage(initialEntries: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initialEntries));
  const localStorage: LocalStorageMock = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value);
    },
    removeItem: (key) => {
      storage.delete(key);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      dispatchEvent: () => true,
    },
  });
}

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("prompt home card visibility normalizes hidden cards", () => {
  assert.deepEqual(
    normalizePromptHomeHiddenCardKeys([
      "prices",
      "unknown-card",
      "map",
      "prices",
      12,
    ]),
    ["prices", "map"],
  );
  assert.deepEqual(
    normalizePromptHomeHiddenCardKeys({
      hidden: ["communication", "documents", "unsupported"],
    }),
    ["communication", "documents"],
  );
});

test("prompt home card order normalizes known cards and appends missing cards", () => {
  assert.deepEqual(
    normalizePromptHomeCardOrder([
      "prompt",
      "unknown-card",
      "map",
      "prompt",
      12,
    ]),
    ["prompt", "map", "timeframe", "prices", "news", "documents", "communication"],
  );
  assert.deepEqual(
    normalizePromptHomeCardOrder({
      order: ["communication", "documents", "unsupported"],
    }),
    ["communication", "documents", "timeframe", "prices", "news", "map", "prompt"],
  );
});

test("prompt home card visibility reads and writes the stored preference", () => {
  installWindowWithStorage();

  assert.deepEqual(getPromptHomeHiddenCardKeysSnapshot(), []);
  assert.deepEqual(savePromptHomeHiddenCardKeys(["prompt", "map", "prompt"]), [
    "prompt",
    "map",
  ]);
  assert.deepEqual(getPromptHomeHiddenCardKeysSnapshot(), ["prompt", "map"]);

  assert.deepEqual(savePromptHomeHiddenCardKeys([]), []);
  assert.deepEqual(getPromptHomeHiddenCardKeysSnapshot(), []);
});

test("prompt home card order reads and writes the stored preference", () => {
  installWindowWithStorage();

  assert.deepEqual(getPromptHomeCardOrderSnapshot(), [
    "timeframe",
    "prices",
    "news",
    "map",
    "documents",
    "communication",
    "prompt",
  ]);
  assert.deepEqual(savePromptHomeCardOrder(["prompt", "map"]), [
    "prompt",
    "map",
    "timeframe",
    "prices",
    "news",
    "documents",
    "communication",
  ]);
  assert.deepEqual(getPromptHomeCardOrderSnapshot(), [
    "prompt",
    "map",
    "timeframe",
    "prices",
    "news",
    "documents",
    "communication",
  ]);
});

test("prompt home card visibility ignores malformed storage entries", () => {
  installWindowWithStorage({
    [PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY]: JSON.stringify({
      hidden: ["timeframe", "old-card"],
    }),
  });

  assert.deepEqual(getPromptHomeHiddenCardKeysSnapshot(), ["timeframe"]);
});

test("prompt home card order ignores malformed storage entries", () => {
  installWindowWithStorage({
    [PROMPT_HOME_CARD_ORDER_STORAGE_KEY]: JSON.stringify({
      order: ["communication", "old-card"],
    }),
  });

  assert.deepEqual(getPromptHomeCardOrderSnapshot(), [
    "communication",
    "timeframe",
    "prices",
    "news",
    "map",
    "documents",
    "prompt",
  ]);
});

test("prompt home cards can seed a personal view from local order and visibility", () => {
  installWindowWithStorage({
    [PROMPT_HOME_CARD_ORDER_STORAGE_KEY]: JSON.stringify({
      order: ["prompt", "map", "prices"],
    }),
    [PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY]: JSON.stringify({
      hidden: ["map", "old-card"],
    }),
  });

  const cards = buildPromptHomeCardsFromLocalPreferences();

  assert.deepEqual(
    cards.map((card) => card.cardId),
    ["prompt", "map", "prices", "timeframe", "news", "documents", "communication"],
  );
  assert.deepEqual(
    cards.map((card) => card.placement.order),
    [0, 1, 2, 3, 4, 5, 6],
  );
  assert.equal(cards.find((card) => card.cardId === "map")?.visible, false);
  assert.equal(cards.find((card) => card.cardId === "prompt")?.visible, true);
  assert.deepEqual(promptHomeTemplateCardsToOrderAndHidden(cards), {
    order: ["prompt", "map", "prices", "timeframe", "news", "documents", "communication"],
    hidden: ["map"],
  });
});

test("prompt home reset cards resolve to the immutable system card order", () => {
  const cards = buildPromptHomeCardsFromOrderAndHidden([], []);

  assert.deepEqual(
    promptHomeTemplateCardsToOrderAndHidden(cards),
    {
      order: [
        "timeframe",
        "prices",
        "news",
        "map",
        "documents",
        "communication",
        "prompt",
      ],
      hidden: [],
    },
  );
});

test("prompt home card rebuilds preserve saved card parameters and filters", () => {
  const cards = buildPromptHomeCardsFromOrderAndHidden(
    ["prices", "map"],
    [],
    [
      {
        cardId: "prices",
        visible: true,
        placement: { order: 0, columnSpan: 2, rowSpan: 1 },
        parameters: { price_mark_status: "with_marks", price_sort: "updated_desc" },
        filters: { price_index_code: "HH_NATGAS", commodity_code: "NATGAS" },
        dataBindings: ["latest_price_marks", "market_price_indices"],
      },
      {
        cardId: "map",
        visible: true,
        placement: { order: 1, columnSpan: 2, rowSpan: 2 },
        parameters: { map_record_limit: 250 },
        filters: { geography: ["North America"] },
        dataBindings: ["asset_map", "spatial_features", "weather_overlays"],
      },
    ],
  );

  assert.deepEqual(cards[0]?.parameters, {
    price_mark_status: "with_marks",
    price_sort: "updated_desc",
  });
  assert.deepEqual(cards[0]?.filters, {
    price_index_code: "HH_NATGAS",
    commodity_code: "NATGAS",
  });
  assert.deepEqual(cards[1]?.parameters, { map_record_limit: 250 });
  assert.deepEqual(cards[1]?.filters, { geography: ["North America"] });
});
