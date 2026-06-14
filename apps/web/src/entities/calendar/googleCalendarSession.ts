import type { GoogleCalendarEvent } from "./googleCalendar";

const GOOGLE_CALENDAR_SESSION_EVENT =
  "ectrm:google-calendar-session-change";
const GOOGLE_CALENDAR_SELECTED_ID_STORAGE_KEY =
  "ectrm.google-calendar.selected-calendar-id";
const GOOGLE_CALENDAR_SELECTED_SUMMARY_STORAGE_KEY =
  "ectrm.google-calendar.selected-calendar-summary";
const GOOGLE_CALENDAR_SELECTED_CALENDARS_STORAGE_KEY =
  "ectrm.google-calendar.selected-calendars";
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
const EMPTY_GOOGLE_CALENDAR_SELECTIONS: GoogleCalendarSelection[] = [];

export type GoogleCalendarSelection = {
  id: string;
  summary: string | null;
};

export type GoogleCalendarSessionSnapshot = {
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  selectedCalendarId: string;
  selectedCalendarSummary: string | null;
  selectedCalendars: GoogleCalendarSelection[];
  scopeGranted: boolean;
  cachedEvents: GoogleCalendarEvent[];
  cachedAt: string | null;
};

type GoogleCalendarSessionRawSnapshot = {
  accessToken: string;
  accessTokenExpiresAt: string;
  selectedCalendarId: string;
  selectedCalendarSummary: string;
  selectedCalendars: string;
  scopeGranted: boolean;
  cachedEvents: string;
  cachedAt: string;
};

const DEFAULT_GOOGLE_CALENDAR_SESSION_SNAPSHOT: GoogleCalendarSessionSnapshot = {
  accessToken: null,
  accessTokenExpiresAt: null,
  selectedCalendarId: "",
  selectedCalendarSummary: null,
  selectedCalendars: EMPTY_GOOGLE_CALENDAR_SELECTIONS,
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

function readPersistentStorageString(key: string): string {
  const localValue = readLocalStorageString(key);
  if (localValue) {
    return localValue;
  }

  return readSessionStorageString(key);
}

function readPersistentStorageRaw(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const localValue = window.localStorage.getItem(key);
  if (localValue !== null) {
    return localValue;
  }

  return readSessionStorageRaw(key);
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

function clearSessionStorageKey(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(key);
}

function writePersistentStorageString(key: string, value: string): void {
  writeLocalStorageString(key, value);
  clearSessionStorageKey(key);
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
      window.localStorage.removeItem(GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY);
      window.sessionStorage.removeItem(
        GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY,
      );
    }
    return EMPTY_GOOGLE_CALENDAR_EVENTS;
  }
}

function normalizeGoogleCalendarSelections(
  value: unknown,
): GoogleCalendarSelection[] {
  if (!Array.isArray(value)) {
    return EMPTY_GOOGLE_CALENDAR_SELECTIONS;
  }

  const seenIds = new Set<string>();
  const selections: GoogleCalendarSelection[] = [];

  for (const item of value) {
    const candidate =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id || seenIds.has(id)) {
      continue;
    }

    const summary =
      typeof candidate.summary === "string"
        ? candidate.summary.trim() || null
        : null;
    selections.push({ id, summary });
    seenIds.add(id);
  }

  return selections.length > 0 ? selections : EMPTY_GOOGLE_CALENDAR_SELECTIONS;
}

function parseSelectedCalendars(args: {
  rawValue: string;
  selectedCalendarId: string;
  selectedCalendarSummary: string;
}): GoogleCalendarSelection[] {
  if (args.rawValue.trim()) {
    try {
      const parsedValue = JSON.parse(args.rawValue) as unknown;
      const selectedCalendars = normalizeGoogleCalendarSelections(parsedValue);
      if (selectedCalendars.length > 0) {
        return selectedCalendars;
      }
    } catch {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(
          GOOGLE_CALENDAR_SELECTED_CALENDARS_STORAGE_KEY,
        );
      }
    }
  }

  const fallbackId = args.selectedCalendarId.trim();
  if (!fallbackId) {
    return EMPTY_GOOGLE_CALENDAR_SELECTIONS;
  }

  return [
    {
      id: fallbackId,
      summary: args.selectedCalendarSummary.trim() || null,
    },
  ];
}

function writeCachedEvents(events: GoogleCalendarEvent[]): void {
  if (typeof window === "undefined") {
    return;
  }

  if (events.length === 0) {
    window.localStorage.removeItem(GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY);
    window.sessionStorage.removeItem(GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY,
    JSON.stringify(events),
  );
  window.sessionStorage.removeItem(GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY);
}

function writeSelectedCalendars(selections: GoogleCalendarSelection[]): void {
  if (typeof window === "undefined") {
    return;
  }

  if (selections.length === 0) {
    window.localStorage.removeItem(GOOGLE_CALENDAR_SELECTED_CALENDARS_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    GOOGLE_CALENDAR_SELECTED_CALENDARS_STORAGE_KEY,
    JSON.stringify(selections),
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
    accessToken: readPersistentStorageString(GOOGLE_CALENDAR_ACCESS_TOKEN_STORAGE_KEY),
    accessTokenExpiresAt: readPersistentStorageString(
      GOOGLE_CALENDAR_ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY,
    ),
    selectedCalendarId: readLocalStorageString(
      GOOGLE_CALENDAR_SELECTED_ID_STORAGE_KEY,
    ),
    selectedCalendarSummary: readPersistentStorageString(
      GOOGLE_CALENDAR_SELECTED_SUMMARY_STORAGE_KEY,
    ),
    selectedCalendars: readPersistentStorageRaw(
      GOOGLE_CALENDAR_SELECTED_CALENDARS_STORAGE_KEY,
    ),
    scopeGranted: readLocalStorageBoolean(
      GOOGLE_CALENDAR_SCOPE_GRANTED_STORAGE_KEY,
    ),
    cachedEvents: readPersistentStorageRaw(
      GOOGLE_CALENDAR_CACHED_EVENTS_STORAGE_KEY,
    ),
    cachedAt: readPersistentStorageString(GOOGLE_CALENDAR_CACHED_AT_STORAGE_KEY),
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
    left.selectedCalendars === right.selectedCalendars &&
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
  const selectedCalendars = parseSelectedCalendars({
    rawValue: rawSnapshot.selectedCalendars,
    selectedCalendarId: rawSnapshot.selectedCalendarId,
    selectedCalendarSummary: rawSnapshot.selectedCalendarSummary,
  });
  cachedGoogleCalendarSessionSnapshot = {
    accessToken: rawSnapshot.accessToken || null,
    accessTokenExpiresAt: parseStorageNumber(rawSnapshot.accessTokenExpiresAt),
    selectedCalendarId: rawSnapshot.selectedCalendarId,
    selectedCalendarSummary: rawSnapshot.selectedCalendarSummary || null,
    selectedCalendars,
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
  saveGoogleCalendarSelectedCalendars(
    selection.selectedCalendarId.trim()
      ? [
          {
            id: selection.selectedCalendarId,
            summary: selection.selectedCalendarSummary ?? null,
          },
        ]
      : [],
  );
}

export function formatGoogleCalendarSelectionSummary(
  selections: GoogleCalendarSelection[],
): string | null {
  const normalizedSelections = normalizeGoogleCalendarSelections(selections);
  if (normalizedSelections.length === 0) {
    return null;
  }

  if (normalizedSelections.length === 1) {
    return normalizedSelections[0]?.summary ?? normalizedSelections[0]?.id ?? null;
  }

  const firstSelection = normalizedSelections[0];
  const firstLabel = firstSelection?.summary ?? firstSelection?.id ?? "Calendar";
  const additionalCount = normalizedSelections.length - 1;
  return `${firstLabel} + ${additionalCount} ${additionalCount === 1 ? "calendar" : "calendars"}`;
}

export function saveGoogleCalendarSelectedCalendars(
  selections: GoogleCalendarSelection[],
): void {
  const normalizedSelections = normalizeGoogleCalendarSelections(selections);
  const primarySelection = normalizedSelections[0] ?? null;

  writeLocalStorageString(
    GOOGLE_CALENDAR_SELECTED_ID_STORAGE_KEY,
    primarySelection?.id ?? "",
  );
  writePersistentStorageString(
    GOOGLE_CALENDAR_SELECTED_SUMMARY_STORAGE_KEY,
    formatGoogleCalendarSelectionSummary(normalizedSelections) ?? "",
  );
  writeSelectedCalendars(normalizedSelections);
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
  writePersistentStorageString(
    GOOGLE_CALENDAR_ACCESS_TOKEN_STORAGE_KEY,
    access.accessToken,
  );
  writePersistentStorageString(
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
  writePersistentStorageString(
    GOOGLE_CALENDAR_SELECTED_SUMMARY_STORAGE_KEY,
    cache.selectedCalendarSummary?.trim() ?? "",
  );
  writeCachedEvents(cache.events);
  writePersistentStorageString(
    GOOGLE_CALENDAR_CACHED_AT_STORAGE_KEY,
    cache.cachedAt,
  );
  emitGoogleCalendarSessionChange();
}

export function clearGoogleCalendarSession(): void {
  writeLocalStorageString(GOOGLE_CALENDAR_SELECTED_ID_STORAGE_KEY, "");
  writeLocalStorageBoolean(GOOGLE_CALENDAR_SCOPE_GRANTED_STORAGE_KEY, false);
  writePersistentStorageString(GOOGLE_CALENDAR_SELECTED_SUMMARY_STORAGE_KEY, "");
  writeSelectedCalendars([]);
  writePersistentStorageString(GOOGLE_CALENDAR_ACCESS_TOKEN_STORAGE_KEY, "");
  writePersistentStorageString(
    GOOGLE_CALENDAR_ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY,
    "",
  );
  writeCachedEvents([]);
  writePersistentStorageString(GOOGLE_CALENDAR_CACHED_AT_STORAGE_KEY, "");
  emitGoogleCalendarSessionChange();
}
