import assert from "node:assert/strict";

import { afterEach, test } from "vitest";

import {
  getPromptHomeCardOrderSnapshot,
  getPromptHomeHiddenCardKeysSnapshot,
  normalizePromptHomeCardOrder,
  normalizePromptHomeHiddenCardKeys,
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
    ["prompt", "map", "timeframe", "prices", "documents", "communication"],
  );
  assert.deepEqual(
    normalizePromptHomeCardOrder({
      order: ["communication", "documents", "unsupported"],
    }),
    ["communication", "documents", "timeframe", "prices", "map", "prompt"],
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
    "documents",
    "communication",
  ]);
  assert.deepEqual(getPromptHomeCardOrderSnapshot(), [
    "prompt",
    "map",
    "timeframe",
    "prices",
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
    "map",
    "documents",
    "prompt",
  ]);
});
