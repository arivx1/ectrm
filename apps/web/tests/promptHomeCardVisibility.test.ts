import assert from "node:assert/strict";

import { afterEach, test } from "vitest";

import {
  buildPromptHomeCardsFromLocalPreferences,
  buildPromptHomeCardsFromOrderAndHidden,
  deletePromptHomeCardInstance,
  getPromptHomeCardOrderSnapshot,
  getPromptHomeHiddenCardKeysSnapshot,
  normalizePromptHomeCardOrder,
  normalizePromptHomeHiddenCardKeys,
  promptHomeTemplateCardsToOrderAndHidden,
  PROMPT_HOME_CARD_ORDER_STORAGE_KEY,
  PROMPT_HOME_TEMPLATE_CARDS_STORAGE_KEY,
  PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY,
  resizePromptHomeCardPlacement,
  resizePromptHomeCardPlacementToSpan,
  savePromptHomeCardOrder,
  savePromptHomeHiddenCardKeys,
} from "../src/workspaces/prompt/promptHomeCardVisibility";
import { normalizePromptHomeTemplateCards } from "../src/workspaces/prompt/promptHomeCards";

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
    [
      "prompt",
      "map",
      "timeframe",
      "exchanges",
      "calendar",
      "prices",
      "news",
      "documents",
      "communication",
    ],
  );
  assert.deepEqual(
    normalizePromptHomeCardOrder({
      order: ["communication", "documents", "unsupported"],
    }),
    [
      "communication",
      "documents",
      "timeframe",
      "exchanges",
      "calendar",
      "prices",
      "news",
      "map",
      "prompt",
    ],
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
    "exchanges",
    "calendar",
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
    "exchanges",
    "calendar",
    "prices",
    "news",
    "documents",
    "communication",
  ]);
  assert.deepEqual(getPromptHomeCardOrderSnapshot(), [
    "prompt",
    "map",
    "timeframe",
    "exchanges",
    "calendar",
    "prices",
    "news",
    "documents",
    "communication",
  ]);
});

test("prompt home local preferences preserve duplicate card instances", () => {
  installWindowWithStorage({
    [PROMPT_HOME_TEMPLATE_CARDS_STORAGE_KEY]: JSON.stringify({
      cards: [
        {
          instanceId: "prices",
          cardId: "prices",
          visible: true,
          placement: { order: 0, columnSpan: 2, rowSpan: 1 },
          parameters: { price_sort: "updated_desc" },
          filters: {},
        },
        {
          instanceId: "prices-copy-2",
          cardId: "prices",
          visible: true,
          placement: {
            order: 1,
            columnSpan: 3,
            rowSpan: 2,
            collapsedColumnSpan: 1,
            collapsedRowSpan: 2,
            expandedColumnSpan: 3,
            expandedRowSpan: 2,
          },
          parameters: { price_sort: "product_asc" },
          filters: { commodity_code: "NATGAS" },
        },
      ],
    }),
  });

  const cards = buildPromptHomeCardsFromLocalPreferences();

  assert.deepEqual(
    cards.slice(0, 3).map((card) => [card.instanceId, card.cardId]),
    [
      ["prices", "prices"],
      ["prices-copy-2", "prices"],
      ["timeframe", "timeframe"],
    ],
  );
  assert.deepEqual(cards[1]?.parameters, { price_sort: "product_asc" });
  assert.deepEqual(cards[1]?.filters, { commodity_code: "NATGAS" });
  assert.deepEqual(cards[0]?.placement, {
    order: 0,
    columnSpan: 2,
    rowSpan: 4,
    collapsedColumnSpan: 2,
    collapsedRowSpan: 1,
    expandedColumnSpan: 2,
    expandedRowSpan: 4,
  });
  assert.deepEqual(cards[1]?.placement, {
    order: 1,
    columnSpan: 3,
    rowSpan: 2,
    collapsedColumnSpan: 1,
    collapsedRowSpan: 2,
    expandedColumnSpan: 3,
    expandedRowSpan: 2,
  });
});

test("prompt home card delete removes duplicates and hides sole built-in cards", () => {
  const cards = normalizePromptHomeTemplateCards({
    cards: [
      {
        instanceId: "prices",
        cardId: "prices",
        visible: true,
        placement: { order: 0, columnSpan: 2, rowSpan: 4 },
      },
      {
        instanceId: "prices-copy-2",
        cardId: "prices",
        visible: true,
        placement: { order: 1, columnSpan: 2, rowSpan: 4 },
      },
    ],
  });

  const withoutDuplicate = deletePromptHomeCardInstance(cards, "prices-copy-2");

  assert.equal(
    withoutDuplicate.some((card) => card.instanceId === "prices-copy-2"),
    false,
  );
  assert.equal(
    withoutDuplicate.find((card) => card.instanceId === "prices")?.visible,
    true,
  );

  const withoutSoleBuiltIn = deletePromptHomeCardInstance(
    withoutDuplicate,
    "prices",
  );

  assert.equal(
    withoutSoleBuiltIn.some((card) => card.instanceId === "prices"),
    true,
  );
  assert.equal(
    withoutSoleBuiltIn.find((card) => card.instanceId === "prices")?.visible,
    false,
  );
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
    "exchanges",
    "calendar",
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
    [
      "prompt",
      "map",
      "prices",
      "timeframe",
      "exchanges",
      "calendar",
      "news",
      "documents",
      "communication",
    ],
  );
  assert.deepEqual(
    cards.map((card) => card.placement.order),
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(cards.find((card) => card.cardId === "map")?.visible, false);
  assert.equal(cards.find((card) => card.cardId === "prompt")?.visible, true);
  assert.deepEqual(promptHomeTemplateCardsToOrderAndHidden(cards), {
    order: [
      "prompt",
      "map",
      "prices",
      "timeframe",
      "exchanges",
      "calendar",
      "news",
      "documents",
      "communication",
    ],
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
        "exchanges",
        "calendar",
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
        instanceId: "prices",
        cardId: "prices",
        visible: true,
        placement: {
          order: 0,
          columnSpan: 2,
          rowSpan: 4,
          collapsedColumnSpan: 2,
          collapsedRowSpan: 1,
          expandedColumnSpan: 2,
          expandedRowSpan: 4,
        },
        parameters: { price_mark_status: "with_marks", price_sort: "updated_desc" },
        filters: { price_index_code: "HH_NATGAS", commodity_code: "NATGAS" },
        dataBindings: ["latest_price_marks", "market_price_indices"],
      },
      {
        instanceId: "map",
        cardId: "map",
        visible: true,
        placement: {
          order: 1,
          columnSpan: 2,
          rowSpan: 4,
          collapsedColumnSpan: 2,
          collapsedRowSpan: 1,
          expandedColumnSpan: 2,
          expandedRowSpan: 4,
        },
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

test("prompt home card resize applies state-specific span limits", () => {
  const placement = {
    order: 0,
    columnSpan: 3,
    rowSpan: 4,
    collapsedColumnSpan: 1,
    collapsedRowSpan: 1,
    expandedColumnSpan: 3,
    expandedRowSpan: 4,
  } as const;

  const resizedFromCollapsed = resizePromptHomeCardPlacementToSpan(
    placement,
    "collapsed",
    "horizontal",
    2,
  );
  assert.equal(resizedFromCollapsed.collapsedColumnSpan, 2);
  assert.equal(resizedFromCollapsed.expandedColumnSpan, 2);
  assert.equal(resizedFromCollapsed.columnSpan, 2);

  const increasedFromExpanded = resizePromptHomeCardPlacement(
    placement,
    "expanded",
    "horizontal",
    "increase",
  );
  assert.equal(increasedFromExpanded.collapsedColumnSpan, 4);
  assert.equal(increasedFromExpanded.expandedColumnSpan, 4);
  assert.equal(increasedFromExpanded.columnSpan, 4);

  const verticalResize = resizePromptHomeCardPlacementToSpan(
    placement,
    "collapsed",
    "vertical",
    2,
  );
  assert.equal(verticalResize.collapsedColumnSpan, 1);
  assert.equal(verticalResize.expandedColumnSpan, 3);
  assert.equal(verticalResize.collapsedRowSpan, 2);
  assert.equal(verticalResize.expandedRowSpan, 4);

  const expandedVerticalResize = resizePromptHomeCardPlacementToSpan(
    placement,
    "expanded",
    "vertical",
    7,
  );
  assert.equal(expandedVerticalResize.rowSpan, 7);
  assert.equal(expandedVerticalResize.collapsedRowSpan, 1);
  assert.equal(expandedVerticalResize.expandedRowSpan, 7);

  const increasedExpandedHeight = resizePromptHomeCardPlacement(
    placement,
    "expanded",
    "vertical",
    "increase",
  );
  assert.equal(increasedExpandedHeight.rowSpan, 5);
  assert.equal(increasedExpandedHeight.expandedRowSpan, 5);

  const clampedExpandedVerticalResize = resizePromptHomeCardPlacementToSpan(
    placement,
    "expanded",
    "vertical",
    99,
  );
  assert.equal(clampedExpandedVerticalResize.rowSpan, 8);
  assert.equal(clampedExpandedVerticalResize.expandedRowSpan, 8);

  const clampedCollapsedVerticalResize = resizePromptHomeCardPlacementToSpan(
    placement,
    "collapsed",
    "vertical",
    99,
  );
  assert.equal(clampedCollapsedVerticalResize.collapsedRowSpan, 4);
  assert.equal(clampedCollapsedVerticalResize.expandedRowSpan, 4);
});
