import type { GoogleCalendarEvent } from "./googleCalendar";

const GOOGLE_CALENDAR_SESSION_EVENT =
  "ectrm:google-calendar-session-change";
const GOOGLE_CALENDAR_SELECTED_ID_STORAGE_KEY =
  "ectrm.google-calendar.selected-calendar-id";
const GOOGLE_CALENDAR_SELECTED_SUMMARY_STORAGE_KEY =
  "ectrm.google-calendar.selected-calendar-summary";
const GOOGLE_CALENDAR_SCOPE_GRANTED_STORAGE_KEY =
  "ectrm.google-calendar.scope-granted";
const GOOGLE_CALENDAR_ACCESS_TOKEN_STORAGE_KEY =
  "ectrm.google-calendar.access-token";
const GOOGLE_CALENDAR_ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY =
  "ectrm.google-calendar.access-token-expires-at";
const GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY =
  "ectrm.google-calendar.cached-events";
const GOOGLE_CALENDAR_CACHED_AT_STORAGE_KEY =
  "ectrm.google-calendar.cached-at";

const EMPTY_GOOGLE_CALENDAR_EVENTS: GoogleCalendarEvent[] = [];

export type GoogleCalendarSessionSnapshot = {
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  selectedCalendarId: string;
  selectedCalendarSummary: string | null;
  scopeGranted: boolean;
  cachedEvents: GoogleCalendarEvent[];
  cachedAt: string | null;
};

type GoogleCalendarSessionRawSnapshot = {
  accessToken: string;
  accessTokenExpiresAt: string;
  selectedCalendarId: string;
  selectedCalendarSummary: string;
  scopeGranted: boolean;
  cachedEvents: string;
  cachedAt: string;
};

const DEFAULT_GOOGLE_CALENDAR_SESSION_SNAPSHOT: GoogleCalendarSessionSnapshot = {
  accessToken: null,
  accessTokenExpiresAt: null,
  selectedCalendarId: "",
  selectedCalendarSummary: null,
  scopeGranted: false,
  cachedEvents: EMPTY_GOOGLE_CALENDAR_EVENTS,
  cachedAt: null,
};

let cachedGoogleCalendarSessionRawSnapshot:
  | GoogleCalendarSessionRawSnapshot
  | null = null;
let cachedGoogleCalendarSessionSnapshot =
  DEFAULT_GOOGLE_CALENDAR_SESSION_SNAPSHOT;

function readLocalStorageString(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(key)?.trim() ?? "";
}

function readSessionStorageString(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(key)?.trim() ?? "";
}

function readSessionStorageRaw(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(key) ?? "";
}

function writeLocalStorageString(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, normalizedValue);
}

function writeSessionStorageString(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    window.sessionStorage.removeItem(key);
    return;
  }

  window.sessionStorage.setItem(key, normalizedValue);
}

function readLocalStorageBoolean(key: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) === "true";
}

function writeLocalStorageBoolean(key: string, value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  if (value) {
    window.localStorage.setItem(key, "true");
    return;
  }

  window.localStorage.removeItem(key);
}

function parseStorageNumber(rawValue: string): number | null {
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseCachedEvents(rawValue: string): GoogleCalendarEvent[] {
  if (!rawValue.trim()) {
    return EMPTY_GOOGLE_CALENDAR_EVENTS;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsedValue)
      ? parsedValue.length > 0
        ? (parsedValue as GoogleCalendarEvent[])
        : EMPTY_GOOGLE_CALENDAR_EVENTS
      : EMPTY_GOOGLE_CALENDAR_EVENTS;
  } catch {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(
        GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY,
      );
    }
    return EMPTY_GOOGLE_CALENDAR_EVENTS;
  }
}

function writeCachedEvents(events: GoogleCalendarEvent[]): void {
  if (typeof window === "undefined") {
    return;
  }

  if (events.length === 0) {
    window.sessionStorage.removeItem(GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(
    GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY,
    JSON.stringify(events),
  );
}

function emitGoogleCalendarSessionChange(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(GOOGLE_CALENDAR_SESSION_EVENT));
}

function readGoogleCalendarSessionRawSnapshot(): GoogleCalendarSessionRawSnapshot {
  return {
    accessToken: readSessionStorageString(GOOGLE_CALENDAR_ACCESS_TOKEN_STORAGE_KEY),
    accessTokenExpiresAt: readSessionStorageString(
      GOOGLE_CALENDAR_ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY,
    ),
    selectedCalendarId: readLocalStorageString(
      GOOGLE_CALENDAR_SELECTED_ID_STORAGE_KEY,
    ),
    selectedCalendarSummary: readSessionStorageString(
      GOOGLE_CALENDAR_SELECTED_SUMMARY_STORAGE_KEY,
    ),
    scopeGranted: readLocalStorageBoolean(
      GOOGLE_CALENDAR_SCOPE_GRANTED_STORAGE_KEY,
    ),
    cachedEvents: readSessionStorageRaw(
      GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY,
    ),
    cachedAt: readSessionStorageString(GOOGLE_CALENDAR_CACHED_AT_STORAGE_KEY),
  };
}

function sameGoogleCalendarSessionRawSnapshot(
  left: GoogleCalendarSessionRawSnapshot | null,
  right: GoogleCalendarSessionRawSnapshot,
): boolean {
  return (
    left?.accessToken === right.accessToken &&
    left.accessTokenExpiresAt === right.accessTokenExpiresAt &&
    left.selectedCalendarId === right.selectedCalendarId &&
    left.selectedCalendarSummary === right.selectedCalendarSummary &&
    left.scopeGranted === right.scopeGranted &&
    left.cachedEvents === right.cachedEvents &&
    left.cachedAt === right.cachedAt
  );
}

export function getGoogleCalendarSessionSnapshot(): GoogleCalendarSessionSnapshot {
  if (typeof window === "undefined") {
    return DEFAULT_GOOGLE_CALENDAR_SESSION_SNAPSHOT;
  }

  const rawSnapshot = readGoogleCalendarSessionRawSnapshot();
  if (
    sameGoogleCalendarSessionRawSnapshot(
      cachedGoogleCalendarSessionRawSnapshot,
      rawSnapshot,
    )
  ) {
    return cachedGoogleCalendarSessionSnapshot;
  }

  cachedGoogleCalendarSessionRawSnapshot = rawSnapshot;
  cachedGoogleCalendarSessionSnapshot = {
    accessToken: rawSnapshot.accessToken || null,
    accessTokenExpiresAt: parseStorageNumber(rawSnapshot.accessTokenExpiresAt),
    selectedCalendarId: rawSnapshot.selectedCalendarId,
    selectedCalendarSummary: rawSnapshot.selectedCalendarSummary || null,
    scopeGranted: rawSnapshot.scopeGranted,
    cachedEvents: parseCachedEvents(rawSnapshot.cachedEvents),
    cachedAt: rawSnapshot.cachedAt || null,
  };
  return cachedGoogleCalendarSessionSnapshot;
}

export function subscribeGoogleCalendarSession(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      !event.key ||
      event.key.startsWith("ectrm.google-calendar.")
    ) {
      listener();
    }
  };

  window.addEventListener(GOOGLE_CALENDAR_SESSION_EVENT, listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(GOOGLE_CALENDAR_SESSION_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function googleCalendarSessionTokenIsUsable(
  snapshot: Pick<GoogleCalendarSessionSnapshot, "accessToken" | "accessTokenExpiresAt">,
): boolean {
  return Boolean(
    snapshot.accessToken &&
      (snapshot.accessTokenExpiresAt === null ||
        Date.now() < snapshot.accessTokenExpiresAt),
  );
}

export function saveGoogleCalendarSelection(
  selection: {
    selectedCalendarId: string;
    selectedCalendarSummary?: string | null;
  },
): void {
  writeLocalStorageString(
    GOOGLE_CALENDAR_SELECTED_ID_STORAGE_KEY,
    selection.selectedCalendarId,
  );
  writeSessionStorageString(
    GOOGLE_CALENDAR_SELECTED_SUMMARY_STORAGE_KEY,
    selection.selectedCalendarSummary?.trim() ?? "",
  );
  emitGoogleCalendarSessionChange();
}

export function saveGoogleCalendarScopeGranted(scopeGranted: boolean): void {
  writeLocalStorageBoolean(
    GOOGLE_CALENDAR_SCOPE_GRANTED_STORAGE_KEY,
    scopeGranted,
  );
  emitGoogleCalendarSessionChange();
}

export function saveGoogleCalendarAccessToken(
  access: {
    accessToken: string;
    accessTokenExpiresAt: number | null;
  },
): void {
  writeSessionStorageString(
    GOOGLE_CALENDAR_ACCESS_TOKEN_STORAGE_KEY,
    access.accessToken,
  );
  writeSessionStorageString(
    GOOGLE_CALENDAR_ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY,
    access.accessTokenExpiresAt === null
      ? ""
      : String(access.accessTokenExpiresAt),
  );
  emitGoogleCalendarSessionChange();
}

export function saveGoogleCalendarEventCache(
  cache: {
    selectedCalendarSummary?: string | null;
    events: GoogleCalendarEvent[];
    cachedAt: string;
  },
): void {
  writeSessionStorageString(
    GOOGLE_CALENDAR_SELECTED_SUMMARY_STORAGE_KEY,
    cache.selectedCalendarSummary?.trim() ?? "",
  );
  writeCachedEvents(cache.events);
  writeSessionStorageString(
    GOOGLE_CALENDAR_CACHED_AT_STORAGE_KEY,
    cache.cachedAt,
  );
  emitGoogleCalendarSessionChange();
}

export function clearGoogleCalendarSession(): void {
  writeLocalStorageString(GOOGLE_CALENDAR_SELECTED_ID_STORAGE_KEY, "");
  writeLocalStorageBoolean(GOOGLE_CALENDAR_SCOPE_GRANTED_STORAGE_KEY, false);
  writeSessionStorageString(GOOGLE_CALENDAR_SELECTED_SUMMARY_STORAGE_KEY, "");
  writeSessionStorageString(GOOGLE_CALENDAR_ACCESS_TOKEN_STORAGE_KEY, "");
  writeSessionStorageString(
    GOOGLE_CALENDAR_ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY,
    "",
  );
  writeCachedEvents([]);
  writeSessionStorageString(GOOGLE_CALENDAR_CACHED_AT_STORAGE_KEY, "");
  emitGoogleCalendarSessionChange();
}
