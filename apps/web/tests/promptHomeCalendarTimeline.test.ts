import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, test, vi } from "vitest";

import { PromptHomeWorkspace } from "../src/workspaces/prompt/PromptHomeWorkspace";

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

type StorageStub = Storage & {
  __store: Map<string, string>;
};

function createStorageStub(): StorageStub {
  const store = new Map<string, string>();

  return {
    __store: store,
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const originalWindow = globalThis.window;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-08T16:30:00.000Z"));

  const localStorage = createStorageStub();
  const sessionStorage = createStorageStub();

  localStorage.setItem(
    "ectrm.time-display-settings",
    JSON.stringify({ timeZone: "America/Los_Angeles" }),
  );
  localStorage.setItem("ectrm.google-calendar.selected-calendar-id", "primary");
  localStorage.setItem("ectrm.google-calendar.scope-granted", "true");

  localStorage.setItem(
    "ectrm.google-calendar.selected-calendar-summary",
    "Trading Desk",
  );
  localStorage.setItem("ectrm.google-calendar.access-token", "calendar-token");
  localStorage.setItem(
    "ectrm.google-calendar.access-token-expires-at",
    String(Date.now() + 3_600_000),
  );
  localStorage.setItem(
    "ectrm.google-calendar.cached-at",
    "2026-05-08T16:00:00.000Z",
  );
  localStorage.setItem(
    "ectrm.google-calendar.cached-events",
    JSON.stringify([
      {
        id: "evt-1",
        summary: "Desk sync",
        description: null,
        location: "Houston",
        htmlLink: "https://calendar.google.com/calendar/event?eid=desk-sync",
        status: "confirmed",
        creatorEmail: null,
        organizerEmail: "desk@example.com",
        start: {
          date: null,
          dateTime: "2026-05-08T16:00:00.000Z",
          timeZone: "UTC",
        },
        end: {
          date: null,
          dateTime: "2026-05-08T16:30:00.000Z",
          timeZone: "UTC",
        },
      },
      {
        id: "evt-2",
        summary: "Settlement cutoff",
        description: null,
        location: null,
        htmlLink: null,
        status: "confirmed",
        creatorEmail: null,
        organizerEmail: "settlement@example.com",
        start: {
          date: "2026-05-08",
          dateTime: null,
          timeZone: null,
        },
        end: {
          date: "2026-05-09",
          dateTime: null,
          timeZone: null,
        },
      },
      {
        id: "evt-3",
        summary: "Weekend nominations",
        description: null,
        location: "Remote",
        htmlLink: null,
        status: "tentative",
        creatorEmail: null,
        organizerEmail: "ops@example.com",
        start: {
          date: null,
          dateTime: "2026-05-09T20:00:00.000Z",
          timeZone: "UTC",
        },
        end: {
          date: null,
          dateTime: "2026-05-09T21:00:00.000Z",
          timeZone: "UTC",
        },
      },
    ]),
  );

  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage,
      sessionStorage,
      requestAnimationFrame: () => 0,
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
});

test("prompt home timeline cards render cached Google Calendar agenda items", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      onOpenView: () => undefined,
    }),
  );

  assert.match(markup, /Calendar agenda/);
  assert.match(markup, /This week/);
  assert.match(markup, /This month/);
  assert.match(markup, /Trading Desk/);
  assert.match(markup, /Desk sync/);
  assert.match(markup, /Settlement cutoff/);
  assert.match(markup, /Weekend nominations/);
  assert.match(markup, /Pull Google Calendar into the day timeline card/);
  assert.match(markup, /Pull Google Calendar into the week timeline card/);
  assert.match(markup, /Pull Google Calendar into the month timeline card/);
  assert.match(markup, /2 events today/);
  assert.match(markup, /3 events this week/);
  assert.match(markup, /3 events this month/);
  assert.doesNotMatch(
    markup,
    /Connect Google Calendar in Settings to overlay schedule events here\./,
  );
});

test("prompt home timeline cards do not duplicate disconnected calendar guidance", () => {
  globalThis.window?.localStorage.removeItem(
    "ectrm.google-calendar.selected-calendar-id",
  );
  globalThis.window?.localStorage.removeItem(
    "ectrm.google-calendar.scope-granted",
  );
  globalThis.window?.localStorage.removeItem(
    "ectrm.google-calendar.selected-calendar-summary",
  );
  globalThis.window?.localStorage.removeItem(
    "ectrm.google-calendar.access-token",
  );
  globalThis.window?.localStorage.removeItem(
    "ectrm.google-calendar.access-token-expires-at",
  );
  globalThis.window?.localStorage.removeItem("ectrm.google-calendar.cached-at");
  globalThis.window?.localStorage.removeItem(
    "ectrm.google-calendar.cached-events",
  );

  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      onOpenView: () => undefined,
    }),
  );

  assert.equal(
    (
      markup.match(
        /Connect Google Calendar in Settings to overlay schedule events here\./g,
      ) ?? []
    ).length,
    3,
  );
});

test("prompt home timeline cards hide calendar sections when a card is unchecked", () => {
  globalThis.window?.localStorage.setItem(
    "ectrm.prompt-home.calendar-card-state",
    JSON.stringify({
      day: false,
      week: false,
      month: true,
    }),
  );

  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      onOpenView: () => undefined,
    }),
  );

  assert.doesNotMatch(markup, /Calendar agenda/);
  assert.doesNotMatch(markup, /This week/);
  assert.match(markup, /This month/);
  assert.match(markup, /Google Calendar off for this card/);
  assert.match(markup, /Google Calendar off/);
  assert.match(markup, /Weekend nominations/);
});
