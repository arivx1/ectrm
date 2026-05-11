import assert from "node:assert/strict";

import { afterEach, test } from "vitest";

import {
  DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT,
  getPromptHomeMapRecordLimit,
  normalizePromptHomeMapRecordLimit,
  savePromptHomeMapRecordLimit,
} from "../src/workspaces/prompt/promptHomeMapRecordLimit";

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
    value: { localStorage },
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

test("prompt home map record limit normalizes invalid values to the default", () => {
  assert.equal(
    normalizePromptHomeMapRecordLimit(500),
    500,
  );
  assert.equal(
    normalizePromptHomeMapRecordLimit("250"),
    250,
  );
  assert.equal(
    normalizePromptHomeMapRecordLimit("999"),
    DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT,
  );
  assert.equal(
    normalizePromptHomeMapRecordLimit(null),
    DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT,
  );
});

test("prompt home map record limit reads and writes the stored preference", () => {
  installWindowWithStorage();

  assert.equal(
    getPromptHomeMapRecordLimit(),
    DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT,
  );
  assert.equal(savePromptHomeMapRecordLimit(500), 500);
  assert.equal(getPromptHomeMapRecordLimit(), 500);
  assert.equal(
    savePromptHomeMapRecordLimit(DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT),
    DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT,
  );
  assert.equal(
    getPromptHomeMapRecordLimit(),
    DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT,
  );
});
