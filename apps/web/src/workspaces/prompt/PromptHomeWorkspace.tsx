import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  approveAssistantActionRequest,
  listAssistantPromptRouteRecommendations,
  loadAssistantRuntimeSettings,
  rejectAssistantActionRequest,
  requestAssistantResponse,
  submitAssistantPromptNavigationOutcome,
  synthesizeAssistantVoice,
  transcribeAssistantVoice,
} from "../../entities/assistant/api";
import {
  AssistantActionRequestList,
  type AssistantActionDecisionPayload,
} from "../../entities/assistant/AssistantActionRequestList";
import {
  loadAssetMapScopeSummary,
  loadInvoiceIssueCandidates,
  loadTradeAttentionCandidates,
  type AssetMapScopeSummary,
  type InvoiceIssueCandidateRecord,
  type TradeAttentionCandidateRecord,
} from "../../entities/app/api";
import {
  buildPromptNavigationIntentKey,
  buildPromptNavigationRouteHandoff,
  INVALID_PROMPT_NAVIGATION_WARNING,
  normalizePromptNavigationIntent,
  parsePromptNavigationIntentsFromAssistantContent,
  promptNavigationIntentDetail,
  promptNavigationIntentLabel,
  type PromptNavigationIntent,
} from "../../entities/app/promptNavigationIntent";
import {
  describeGoogleCalendarEventWindow,
  loadUpcomingGoogleCalendarEvents,
  parseGoogleCalendarDateOnly,
  type GoogleCalendarEvent,
} from "../../entities/calendar/googleCalendar";
import {
  getGoogleCalendarSessionSnapshot,
  googleCalendarSessionTokenIsUsable,
  saveGoogleCalendarEventCache,
  subscribeGoogleCalendarSession,
  type GoogleCalendarSessionSnapshot,
} from "../../entities/calendar/googleCalendarSession";
import { sessionHeaders } from "../../entities/app/workspaceDataShared";
import { appConfig } from "../../shared/config";
import { usePersistentCollapsibleCardState } from "../../shared/collapsibleCardState";
import type { AppRouteHandoff } from "../../shared/appRouteHandoff";
import type {
  AssistantActionRequest,
  AssistantProvider,
  AssistantPromptRouteRecommendation,
  AssistantRuntimeSettings,
  AssistantWorkspaceSummaryTarget,
  AssetRecord,
  LocationRecord,
  SpatialFeatureRecord,
  ViewKey,
  WeatherLocationRecord,
  WeatherSyncStatusRecord,
} from "../../shared/models";
import type { StoredAuthSession } from "../../shared/mutation";
import {
  clearPromptResumeIntent,
  getPromptResumeIntent,
  savePromptResumeIntent,
  savePromptSignInReturnIntent,
  subscribePromptResumeIntent,
} from "../../shared/promptResumeIntent";
import {
  formatTimeDisplayTimeZonePreferenceLabel,
  getTimeDisplaySettingsSnapshot,
  listTimeDisplayTimeZoneOptions,
  resolveTimeDisplayTimeZone,
  saveTimeDisplaySettingsSnapshot,
  type TimeDisplaySettings,
  type TimeDisplayTimeZoneOption,
} from "../../shared/timeDisplaySettings";
import {
  resolveVoicePlaybackButtonLabel,
  useVoicePlayback,
} from "../../shared/voicePlayback";
import { useVoiceComposer } from "../../shared/voiceComposer";
import {
  assetMapActivityLabelsForAsset,
  assetMapCountryCodeForRecord,
  assetMapCountryCodeForWeatherLocation,
  assetMapGeographyLabelForPoint,
  assetMapGeographyLabelForRecord,
  ASSET_MAP_ACTIVITY_LABELS,
  ASSET_MAP_GEOGRAPHY_LABELS,
  assetMapSubdivisionCodeForRecord,
  assetMapSubdivisionCodeForWeatherLocation,
  assetMapSubtypeLabelForAsset,
  buildAssetMapCountryOptions,
  buildAssetMapSubdivisionOptions,
  buildAssetMapSummary,
  formatAssetMapCountryLabel,
  formatAssetMapPlacement,
  formatAssetMapSource,
} from "../../features/reference-data/assetMap";
import { type PromptHomeCounts } from "./promptHomeStarters";
import { shouldAutoEnsurePromptHomeData } from "./promptHomeAutoLoad";
import {
  PROMPT_HOME_PROMPT_KITS,
  type PromptHomePromptKit,
} from "./promptHomePromptKits";
import { PromptHomeDocumentUploadCard } from "./PromptHomeDocumentUploadCard";
import { getPromptHomeNextClockTickDelay } from "./promptHomeClock";
import {
  getPromptHomeMapRecordLimit,
  PROMPT_HOME_MAP_RECORD_LIMIT_OPTIONS,
  savePromptHomeMapRecordLimit,
} from "./promptHomeMapRecordLimit";
import { buildPromptHomePromotedRoutes } from "./promptPromotedRoutes";
import {
  AssetMapCanvas,
  AssetMapRecordsCard,
  syncAssetActivityVisibilityState,
  setAllAssetGeographyVisibilityState,
  sortedUniqueAssetSubtypes,
  syncAssetGeographyVisibilityState,
  setAllAssetSubtypeVisibilityState,
  syncAssetSubtypeVisibilityState,
} from "../reference-data/tabs/AssetMapPanel";
import { SETTINGS_CUSTOM_EVENTS_CARD_ANCHOR_ID } from "../settings/userEventsPanelShared";

type PromptHomeWorkspaceProps = {
  authSession: StoredAuthSession | null;
  health: string;
  counts: PromptHomeCounts;
  assets?: AssetRecord[];
  locations?: LocationRecord[];
  spatialFeatures?: SpatialFeatureRecord[];
  weatherLocations?: WeatherLocationRecord[];
  weatherSyncStatus?: WeatherSyncStatusRecord | null;
  referenceDataLoaded?: boolean;
  referenceDataLoading?: boolean;
  onEnsureReferenceData?: () => Promise<void>;
  weatherDataLoaded?: boolean;
  weatherDataLoading?: boolean;
  weatherDataError?: string;
  onEnsureWeatherData?: () => Promise<void>;
  onOpenView: (view: ViewKey, handoff?: AppRouteHandoff | null) => void;
  customEventsHref?: string;
  onOpenCustomEvents?: () => void;
  onRefreshData?: () => Promise<void>;
  initialMessages?: PromptHomeMessage[];
  initialMapAssetLayerVisible?: boolean;
};

type PromptHomeMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: AssistantProvider;
  model?: string;
  runId?: number | null;
  warnings?: string[];
  actionRequests?: AssistantActionRequest[];
  navigationIntents?: PromptNavigationIntent[];
};

const QUICK_PROMPTS = [
  "What needs my attention right now?",
  "Summarize the open operations queue.",
  "Where should I look for exposure risk today?",
  "Help me decide which workspace to use for a trade issue.",
];

const PROMPT_HOME_PROMPT_CARD_PANEL_ID = "prompt-home-prompt-card-panel";
const PROMPT_HOME_TIMEFRAME_PANEL_ID = "prompt-home-timeframe-panel";
const PROMPT_HOME_DAY_PANEL_ID = "prompt-home-day-panel";
const PROMPT_HOME_WEEK_PANEL_ID = "prompt-home-week-panel";
const PROMPT_HOME_MONTH_PANEL_ID = "prompt-home-month-panel";
const PROMPT_HOME_MAP_PANEL_ID = "prompt-home-map-panel";
const PROMPT_HOME_TRADING_HOURS_PANEL_ID = "prompt-home-trading-hours-panel";
const PROMPT_HOME_DAY_CALENDAR_MARKER_LIMIT = 3;
const PROMPT_HOME_WEEK_CALENDAR_MARKER_LIMIT = 7;
const PROMPT_HOME_MONTH_CALENDAR_MARKER_LIMIT = 6;
const PROMPT_HOME_CALENDAR_AGENDA_LIST_LIMIT = 4;
const PROMPT_HOME_DAY_HOURS = 24;
const PROMPT_HOME_DAY_MINUTES = PROMPT_HOME_DAY_HOURS * 60;
const PROMPT_HOME_WEEK_DAYS = 7;
const PROMPT_HOME_WEEK_MINUTES =
  PROMPT_HOME_WEEK_DAYS * PROMPT_HOME_DAY_MINUTES;
const PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING = 7;
const PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING = 22;
const PROMPT_HOME_DAY_METER_TICKS = [0, 6, 12, 18, 24];
const PROMPT_HOME_WEEKDAY_SHORT_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
const PROMPT_HOME_WEEKDAY_FULL_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_KEY =
  "ectrm.prompt-home.calendar-card-state";
const PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_EVENT =
  "ectrm:prompt-home-calendar-card-state-change";
const PROMPT_HOME_CALENDAR_CARD_KEYS = ["day", "week", "month"] as const;

type PromptHomeMeterTick = {
  key: string;
  label: string;
  percent: number;
  align?: "start" | "center" | "end";
};

type PromptHomeMeterMarker = {
  key: string;
  label: string;
  detail: string;
  percent: number;
  align?: "start" | "end";
  tone?: "trading" | "calendar";
};

type PromptHomeCalendarAgendaItem = {
  key: string;
  title: string;
  primary: string;
  secondary: string;
  supportingText: string | null;
  htmlLink: string | null;
  year: number;
  month: number;
  day: number;
  weekdayIndex: number;
  minuteOfDay: number | null;
};

type PromptHomeZonedDateParts = {
  year: number;
  month: number;
  day: number;
  weekdayIndex: number;
  hour: number;
  minute: number;
  second: number;
};

type PromptHomeExchangeSessionWindow = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

type PromptHomeExchangeSessionDefinition = {
  key: string;
  label: string;
  detail: string;
  tone: "ice" | "lme" | "lme-ring" | "sgx" | "cme" | "eex" | "tocom";
  sourceTimeZone: string;
  sourceWindowLabel: string;
  windows: PromptHomeExchangeSessionWindow[];
};

type PromptHomeExchangeSessionSegment = {
  key: string;
  startPercent: number;
  widthPercent: number;
};

type PromptHomeCalendarCardKey =
  (typeof PROMPT_HOME_CALENDAR_CARD_KEYS)[number];

type PromptHomeCalendarCardStateSnapshot = Partial<
  Record<PromptHomeCalendarCardKey, boolean>
>;

function normalizePromptHomeCalendarCardStateSnapshot(
  value: unknown,
): PromptHomeCalendarCardStateSnapshot {
  if (!value || typeof value !== "object") {
    return {};
  }

  const record = value as Record<string, unknown>;
  const snapshot: PromptHomeCalendarCardStateSnapshot = {};
  for (const key of PROMPT_HOME_CALENDAR_CARD_KEYS) {
    if (typeof record[key] === "boolean") {
      snapshot[key] = record[key];
    }
  }

  return snapshot;
}

function getPromptHomeCalendarCardStateSnapshot(): PromptHomeCalendarCardStateSnapshot {
  if (typeof window === "undefined") {
    return {};
  }

  const storedValue = window.localStorage.getItem(
    PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_KEY,
  );
  if (!storedValue) {
    return {};
  }

  try {
    return normalizePromptHomeCalendarCardStateSnapshot(JSON.parse(storedValue));
  } catch {
    return {};
  }
}

function getPromptHomeCalendarCardStateValue(
  cardKey: PromptHomeCalendarCardKey,
  fallback: boolean,
): boolean {
  const snapshot = getPromptHomeCalendarCardStateSnapshot();
  return typeof snapshot[cardKey] === "boolean" ? snapshot[cardKey] : fallback;
}

function savePromptHomeCalendarCardStateValue(
  cardKey: PromptHomeCalendarCardKey,
  enabled: boolean,
): boolean {
  const nextSnapshot = {
    ...getPromptHomeCalendarCardStateSnapshot(),
    [cardKey]: enabled,
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_KEY,
      JSON.stringify(nextSnapshot),
    );
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new Event(PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_EVENT),
      );
    }
  }

  return enabled;
}

function subscribeToPromptHomeCalendarCardState(
  onStoreChange: () => void,
): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function" ||
    typeof window.removeEventListener !== "function"
  ) {
    return () => undefined;
  }

  const handleStoreEvent = (event: Event) => {
    if (event.type === "storage") {
      const storageEvent = event as StorageEvent;
      if (
        typeof storageEvent.key === "string" &&
        storageEvent.key !== PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_KEY
      ) {
        return;
      }
    }

    onStoreChange();
  };

  window.addEventListener(
    PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_EVENT,
    handleStoreEvent,
  );
  window.addEventListener("storage", handleStoreEvent);

  return () => {
    window.removeEventListener(
      PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_EVENT,
      handleStoreEvent,
    );
    window.removeEventListener("storage", handleStoreEvent);
  };
}

function usePersistentPromptHomeCalendarCardState(
  cardKey: PromptHomeCalendarCardKey,
  defaultEnabled: boolean,
): {
  enabled: boolean;
  setEnabled: (
    nextValue: boolean | ((currentValue: boolean) => boolean),
  ) => void;
} {
  const enabled = useSyncExternalStore(
    subscribeToPromptHomeCalendarCardState,
    () => getPromptHomeCalendarCardStateValue(cardKey, defaultEnabled),
    () => getPromptHomeCalendarCardStateValue(cardKey, defaultEnabled),
  );

  const setEnabled = useCallback(
    (nextValue: boolean | ((currentValue: boolean) => boolean)) => {
      const currentValue = getPromptHomeCalendarCardStateValue(
        cardKey,
        defaultEnabled,
      );
      const resolvedValue =
        typeof nextValue === "function" ? nextValue(currentValue) : nextValue;

      savePromptHomeCalendarCardStateValue(cardKey, resolvedValue);
    },
    [cardKey, defaultEnabled],
  );

  return {
    enabled,
    setEnabled,
  };
}

function formatPromptHomeMapSummary(params: {
  assetLayerVisible: boolean;
  filteredRecordCount: number;
  shownRecordCount: number;
  mapReadyRecordCount: number;
}): string {
  const {
    assetLayerVisible,
    filteredRecordCount,
    shownRecordCount,
    mapReadyRecordCount,
  } = params;

  if (!assetLayerVisible) {
    return "Assets layer is hidden. 0 records are currently shown on the map.";
  }

  if (filteredRecordCount === 0) {
    return "No records fit the current filters.";
  }

  const filteredRecordLabel = `${filteredRecordCount.toLocaleString()} record${filteredRecordCount === 1 ? "" : "s"}`;
  if (mapReadyRecordCount === 0) {
    return `${filteredRecordLabel} ${filteredRecordCount === 1 ? "fits" : "fit"} the current filters. None are map-ready yet.`;
  }

  const shownSummary =
    shownRecordCount === mapReadyRecordCount
      ? `Showing all ${shownRecordCount.toLocaleString()}`
      : `Showing ${shownRecordCount.toLocaleString()} of ${mapReadyRecordCount.toLocaleString()}`;

  if (filteredRecordCount === mapReadyRecordCount) {
    return `${shownSummary} records on the map.`;
  }

  return `${filteredRecordLabel} ${filteredRecordCount === 1 ? "fits" : "fit"} the current filters. ${shownSummary} map-ready records on the map.`;
}

type PromptHomeExchangeSessionLane = PromptHomeExchangeSessionDefinition & {
  displayWindowLabel: string;
  segments: PromptHomeExchangeSessionSegment[];
};

const PROMPT_HOME_MAJOR_EXCHANGE_SESSIONS: PromptHomeExchangeSessionDefinition[] =
  [
    {
      key: "ice-brent",
      label: "ICE Brent",
      detail: "Representative Brent crude session",
      tone: "ice",
      sourceTimeZone: "Europe/London",
      sourceWindowLabel: "01:00-23:00 London",
      windows: [{ startHour: 1, startMinute: 0, endHour: 23, endMinute: 0 }],
    },
    {
      key: "lme-electronic",
      label: "LMEselect",
      detail: "Electronic metals session",
      tone: "lme",
      sourceTimeZone: "Europe/London",
      sourceWindowLabel: "01:00-19:00 London",
      windows: [{ startHour: 1, startMinute: 0, endHour: 19, endMinute: 0 }],
    },
    {
      key: "lme-ring",
      label: "LME Ring",
      detail: "Open-outcry reference session",
      tone: "lme-ring",
      sourceTimeZone: "Europe/London",
      sourceWindowLabel: "11:40-17:00 London",
      windows: [{ startHour: 11, startMinute: 40, endHour: 17, endMinute: 0 }],
    },
    {
      key: "sgx-msci",
      label: "SGX MSCI",
      detail: "T and T+1 futures sessions",
      tone: "sgx",
      sourceTimeZone: "Asia/Singapore",
      sourceWindowLabel: "08:30-17:20 / 17:50-05:15 Singapore",
      windows: [
        { startHour: 8, startMinute: 30, endHour: 17, endMinute: 20 },
        { startHour: 17, startMinute: 50, endHour: 5, endMinute: 15 },
      ],
    },
    {
      key: "cme-wti",
      label: "CME WTI",
      detail: "NYMEX WTI on CME Globex",
      tone: "cme",
      sourceTimeZone: "America/Chicago",
      sourceWindowLabel: "17:00-16:00 Central",
      windows: [{ startHour: 17, startMinute: 0, endHour: 16, endMinute: 0 }],
    },
    {
      key: "eex-power",
      label: "EEX Power",
      detail: "Representative power derivatives session",
      tone: "eex",
      sourceTimeZone: "Europe/Berlin",
      sourceWindowLabel: "08:00-18:00 Central Europe",
      windows: [{ startHour: 8, startMinute: 0, endHour: 18, endMinute: 0 }],
    },
    {
      key: "tocom-energy",
      label: "TOCOM Energy",
      detail: "Representative Japan energy session",
      tone: "tocom",
      sourceTimeZone: "Asia/Tokyo",
      sourceWindowLabel: "08:45-15:40 / 17:00-05:55 Tokyo",
      windows: [
        { startHour: 8, startMinute: 45, endHour: 15, endMinute: 40 },
        { startHour: 17, startMinute: 0, endHour: 5, endMinute: 55 },
      ],
    },
  ];

function createPromptMessageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function meterPercentForRatio(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return clampPercent((value / total) * 100);
}

function meterPercentForHourEnding(hourEnding: number): number {
  return meterPercentForRatio(hourEnding, PROMPT_HOME_DAY_HOURS);
}

function normalizeMinutes(value: number): number {
  return (
    ((value % PROMPT_HOME_DAY_MINUTES) + PROMPT_HOME_DAY_MINUTES) %
    PROMPT_HOME_DAY_MINUTES
  );
}

function minutesIntoDay(parts: PromptHomeZonedDateParts): number {
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

function formatHourEndingLabel(hourEnding: number): string {
  return `HE${hourEnding.toString().padStart(2, "0")}`;
}

function currentHourEnding(parts: PromptHomeZonedDateParts): number {
  if (parts.minute === 0 && parts.second === 0) {
    return parts.hour;
  }

  return Math.min(PROMPT_HOME_DAY_HOURS, parts.hour + 1);
}

function formatPromptHomeClockTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatPromptHomeMonthLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatPromptHomeMonthDayLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatPromptHomeSummaryMonthDayLabel(
  value: Date,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "2-digit",
  }).format(value);
}

function dayCountSuffix(value: number): string {
  if (value % 100 >= 11 && value % 100 <= 13) {
    return "th";
  }

  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatOrdinal(value: number): string {
  return `${value}${dayCountSuffix(value)}`;
}

function parseFormatterParts(
  parts: Intl.DateTimeFormatPart[],
): PromptHomeZonedDateParts {
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const weekdayIndex = PROMPT_HOME_WEEKDAY_SHORT_LABELS.indexOf(
    (values.weekday ??
      "Sun") as (typeof PROMPT_HOME_WEEKDAY_SHORT_LABELS)[number],
  );

  return {
    year: Number.parseInt(values.year ?? "1970", 10),
    month: Number.parseInt(values.month ?? "1", 10),
    day: Number.parseInt(values.day ?? "1", 10),
    weekdayIndex: weekdayIndex >= 0 ? weekdayIndex : 0,
    hour: Number.parseInt(values.hour ?? "0", 10),
    minute: Number.parseInt(values.minute ?? "0", 10),
    second: Number.parseInt(values.second ?? "0", 10),
  };
}

function getPromptHomeZonedDateParts(
  value: Date,
  timeZone: string,
): PromptHomeZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });

  return parseFormatterParts(formatter.formatToParts(value));
}

function parseTimeZoneOffsetLabel(value: string): number | null {
  if (value === "GMT" || value === "UTC") {
    return 0;
  }

  const match = value.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2] ?? "0", 10);
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(value: Date, timeZone: string): number {
  const offsetFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const offsetLabel = offsetFormatter
    .formatToParts(value)
    .find((part) => part.type === "timeZoneName")?.value;
  const parsedOffset = offsetLabel
    ? parseTimeZoneOffsetLabel(offsetLabel)
    : null;
  if (parsedOffset !== null) {
    return parsedOffset;
  }

  const zonedDateParts = getPromptHomeZonedDateParts(value, timeZone);
  const zonedTimestamp = Date.UTC(
    zonedDateParts.year,
    zonedDateParts.month - 1,
    zonedDateParts.day,
    zonedDateParts.hour,
    zonedDateParts.minute,
    zonedDateParts.second,
  );
  return Math.round((zonedTimestamp - value.getTime()) / 60_000);
}

function daysInMonth(parts: PromptHomeZonedDateParts): number {
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
}

function promptHomeCalendarDayKey(
  year: number,
  month: number,
  day: number,
): number {
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function formatCalendarEventCountLabel(count: number): string {
  return `${count} ${count === 1 ? "event" : "events"}`;
}

function truncatePromptHomeCalendarMarkerLabel(value: string): string {
  const normalizedValue = value.trim();
  if (normalizedValue.length <= 18) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 17).trimEnd()}…`;
}

function calendarMarkerAlignForPercent(
  percent: number,
): "start" | "end" {
  return percent >= 72 ? "end" : "start";
}

function buildPromptHomeCalendarAgendaItems(args: {
  events: GoogleCalendarEvent[];
  currentTime: Date;
  timeZone: string;
}): PromptHomeCalendarAgendaItem[] {
  const items: PromptHomeCalendarAgendaItem[] = [];

  for (const event of args.events) {
    const eventWindow = describeGoogleCalendarEventWindow(event, {
      now: args.currentTime,
      timeZone: args.timeZone,
    });

    if (event.start.dateTime) {
      const start = new Date(event.start.dateTime);
      if (Number.isNaN(start.getTime())) {
        continue;
      }

      const parts = getPromptHomeZonedDateParts(start, args.timeZone);
      items.push({
        key: event.id,
        title: event.summary,
        primary: eventWindow.primary,
        secondary: eventWindow.secondary,
        supportingText: event.location ?? event.organizerEmail ?? null,
        htmlLink: event.htmlLink,
        year: parts.year,
        month: parts.month,
        day: parts.day,
        weekdayIndex: parts.weekdayIndex,
        minuteOfDay: parts.hour * 60 + parts.minute,
      });
      continue;
    }

    const start = parseGoogleCalendarDateOnly(event.start.date);
    if (!start) {
      continue;
    }

    items.push({
      key: event.id,
      title: event.summary,
      primary: eventWindow.primary,
      secondary: eventWindow.secondary,
      supportingText: event.location ?? event.organizerEmail ?? null,
      htmlLink: event.htmlLink,
      year: start.getFullYear(),
      month: start.getMonth() + 1,
      day: start.getDate(),
      weekdayIndex: start.getDay(),
      minuteOfDay: null,
    });
  }

  return items.sort((left, right) => {
      const leftDayKey = promptHomeCalendarDayKey(
        left.year,
        left.month,
        left.day,
      );
      const rightDayKey = promptHomeCalendarDayKey(
        right.year,
        right.month,
        right.day,
      );
      if (leftDayKey !== rightDayKey) {
        return leftDayKey - rightDayKey;
      }

      return (left.minuteOfDay ?? -1) - (right.minuteOfDay ?? -1);
    });
}

function buildPromptHomeCalendarDayMarkers(
  items: PromptHomeCalendarAgendaItem[],
): PromptHomeMeterMarker[] {
  return items
    .filter((item) => item.minuteOfDay !== null)
    .slice(0, PROMPT_HOME_DAY_CALENDAR_MARKER_LIMIT)
    .map((item) => {
      const percent = meterPercentForRatio(
        item.minuteOfDay ?? 0,
        PROMPT_HOME_DAY_MINUTES,
      );
      return {
        key: `calendar-day-${item.key}`,
        label: truncatePromptHomeCalendarMarkerLabel(item.title),
        detail: item.secondary,
        percent,
        align: calendarMarkerAlignForPercent(percent),
        tone: "calendar",
      };
    });
}

function buildPromptHomeCalendarWeekMarkers(
  items: PromptHomeCalendarAgendaItem[],
): PromptHomeMeterMarker[] {
  const countsByWeekdayIndex = new Map<number, number>();

  for (const item of items) {
    countsByWeekdayIndex.set(
      item.weekdayIndex,
      (countsByWeekdayIndex.get(item.weekdayIndex) ?? 0) + 1,
    );
  }

  return Array.from(countsByWeekdayIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .slice(0, PROMPT_HOME_WEEK_CALENDAR_MARKER_LIMIT)
    .map(([weekdayIndex, count]) => {
      const percent = meterPercentForRatio(
        weekdayIndex * PROMPT_HOME_DAY_MINUTES + PROMPT_HOME_DAY_MINUTES / 2,
        PROMPT_HOME_WEEK_MINUTES,
      );
      return {
        key: `calendar-week-${weekdayIndex}`,
        label: PROMPT_HOME_WEEKDAY_SHORT_LABELS[weekdayIndex] ?? "Day",
        detail: formatCalendarEventCountLabel(count),
        percent,
        align:
          weekdayIndex === PROMPT_HOME_WEEK_DAYS - 1 ? "end" : "start",
        tone: "calendar",
      };
    });
}

function buildPromptHomeCalendarMonthMarkers(args: {
  items: PromptHomeCalendarAgendaItem[];
  monthDayTotal: number;
}): PromptHomeMeterMarker[] {
  const countsByDay = new Map<number, number>();

  for (const item of args.items) {
    countsByDay.set(item.day, (countsByDay.get(item.day) ?? 0) + 1);
  }

  return Array.from(countsByDay.entries())
    .sort((left, right) => left[0] - right[0])
    .slice(0, PROMPT_HOME_MONTH_CALENDAR_MARKER_LIMIT)
    .map(([day, count]) => {
      const percent = meterPercentForRatio(
        (day - 1) * PROMPT_HOME_DAY_MINUTES +
          PROMPT_HOME_DAY_MINUTES / 2,
        args.monthDayTotal * PROMPT_HOME_DAY_MINUTES,
      );
      return {
        key: `calendar-month-${day}`,
        label: `Day ${day}`,
        detail: formatCalendarEventCountLabel(count),
        percent,
        align: calendarMarkerAlignForPercent(percent),
        tone: "calendar",
      };
    });
}

function formatPromptHomeCalendarAgendaSummary(args: {
  calendarSession: GoogleCalendarSessionSnapshot;
  loading: boolean;
  error: string;
}): string {
  const cachedAtLabel = (() => {
    if (!args.calendarSession.cachedAt) {
      return null;
    }

    const parsedCachedAt = new Date(args.calendarSession.cachedAt);
    if (Number.isNaN(parsedCachedAt.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsedCachedAt);
  })();

  if (args.loading) {
    return "Refreshing calendar events…";
  }

  if (args.error) {
    return args.error;
  }

  if (args.calendarSession.selectedCalendarSummary) {
    return cachedAtLabel
      ? `${args.calendarSession.selectedCalendarSummary} · cached ${cachedAtLabel}`
      : args.calendarSession.selectedCalendarSummary;
  }

  if (cachedAtLabel) {
    return `Cached ${cachedAtLabel}`;
  }

  if (args.calendarSession.scopeGranted) {
    return "Reconnect Google Calendar in Settings to refresh schedule events.";
  }

  return "Connect Google Calendar in Settings to overlay schedule events here.";
}

function windowDurationMinutes(
  window: PromptHomeExchangeSessionWindow,
): number {
  const startMinutes = window.startHour * 60 + window.startMinute;
  const endMinutes = window.endHour * 60 + window.endMinute;
  return endMinutes > startMinutes
    ? endMinutes - startMinutes
    : PROMPT_HOME_DAY_MINUTES - startMinutes + endMinutes;
}

function formatPromptHomeClockMinutes(value: number): string {
  const normalizedValue = normalizeMinutes(value);
  const hours = Math.floor(normalizedValue / 60);
  const minutes = normalizedValue % 60;
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const meridiem = hours >= 12 ? "PM" : "AM";
  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${meridiem}`;
}

function buildExchangeSessionWindowDisplayLabel(args: {
  window: PromptHomeExchangeSessionWindow;
  sourceOffsetMinutes: number;
  targetOffsetMinutes: number;
}): string {
  const sourceStartMinutes =
    args.window.startHour * 60 + args.window.startMinute;
  const durationMinutes = windowDurationMinutes(args.window);
  const targetStartMinutes = normalizeMinutes(
    sourceStartMinutes - args.sourceOffsetMinutes + args.targetOffsetMinutes,
  );
  const targetEndMinutes = normalizeMinutes(
    targetStartMinutes + durationMinutes,
  );
  const wrapsToNextDay =
    durationMinutes > PROMPT_HOME_DAY_MINUTES - targetStartMinutes;

  return `${formatPromptHomeClockMinutes(targetStartMinutes)} to ${formatPromptHomeClockMinutes(
    targetEndMinutes,
  )}${wrapsToNextDay ? " next day" : ""}`;
}

function buildExchangeSessionWindowSegments(args: {
  keyPrefix: string;
  window: PromptHomeExchangeSessionWindow;
  sourceOffsetMinutes: number;
  targetOffsetMinutes: number;
}): PromptHomeExchangeSessionSegment[] {
  const sourceStartMinutes =
    args.window.startHour * 60 + args.window.startMinute;
  const durationMinutes = windowDurationMinutes(args.window);
  if (durationMinutes <= 0) {
    return [];
  }

  const targetStartMinutes = normalizeMinutes(
    sourceStartMinutes - args.sourceOffsetMinutes + args.targetOffsetMinutes,
  );
  const firstSegmentMinutes =
    durationMinutes >= PROMPT_HOME_DAY_MINUTES
      ? PROMPT_HOME_DAY_MINUTES
      : Math.min(durationMinutes, PROMPT_HOME_DAY_MINUTES - targetStartMinutes);
  const segments: PromptHomeExchangeSessionSegment[] = [
    {
      key: `${args.keyPrefix}-0`,
      startPercent: meterPercentForRatio(
        targetStartMinutes,
        PROMPT_HOME_DAY_MINUTES,
      ),
      widthPercent: meterPercentForRatio(
        firstSegmentMinutes,
        PROMPT_HOME_DAY_MINUTES,
      ),
    },
  ];
  const remainingMinutes = durationMinutes - firstSegmentMinutes;

  if (remainingMinutes > 0) {
    segments.push({
      key: `${args.keyPrefix}-1`,
      startPercent: 0,
      widthPercent: meterPercentForRatio(
        remainingMinutes,
        PROMPT_HOME_DAY_MINUTES,
      ),
    });
  }

  return segments.filter((segment) => segment.widthPercent > 0);
}

function buildPromptHomeExchangeSessionLane(
  definition: PromptHomeExchangeSessionDefinition,
  targetTimeZone: string,
  currentTime: Date,
): PromptHomeExchangeSessionLane {
  const sourceOffsetMinutes = getTimeZoneOffsetMinutes(
    currentTime,
    definition.sourceTimeZone,
  );
  const targetOffsetMinutes = getTimeZoneOffsetMinutes(
    currentTime,
    targetTimeZone,
  );

  return {
    ...definition,
    displayWindowLabel: definition.windows
      .map((window) =>
        buildExchangeSessionWindowDisplayLabel({
          window,
          sourceOffsetMinutes,
          targetOffsetMinutes,
        }),
      )
      .join(" / "),
    segments: definition.windows.flatMap((window, index) =>
      buildExchangeSessionWindowSegments({
        keyPrefix: `${definition.key}-${index}`,
        window,
        sourceOffsetMinutes,
        targetOffsetMinutes,
      }),
    ),
  };
}

function buildWeekMeterTicks(): PromptHomeMeterTick[] {
  return PROMPT_HOME_WEEKDAY_SHORT_LABELS.map((label, index) => ({
    key: label,
    label,
    percent: meterPercentForRatio(index, PROMPT_HOME_WEEK_DAYS - 1),
    align:
      index === 0
        ? "start"
        : index === PROMPT_HOME_WEEK_DAYS - 1
          ? "end"
          : "center",
  }));
}

function buildMonthMeterTicks(dayTotal: number): PromptHomeMeterTick[] {
  const checkpoints = [
    1,
    Math.ceil(dayTotal * 0.25),
    Math.ceil(dayTotal * 0.5),
    Math.ceil(dayTotal * 0.75),
    dayTotal,
  ];
  const uniqueCheckpoints = checkpoints.filter(
    (day, index) => checkpoints.indexOf(day) === index,
  );

  return uniqueCheckpoints.map((day, index) => ({
    key: String(day),
    label: day === dayTotal ? "EOM" : String(day),
    percent: meterPercentForRatio(day - 1, Math.max(dayTotal - 1, 1)),
    align:
      index === 0
        ? "start"
        : index === uniqueCheckpoints.length - 1
          ? "end"
          : "center",
  }));
}

function formatCount(value: number | null): string {
  return typeof value === "number" ? value.toLocaleString() : "n/a";
}

function formatPromptTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatPromotedRouteEvidence(
  recommendation: AssistantPromptRouteRecommendation,
): string {
  const acceptanceLabel =
    typeof recommendation.acceptance_rate === "number" &&
    Number.isFinite(recommendation.acceptance_rate)
      ? `${Math.round(recommendation.acceptance_rate * 100)}% accepted`
      : "Accepted route";
  return `${recommendation.accepted_count}/${recommendation.outcome_count} accepted · ${acceptanceLabel}`;
}

function formatPromotedRouteSummary(
  routes: Array<{ readiness: "ready" | "waiting" | "cooling_off" }>,
): string {
  const readyCount = routes.filter(
    (route) => route.readiness === "ready",
  ).length;
  const waitingCount = routes.filter(
    (route) => route.readiness === "waiting",
  ).length;
  const coolingCount = routes.filter(
    (route) => route.readiness === "cooling_off",
  ).length;
  const parts: string[] = [];
  if (readyCount > 0) {
    parts.push(`${readyCount} ready`);
  }
  if (waitingCount > 0) {
    parts.push(`${waitingCount} gathering more signal`);
  }
  if (coolingCount > 0) {
    parts.push(`${coolingCount} cooling off`);
  }

  return parts.length > 0
    ? `Promoted routes: ${parts.join(" · ")}.`
    : "Repeated accepted Home handoffs will appear here once a route stabilizes.";
}

function resolveDefaultProvider(
  settings: AssistantRuntimeSettings,
): AssistantProvider | "" {
  return (
    settings.effective_default_provider ??
    settings.providers.find((provider) => provider.enabled)?.provider ??
    settings.providers.find((provider) => provider.configured)?.provider ??
    ""
  );
}

function buildPromptHomeContext(args: {
  health: string;
  counts: PromptHomeCounts;
  displayName: string;
}): string {
  return [
    "Current workspace: prompt-first operator home.",
    `Authenticated user: ${args.displayName}.`,
    `API health: ${args.health}.`,
    `Active trades: ${formatCount(args.counts.activeTrades)}.`,
    `Open workflow items: ${formatCount(args.counts.openWorkItems)}.`,
    `Pending invoices: ${formatCount(args.counts.pendingInvoices)}.`,
    `Payments due: ${formatCount(args.counts.paymentsDue)}.`,
    `Dashboard attention items: ${formatCount(args.counts.attentionItems)}.`,
    "If the user needs to perform a business write, stage or describe the governed action path instead of claiming it has been executed.",
    'When opening an existing workspace would help, include a fenced navigation_intent JSON block after the user-facing answer. Use shape {"kind":"open_workspace","targetView":"operations","label":"Open Work Queue","rationale":"Why this is the right destination","focus":{"type":"trade","id":"TRD-1001","label":"TRD-1001"},"inspectorTab":"events"}. Navigation intents move the UI only and never execute business changes.',
  ].join("\n");
}

function mergePromptContexts(
  operatorContext: string,
  applicationContext?: string | null,
): string {
  return [operatorContext, applicationContext?.trim() ?? ""]
    .filter((section) => section.length > 0)
    .join("\n\n");
}

function replacePromptMessageActionRequest(
  currentMessages: PromptHomeMessage[],
  updatedActionRequest: AssistantActionRequest,
): PromptHomeMessage[] {
  return currentMessages.map((message) => {
    if (
      !message.actionRequests?.some(
        (request) =>
          request.action_request_id === updatedActionRequest.action_request_id,
      )
    ) {
      return message;
    }

    return {
      ...message,
      actionRequests: message.actionRequests.map((request) =>
        request.action_request_id === updatedActionRequest.action_request_id
          ? updatedActionRequest
          : request,
      ),
    };
  });
}

function removePromptNavigationIntent(
  currentMessages: PromptHomeMessage[],
  args: {
    messageId: string;
    intentKey: string;
  },
): PromptHomeMessage[] {
  return currentMessages.map((message) => {
    if (message.id !== args.messageId || !message.navigationIntents?.length) {
      return message;
    }

    return {
      ...message,
      navigationIntents: message.navigationIntents.filter(
        (intent) => buildPromptNavigationIntentKey(intent) !== args.intentKey,
      ),
    };
  });
}

function PromptHomeCalendarAgendaSection({
  title,
  summary,
  items,
  emptyMessage,
}: {
  title: string;
  summary: string;
  items: PromptHomeCalendarAgendaItem[];
  emptyMessage: string;
}) {
  const visibleItems = items.slice(0, PROMPT_HOME_CALENDAR_AGENDA_LIST_LIMIT);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);
  const normalizedSummary = summary.trim();
  const normalizedEmptyMessage = emptyMessage.trim();
  const showEmptyMessage =
    normalizedEmptyMessage.length > 0 &&
    normalizedEmptyMessage !== normalizedSummary;

  return (
    <section className="prompt-home-calendar-agenda">
      <div className="prompt-home-calendar-agenda-head">
        <strong>{title}</strong>
        <span>{summary}</span>
      </div>

      {visibleItems.length > 0 ? (
        <>
          <div className="prompt-home-calendar-agenda-list">
            {visibleItems.map((item) => (
              <article
                key={item.key}
                className="prompt-home-calendar-agenda-item"
              >
                <div className="prompt-home-calendar-agenda-copy">
                  <strong>{item.title}</strong>
                  <p>
                    {item.primary} · {item.secondary}
                  </p>
                  {item.supportingText ? <span>{item.supportingText}</span> : null}
                </div>
                <div className="prompt-home-calendar-agenda-meta">
                  {item.htmlLink ? (
                    <a href={item.htmlLink} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {hiddenCount > 0 ? (
            <p className="prompt-home-calendar-agenda-note">
              {hiddenCount} more {hiddenCount === 1 ? "event" : "events"} remain
              in this range.
            </p>
          ) : null}
        </>
      ) : showEmptyMessage ? (
        <p className="prompt-home-calendar-agenda-note">{emptyMessage}</p>
      ) : null}
    </section>
  );
}

function PromptHomeTimeMeterCard({
  panelId,
  eyebrow,
  title,
  detail,
  badge,
  meta,
  collapsedSummary = meta,
  ticks,
  markers = [],
  currentPercent,
  ariaLabel,
  highlightedWindowStartPercent,
  highlightedWindowWidthPercent,
  calendarToggle,
  expanded,
  onToggle,
  children,
}: {
  panelId: string;
  eyebrow: string;
  title: string;
  detail: string;
  badge: string;
  meta: string;
  collapsedSummary?: string;
  ticks: PromptHomeMeterTick[];
  markers?: PromptHomeMeterMarker[];
  currentPercent: number;
  ariaLabel: string;
  highlightedWindowStartPercent?: number;
  highlightedWindowWidthPercent?: number;
  calendarToggle?: {
    checked: boolean;
    label: string;
    ariaLabel?: string;
    onChange: (checked: boolean) => void;
  };
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <article
      className={`prompt-home-time-meter-card ${expanded ? "is-expanded" : "is-collapsed"}`}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="prompt-home-time-meter-card-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <div className="prompt-home-time-meter-card-head">
          <div
            className={`prompt-home-time-meter-card-copy${expanded ? "" : " is-collapsed"}`}
          >
            {expanded ? (
              <>
                <span className="eyebrow">{eyebrow}</span>
                <strong>{title}</strong>
              </>
            ) : (
              <div className="prompt-home-time-meter-card-collapsed-line">
                <span className="eyebrow prompt-home-time-meter-card-inline-eyebrow">
                  {eyebrow}
                </span>
                <strong>{title}</strong>
                <small className="prompt-home-time-meter-card-summary">
                  {collapsedSummary}
                </small>
              </div>
            )}
          </div>
          <div className="prompt-home-time-meter-card-toggle-side">
            <div className="prompt-home-time-meter-card-toggle-meta">
              <small>{expanded ? "Hide card" : "Show card"}</small>
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {expanded ? "−" : "+"}
              </span>
            </div>
            <span className="status-pill status-pill-active">{badge}</span>
          </div>
        </div>
      </button>

      {calendarToggle ? (
        <label className="prompt-home-time-meter-card-calendar-toggle">
          <input
            type="checkbox"
            checked={calendarToggle.checked}
            aria-label={calendarToggle.ariaLabel ?? calendarToggle.label}
            onChange={(event) => calendarToggle.onChange(event.target.checked)}
          />
          <span>{calendarToggle.label}</span>
        </label>
      ) : null}

      <div
        id={panelId}
        className="prompt-home-time-meter-card-body"
        hidden={!expanded}
      >
        <div className="prompt-home-time-meter-card-body-head">
          <p>{detail}</p>
          <small>{meta}</small>
        </div>

        {markers.length > 0 ? (
          <div className="prompt-home-time-meter-markers" aria-hidden="true">
            {markers.map((marker) => (
              <div
                key={marker.key}
                className={`prompt-home-time-meter-marker ${marker.align === "end" ? "is-end" : "is-start"} ${marker.tone === "calendar" ? "is-calendar" : "is-trading"}`}
                style={{ left: `${marker.percent}%` }}
              >
                <span>{marker.label}</span>
                <strong>{marker.detail}</strong>
              </div>
            ))}
          </div>
        ) : null}

        <div className="prompt-home-time-meter-scale" aria-hidden="true">
          {typeof highlightedWindowStartPercent === "number" &&
          typeof highlightedWindowWidthPercent === "number" ? (
            <span
              className="prompt-home-time-meter-window"
              style={{
                left: `${highlightedWindowStartPercent}%`,
                width: `${highlightedWindowWidthPercent}%`,
              }}
            />
          ) : null}
          {markers.map((marker) => (
            <span
              key={`${marker.key}-boundary`}
              className={`prompt-home-time-meter-boundary ${marker.tone === "calendar" ? "is-calendar" : "is-trading"}`}
              style={{ left: `${marker.percent}%` }}
            />
          ))}
          <span
            className="prompt-home-time-meter-now"
            style={{ left: `${currentPercent}%` }}
          />
        </div>

        <div className="prompt-home-time-meter-ticks" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick.key}
              className={`prompt-home-time-meter-tick ${
                tick.align === "start"
                  ? "is-start"
                  : tick.align === "end"
                    ? "is-end"
                    : ""
              }`}
              style={{ left: `${tick.percent}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        {children}
      </div>
    </article>
  );
}

function PromptHomeMapTile({
  authSession,
  assets,
  locations,
  spatialFeatures,
  weatherLocations,
  weatherSyncStatus,
  referenceDataLoaded,
  weatherDataLoaded,
  weatherDataLoading,
  weatherDataError,
  onOpenMapWorkspace,
  initialMapAssetLayerVisible = true,
}: {
  authSession: StoredAuthSession | null;
  assets: AssetRecord[];
  locations: LocationRecord[];
  spatialFeatures: SpatialFeatureRecord[];
  weatherLocations: WeatherLocationRecord[];
  weatherSyncStatus: WeatherSyncStatusRecord | null;
  referenceDataLoaded?: boolean;
  weatherDataLoaded?: boolean;
  weatherDataLoading?: boolean;
  weatherDataError?: string;
  onOpenMapWorkspace: () => void;
  initialMapAssetLayerVisible?: boolean;
}) {
  const mapExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.map-card",
    true,
  );
  const [selectedAssetCode, setSelectedAssetCode] = useState<string | null>(
    null,
  );
  const [assetActivityVisibility, setAssetActivityVisibility] = useState<
    Record<string, boolean>
  >({});
  const [assetGeographyVisibility, setAssetGeographyVisibility] = useState<
    Record<string, boolean>
  >({});
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [selectedSubdivisionCode, setSelectedSubdivisionCode] = useState("");
  const [assetSubtypeVisibility, setAssetSubtypeVisibility] = useState<
    Record<string, boolean>
  >({});
  const [mapRecordLimit, setMapRecordLimit] = useState(
    getPromptHomeMapRecordLimit,
  );
  const [showAssetLayer, setShowAssetLayer] = useState(
    initialMapAssetLayerVisible,
  );
  const [serverMapScopeSummary, setServerMapScopeSummary] =
    useState<AssetMapScopeSummary | null>(null);
  const mapSummary = useMemo(
    () => buildAssetMapSummary(assets, locations),
    [assets, locations],
  );
  const locationByCode = useMemo(
    () =>
      new Map(locations.map((location) => [location.code, location] as const)),
    [locations],
  );
  const assetSubtypeOptions = useMemo(
    () => sortedUniqueAssetSubtypes(mapSummary.records),
    [mapSummary.records],
  );
  const normalizedAssetActivityVisibility = useMemo(
    () => syncAssetActivityVisibilityState(assetActivityVisibility),
    [assetActivityVisibility],
  );
  const normalizedAssetGeographyVisibility = useMemo(
    () => syncAssetGeographyVisibilityState(assetGeographyVisibility),
    [assetGeographyVisibility],
  );
  const normalizedAssetSubtypeVisibility = useMemo(
    () =>
      syncAssetSubtypeVisibilityState(
        assetSubtypeOptions,
        assetSubtypeVisibility,
      ),
    [assetSubtypeOptions, assetSubtypeVisibility],
  );
  const hiddenAssetGeographies = useMemo(
    () =>
      ASSET_MAP_GEOGRAPHY_LABELS.filter(
        (geographyLabel) =>
          normalizedAssetGeographyVisibility[geographyLabel] === false,
      ),
    [normalizedAssetGeographyVisibility],
  );
  const hiddenAssetActivities = useMemo(
    () =>
      ASSET_MAP_ACTIVITY_LABELS.filter(
        (activityLabel) =>
          normalizedAssetActivityVisibility[activityLabel] === false,
      ),
    [normalizedAssetActivityVisibility],
  );
  const hiddenAssetSubtypes = useMemo(
    () =>
      assetSubtypeOptions.filter(
        (assetSubtype) =>
          normalizedAssetSubtypeVisibility[assetSubtype] === false,
      ),
    [assetSubtypeOptions, normalizedAssetSubtypeVisibility],
  );
  const geographyVisibleRecordCandidates = useMemo(
    () =>
      mapSummary.records.filter(
        (record) =>
          assetMapGeographyLabelForRecord(record) === null ||
          normalizedAssetGeographyVisibility[
            assetMapGeographyLabelForRecord(record) ?? ""
          ] !== false,
      ),
    [mapSummary.records, normalizedAssetGeographyVisibility],
  );
  const geographyVisibleWeatherLocations = useMemo(
    () =>
      weatherLocations.filter(
        (location) =>
          normalizedAssetGeographyVisibility[
            assetMapGeographyLabelForPoint({
              latitude: location.latitude,
              longitude: location.longitude,
            }) ?? ""
          ] !== false,
      ),
    [normalizedAssetGeographyVisibility, weatherLocations],
  );
  const countryOptions = useMemo(
    () =>
      buildAssetMapCountryOptions({
        records: geographyVisibleRecordCandidates,
        weatherLocations: geographyVisibleWeatherLocations,
        locationByCode,
      }),
    [
      geographyVisibleRecordCandidates,
      geographyVisibleWeatherLocations,
      locationByCode,
    ],
  );
  const activeSelectedCountryCode = useMemo(
    () =>
      selectedCountryCode &&
      countryOptions.some(
        (countryOption) => countryOption.code === selectedCountryCode,
      )
        ? selectedCountryCode
        : "",
    [countryOptions, selectedCountryCode],
  );
  const countryVisibleRecordCandidates = useMemo(
    () =>
      geographyVisibleRecordCandidates.filter(
        (record) =>
          !activeSelectedCountryCode ||
          assetMapCountryCodeForRecord(record) === activeSelectedCountryCode,
      ),
    [activeSelectedCountryCode, geographyVisibleRecordCandidates],
  );
  const countryVisibleWeatherLocations = useMemo(
    () =>
      geographyVisibleWeatherLocations.filter(
        (location) =>
          !activeSelectedCountryCode ||
          assetMapCountryCodeForWeatherLocation(location, locationByCode) ===
            activeSelectedCountryCode,
      ),
    [
      activeSelectedCountryCode,
      geographyVisibleWeatherLocations,
      locationByCode,
    ],
  );
  const subdivisionOptions = useMemo(
    () =>
      buildAssetMapSubdivisionOptions({
        records: countryVisibleRecordCandidates,
        weatherLocations: countryVisibleWeatherLocations,
        locationByCode,
      }),
    [
      countryVisibleRecordCandidates,
      countryVisibleWeatherLocations,
      locationByCode,
    ],
  );
  const activeSelectedSubdivisionCode = useMemo(
    () =>
      selectedSubdivisionCode &&
      subdivisionOptions.some(
        (subdivisionOption) =>
          subdivisionOption.code === selectedSubdivisionCode,
      )
        ? selectedSubdivisionCode
        : "",
    [selectedSubdivisionCode, subdivisionOptions],
  );
  const subdivisionVisibleRecordCandidates = useMemo(
    () =>
      countryVisibleRecordCandidates.filter(
        (record) =>
          !activeSelectedSubdivisionCode ||
          assetMapSubdivisionCodeForRecord(record) ===
            activeSelectedSubdivisionCode,
      ),
    [activeSelectedSubdivisionCode, countryVisibleRecordCandidates],
  );
  const activityVisibleRecordCandidates = useMemo(
    () =>
      subdivisionVisibleRecordCandidates.filter((record) =>
        assetMapActivityLabelsForAsset(record.asset).some(
          (activityLabel) =>
            normalizedAssetActivityVisibility[activityLabel] !== false,
        ),
      ),
    [normalizedAssetActivityVisibility, subdivisionVisibleRecordCandidates],
  );
  const visibleRecordCandidates = useMemo(
    () =>
      activityVisibleRecordCandidates.filter(
        (record) =>
          normalizedAssetSubtypeVisibility[
            assetMapSubtypeLabelForAsset(record.asset)
          ] !== false,
      ),
    [activityVisibleRecordCandidates, normalizedAssetSubtypeVisibility],
  );
  const visibleWeatherLocations = useMemo(
    () =>
      countryVisibleWeatherLocations.filter(
        (location) =>
          !activeSelectedSubdivisionCode ||
          assetMapSubdivisionCodeForWeatherLocation(
            location,
            locationByCode,
          ) === activeSelectedSubdivisionCode,
      ),
    [
      activeSelectedSubdivisionCode,
      countryVisibleWeatherLocations,
      locationByCode,
    ],
  );
  const geographyVisibleMappedRecords = useMemo(
    () =>
      mapSummary.mappedRecords.filter(
        (record) =>
          assetMapGeographyLabelForRecord(record) === null ||
          normalizedAssetGeographyVisibility[
            assetMapGeographyLabelForRecord(record) ?? ""
          ] !== false,
      ),
    [mapSummary.mappedRecords, normalizedAssetGeographyVisibility],
  );
  const countryVisibleMappedRecords = useMemo(
    () =>
      geographyVisibleMappedRecords.filter(
        (record) =>
          !activeSelectedCountryCode ||
          assetMapCountryCodeForRecord(record) === activeSelectedCountryCode,
      ),
    [activeSelectedCountryCode, geographyVisibleMappedRecords],
  );
  const subdivisionVisibleMappedRecords = useMemo(
    () =>
      countryVisibleMappedRecords.filter(
        (record) =>
          !activeSelectedSubdivisionCode ||
          assetMapSubdivisionCodeForRecord(record) ===
            activeSelectedSubdivisionCode,
      ),
    [activeSelectedSubdivisionCode, countryVisibleMappedRecords],
  );
  const activityVisibleMappedRecords = useMemo(
    () =>
      subdivisionVisibleMappedRecords.filter((record) =>
        assetMapActivityLabelsForAsset(record.asset).some(
          (activityLabel) =>
            normalizedAssetActivityVisibility[activityLabel] !== false,
        ),
      ),
    [normalizedAssetActivityVisibility, subdivisionVisibleMappedRecords],
  );
  const visibleMappedRecords = useMemo(
    () =>
      activityVisibleMappedRecords.filter(
        (record) =>
          normalizedAssetSubtypeVisibility[
            assetMapSubtypeLabelForAsset(record.asset)
          ] !== false,
      ),
    [activityVisibleMappedRecords, normalizedAssetSubtypeVisibility],
  );
  const displayedMappedRecords = useMemo(
    () => visibleMappedRecords.slice(0, mapRecordLimit),
    [mapRecordLimit, visibleMappedRecords],
  );
  const displayedAssetMapRecords = useMemo(
    () => (showAssetLayer ? displayedMappedRecords : []),
    [displayedMappedRecords, showAssetLayer],
  );
  const activeSpatialFeatures = useMemo(
    () => spatialFeatures.filter((feature) => feature.is_active),
    [spatialFeatures],
  );
  const activeRailRouteSpatialFeatures = useMemo(
    () =>
      activeSpatialFeatures.filter(
        (feature) => feature.entity_type === "RAIL_ROUTE",
      ),
    [activeSpatialFeatures],
  );
  const activeSharedSpatialFeatures = useMemo(
    () =>
      activeSpatialFeatures.filter(
        (feature) => feature.entity_type !== "RAIL_ROUTE",
      ),
    [activeSpatialFeatures],
  );
  const activeServerMapScopeSummary =
    authSession && referenceDataLoaded ? serverMapScopeSummary : null;
  const exactFilteredRecordCount =
    activeServerMapScopeSummary?.filtered_total_count ??
    visibleRecordCandidates.length;
  const exactFilteredMapReadyCount =
    activeServerMapScopeSummary?.filtered_map_ready_count ??
    visibleMappedRecords.length;
  const mapSummaryLabel = useMemo(
    () =>
      formatPromptHomeMapSummary({
        assetLayerVisible: showAssetLayer,
        filteredRecordCount: exactFilteredRecordCount,
        shownRecordCount: displayedAssetMapRecords.length,
        mapReadyRecordCount: showAssetLayer ? exactFilteredMapReadyCount : 0,
      }),
    [
      displayedAssetMapRecords.length,
      exactFilteredMapReadyCount,
      exactFilteredRecordCount,
      showAssetLayer,
    ],
  );

  const activeSelectedAssetCode = useMemo(
    () =>
      selectedAssetCode &&
      displayedAssetMapRecords.some(
        (record) => record.asset.code === selectedAssetCode,
      )
        ? selectedAssetCode
        : null,
    [displayedAssetMapRecords, selectedAssetCode],
  );
  const selectedRecord = useMemo(
    () =>
      displayedAssetMapRecords.find(
        (record) => record.asset.code === activeSelectedAssetCode,
      ) ?? null,
    [activeSelectedAssetCode, displayedAssetMapRecords],
  );
  const statusTitle =
    visibleMappedRecords.length === 0
      ? geographyVisibleRecordCandidates.length === 0
        ? "No selected geographies are visible right now."
        : countryVisibleRecordCandidates.length === 0 &&
            activeSelectedCountryCode
          ? `No assets are visible for ${formatAssetMapCountryLabel(activeSelectedCountryCode)} right now.`
          : subdivisionVisibleRecordCandidates.length === 0 &&
              activeSelectedSubdivisionCode
            ? `No assets are visible for ${activeSelectedSubdivisionCode} right now.`
            : activityVisibleRecordCandidates.length === 0
              ? "No selected activities are visible right now."
              : visibleRecordCandidates.length === 0 &&
                  assetSubtypeOptions.length > 0
                ? "No selected asset types are visible right now."
                : "No map-ready assets yet."
      : null;
  const statusDetail =
    visibleMappedRecords.length === 0
      ? geographyVisibleRecordCandidates.length === 0
        ? "Turn at least one geography back on to restore plotted assets."
        : countryVisibleRecordCandidates.length === 0 &&
            activeSelectedCountryCode
          ? "Choose All countries or a different country to restore plotted assets."
          : subdivisionVisibleRecordCandidates.length === 0 &&
              activeSelectedSubdivisionCode
            ? "Choose All states or territories or a different subdivision to restore plotted assets."
            : activityVisibleRecordCandidates.length === 0
              ? "Turn at least one activity back on to restore plotted assets."
              : visibleRecordCandidates.length === 0 &&
                  assetSubtypeOptions.length > 0
                ? "Turn at least one asset type back on to restore plotted assets."
                : "The base map still loads here. Assets appear once they have GeoJSON, direct coordinates, or linked location coordinates."
      : null;

  useEffect(() => {
    if (!authSession || !referenceDataLoaded) {
      return;
    }

    const currentAuthSession = authSession;
    let cancelled = false;

    async function loadScopeSummary() {
      try {
        const nextSummary = await loadAssetMapScopeSummary(
          appConfig.apiBase,
          {
            hiddenGeographies: hiddenAssetGeographies,
            selectedCountryCode: activeSelectedCountryCode,
            selectedSubdivisionCode: activeSelectedSubdivisionCode,
            hiddenActivities: hiddenAssetActivities,
            hiddenSubtypes: hiddenAssetSubtypes,
          },
          {
            readHeaders: sessionHeaders(currentAuthSession),
          },
        );
        if (!cancelled) {
          setServerMapScopeSummary(nextSummary);
        }
      } catch {
        if (!cancelled) {
          setServerMapScopeSummary(null);
        }
      }
    }

    void loadScopeSummary();

    return () => {
      cancelled = true;
    };
  }, [
    authSession,
    hiddenAssetActivities,
    hiddenAssetGeographies,
    hiddenAssetSubtypes,
    referenceDataLoaded,
    activeSelectedCountryCode,
    activeSelectedSubdivisionCode,
  ]);

  function handleToggleAssetActivity(activityLabel: string) {
    setAssetActivityVisibility((currentState) => {
      const nextState = syncAssetActivityVisibilityState(currentState);
      return {
        ...nextState,
        [activityLabel]: nextState[activityLabel] === false,
      };
    });
  }

  function handleToggleAssetGeography(geographyLabel: string) {
    setAssetGeographyVisibility((currentState) => {
      const nextState = syncAssetGeographyVisibilityState(currentState);
      return {
        ...nextState,
        [geographyLabel]: nextState[geographyLabel] === false,
      };
    });
  }

  function handleSetAllAssetGeographiesVisible(visible: boolean) {
    setAssetGeographyVisibility(setAllAssetGeographyVisibilityState(visible));
  }

  function handleSelectCountry(countryCode: string) {
    setSelectedCountryCode(countryCode);
  }

  function handleSelectSubdivision(subdivisionCode: string) {
    setSelectedSubdivisionCode(subdivisionCode);
  }

  function handleToggleAssetSubtype(assetSubtype: string) {
    setAssetSubtypeVisibility((currentState) => {
      const nextState = syncAssetSubtypeVisibilityState(
        assetSubtypeOptions,
        currentState,
      );
      return {
        ...nextState,
        [assetSubtype]: nextState[assetSubtype] === false,
      };
    });
  }

  function handleSetAllAssetSubtypesVisible(visible: boolean) {
    setAssetSubtypeVisibility(
      setAllAssetSubtypeVisibilityState(assetSubtypeOptions, visible),
    );
  }

  function handleMapRecordLimitChange(nextValue: string) {
    setMapRecordLimit(savePromptHomeMapRecordLimit(nextValue));
  }

  return (
    <article className="prompt-home-map-card">
      <button
        type="button"
        className="prompt-home-map-card-toggle"
        aria-expanded={mapExpandedState.expanded}
        aria-controls={PROMPT_HOME_MAP_PANEL_ID}
        onClick={() => mapExpandedState.setExpanded((current) => !current)}
      >
        <div className="prompt-home-map-card-head">
          <div className="prompt-home-map-card-copy">
            <strong>Map</strong>
            <p>{mapSummaryLabel}</p>
          </div>
          <div className="prompt-home-map-card-toggle-side">
            <div className="prompt-home-map-card-toggle-meta">
              <small>
                {mapExpandedState.expanded ? "Hide card" : "Show card"}
              </small>
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {mapExpandedState.expanded ? "−" : "+"}
              </span>
            </div>
          </div>
        </div>
      </button>

      <div
        id={PROMPT_HOME_MAP_PANEL_ID}
        className="prompt-home-map-card-body"
        hidden={!mapExpandedState.expanded}
      >
        <AssetMapCanvas
          records={displayedMappedRecords}
          spatialFeatures={activeSharedSpatialFeatures}
          railRouteSpatialFeatures={activeRailRouteSpatialFeatures}
          weatherLocations={visibleWeatherLocations}
          weatherSyncStatus={weatherSyncStatus}
          showAssets={showAssetLayer}
          filterCardStateKey="prompt-home.map-filters-card"
          assetActivityVisibility={normalizedAssetActivityVisibility}
          assetGeographyVisibility={normalizedAssetGeographyVisibility}
          countryOptions={countryOptions}
          selectedCountryCode={activeSelectedCountryCode}
          subdivisionOptions={subdivisionOptions}
          selectedSubdivisionCode={activeSelectedSubdivisionCode}
          assetSubtypeOptions={assetSubtypeOptions}
          assetSubtypeVisibility={normalizedAssetSubtypeVisibility}
          weatherDataLoaded={weatherDataLoaded}
          weatherDataLoading={weatherDataLoading}
          weatherLoadError={weatherDataError}
          onShowAssetsChange={setShowAssetLayer}
          onToggleAssetActivity={handleToggleAssetActivity}
          onToggleAssetGeography={handleToggleAssetGeography}
          onSelectCountry={handleSelectCountry}
          onSelectSubdivision={handleSelectSubdivision}
          onSetAllAssetGeographiesVisible={handleSetAllAssetGeographiesVisible}
          onToggleAssetSubtype={handleToggleAssetSubtype}
          onSetAllAssetSubtypesVisible={handleSetAllAssetSubtypesVisible}
          selectedAssetCode={activeSelectedAssetCode}
          onSelectAsset={setSelectedAssetCode}
          statusTitle={statusTitle}
          statusDetail={statusDetail}
        />

        <div className="prompt-home-map-card-settings">
          <label className="field prompt-home-map-record-limit-field">
            <span>Show up to</span>
            <select
              className="control"
              aria-label="Home map record limit"
              value={String(mapRecordLimit)}
              onChange={(event) =>
                handleMapRecordLimitChange(event.target.value)
              }
            >
              {PROMPT_HOME_MAP_RECORD_LIMIT_OPTIONS.map((limitOption) => (
                <option key={limitOption} value={limitOption}>
                  {`${limitOption.toLocaleString()} map records`}
                </option>
              ))}
            </select>
          </label>
          <p className="form-note prompt-home-map-record-limit-note">
            Higher limits draw more markers and rows in Home.
          </p>
        </div>

        <AssetMapRecordsCard
          records={displayedAssetMapRecords}
          totalRecordCount={showAssetLayer ? exactFilteredMapReadyCount : 0}
          selectedAssetCode={activeSelectedAssetCode}
          onSelectAsset={setSelectedAssetCode}
          collapsibleStateKey="prompt-home.map-records-card"
        />

        <div
          className={`prompt-home-map-card-footer ${selectedRecord ? "" : "is-actions-only"}`.trim()}
        >
          {selectedRecord ? (
            <div className="prompt-home-map-card-selection">
              <strong>{selectedRecord.asset.code}</strong>
              <p>{`${selectedRecord.asset.name} · ${formatAssetMapSource(selectedRecord)}`}</p>
              <p>{formatAssetMapPlacement(selectedRecord)}</p>
            </div>
          ) : null}
          <button
            type="button"
            className="button button-secondary"
            onClick={onOpenMapWorkspace}
          >
            Open Map Workspace
          </button>
        </div>
      </div>
    </article>
  );
}

function PromptHomeTimeframePanel({
  currentTime,
  timeDisplaySettings,
  timeZoneOptions,
  onTimeZoneChange,
  customEventsHref,
  onOpenCustomEvents,
}: {
  currentTime: Date;
  timeDisplaySettings: TimeDisplaySettings;
  timeZoneOptions: TimeDisplayTimeZoneOption[];
  onTimeZoneChange: (nextTimeZone: string) => void;
  customEventsHref: string;
  onOpenCustomEvents?: () => void;
}) {
  const timeframeExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.timeframe-panel",
    true,
  );
  const dayCardExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.timeframe.day-card",
    true,
  );
  const weekCardExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.timeframe.week-card",
    true,
  );
  const monthCardExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.timeframe.month-card",
    true,
  );
  const dayCalendarToggleState = usePersistentPromptHomeCalendarCardState(
    "day",
    true,
  );
  const weekCalendarToggleState = usePersistentPromptHomeCalendarCardState(
    "week",
    true,
  );
  const monthCalendarToggleState = usePersistentPromptHomeCalendarCardState(
    "month",
    true,
  );
  const exchangeSessionsExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.timeframe.trading-hours",
    false,
  );
  const resolvedTimeZone = resolveTimeDisplayTimeZone(timeDisplaySettings);
  const googleCalendarSession = useSyncExternalStore(
    subscribeGoogleCalendarSession,
    getGoogleCalendarSessionSnapshot,
    getGoogleCalendarSessionSnapshot,
  );
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const timeZonePreferenceLabel =
    formatTimeDisplayTimeZonePreferenceLabel(timeDisplaySettings);
  const zonedDateParts = getPromptHomeZonedDateParts(
    currentTime,
    resolvedTimeZone,
  );
  const currentClockLabel = formatPromptHomeClockTime(
    currentTime,
    resolvedTimeZone,
  );
  const currentMonthLabel = formatPromptHomeMonthLabel(
    currentTime,
    resolvedTimeZone,
  );
  const currentMonthDayLabel = formatPromptHomeMonthDayLabel(
    currentTime,
    resolvedTimeZone,
  );
  const currentSummaryMonthDayLabel = formatPromptHomeSummaryMonthDayLabel(
    currentTime,
    resolvedTimeZone,
  );
  const currentHourEndingLabel = formatHourEndingLabel(
    currentHourEnding(zonedDateParts),
  );
  const currentWeekdayLabel =
    PROMPT_HOME_WEEKDAY_FULL_LABELS[zonedDateParts.weekdayIndex];
  const currentDayPercent = meterPercentForRatio(
    minutesIntoDay(zonedDateParts),
    PROMPT_HOME_DAY_MINUTES,
  );
  const currentWeekPercent = meterPercentForRatio(
    zonedDateParts.weekdayIndex * PROMPT_HOME_DAY_MINUTES +
      minutesIntoDay(zonedDateParts),
    PROMPT_HOME_WEEK_MINUTES,
  );
  const currentDayKey = promptHomeCalendarDayKey(
    zonedDateParts.year,
    zonedDateParts.month,
    zonedDateParts.day,
  );
  const currentWeekStartDayKey = currentDayKey - zonedDateParts.weekdayIndex;
  const currentWeekEndDayKey =
    currentWeekStartDayKey + PROMPT_HOME_WEEK_DAYS - 1;
  const monthDayTotal = daysInMonth(zonedDateParts);
  const calendarRefreshKey = `${zonedDateParts.year}-${zonedDateParts.month}-${zonedDateParts.day}`;
  const hasCalendarTimelineEnabled =
    dayCalendarToggleState.enabled ||
    weekCalendarToggleState.enabled ||
    monthCalendarToggleState.enabled;
  const calendarSessionCanRefresh =
    hasCalendarTimelineEnabled &&
    googleCalendarSessionTokenIsUsable({
      accessToken: googleCalendarSession.accessToken,
      accessTokenExpiresAt: googleCalendarSession.accessTokenExpiresAt,
    }) &&
    Boolean(googleCalendarSession.selectedCalendarId);
  const timeframeCollapsedSummary = [
    currentClockLabel,
    currentHourEndingLabel,
    currentWeekdayLabel,
    currentSummaryMonthDayLabel,
  ].join(" | ");
  const currentMonthPercent = meterPercentForRatio(
    (zonedDateParts.day - 1) * PROMPT_HOME_DAY_MINUTES +
      minutesIntoDay(zonedDateParts),
    monthDayTotal * PROMPT_HOME_DAY_MINUTES,
  );
  const tradingWindowStartPercent = meterPercentForHourEnding(
    PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING,
  );
  const tradingWindowEndPercent = meterPercentForHourEnding(
    PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING,
  );
  const tradingWindowWidthPercent =
    tradingWindowEndPercent - tradingWindowStartPercent;
  const dayTicks: PromptHomeMeterTick[] = PROMPT_HOME_DAY_METER_TICKS.map(
    (tick, index) => ({
      key: String(tick),
      label: formatHourEndingLabel(tick),
      percent: meterPercentForHourEnding(tick),
      align:
        index === 0
          ? "start"
          : index === PROMPT_HOME_DAY_METER_TICKS.length - 1
            ? "end"
            : "center",
    }),
  );
  const weekTicks = buildWeekMeterTicks();
  const monthTicks = buildMonthMeterTicks(monthDayTotal);
  const exchangeSessionLanes = PROMPT_HOME_MAJOR_EXCHANGE_SESSIONS.map(
    (session) =>
      buildPromptHomeExchangeSessionLane(
        session,
        resolvedTimeZone,
        currentTime,
      ),
  );
  const tradingWindowStartClockLabel = formatPromptHomeClockMinutes(
    PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING * 60,
  );
  const tradingWindowEndClockLabel = formatPromptHomeClockMinutes(
    PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING * 60,
  );
  const tradingMarkers: PromptHomeMeterMarker[] = [
    {
      key: "open",
      label: "Trading opens",
      detail: `${tradingWindowStartClockLabel} local · ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)}`,
      percent: tradingWindowStartPercent,
      align: "start",
    },
    {
      key: "close",
      label: "Desk EOD",
      detail: `${tradingWindowEndClockLabel} local · ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)}`,
      percent: tradingWindowEndPercent,
      align: "end",
    },
  ];
  const refreshCalendarTimeline = useEffectEvent(async () => {
    if (
      !calendarSessionCanRefresh ||
      !googleCalendarSession.accessToken ||
      !googleCalendarSession.selectedCalendarId
    ) {
      return;
    }

    setCalendarLoading(true);
    setCalendarError("");
    try {
      const refreshedEvents = await loadUpcomingGoogleCalendarEvents(
        googleCalendarSession.accessToken,
        googleCalendarSession.selectedCalendarId,
        {
          now: currentTime,
          days: 31,
          maxResults: 48,
        },
      );
      saveGoogleCalendarEventCache({
        selectedCalendarSummary:
          googleCalendarSession.selectedCalendarSummary,
        events: refreshedEvents,
        cachedAt: new Date().toISOString(),
      });
    } catch (error) {
      setCalendarError(
        error instanceof Error
          ? error.message
          : "Could not refresh Google Calendar events for Home.",
      );
    } finally {
      setCalendarLoading(false);
    }
  });

  useEffect(() => {
    if (!calendarSessionCanRefresh || !googleCalendarSession.accessToken) {
      return;
    }

    void refreshCalendarTimeline();
  }, [
    calendarSessionCanRefresh,
    calendarRefreshKey,
    googleCalendarSession.accessToken,
    googleCalendarSession.accessTokenExpiresAt,
    googleCalendarSession.selectedCalendarId,
  ]);

  const calendarAgendaItems = useMemo(
    () =>
      hasCalendarTimelineEnabled
        ? buildPromptHomeCalendarAgendaItems({
            events: googleCalendarSession.cachedEvents,
            currentTime,
            timeZone: resolvedTimeZone,
          })
        : [],
    [
      currentTime,
      googleCalendarSession.cachedEvents,
      hasCalendarTimelineEnabled,
      resolvedTimeZone,
    ],
  );
  const dayCalendarItems = useMemo(
    () =>
      calendarAgendaItems.filter(
        (item) =>
          promptHomeCalendarDayKey(item.year, item.month, item.day) ===
          currentDayKey,
      ),
    [calendarAgendaItems, currentDayKey],
  );
  const weekCalendarItems = useMemo(
    () =>
      calendarAgendaItems.filter((item) => {
        const itemDayKey = promptHomeCalendarDayKey(
          item.year,
          item.month,
          item.day,
        );
        return (
          itemDayKey >= currentWeekStartDayKey &&
          itemDayKey <= currentWeekEndDayKey
        );
      }),
    [calendarAgendaItems, currentWeekEndDayKey, currentWeekStartDayKey],
  );
  const monthCalendarItems = useMemo(
    () =>
      calendarAgendaItems.filter(
        (item) =>
          item.year === zonedDateParts.year &&
          item.month === zonedDateParts.month,
      ),
    [calendarAgendaItems, zonedDateParts.month, zonedDateParts.year],
  );
  const dayCalendarItemsVisible = dayCalendarToggleState.enabled
    ? dayCalendarItems
    : [];
  const weekCalendarItemsVisible = weekCalendarToggleState.enabled
    ? weekCalendarItems
    : [];
  const monthCalendarItemsVisible = monthCalendarToggleState.enabled
    ? monthCalendarItems
    : [];
  const calendarAgendaSummary = formatPromptHomeCalendarAgendaSummary({
    calendarSession: googleCalendarSession,
    loading: calendarLoading && googleCalendarSession.cachedEvents.length === 0,
    error:
      googleCalendarSession.cachedEvents.length === 0 ? calendarError : "",
  });
  const calendarConnectionMessage = googleCalendarSession.scopeGranted
    ? "Reconnect Google Calendar in Settings to refresh schedule events here."
    : "Connect Google Calendar in Settings to overlay schedule events here.";
  const dayCalendarSummary =
    dayCalendarItemsVisible.length > 0
      ? `${calendarAgendaSummary} · ${formatCalendarEventCountLabel(
          dayCalendarItemsVisible.length,
        )} today`
      : calendarAgendaSummary;
  const weekCalendarSummary =
    weekCalendarItemsVisible.length > 0
      ? `${calendarAgendaSummary} · ${formatCalendarEventCountLabel(
          weekCalendarItemsVisible.length,
        )} this week`
      : calendarAgendaSummary;
  const monthCalendarSummary =
    monthCalendarItemsVisible.length > 0
      ? `${calendarAgendaSummary} · ${formatCalendarEventCountLabel(
          monthCalendarItemsVisible.length,
        )} this month`
      : calendarAgendaSummary;
  const dayCollapsedSummary = `${`Desk window ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)} to ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)}`} · EOD ${tradingWindowEndClockLabel} local · ${exchangeSessionLanes.length} venue sessions${dayCalendarItemsVisible.length > 0 ? ` · ${formatCalendarEventCountLabel(dayCalendarItemsVisible.length)}` : dayCalendarToggleState.enabled ? "" : " · Google Calendar off"}`;
  const weekCollapsedSummary = `Sunday through Saturday · Week progress ${Math.round(currentWeekPercent)}%${weekCalendarItemsVisible.length > 0 ? ` · ${formatCalendarEventCountLabel(weekCalendarItemsVisible.length)}` : weekCalendarToggleState.enabled ? "" : " · Google Calendar off"}`;
  const monthCollapsedSummary = `1 through EOM · ${monthDayTotal} days this month${monthCalendarItemsVisible.length > 0 ? ` · ${formatCalendarEventCountLabel(monthCalendarItemsVisible.length)}` : monthCalendarToggleState.enabled ? "" : " · Google Calendar off"}`;
  const dayMeterMarkers = dayCalendarToggleState.enabled
    ? [...tradingMarkers, ...buildPromptHomeCalendarDayMarkers(dayCalendarItems)]
    : tradingMarkers;
  const weekMeterMarkers = weekCalendarToggleState.enabled
    ? buildPromptHomeCalendarWeekMarkers(weekCalendarItems)
    : [];
  const monthMeterMarkers = monthCalendarToggleState.enabled
    ? buildPromptHomeCalendarMonthMarkers({
        items: monthCalendarItems,
        monthDayTotal,
      })
    : [];
  return (
    <section className="prompt-home-timeframe-panel">
      <div className="prompt-home-timeframe-panel-head">
        <div className="prompt-home-timeframe-panel-toggle">
          <div className="prompt-home-timeframe-panel-copy">
            <span className="eyebrow">Desk Time</span>
            <strong>Desk clocks and calendars</strong>
            {timeframeExpandedState.expanded ? null : (
              <p>{timeframeCollapsedSummary}</p>
            )}
          </div>
        </div>

        <div className="prompt-home-timeframe-panel-side">
          <a
            href={customEventsHref}
            className="button button-secondary prompt-home-timeframe-panel-link"
            onClick={(event) => {
              if (!onOpenCustomEvents) {
                return;
              }
              event.preventDefault();
              onOpenCustomEvents();
            }}
          >
            Add Event
          </a>

          <button
            type="button"
            className="prompt-home-timeframe-panel-toggle-action"
            aria-expanded={timeframeExpandedState.expanded}
            aria-controls={PROMPT_HOME_TIMEFRAME_PANEL_ID}
            onClick={() =>
              timeframeExpandedState.setExpanded((current) => !current)
            }
          >
            <div className="prompt-home-timeframe-panel-toggle-meta">
              <small>
                {timeframeExpandedState.expanded ? "Hide card" : "Show card"}
              </small>
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {timeframeExpandedState.expanded ? "−" : "+"}
              </span>
            </div>
          </button>

          {timeframeExpandedState.expanded ? (
            <label className="field prompt-home-timezone-field">
              <span>Time zone</span>
              <select
                className="control"
                aria-label="Preferred time zone"
                value={timeDisplaySettings.timeZone}
                onChange={(event) => onTimeZoneChange(event.target.value)}
              >
                {timeZoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      <div
        id={PROMPT_HOME_TIMEFRAME_PANEL_ID}
        className="prompt-home-timeframe-panel-body"
        hidden={!timeframeExpandedState.expanded}
      >
        <div className="prompt-home-timeframe-grid">
          <PromptHomeTimeMeterCard
            panelId={PROMPT_HOME_DAY_PANEL_ID}
            eyebrow="Day"
            title={`${currentClockLabel} local`}
            detail={`Hour-ending day with the desk window, desk EOD at ${tradingWindowEndClockLabel} local, and representative venue sessions marked.`}
            badge={currentHourEndingLabel}
            meta={`Desk window ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)} to ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)} · EOD ${tradingWindowEndClockLabel} local · ${dayCalendarToggleState.enabled ? dayCalendarItemsVisible.length > 0 ? formatCalendarEventCountLabel(dayCalendarItemsVisible.length) : "No calendar events scheduled today" : "Google Calendar off for this card"}`}
            collapsedSummary={dayCollapsedSummary}
            ticks={dayTicks}
            markers={dayMeterMarkers}
            currentPercent={currentDayPercent}
            highlightedWindowStartPercent={tradingWindowStartPercent}
            highlightedWindowWidthPercent={tradingWindowWidthPercent}
            calendarToggle={{
              checked: dayCalendarToggleState.enabled,
              label: "Pull Google Calendar",
              ariaLabel: "Pull Google Calendar into the day timeline card",
              onChange: dayCalendarToggleState.setEnabled,
            }}
            ariaLabel={`Day meter in ${resolvedTimeZone}. Current local time ${currentClockLabel}, ${currentHourEndingLabel}. Desk trading hours run from ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)} to ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)}, with desk EOD at ${tradingWindowEndClockLabel} local. Representative venue sessions for ICE Brent, LMEselect, LME Ring, SGX MSCI, CME WTI, EEX Power, and TOCOM Energy are also shown.`}
            expanded={dayCardExpandedState.expanded}
            onToggle={() =>
              dayCardExpandedState.setExpanded((current) => !current)
            }
          >
            <div className="prompt-home-time-details">
              <button
                type="button"
                className="prompt-home-time-details-toggle"
                aria-expanded={exchangeSessionsExpandedState.expanded}
                aria-controls={PROMPT_HOME_TRADING_HOURS_PANEL_ID}
                onClick={() =>
                  exchangeSessionsExpandedState.setExpanded(
                    (current) => !current,
                  )
                }
              >
                <div className="prompt-home-time-details-toggle-copy">
                  <strong>Representative trading hours</strong>
                  <span>
                    {exchangeSessionLanes.length} major venue sessions available
                  </span>
                </div>
                <div className="prompt-home-time-details-toggle-meta">
                  <small>
                    {exchangeSessionsExpandedState.expanded
                      ? "Hide details"
                      : "Show details"}
                  </small>
                  <span
                    className="prompt-home-support-toggle-indicator"
                    aria-hidden="true"
                  >
                    {exchangeSessionsExpandedState.expanded ? "−" : "+"}
                  </span>
                </div>
              </button>

              <div
                id={PROMPT_HOME_TRADING_HOURS_PANEL_ID}
                className="prompt-home-session-board"
                hidden={!exchangeSessionsExpandedState.expanded}
              >
                <p className="prompt-home-session-board-note">
                  Representative venue sessions converted into{" "}
                  {timeZonePreferenceLabel}.
                </p>
                <div className="prompt-home-session-lane-list">
                  {exchangeSessionLanes.map((session) => (
                    <div
                      key={session.key}
                      className={`prompt-home-session-lane is-${session.tone}`}
                    >
                      <div className="prompt-home-session-lane-copy">
                        <strong>{session.label}</strong>
                        <span>{session.displayWindowLabel}</span>
                        <small>
                          {session.detail} · {session.sourceWindowLabel}
                        </small>
                      </div>
                      <div
                        className="prompt-home-session-lane-track"
                        aria-hidden="true"
                      >
                        {session.segments.map((segment) => (
                          <span
                            key={segment.key}
                            className="prompt-home-session-lane-segment"
                            style={{
                              left: `${segment.startPercent}%`,
                              width: `${segment.widthPercent}%`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {dayCalendarToggleState.enabled ? (
                <PromptHomeCalendarAgendaSection
                  title="Calendar agenda"
                  summary={dayCalendarSummary}
                  items={dayCalendarItemsVisible}
                  emptyMessage={
                    googleCalendarSession.cachedEvents.length > 0 ||
                    googleCalendarSession.scopeGranted
                      ? "No calendar events are scheduled on today's timeline."
                      : calendarConnectionMessage
                  }
                />
              ) : null}
            </div>
          </PromptHomeTimeMeterCard>
          <PromptHomeTimeMeterCard
            panelId={PROMPT_HOME_WEEK_PANEL_ID}
            eyebrow="Week"
            title={currentWeekdayLabel}
            detail="Sunday through Saturday."
            badge={currentMonthDayLabel}
            meta={`Week progress ${Math.round(currentWeekPercent)}% · ${weekCalendarToggleState.enabled ? weekCalendarItemsVisible.length > 0 ? formatCalendarEventCountLabel(weekCalendarItemsVisible.length) : "No calendar events scheduled this week" : "Google Calendar off for this card"}`}
            collapsedSummary={weekCollapsedSummary}
            ticks={weekTicks}
            markers={weekMeterMarkers}
            currentPercent={currentWeekPercent}
            calendarToggle={{
              checked: weekCalendarToggleState.enabled,
              label: "Pull Google Calendar",
              ariaLabel: "Pull Google Calendar into the week timeline card",
              onChange: weekCalendarToggleState.setEnabled,
            }}
            ariaLabel={`Week meter in ${resolvedTimeZone}. Current day ${currentWeekdayLabel}. The week runs from Sunday through Saturday.`}
            expanded={weekCardExpandedState.expanded}
            onToggle={() =>
              weekCardExpandedState.setExpanded((current) => !current)
            }
          >
            {weekCalendarToggleState.enabled ? (
              <PromptHomeCalendarAgendaSection
                title="This week"
                summary={weekCalendarSummary}
                items={weekCalendarItemsVisible}
                emptyMessage={
                  googleCalendarSession.cachedEvents.length > 0 ||
                  googleCalendarSession.scopeGranted
                    ? "No calendar events are scheduled in this week view."
                    : calendarConnectionMessage
                }
              />
            ) : null}
          </PromptHomeTimeMeterCard>
          <PromptHomeTimeMeterCard
            panelId={PROMPT_HOME_MONTH_PANEL_ID}
            eyebrow="Month"
            title={currentMonthLabel}
            detail="1 through EOM."
            badge={`Day ${formatOrdinal(zonedDateParts.day)}`}
            meta={`${monthDayTotal} days this month · ${monthCalendarToggleState.enabled ? monthCalendarItemsVisible.length > 0 ? formatCalendarEventCountLabel(monthCalendarItemsVisible.length) : "No calendar events scheduled this month" : "Google Calendar off for this card"}`}
            collapsedSummary={monthCollapsedSummary}
            ticks={monthTicks}
            markers={monthMeterMarkers}
            currentPercent={currentMonthPercent}
            calendarToggle={{
              checked: monthCalendarToggleState.enabled,
              label: "Pull Google Calendar",
              ariaLabel: "Pull Google Calendar into the month timeline card",
              onChange: monthCalendarToggleState.setEnabled,
            }}
            ariaLabel={`Month meter in ${resolvedTimeZone}. Today is day ${zonedDateParts.day} of ${monthDayTotal}. The month runs from 1 through end of month.`}
            expanded={monthCardExpandedState.expanded}
            onToggle={() =>
              monthCardExpandedState.setExpanded((current) => !current)
            }
          >
            {monthCalendarToggleState.enabled ? (
              <PromptHomeCalendarAgendaSection
                title="This month"
                summary={monthCalendarSummary}
                items={monthCalendarItemsVisible}
                emptyMessage={
                  googleCalendarSession.cachedEvents.length > 0 ||
                  googleCalendarSession.scopeGranted
                    ? "No calendar events are scheduled in this month view."
                    : calendarConnectionMessage
                }
              />
            ) : null}
          </PromptHomeTimeMeterCard>
        </div>
      </div>
    </section>
  );
}

export function PromptHomeWorkspace({
  authSession,
  health,
  counts,
  assets = [],
  locations = [],
  spatialFeatures = [],
  weatherLocations = [],
  weatherSyncStatus = null,
  referenceDataLoaded = false,
  referenceDataLoading = false,
  onEnsureReferenceData,
  weatherDataLoaded = false,
  weatherDataLoading = false,
  weatherDataError = "",
  onEnsureWeatherData,
  onOpenView,
  customEventsHref = `/?view=settings#${SETTINGS_CUSTOM_EVENTS_CARD_ANCHOR_ID}`,
  onOpenCustomEvents,
  onRefreshData,
  initialMessages = [],
  initialMapAssetLayerVisible = true,
}: PromptHomeWorkspaceProps) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [timeDisplaySettings, setTimeDisplaySettings] =
    useState<TimeDisplaySettings>(() => getTimeDisplaySettingsSnapshot());
  const [runtimeSettings, setRuntimeSettings] =
    useState<AssistantRuntimeSettings | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [draft, setDraft] = useState("");
  const [draftApplicationContext, setDraftApplicationContext] = useState("");
  const [draftSummaryTargets, setDraftSummaryTargets] = useState<
    AssistantWorkspaceSummaryTarget[]
  >([]);
  const [messages, setMessages] = useState<PromptHomeMessage[]>(
    () => initialMessages,
  );
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [actionRequestIdsInFlight, setActionRequestIdsInFlight] = useState<
    number[]
  >([]);
  const [promptRouteRecommendations, setPromptRouteRecommendations] = useState<
    AssistantPromptRouteRecommendation[]
  >([]);
  const [
    promptRouteRecommendationsLoading,
    setPromptRouteRecommendationsLoading,
  ] = useState(false);
  const [promptRouteRecommendationsError, setPromptRouteRecommendationsError] =
    useState("");
  const [tradeAttentionCandidates, setTradeAttentionCandidates] = useState<
    TradeAttentionCandidateRecord[]
  >([]);
  const [invoiceIssueCandidates, setInvoiceIssueCandidates] = useState<
    InvoiceIssueCandidateRecord[]
  >([]);
  const [selectedPromptKitKey, setSelectedPromptKitKey] = useState<
    PromptHomePromptKit["key"] | null
  >(null);
  const promptCardExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.prompt-card",
    true,
  );
  const setPromptCardExpanded = promptCardExpandedState.setExpanded;
  const promptResumeIntent = useSyncExternalStore(
    subscribePromptResumeIntent,
    getPromptResumeIntent,
    () => null,
  );
  const consumedPromptResumeKeyRef = useRef<string | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const timeZoneOptions = useMemo(() => listTimeDisplayTimeZoneOptions(), []);

  useEffect(() => {
    if (
      !shouldAutoEnsurePromptHomeData({
        hasSession: Boolean(authSession),
        dataLoaded: referenceDataLoaded,
        dataLoading: referenceDataLoading,
        hasEnsureHandler: Boolean(onEnsureReferenceData),
      })
    ) {
      return;
    }

    if (!onEnsureReferenceData) {
      return;
    }

    void onEnsureReferenceData().catch(() => undefined);
  }, [
    authSession,
    onEnsureReferenceData,
    referenceDataLoaded,
    referenceDataLoading,
  ]);

  useEffect(() => {
    if (
      !shouldAutoEnsurePromptHomeData({
        hasSession: Boolean(authSession),
        dataLoaded: weatherDataLoaded,
        dataLoading: weatherDataLoading,
        dataError: weatherDataError,
        hasEnsureHandler: Boolean(onEnsureWeatherData),
      })
    ) {
      return;
    }

    if (!onEnsureWeatherData) {
      return;
    }

    void onEnsureWeatherData().catch(() => undefined);
  }, [
    authSession,
    onEnsureWeatherData,
    weatherDataError,
    weatherDataLoaded,
    weatherDataLoading,
  ]);

  useEffect(() => {
    let timeoutId: number | null = null;

    const scheduleNextClockRefresh = (now: Date) => {
      timeoutId = window.setTimeout(() => {
        syncClockToCurrentMinute();
      }, getPromptHomeNextClockTickDelay(now));
    };

    const syncClockToCurrentMinute = () => {
      const now = new Date();
      setCurrentTime(now);
      scheduleNextClockRefresh(now);
    };

    const resyncClock = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      syncClockToCurrentMinute();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resyncClock();
      }
    };

    scheduleNextClockRefresh(new Date());
    window.addEventListener("focus", resyncClock);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener("focus", resyncClock);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const operatorContext = useMemo(
    () =>
      buildPromptHomeContext({
        health,
        counts,
        displayName: authSession?.user.display_name ?? "Signed-out user",
      }),
    [authSession?.user.display_name, counts, health],
  );
  const selectedPromptKit = useMemo(
    () =>
      selectedPromptKitKey
        ? (PROMPT_HOME_PROMPT_KITS.find(
            (promptKit) => promptKit.key === selectedPromptKitKey,
          ) ?? null)
        : null,
    [selectedPromptKitKey],
  );
  const promotedRoutes = useMemo(
    () =>
      buildPromptHomePromotedRoutes({
        recommendations: promptRouteRecommendations,
        tradeAttentionCandidates,
        invoiceIssueCandidates,
      }),
    [
      invoiceIssueCandidates,
      promptRouteRecommendations,
      tradeAttentionCandidates,
    ],
  );
  const displayedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const recordPromptNavigationOutcome = useCallback(
    (
      runId: number | null | undefined,
      payload: {
        outcome: "ACCEPTED" | "DISMISSED" | "FAILED";
        intentKey: string;
        targetView?: ViewKey;
        targetLabel?: string;
        targetRationale?: string;
        focusType?:
          | "trade"
          | "workflow_item"
          | "document"
          | "invoice"
          | "payment"
          | "reference_record"
          | "report";
        focusId?: string;
        focusLabel?: string;
        detail?: string;
      },
    ) => {
      if (!authSession) {
        return;
      }

      void submitAssistantPromptNavigationOutcome(
        appConfig.apiBase,
        runId,
        payload,
        { accessToken: authSession.accessToken },
      ).catch(() => undefined);
    },
    [authSession],
  );

  const refreshPromptRouteRecommendations = useCallback(async () => {
    if (!authSession) {
      setPromptRouteRecommendations([]);
      setPromptRouteRecommendationsError("");
      return;
    }

    setPromptRouteRecommendationsLoading(true);
    setPromptRouteRecommendationsError("");
    try {
      const recommendations = await listAssistantPromptRouteRecommendations(
        appConfig.apiBase,
        {
          accessToken: authSession.accessToken,
        },
      );
      setPromptRouteRecommendations(recommendations);
    } catch (error) {
      setPromptRouteRecommendations([]);
      setPromptRouteRecommendationsError(
        error instanceof Error
          ? error.message
          : "Could not load promoted prompt routes.",
      );
    } finally {
      setPromptRouteRecommendationsLoading(false);
    }
  }, [authSession]);

  useEffect(() => {
    void refreshPromptRouteRecommendations();
  }, [refreshPromptRouteRecommendations]);

  useEffect(() => {
    if (!authSession || promptRouteRecommendations.length === 0) {
      setTradeAttentionCandidates([]);
      setInvoiceIssueCandidates([]);
      return;
    }

    const readHeaders = new Headers({
      Authorization: `Bearer ${authSession.accessToken}`,
    });
    void Promise.allSettled([
      loadTradeAttentionCandidates(
        appConfig.apiBase,
        { limit: 6 },
        { readHeaders },
      ),
      loadInvoiceIssueCandidates(
        appConfig.apiBase,
        { readyOnly: true, limit: 6 },
        { readHeaders },
      ),
    ]).then((results) => {
      const [tradeCandidatesResult, invoiceCandidatesResult] = results;
      if (tradeCandidatesResult.status === "fulfilled") {
        setTradeAttentionCandidates(tradeCandidatesResult.value.items);
      } else {
        setTradeAttentionCandidates([]);
      }

      if (invoiceCandidatesResult.status === "fulfilled") {
        setInvoiceIssueCandidates(invoiceCandidatesResult.value.items);
      } else {
        setInvoiceIssueCandidates([]);
      }
    });
  }, [authSession, promptRouteRecommendations]);

  const loadRuntimeSettings = useCallback(async (): Promise<AssistantRuntimeSettings> => {
    if (runtimeSettings) {
      return runtimeSettings;
    }

    try {
      const payload = await loadAssistantRuntimeSettings(appConfig.apiBase);
      setRuntimeSettings(payload);
      setRuntimeError("");
      return payload;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not load assistant runtime.";
      setRuntimeError(message);
      throw new Error(message);
    }
  }, [runtimeSettings]);

  const transcribeVoiceNote = useCallback(
    async (audioFile: File) => {
      if (!authSession) {
        throw new Error("Sign in to use recorded voice transcription.");
      }

      const runtime = await loadRuntimeSettings();
      if (!runtime.voice_transcription?.enabled) {
        throw new Error("Backend voice transcription is not configured on this API.");
      }

      const transcript = await transcribeAssistantVoice(appConfig.apiBase, audioFile, {
        accessToken: authSession.accessToken,
        filename: audioFile.name,
      });
      return transcript.text;
    },
    [authSession, loadRuntimeSettings],
  );
  const voiceTranscriptionSettings = runtimeSettings?.voice_transcription;
  const voiceGenerationSettings = runtimeSettings?.voice_generation;
  const synthesizeVoicePlayback = useCallback(
    async (text: string) => {
      if (!authSession) {
        throw new Error("Sign in to use generated voice playback.");
      }

      return synthesizeAssistantVoice(appConfig.apiBase, text, {
        accessToken: authSession.accessToken,
      });
    },
    [authSession],
  );

  const voiceComposer = useVoiceComposer({
    draft,
    onDraftChange: setDraft,
    backendTranscription: {
      enabled: Boolean(authSession && voiceTranscriptionSettings?.enabled),
      supportedContentTypes:
        voiceTranscriptionSettings?.supported_content_types ?? [],
      transcribeAudio: transcribeVoiceNote,
      unavailableMessage: !authSession
        ? "Sign in to use recorded voice transcription when browser dictation is unavailable."
        : runtimeSettings
          ? voiceTranscriptionSettings?.enabled
            ? ""
            : "Backend voice transcription is not configured on this API."
          : "Checking whether backend voice transcription is available.",
    },
  });
  const voicePlayback = useVoicePlayback({
    backendSynthesis: {
      enabled: Boolean(authSession && voiceGenerationSettings?.enabled),
      synthesizeAudio: synthesizeVoicePlayback,
    },
  });

  useEffect(() => {
    if (!voicePlayback.activePlaybackId) {
      return;
    }

    if (
      displayedMessages.some(
        (message) => message.id === voicePlayback.activePlaybackId,
      )
    ) {
      return;
    }

    voicePlayback.stopPlayback();
  }, [displayedMessages, voicePlayback]);

  useEffect(() => {
    if (!authSession || runtimeSettings) {
      return;
    }

    void loadRuntimeSettings().catch(() => undefined);
  }, [authSession, loadRuntimeSettings, runtimeSettings]);

  async function submitPrompt(
    prompt: string,
    summaryTargets: AssistantWorkspaceSummaryTarget[] = [],
    applicationContext?: string,
  ) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || !authSession || submitting) {
      return;
    }

    const userMessage: PromptHomeMessage = {
      id: createPromptMessageId(),
      role: "user",
      content: trimmedPrompt,
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setDraft("");
    setSubmitError("");
    setSubmitting(true);

    try {
      const settings = await loadRuntimeSettings();
      if (!settings.enabled) {
        throw new Error(
          "No configured assistant provider is currently ready on the API.",
        );
      }

      const provider = resolveDefaultProvider(settings);
      const providerDetails = settings.providers.find(
        (entry) => entry.provider === provider,
      );
      if (!provider || !providerDetails?.enabled) {
        throw new Error(
          "No enabled assistant provider is available for the operator prompt.",
        );
      }

      const response = await requestAssistantResponse(
        appConfig.apiBase,
        {
          conversation_id: conversationId ?? undefined,
          provider,
          workspace: "assistant",
          context: mergePromptContexts(operatorContext, applicationContext),
          summary_targets: summaryTargets,
          use_live_tools: true,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        },
        {
          accessToken: authSession.accessToken,
        },
      );
      const responseConversationId = response.conversation_id ?? conversationId;
      const parsedResponse = parsePromptNavigationIntentsFromAssistantContent(
        response.message.content,
        {
          sourceRunId: response.run_id,
          sourceConversationId: responseConversationId,
        },
      );
      const responseContent =
        parsedResponse.intents.length > 0 || parsedResponse.warnings.length > 0
          ? parsedResponse.content
          : parsedResponse.content || response.message.content;

      if (parsedResponse.warnings.includes(INVALID_PROMPT_NAVIGATION_WARNING)) {
        recordPromptNavigationOutcome(response.run_id, {
          outcome: "FAILED",
          intentKey: "invalid_navigation_payload",
          detail: INVALID_PROMPT_NAVIGATION_WARNING,
        });
      }

      setConversationId(responseConversationId);
      setDraftApplicationContext("");
      setDraftSummaryTargets([]);
      setMessages((current) => [
        ...current,
        {
          id: createPromptMessageId(),
          role: "assistant",
          content: responseContent,
          provider: response.provider,
          model: response.model,
          runId: response.run_id,
          warnings: [...response.warnings, ...parsedResponse.warnings],
          actionRequests: response.action_requests,
          navigationIntents: parsedResponse.intents,
        },
      ]);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Assistant request failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const submitResumedPrompt = useEffectEvent(
    (
      prompt: string,
      summaryTargets: AssistantWorkspaceSummaryTarget[] = [],
      applicationContext?: string,
    ) => {
      void submitPrompt(prompt, summaryTargets, applicationContext);
    },
  );

  useEffect(() => {
    if (!authSession || !promptResumeIntent) {
      return;
    }

    const resumeKey = `${promptResumeIntent.createdAt}:${promptResumeIntent.draft}`;
    if (consumedPromptResumeKeyRef.current === resumeKey) {
      return;
    }

    consumedPromptResumeKeyRef.current = resumeKey;
    clearPromptResumeIntent();
    setPromptCardExpanded(true);
    setDraft(promptResumeIntent.draft);
    setDraftApplicationContext(promptResumeIntent.applicationContext ?? "");
    setDraftSummaryTargets(promptResumeIntent.summaryTargets ?? []);
    setSubmitError("");

    if (promptResumeIntent.submitAfterSignIn) {
      submitResumedPrompt(
        promptResumeIntent.draft,
        promptResumeIntent.summaryTargets ?? [],
        promptResumeIntent.applicationContext,
      );
    }
  }, [authSession, promptResumeIntent, setPromptCardExpanded]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    voicePlayback.stopPlayback();
    voiceComposer.cancelListening();
    if (!authSession) {
      const trimmedDraft = draft.trim();
      if (!trimmedDraft) {
        return;
      }

      savePromptResumeIntent({
        draft: trimmedDraft,
        applicationContext: draftApplicationContext,
        summaryTargets: draftSummaryTargets,
        submitAfterSignIn: true,
      });
      setSubmitError("");
      onOpenView("settings");
      return;
    }

    void submitPrompt(draft, draftSummaryTargets, draftApplicationContext);
  }

  function handleSignIn() {
    const trimmedDraft = draft.trim();
    if (trimmedDraft) {
      savePromptResumeIntent({
        draft: trimmedDraft,
        applicationContext: draftApplicationContext,
        summaryTargets: draftSummaryTargets,
        submitAfterSignIn: false,
      });
    } else {
      savePromptSignInReturnIntent();
    }

    setSubmitError("");
    onOpenView("settings");
  }

  function loadPromptDraft(nextDraft: string) {
    voicePlayback.stopPlayback();
    voiceComposer.cancelListening();
    setPromptCardExpanded(true);
    setDraft(nextDraft);
    setDraftApplicationContext("");
    setDraftSummaryTargets([]);
    setSubmitError("");

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        composerTextareaRef.current?.focus();
        composerTextareaRef.current?.setSelectionRange(
          nextDraft.length,
          nextDraft.length,
        );
      });
    }
  }

  function openNavigationIntent(
    intent: PromptNavigationIntent,
    options: {
      includeHandoff?: boolean;
      recordOutcome?: boolean;
    } = {},
  ) {
    const normalizedIntent = normalizePromptNavigationIntent(intent);
    if (!normalizedIntent) {
      setSubmitError("That navigation suggestion is no longer available.");
      if (options.recordOutcome) {
        recordPromptNavigationOutcome(intent.sourceRunId, {
          outcome: "FAILED",
          intentKey: buildPromptNavigationIntentKey(intent),
          detail: "That navigation suggestion is no longer available.",
        });
      }
      return;
    }

    if (options.recordOutcome) {
      recordPromptNavigationOutcome(normalizedIntent.sourceRunId, {
        outcome: "ACCEPTED",
        intentKey: buildPromptNavigationIntentKey(normalizedIntent),
        targetView: normalizedIntent.targetView,
        targetLabel: promptNavigationIntentLabel(normalizedIntent),
        targetRationale: normalizedIntent.rationale,
        focusType: normalizedIntent.focus?.type,
        focusId: normalizedIntent.focus?.id,
        focusLabel: normalizedIntent.focus?.label,
      });
    }

    onOpenView(
      normalizedIntent.targetView,
      options.includeHandoff === false
        ? null
        : buildPromptNavigationRouteHandoff(normalizedIntent),
    );
  }

  function handleDismissNavigationIntent(
    messageId: string,
    intent: PromptNavigationIntent,
  ) {
    const intentKey = buildPromptNavigationIntentKey(intent);
    setMessages((current) =>
      removePromptNavigationIntent(current, { messageId, intentKey }),
    );
    recordPromptNavigationOutcome(intent.sourceRunId, {
      outcome: "DISMISSED",
      intentKey,
      targetView: intent.targetView,
      targetLabel: promptNavigationIntentLabel(intent),
      targetRationale: intent.rationale,
      focusType: intent.focus?.type,
      focusId: intent.focus?.id,
      focusLabel: intent.focus?.label,
    });
  }

  const handleActionRequestDecision = useCallback(
    async (
      actionRequestId: number,
      decision: "approve" | "reject",
      payload: AssistantActionDecisionPayload,
    ) => {
      setSubmitError("");
      setActionRequestIdsInFlight((current) =>
        current.includes(actionRequestId)
          ? current
          : [...current, actionRequestId],
      );

      try {
        const updatedActionRequest =
          decision === "approve"
            ? await approveAssistantActionRequest(
                appConfig.apiBase,
                actionRequestId,
                payload,
              )
            : await rejectAssistantActionRequest(
                appConfig.apiBase,
                actionRequestId,
                payload,
              );

        setMessages((current) =>
          replacePromptMessageActionRequest(current, updatedActionRequest),
        );

        if (
          (updatedActionRequest.status === "EXECUTED" ||
            updatedActionRequest.status === "FAILED") &&
          onRefreshData
        ) {
          await onRefreshData();
        }
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Could not update the governed action request.",
        );
      } finally {
        setActionRequestIdsInFlight((current) =>
          current.filter((id) => id !== actionRequestId),
        );
      }
    },
    [onRefreshData],
  );

  const runtimeNote = runtimeError
    ? runtimeError
    : runtimeSettings
      ? `Using ${runtimeSettings.effective_default_provider ?? "the first enabled provider"} when you send.`
      : "Assistant runtime will be checked when you send the first prompt.";
  const promptCardCollapsedSummary = (() => {
    const trimmedDraft = draft.trim();
    if (submitting) {
      return "Sending the current prompt.";
    }
    if (trimmedDraft) {
      return trimmedDraft.length > 120
        ? `${trimmedDraft.slice(0, 117).trimEnd()}...`
        : trimmedDraft;
    }
    return authSession
      ? "Ask what needs attention, where to go next, or how to handle a trade, queue, exposure, invoice, or report question."
      : "Draft a request here, then sign in when you're ready to send it.";
  })();
  const promptCardDescription = promptCardExpandedState.expanded
    ? "Route work from intent, start from a suggested prompt, and keep the governed assistant flow close at hand."
    : promptCardCollapsedSummary;
  const promptRouteRecommendationNote = !authSession
    ? "Sign in to load promoted routes from accepted Home handoffs."
    : promptRouteRecommendationsLoading
      ? "Loading promoted routes."
      : promptRouteRecommendationsError
        ? promptRouteRecommendationsError
        : formatPromotedRouteSummary(promotedRoutes);

  return (
    <div className="prompt-home">
      <section className="surface prompt-home-composer-panel">
        <div className="prompt-home-heading-row">
          <div className="prompt-home-heading">
            <span className="eyebrow">Home</span>
          </div>
          {!authSession ? (
            <div className="prompt-home-heading-actions">
              <button
                type="button"
                className="button button-ghost prompt-home-secondary-action"
                onClick={handleSignIn}
              >
                Sign In
              </button>
            </div>
          ) : null}
        </div>

        <PromptHomeTimeframePanel
          currentTime={currentTime}
          timeDisplaySettings={timeDisplaySettings}
          timeZoneOptions={timeZoneOptions}
          customEventsHref={customEventsHref}
          onOpenCustomEvents={onOpenCustomEvents}
          onTimeZoneChange={(nextTimeZone) => {
            const savedSettings = saveTimeDisplaySettingsSnapshot({
              ...timeDisplaySettings,
              timeZone: nextTimeZone,
            });
            setTimeDisplaySettings(savedSettings);
          }}
        />
        <PromptHomeMapTile
          authSession={authSession}
          assets={assets}
          locations={locations}
          spatialFeatures={spatialFeatures}
          weatherLocations={weatherLocations}
          weatherSyncStatus={weatherSyncStatus}
          referenceDataLoaded={referenceDataLoaded}
          weatherDataLoaded={weatherDataLoaded}
          weatherDataLoading={weatherDataLoading}
          weatherDataError={weatherDataError}
          onOpenMapWorkspace={() => onOpenView("map")}
          initialMapAssetLayerVisible={initialMapAssetLayerVisible}
        />
        <PromptHomeDocumentUploadCard
          authSession={authSession}
          onOpenOperationsWorkspace={() => onOpenView("operations")}
          onSignIn={handleSignIn}
        />

        <section
          className={`prompt-home-prompt-card ${promptCardExpandedState.expanded ? "is-expanded" : "is-collapsed"}`}
        >
          <div className="prompt-home-prompt-card-head">
            <div className="prompt-home-prompt-card-copy">
              <span className="eyebrow">Prompt</span>
              <strong>Ask the desk assistant</strong>
              <p>{promptCardDescription}</p>
            </div>

            <div className="prompt-home-prompt-card-side">
              <button
                type="button"
                className="prompt-home-prompt-card-toggle"
                aria-expanded={promptCardExpandedState.expanded}
                aria-controls={PROMPT_HOME_PROMPT_CARD_PANEL_ID}
                onClick={() =>
                  promptCardExpandedState.setExpanded((current) => !current)
                }
              >
                <div className="prompt-home-prompt-card-toggle-meta">
                  <small>
                    {promptCardExpandedState.expanded
                      ? "Hide card"
                      : "Show card"}
                  </small>
                  <span
                    className="prompt-home-support-toggle-indicator"
                    aria-hidden="true"
                  >
                    {promptCardExpandedState.expanded ? "−" : "+"}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div
            id={PROMPT_HOME_PROMPT_CARD_PANEL_ID}
            className="prompt-home-prompt-card-body"
            hidden={!promptCardExpandedState.expanded}
          >
            {promptCardExpandedState.expanded ? (
              <>
                <form className="prompt-home-composer" onSubmit={handleSubmit}>
                  <label className="field prompt-home-composer-field">
                    <span>Operator prompt</span>
                    <textarea
                      ref={composerTextareaRef}
                      className="control prompt-home-textarea"
                      value={draft}
                      onChange={(event) => {
                        voiceComposer.cancelListening();
                        setDraft(event.target.value);
                        setSubmitError("");
                      }}
                      placeholder="Ask what needs attention, where to go next, or how to handle a trade, queue, exposure, invoice, or report question."
                    />
                  </label>

                  <div className="toolbar settings-actions prompt-home-actions">
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => {
                        setSubmitError("");
                        voiceComposer.toggleListening();
                      }}
                      disabled={!voiceComposer.canToggle || submitting}
                      aria-pressed={voiceComposer.listening}
                    >
                      {voiceComposer.buttonLabel}
                    </button>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={
                        !draft.trim() || submitting || voiceComposer.listening
                      }
                    >
                      {submitting
                        ? "Sending..."
                        : authSession
                          ? "Send Prompt"
                          : "Sign In to Send Prompt"}
                    </button>
                  </div>

                  <p
                    className={`form-note ${submitError ? "form-note-error" : ""}`}
                  >
                    {submitError ||
                      (!authSession
                        ? "You can draft the prompt here. We will only send it after you sign in."
                        : runtimeNote)}
                  </p>
                  <p
                    className={`form-note ${
                      voiceComposer.statusTone === "error"
                        ? "form-note-error"
                        : ""
                    }`}
                  >
                    {voiceComposer.statusMessage}
                  </p>
                </form>

                <div
                  className="prompt-home-quick-prompts"
                  aria-label="Quick prompts"
                >
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="entity-chip entity-chip-soft"
                      onClick={() => loadPromptDraft(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <section
                  className="prompt-home-prompt-kits"
                  aria-label="Prompt kits"
                >
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">Guided Prompts</span>
                      <h3>What are you trying to do?</h3>
                    </div>
                    <p>
                      Pick a lane, then load a suggested prompt or jump
                      straight to the right workspace.
                    </p>
                  </div>

                  <div
                    className="prompt-home-prompt-kit-picker"
                    aria-label="Prompt kit categories"
                  >
                    {PROMPT_HOME_PROMPT_KITS.map((promptKit) => {
                      const isSelected = promptKit.key === selectedPromptKitKey;

                      return (
                        <button
                          key={promptKit.key}
                          type="button"
                          className={`prompt-home-prompt-kit-choice ${isSelected ? "is-active" : ""}`}
                          aria-pressed={isSelected}
                          onClick={() =>
                            setSelectedPromptKitKey((current) =>
                              current === promptKit.key ? null : promptKit.key,
                            )
                          }
                        >
                          {promptKit.label}
                        </button>
                      );
                    })}
                  </div>

                  {selectedPromptKit ? (
                    <article className="prompt-home-starter prompt-home-prompt-kit-panel">
                      <div className="prompt-home-prompt-kit-panel-head">
                        <h4>{selectedPromptKit.label}</h4>
                        <p>{selectedPromptKit.detail}</p>
                      </div>

                      <div className="prompt-home-prompt-kit-section">
                        <span className="eyebrow">Suggested prompts</span>
                        <div
                          className="prompt-home-kit-examples"
                          aria-label={`${selectedPromptKit.label} suggested prompts`}
                        >
                          {selectedPromptKit.suggestedPrompts.map(
                            (suggestion) => (
                              <button
                                key={`${selectedPromptKit.key}-${suggestion.prompt}`}
                                type="button"
                                className="prompt-home-kit-example"
                                onClick={() =>
                                  loadPromptDraft(suggestion.prompt)
                                }
                              >
                                {suggestion.label}
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      <div className="prompt-home-prompt-kit-section">
                        <span className="eyebrow">Workspace links</span>
                        <div className="prompt-home-starter-actions">
                          {selectedPromptKit.workspaceLinks.map((link) => (
                            <button
                              key={`${selectedPromptKit.key}-${link.view}`}
                              type="button"
                              className="button button-secondary"
                              onClick={() => onOpenView(link.view)}
                            >
                              {link.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </article>
                  ) : (
                    <p className="form-note prompt-home-prompt-kits-empty">
                      Choose one to reveal a few suggested prompts and direct
                      workspace links.
                    </p>
                  )}
                </section>

                <section
                  className="prompt-home-promoted-routes"
                  aria-label="Promoted routes"
                >
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">Promoted Routes</span>
                      <h3>Go straight to proven destinations</h3>
                    </div>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => void refreshPromptRouteRecommendations()}
                      disabled={
                        !authSession || promptRouteRecommendationsLoading
                      }
                    >
                      Refresh
                    </button>
                  </div>
                  <p
                    className={`form-note ${promptRouteRecommendationsError ? "form-note-error" : ""}`}
                  >
                    {promptRouteRecommendationNote}
                  </p>
                  {promotedRoutes.length > 0 ? (
                    <div className="prompt-home-destination-list">
                      {promotedRoutes.map((route) => {
                        if (route.readiness === "ready") {
                          return (
                            <button
                              key={route.key}
                              type="button"
                              className="prompt-home-destination prompt-home-promoted-route"
                              onClick={() =>
                                openNavigationIntent(route.intent, {
                                  includeHandoff: route.hasFocusedHandoff,
                                  recordOutcome: route.recordOutcomeOnOpen,
                                })
                              }
                            >
                              <div className="prompt-home-destination-head">
                                <strong>{route.displayLabel}</strong>
                                <span
                                  className={`status-pill status-pill-${route.readinessTone}`}
                                >
                                  {route.readinessLabel}
                                </span>
                              </div>
                              <span>{route.displayDetail}</span>
                              {route.displayFocusLabel ? (
                                <small>{route.displayFocusLabel}</small>
                              ) : null}
                              {route.ageLabel ? (
                                <small>{route.ageLabel}</small>
                              ) : null}
                              <small>
                                {formatPromotedRouteEvidence(
                                  route.recommendation,
                                )}
                              </small>
                            </button>
                          );
                        }

                        return (
                          <article
                            key={route.key}
                            className="prompt-home-destination prompt-home-promoted-route is-unavailable"
                          >
                            <div className="prompt-home-destination-head">
                              <strong>{route.displayLabel}</strong>
                              <span
                                className={`status-pill status-pill-${route.readinessTone}`}
                              >
                                {route.readinessLabel}
                              </span>
                            </div>
                            <span>{route.displayDetail}</span>
                            {route.ageLabel ? (
                              <small>{route.ageLabel}</small>
                            ) : null}
                            <div className="prompt-home-destination-actions">
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() =>
                                  openNavigationIntent(route.intent, {
                                    includeHandoff: false,
                                  })
                                }
                              >
                                {promptNavigationIntentLabel(route.intent)}
                              </button>
                            </div>
                            <small>
                              {formatPromotedRouteEvidence(
                                route.recommendation,
                              )}
                            </small>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </div>
        </section>
      </section>

      <section className="prompt-home-grid">
        <article className="surface prompt-home-chat">
          <div className="section-head">
            <div>
              <span className="eyebrow">Conversation</span>
              <h3>Current prompt thread</h3>
            </div>
            <p>
              Responses can explain, route, draft, or stage governed actions.
              They do not directly mutate records.
            </p>
          </div>

          <div className="prompt-home-chat-log">
            {displayedMessages.length === 0 ? (
              <div className="empty-state prompt-home-empty">
                <strong>No prompt yet</strong>
                <p>
                  Use the composer above or pick a quick prompt to start from
                  intent instead of choosing a screen first.
                </p>
              </div>
            ) : (
              displayedMessages.map((message) => {
                const canReadAloud =
                  message.role === "assistant" &&
                  voicePlayback.canPlay(message.content);
                const readingMessage = voicePlayback.isPlaying(message.id);

                return (
                  <article
                    key={message.id}
                    className={`assistant-message assistant-message-${message.role}`}
                  >
                    <div className="assistant-message-head">
                      <strong>
                        {message.role === "assistant" ? "Assistant" : "You"}
                      </strong>
                      {message.provider && message.model ? (
                        <span>
                          {message.provider} · {message.model}
                        </span>
                      ) : null}
                    </div>
                    {message.content ? <p>{message.content}</p> : null}
                    {canReadAloud ? (
                      <div className="assistant-message-meta">
                        <button
                          type="button"
                          className={`assistant-run-link ${readingMessage ? "is-selected" : ""}`}
                          aria-pressed={readingMessage}
                          disabled={!voicePlayback.supported}
                          title={
                            voicePlayback.supported
                              ? readingMessage
                                ? "Stop reading this assistant response aloud."
                                : "Read this assistant response aloud."
                              : "Read aloud is not supported in this browser."
                          }
                          onClick={() => {
                            voiceComposer.cancelListening();
                            voicePlayback.togglePlayback(
                              message.id,
                              message.content,
                            );
                          }}
                        >
                          {resolveVoicePlaybackButtonLabel(readingMessage)}
                        </button>
                      </div>
                    ) : null}
                    {message.runId ? (
                      <div className="assistant-message-meta">
                        <span>Run #{message.runId}</span>
                        <button
                          type="button"
                          className="assistant-run-link"
                          onClick={() => onOpenView("assistant")}
                        >
                          Open diagnostics
                        </button>
                      </div>
                    ) : null}
                    {message.actionRequests &&
                    message.actionRequests.length > 0 ? (
                      <div className="prompt-home-action-review">
                        <div className="feedback-banner prompt-home-action-banner">
                          <strong>
                            {message.actionRequests.length.toLocaleString()}{" "}
                            governed action request
                            {message.actionRequests.length === 1 ? "" : "s"}{" "}
                            staged
                          </strong>
                          <p>
                            Nothing changes until the typed review path approves
                            and executes it.
                          </p>
                        </div>
                        <AssistantActionRequestList
                          actionRequests={message.actionRequests}
                          actionRequestIdsInFlight={actionRequestIdsInFlight}
                          formatDate={formatPromptTimestamp}
                          onDecision={handleActionRequestDecision}
                          onOpenRun={() => onOpenView("assistant")}
                          showUserId
                        />
                        <div className="assistant-message-meta prompt-home-action-path">
                          <span>
                            Need the old review inbox or full run trace?
                          </span>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => onOpenView("assistant")}
                          >
                            Open Assistant Console
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {message.navigationIntents &&
                    message.navigationIntents.length > 0 ? (
                      <div
                        className="prompt-home-handoff-list"
                        aria-label="Assistant workspace handoffs"
                      >
                        {message.navigationIntents.map((intent) => (
                          <div
                            key={buildPromptNavigationIntentKey(intent)}
                            className="prompt-home-handoff-item"
                          >
                            <button
                              type="button"
                              className="prompt-home-handoff"
                              onClick={() =>
                                openNavigationIntent(intent, {
                                  includeHandoff: true,
                                  recordOutcome: true,
                                })
                              }
                            >
                              <strong>
                                {promptNavigationIntentLabel(intent)}
                              </strong>
                              <span>{promptNavigationIntentDetail(intent)}</span>
                            </button>
                            <button
                              type="button"
                              className="button button-ghost prompt-home-handoff-dismiss"
                              aria-label={`Dismiss ${promptNavigationIntentLabel(intent)}`}
                              onClick={() =>
                                handleDismissNavigationIntent(message.id, intent)
                              }
                            >
                              Dismiss
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {message.warnings && message.warnings.length > 0 ? (
                      <div className="assistant-message-meta">
                        {message.warnings.map((warning) => (
                          <span key={warning}>{warning}</span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </article>

      </section>
    </div>
  );
}
