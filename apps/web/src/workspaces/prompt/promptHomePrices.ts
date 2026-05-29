import type {
  PriceIndexObservationRecord,
  PriceIndexRecord,
  PriceIndexQuoteType,
} from "../../shared/models";
import { formatNumber } from "../../shared/format";

export type PromptHomePriceMarkFilter = "all" | "with_marks" | "missing_marks";

export type PromptHomePriceFilters = {
  query: string;
  provider: string;
  markFilter: PromptHomePriceMarkFilter;
  quoteType?: string;
  commodityCode?: string;
  locationCode?: string;
  priceIndexCode?: string;
  region?: string;
};

export type PromptHomePriceSortField =
  | "product"
  | "location"
  | "price"
  | "change"
  | "unit"
  | "currency"
  | "frequency"
  | "date"
  | "updated"
  | "source";

export type PromptHomePriceSortDirection = "asc" | "desc";
export type PromptHomePriceChangeTone = "up" | "down" | "flat";

export type PromptHomePriceSortState = {
  field: PromptHomePriceSortField;
  direction: PromptHomePriceSortDirection;
};

export type PromptHomePriceManualOrder = string[];

export type PromptHomePricingSnapshotSource = {
  priceIndices: readonly PriceIndexRecord[];
  latestMarks: readonly PriceIndexObservationRecord[];
};

export type PromptHomePricesCardStatus =
  | "reference_loading"
  | "no_active_indices"
  | "filtered_empty"
  | "ready";

export type PromptHomePriceRowViewModel = {
  key: string;
  priceIndexCode: string;
  product: string;
  location: string;
  price: string;
  change: string;
  changeTone: PromptHomePriceChangeTone;
  unit: string;
  currency: string;
  frequency: string;
  dateTime: string;
  updated: string;
  source: string;
  hasLatestMark: boolean;
  priceIndex: PriceIndexRecord;
  latestMark: PriceIndexObservationRecord | null;
  previousMark: PriceIndexObservationRecord | null;
};

export type PromptHomePricesCardViewModel = {
  status: PromptHomePricesCardStatus;
  activePriceIndexCount: number;
  latestMarkCount: number;
  providerOptions: string[];
  quoteTypeOptions: PriceIndexQuoteType[];
  effectiveFilters: PromptHomePriceFilters;
  hasActiveFilters: boolean;
  allRows: PromptHomePriceRowViewModel[];
  rows: PromptHomePriceRowViewModel[];
  latestMarksByCode: Record<string, PriceIndexObservationRecord>;
  previousMarksByCode: Record<string, PriceIndexObservationRecord>;
};

export const PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER = "ALL";
export const PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE = "ALL";

const PROMPT_HOME_PRICE_QUOTE_TYPE_LABELS: Record<PriceIndexQuoteType, string> = {
  SPOT: "Spot",
  FUTURE: "Future",
  FORWARD: "Forward",
  INDEX: "Index",
  OTHER: "Other",
};

const PROMPT_HOME_PRICE_NUMERIC_SORT_FIELDS = new Set<PromptHomePriceSortField>([
  "price",
  "change",
  "date",
  "updated",
]);

const PROMPT_HOME_PRICE_TIME_ZONE_BY_CONTEXT: Record<string, string> = {
  CAISO: "America/Los_Angeles",
  ERCOT: "America/Chicago",
  MISO: "America/Chicago",
  NYISO: "America/New_York",
  PJM: "America/New_York",
};

function normalizePromptHomePriceIndexCode(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized === "" ? null : normalized;
}

type PromptHomePriceMarkPair = {
  latestMark: PriceIndexObservationRecord;
  previousMark: PriceIndexObservationRecord | null;
};

function buildPromptHomePriceMarkPairsByCode(
  observations: readonly PriceIndexObservationRecord[],
): Record<string, PromptHomePriceMarkPair> {
  const markPairsByCode: Record<string, PromptHomePriceMarkPair> = {};
  for (const observation of observations) {
    const normalizedCode = normalizePromptHomePriceIndexCode(
      observation.price_index_code,
    );
    if (!normalizedCode) {
      continue;
    }

    const currentPair = markPairsByCode[normalizedCode];
    if (!currentPair) {
      markPairsByCode[normalizedCode] = {
        latestMark: observation,
        previousMark: null,
      };
      continue;
    }

    if (observation.id === currentPair.latestMark.id) {
      continue;
    }

    if (comparePromptHomePriceMarkRecency(observation, currentPair.latestMark) > 0) {
      markPairsByCode[normalizedCode] = {
        latestMark: observation,
        previousMark: currentPair.latestMark,
      };
      continue;
    }

    if (
      !currentPair.previousMark ||
      (observation.id !== currentPair.previousMark.id &&
        comparePromptHomePriceMarkRecency(
          observation,
          currentPair.previousMark,
        ) > 0)
    ) {
      currentPair.previousMark = observation;
    }
  }

  return markPairsByCode;
}

export function buildPromptHomeLatestMarksByCode(
  latestMarks: readonly PriceIndexObservationRecord[],
): Record<string, PriceIndexObservationRecord> {
  return Object.fromEntries(
    Object.entries(buildPromptHomePriceMarkPairsByCode(latestMarks)).map(
      ([priceIndexCode, pair]) => [priceIndexCode, pair.latestMark],
    ),
  );
}

function formatPromptHomeObservationDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return value;
  }

  const [, year, month, day] = match;
  const parsedDate = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return formatPromptHomeCompactUtcDate(parsedDate);
}

function promptHomePriceTimestamp(
  value: string | null | undefined,
): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function promptHomeObservationDateTimestamp(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const timestamp = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function promptHomePriceRevisionTimestamp(value: string): Date | null {
  const isoTimestampMatch =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(value.trim());
  if (!isoTimestampMatch?.[1]) {
    return null;
  }

  return promptHomePriceTimestamp(`${isoTimestampMatch[1]}Z`);
}

function promptHomePriceDeliveryRevisionTimestamp(value: string): Date | null {
  const deliveryTimestampMatch =
    /(?:^|:)delivery:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(
      value.trim(),
    );
  return deliveryTimestampMatch?.[1]
    ? promptHomePriceTimestamp(`${deliveryTimestampMatch[1]}Z`)
    : null;
}

function promptHomePriceCaisoRevisionTimestamp(value: string): Date | null {
  const caisoMatch = /^(\d{4}-\d{2}-\d{2}):HE(\d{1,2}):I(\d{1,2})$/i.exec(
    value.trim(),
  );
  if (!caisoMatch?.[1] || !caisoMatch[2] || !caisoMatch[3]) {
    return null;
  }

  const baseDate = promptHomeObservationDateTimestamp(caisoMatch[1]);
  const hourEnding = Number(caisoMatch[2]);
  const interval = Number(caisoMatch[3]);
  if (!baseDate || hourEnding < 1 || hourEnding > 24 || interval < 1 || interval > 12) {
    return null;
  }

  const intervalEndMinutes = (hourEnding - 1) * 60 + interval * 5;
  return new Date(baseDate.getTime() + intervalEndMinutes * 60_000);
}

function promptHomePriceErcotRevisionTimestamp(value: string): Date | null {
  const ercotMatch = /^(\d{4}-\d{2}-\d{2}):IE\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(
    value.trim(),
  );
  if (!ercotMatch?.[1] || !ercotMatch[2]) {
    return null;
  }

  const baseDate = promptHomeObservationDateTimestamp(ercotMatch[1]);
  const hour = Number(ercotMatch[2]);
  const minute = Number(ercotMatch[3] ?? 0);
  if (!baseDate || hour < 0 || hour > 24 || minute < 0 || minute > 59) {
    return null;
  }

  return new Date(baseDate.getTime() + (hour * 60 + minute) * 60_000);
}

function promptHomePriceSourceRevisionTimestamp(
  value: string | null | undefined,
): Date | null {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return null;
  }

  return (
    promptHomePriceDeliveryRevisionTimestamp(normalizedValue) ??
    promptHomePriceRevisionTimestamp(normalizedValue) ??
    promptHomePriceCaisoRevisionTimestamp(normalizedValue) ??
    promptHomePriceErcotRevisionTimestamp(normalizedValue)
  );
}

function formatPromptHomeCompactDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatPromptHomeCompactUtcDate(value: Date): string {
  return [
    formatPromptHomeCompactDatePart(value.getUTCMonth() + 1),
    formatPromptHomeCompactDatePart(value.getUTCDate()),
    String(value.getUTCFullYear()),
  ].join("/");
}

function formatPromptHomeObservationTime(value: Date): string {
  return [
    formatPromptHomeCompactDatePart(value.getUTCHours()),
    formatPromptHomeCompactDatePart(value.getUTCMinutes()),
    formatPromptHomeCompactDatePart(value.getUTCSeconds()),
  ].join(":");
}

function formatPromptHomeObservationTimestamp(value: Date): string {
  return `${formatPromptHomeCompactUtcDate(value)} ${formatPromptHomeObservationTime(value)}`;
}

function formatPromptHomeObservationTimestampWithTimeZone(
  value: Date,
  timeZone: string,
): string {
  return `${formatPromptHomeObservationTimestamp(
    value,
  )} ${formatPromptHomeTimeZoneLabel(timeZone, value)}`;
}

function formatPromptHomeTimeZoneLabel(timeZone: string, value: Date): string {
  const normalizedTimeZone = timeZone.trim() || "UTC";
  if (normalizedTimeZone.toUpperCase() === "UTC") {
    return "UTC";
  }

  try {
    const referenceDate = new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12),
    );
    const timeZonePart = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedTimeZone,
      timeZoneName: "short",
    })
      .formatToParts(referenceDate)
      .find((part) => part.type === "timeZoneName")?.value;
    return timeZonePart?.trim() || normalizedTimeZone;
  } catch {
    return normalizedTimeZone;
  }
}

function normalizePromptHomePriceTimeZoneContext(
  value: string | null | undefined,
): string | null {
  const normalizedValue = value?.trim().toUpperCase();
  return normalizedValue ? normalizedValue.replace(/[\s-]+/g, "_") : null;
}

function promptHomePriceTimeZoneForContext(
  value: string | null | undefined,
): string | null {
  const normalizedValue = normalizePromptHomePriceTimeZoneContext(value);
  return normalizedValue
    ? PROMPT_HOME_PRICE_TIME_ZONE_BY_CONTEXT[normalizedValue] ?? null
    : null;
}

function promptHomePriceSourceRevisionTimeZone(
  value: string | null | undefined,
): string | null {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}:HE\d{1,2}:I\d{1,2}$/i.test(normalizedValue)) {
    return PROMPT_HOME_PRICE_TIME_ZONE_BY_CONTEXT.CAISO;
  }
  if (/^\d{4}-\d{2}-\d{2}:IE\s*\d{1,2}(?::?\d{2})?$/i.test(normalizedValue)) {
    return PROMPT_HOME_PRICE_TIME_ZONE_BY_CONTEXT.ERCOT;
  }

  return null;
}

function promptHomePriceDisplayTimeZone(
  observation: PriceIndexObservationRecord | null | undefined,
  priceIndex?: PriceIndexRecord | null,
): string {
  return (
    promptHomePriceSourceRevisionTimeZone(observation?.source_revision) ??
    promptHomePriceTimeZoneForContext(priceIndex?.calendar_code) ??
    promptHomePriceTimeZoneForContext(priceIndex?.market) ??
    promptHomePriceTimeZoneForContext(observation?.source_provider) ??
    promptHomePriceTimeZoneForContext(priceIndex?.provider) ??
    "UTC"
  );
}

function formatPromptHomeSourceRevisionTime(
  value: string | null | undefined,
): string {
  const sourceRevisionTimestamp = promptHomePriceSourceRevisionTimestamp(value);
  return sourceRevisionTimestamp
    ? formatPromptHomeObservationTime(sourceRevisionTimestamp)
    : "—";
}

export function formatPromptHomePriceDate(
  observation: PriceIndexObservationRecord | null | undefined,
): string {
  if (!observation) {
    return "—";
  }

  return formatPromptHomeObservationDate(observation.observation_date);
}

export function formatPromptHomePriceTime(
  observation: PriceIndexObservationRecord | null | undefined,
): string {
  if (!observation) {
    return "—";
  }

  const sourceRevisionTime = formatPromptHomeSourceRevisionTime(
    observation.source_revision,
  );
  return sourceRevisionTime === "—" ? "00:00:00" : sourceRevisionTime;
}

export function formatPromptHomePriceUpdatedAt(
  observation: PriceIndexObservationRecord | null | undefined,
): string {
  const downloadedAt = promptHomePriceTimestamp(observation?.downloaded_at);
  return downloadedAt
    ? formatPromptHomeObservationTimestampWithTimeZone(downloadedAt, "UTC")
    : "—";
}

export function formatPromptHomePriceSource(
  observation: PriceIndexObservationRecord | null | undefined,
  priceIndex: PriceIndexRecord,
): string {
  const provider =
    observation?.source_provider.trim() || priceIndex.provider.trim();
  return provider || "—";
}

function priceObservationDigits(
  observation: PriceIndexObservationRecord | null,
  priceIndex: PriceIndexRecord,
): number {
  const unitCode = observation?.unit_code ?? priceIndex.unit_code;
  return unitCode === "GAL" ? 3 : 2;
}

export function formatPromptHomePriceNumber(
  observation: PriceIndexObservationRecord | null,
  priceIndex: PriceIndexRecord,
): string {
  if (!observation) {
    return "No mark yet";
  }

  return formatNumber(
    observation.value,
    priceObservationDigits(observation, priceIndex),
  );
}

export function formatPromptHomePriceChange(
  latestMark: PriceIndexObservationRecord | null,
  previousMark: PriceIndexObservationRecord | null,
  priceIndex: PriceIndexRecord,
): string {
  if (!latestMark || !previousMark) {
    return "—";
  }

  const delta = latestMark.value - previousMark.value;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatNumber(
    delta,
    priceObservationDigits(latestMark, priceIndex),
  )}`;
}

export function promptHomePriceChangeTone(
  latestMark: PriceIndexObservationRecord | null,
  previousMark: PriceIndexObservationRecord | null,
): PromptHomePriceChangeTone {
  if (!latestMark || !previousMark || latestMark.value === previousMark.value) {
    return "flat";
  }

  return latestMark.value > previousMark.value ? "up" : "down";
}

export function formatPromptHomePriceUnit(
  observation: PriceIndexObservationRecord | null,
  priceIndex: PriceIndexRecord,
): string {
  return observation?.unit_code || priceIndex.unit_code || "—";
}

export function formatPromptHomePriceCurrency(
  observation: PriceIndexObservationRecord | null,
  priceIndex: PriceIndexRecord,
): string {
  return observation?.currency_code || priceIndex.currency_code || "—";
}

export function formatPromptHomePriceProduct(priceIndex: PriceIndexRecord): string {
  return priceIndex.commodity_code || "—";
}

export function formatPromptHomePriceLocation(
  observation: PriceIndexObservationRecord | null,
  priceIndex: PriceIndexRecord,
): string {
  const locationCode = priceIndex.location_code?.trim();
  if (locationCode) {
    return locationCode;
  }

  const provider = priceIndex.provider.trim().toUpperCase();
  const sourceSeriesId = observation?.source_series_id.trim();
  if (
    sourceSeriesId &&
    ["CAISO", "ERCOT", "EIA_WHOLESALE_POWER"].includes(provider)
  ) {
    return sourceSeriesId;
  }

  return priceIndex.market?.trim() || "—";
}

export function formatPromptHomePriceFrequency(
  value: string | null | undefined,
): string {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return "Unknown cadence";
  }

  const normalizedCode = normalizedValue.toUpperCase().replace(/[\s-]+/g, "_");
  const minuteMatch = /^(\d+)_?MIN(?:UTE)?S?$/.exec(normalizedCode);
  if (minuteMatch?.[1]) {
    return `${minuteMatch[1]}-min`;
  }

  const hourMatch = /^(\d+)_?H(?:OUR)?S?$/.exec(normalizedCode);
  if (hourMatch?.[1]) {
    return `${hourMatch[1]}-hour`;
  }

  switch (normalizedCode) {
    case "HOURLY":
    case "HOUR":
      return "Hourly";
    case "DAILY":
    case "DAY":
      return "Daily";
    case "WEEKLY":
    case "WEEK":
      return "Weekly";
    case "MONTHLY":
    case "MONTH":
      return "Monthly";
    case "QUARTERLY":
    case "QUARTER":
      return "Quarterly";
    case "ANNUAL":
    case "ANNUALLY":
    case "YEARLY":
    case "YEAR":
      return "Annual";
    case "POSTING":
    case "POSTED":
    case "ON_POSTING":
      return "Posting";
    case "INTRADAY":
      return "Intraday";
    case "REAL_TIME":
    case "REALTIME":
      return "Real-time";
    default:
      return normalizedCode
        .split("_")
        .filter((part) => part.length > 0)
        .map((part) => part[0] + part.slice(1).toLowerCase())
        .join(" ");
  }
}

function formatPromptHomePriceRowFrequency(
  observation: PriceIndexObservationRecord | null,
): string {
  return observation ? formatPromptHomePriceFrequency(observation.source_frequency) : "—";
}

export function formatPromptHomePriceDateTime(
  observation: PriceIndexObservationRecord | null | undefined,
  priceIndex?: PriceIndexRecord | null,
): string {
  if (!observation) {
    return "No mark yet";
  }

  const displayTimeZone = promptHomePriceDisplayTimeZone(observation, priceIndex);
  const sourceRevisionTimestamp = promptHomePriceSourceRevisionTimestamp(
    observation.source_revision,
  );
  if (sourceRevisionTimestamp) {
    return formatPromptHomeObservationTimestampWithTimeZone(
      sourceRevisionTimestamp,
      displayTimeZone,
    );
  }

  const observationDate = promptHomeObservationDateTimestamp(
    observation.observation_date,
  );
  if (observationDate) {
    return formatPromptHomeObservationTimestampWithTimeZone(
      observationDate,
      displayTimeZone,
    );
  }

  return `${formatPromptHomePriceDate(observation)} ${formatPromptHomePriceTime(
    observation,
  )} ${formatPromptHomeTimeZoneLabel(displayTimeZone, new Date())}`;
}

export function formatPromptHomePriceReportTitleDateTime(
  observation: PriceIndexObservationRecord | null | undefined,
  priceIndex?: PriceIndexRecord | null,
): string {
  if (!observation) {
    return "";
  }

  const displayTimeZone = promptHomePriceDisplayTimeZone(observation, priceIndex);
  const sourceRevisionTimestamp = promptHomePriceSourceRevisionTimestamp(
    observation.source_revision,
  );
  if (sourceRevisionTimestamp) {
    return formatPromptHomeObservationTimestampWithTimeZone(
      sourceRevisionTimestamp,
      displayTimeZone,
    );
  }

  const observationDate = observation.observation_date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(observationDate)) {
    const observationDateTimestamp =
      promptHomeObservationDateTimestamp(observationDate);
    return observationDateTimestamp
      ? formatPromptHomeObservationTimestampWithTimeZone(
          observationDateTimestamp,
          displayTimeZone,
        )
      : formatPromptHomePriceDate(observation);
  }

  const observationTimestamp = promptHomePriceTimestamp(observationDate);
  if (observationTimestamp) {
    return formatPromptHomeObservationTimestampWithTimeZone(
      observationTimestamp,
      displayTimeZone,
    );
  }

  return formatPromptHomePriceDate(observation);
}

export function normalizePromptHomePriceQuoteType(
  priceIndex: PriceIndexRecord,
): PriceIndexQuoteType {
  const quoteType = priceIndex.quote_type?.trim().toUpperCase();
  return quoteType && quoteType in PROMPT_HOME_PRICE_QUOTE_TYPE_LABELS
    ? (quoteType as PriceIndexQuoteType)
    : "SPOT";
}

export function formatPromptHomePriceQuoteType(
  priceIndex: PriceIndexRecord,
): string {
  return formatPromptHomePriceQuoteTypeCode(
    normalizePromptHomePriceQuoteType(priceIndex),
  );
}

export function formatPromptHomePriceQuoteTypeCode(
  quoteType: string | null | undefined,
): string {
  const normalizedQuoteType = quoteType?.trim().toUpperCase();
  return normalizedQuoteType &&
    normalizedQuoteType in PROMPT_HOME_PRICE_QUOTE_TYPE_LABELS
    ? PROMPT_HOME_PRICE_QUOTE_TYPE_LABELS[
        normalizedQuoteType as PriceIndexQuoteType
      ]
    : "Spot";
}

function promptHomePriceIndexFallbackCompare(
  left: PriceIndexRecord,
  right: PriceIndexRecord,
): number {
  const providerCompare = left.provider.localeCompare(right.provider);
  if (providerCompare !== 0) {
    return providerCompare;
  }

  const nameCompare = left.name.localeCompare(right.name);
  return nameCompare !== 0 ? nameCompare : left.code.localeCompare(right.code);
}

function promptHomePriceMarkTimestamp(
  observation: PriceIndexObservationRecord | null | undefined,
): number {
  if (!observation) {
    return 0;
  }

  const observationTime = Date.parse(observation.observation_date);
  if (Number.isFinite(observationTime)) {
    return observationTime;
  }

  const downloadedTime = Date.parse(observation.downloaded_at);
  return Number.isFinite(downloadedTime) ? downloadedTime : 0;
}

function promptHomePriceMarkDownloadedTimestamp(
  observation: PriceIndexObservationRecord | null | undefined,
): number {
  if (!observation) {
    return 0;
  }

  const downloadedTime = Date.parse(observation.downloaded_at);
  return Number.isFinite(downloadedTime) ? downloadedTime : 0;
}

function comparePromptHomePriceMarkRecency(
  left: PriceIndexObservationRecord,
  right: PriceIndexObservationRecord,
): number {
  const observationCompare =
    promptHomePriceMarkTimestamp(left) - promptHomePriceMarkTimestamp(right);
  if (observationCompare !== 0) {
    return observationCompare;
  }

  const downloadedCompare =
    promptHomePriceMarkDownloadedTimestamp(left) -
    promptHomePriceMarkDownloadedTimestamp(right);
  if (downloadedCompare !== 0) {
    return downloadedCompare;
  }

  return left.id - right.id;
}

export function selectPromptHomePriceIndices(
  priceIndices: PriceIndexRecord[],
): PriceIndexRecord[] {
  return priceIndices
    .filter((priceIndex) => priceIndex.is_active)
    .sort(promptHomePriceIndexFallbackCompare);
}

export function selectPromptHomeDisplayPriceIndices(
  priceIndices: PriceIndexRecord[],
  latestMarksByCode: Record<string, PriceIndexObservationRecord>,
): PriceIndexRecord[] {
  return [...priceIndices].sort((left, right) => {
    const leftMark = latestMarksByCode[left.code] ?? null;
    const rightMark = latestMarksByCode[right.code] ?? null;

    if (leftMark && !rightMark) {
      return -1;
    }
    if (!leftMark && rightMark) {
      return 1;
    }

    const observationCompare =
      promptHomePriceMarkTimestamp(rightMark) -
      promptHomePriceMarkTimestamp(leftMark);
    if (observationCompare !== 0) {
      return observationCompare;
    }

    const downloadedCompare =
      promptHomePriceMarkDownloadedTimestamp(rightMark) -
      promptHomePriceMarkDownloadedTimestamp(leftMark);
    return downloadedCompare !== 0
      ? downloadedCompare
      : promptHomePriceIndexFallbackCompare(left, right);
  });
}

export function defaultPromptHomePriceSortDirection(
  field: PromptHomePriceSortField,
): PromptHomePriceSortDirection {
  return PROMPT_HOME_PRICE_NUMERIC_SORT_FIELDS.has(field) ? "desc" : "asc";
}

export function nextPromptHomePriceSortState(
  currentSort: PromptHomePriceSortState | null,
  field: PromptHomePriceSortField,
): PromptHomePriceSortState | null {
  const defaultDirection = defaultPromptHomePriceSortDirection(field);

  if (currentSort?.field !== field) {
    return {
      field,
      direction: defaultDirection,
    };
  }

  if (currentSort.direction === defaultDirection) {
    return {
      field,
      direction: defaultDirection === "asc" ? "desc" : "asc",
    };
  }

  return null;
}

export function sortPromptHomeDisplayPriceIndices(
  priceIndices: PriceIndexRecord[],
  latestMarksByCode: Record<string, PriceIndexObservationRecord>,
  sortState: PromptHomePriceSortState | null,
  manualOrder: readonly string[] = [],
  previousMarksByCode: Record<string, PriceIndexObservationRecord> = {},
): PriceIndexRecord[] {
  if (!sortState) {
    return applyPromptHomePriceManualOrder(priceIndices, manualOrder);
  }

  return [...priceIndices].sort((left, right) => {
    const leftMark = latestMarksByCode[left.code] ?? null;
    const rightMark = latestMarksByCode[right.code] ?? null;
    const fieldCompare = promptHomePriceSortFieldCompare(
      left,
      right,
      leftMark,
      rightMark,
      sortState,
      previousMarksByCode[left.code] ?? null,
      previousMarksByCode[right.code] ?? null,
    );
    return fieldCompare !== 0
      ? fieldCompare
      : promptHomePriceIndexFallbackCompare(left, right);
  });
}

export function normalizePromptHomePriceManualOrder(
  priceIndexCodes: readonly string[],
): PromptHomePriceManualOrder {
  const seenCodes = new Set<string>();
  const normalizedCodes: string[] = [];
  for (const priceIndexCode of priceIndexCodes) {
    const normalizedCode = normalizePromptHomePriceIndexCode(priceIndexCode);
    if (!normalizedCode || seenCodes.has(normalizedCode)) {
      continue;
    }

    seenCodes.add(normalizedCode);
    normalizedCodes.push(normalizedCode);
  }
  return normalizedCodes;
}

export function applyPromptHomePriceManualOrder(
  priceIndices: PriceIndexRecord[],
  manualOrder: readonly string[],
): PriceIndexRecord[] {
  const normalizedManualOrder = normalizePromptHomePriceManualOrder(manualOrder);
  if (normalizedManualOrder.length === 0) {
    return priceIndices;
  }

  const orderByCode = new Map(
    normalizedManualOrder.map((priceIndexCode, index) => [priceIndexCode, index]),
  );
  return [...priceIndices].sort((left, right) => {
    const leftOrder = orderByCode.get(left.code.trim().toUpperCase());
    const rightOrder = orderByCode.get(right.code.trim().toUpperCase());
    if (leftOrder === undefined && rightOrder === undefined) {
      return 0;
    }
    if (leftOrder === undefined) {
      return 1;
    }
    if (rightOrder === undefined) {
      return -1;
    }

    return leftOrder - rightOrder;
  });
}

function promptHomePriceSortFieldCompare(
  left: PriceIndexRecord,
  right: PriceIndexRecord,
  leftMark: PriceIndexObservationRecord | null,
  rightMark: PriceIndexObservationRecord | null,
  sortState: PromptHomePriceSortState,
  leftPreviousMark: PriceIndexObservationRecord | null = null,
  rightPreviousMark: PriceIndexObservationRecord | null = null,
): number {
  switch (sortState.field) {
    case "product":
      return comparePromptHomePriceText(
        left.commodity_code,
        right.commodity_code,
        sortState.direction,
      );
    case "location":
      return comparePromptHomePriceText(
        promptHomePriceLocationValue(leftMark, left),
        promptHomePriceLocationValue(rightMark, right),
        sortState.direction,
      );
    case "price":
      return comparePromptHomePriceNumber(
        leftMark?.value ?? null,
        rightMark?.value ?? null,
        sortState.direction,
      );
    case "change":
      return comparePromptHomePriceNumber(
        promptHomePriceChangeValue(leftMark, leftPreviousMark),
        promptHomePriceChangeValue(rightMark, rightPreviousMark),
        sortState.direction,
      );
    case "unit":
      return comparePromptHomePriceText(
        leftMark?.unit_code || left.unit_code,
        rightMark?.unit_code || right.unit_code,
        sortState.direction,
      );
    case "currency":
      return comparePromptHomePriceText(
        leftMark?.currency_code || left.currency_code,
        rightMark?.currency_code || right.currency_code,
        sortState.direction,
      );
    case "frequency":
      return comparePromptHomePriceText(
        promptHomePriceFrequencySortValue(leftMark),
        promptHomePriceFrequencySortValue(rightMark),
        sortState.direction,
      );
    case "date":
      return comparePromptHomePriceNumber(
        leftMark ? promptHomePriceDisplayTimestamp(leftMark) : null,
        rightMark ? promptHomePriceDisplayTimestamp(rightMark) : null,
        sortState.direction,
      );
    case "updated":
      return comparePromptHomePriceNumber(
        leftMark ? promptHomePriceMarkDownloadedTimestamp(leftMark) : null,
        rightMark ? promptHomePriceMarkDownloadedTimestamp(rightMark) : null,
        sortState.direction,
      );
    case "source":
      return comparePromptHomePriceText(
        promptHomePriceSourceValue(leftMark, left),
        promptHomePriceSourceValue(rightMark, right),
        sortState.direction,
      );
  }
}

function promptHomePriceLocationValue(
  observation: PriceIndexObservationRecord | null,
  priceIndex: PriceIndexRecord,
): string {
  const locationCode = priceIndex.location_code?.trim();
  if (locationCode) {
    return locationCode;
  }

  const provider = priceIndex.provider.trim().toUpperCase();
  const sourceSeriesId = observation?.source_series_id.trim();
  if (
    sourceSeriesId &&
    ["CAISO", "ERCOT", "EIA_WHOLESALE_POWER", "MISO", "NYISO"].includes(
      provider,
    )
  ) {
    return sourceSeriesId;
  }

  return priceIndex.market?.trim() || "";
}

function promptHomePriceSourceValue(
  observation: PriceIndexObservationRecord | null,
  priceIndex: PriceIndexRecord,
): string {
  return observation?.source_provider.trim() || priceIndex.provider.trim();
}

function promptHomePriceFrequencySortValue(
  observation: PriceIndexObservationRecord | null,
): string {
  return observation ? formatPromptHomePriceFrequency(observation.source_frequency) : "";
}

function promptHomePriceChangeValue(
  latestMark: PriceIndexObservationRecord | null,
  previousMark: PriceIndexObservationRecord | null,
): number | null {
  return latestMark && previousMark ? latestMark.value - previousMark.value : null;
}

function promptHomePriceDisplayTimestamp(
  observation: PriceIndexObservationRecord,
): number {
  const sourceRevisionTimestamp = promptHomePriceSourceRevisionTimestamp(
    observation.source_revision,
  );
  return sourceRevisionTimestamp?.getTime() || promptHomePriceMarkTimestamp(observation);
}

function comparePromptHomePriceText(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: PromptHomePriceSortDirection,
): number {
  const normalizedLeft = left?.trim() ?? "";
  const normalizedRight = right?.trim() ?? "";
  if (!normalizedLeft && normalizedRight) {
    return 1;
  }
  if (normalizedLeft && !normalizedRight) {
    return -1;
  }
  if (!normalizedLeft && !normalizedRight) {
    return 0;
  }

  const compare = normalizedLeft.localeCompare(normalizedRight, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return direction === "asc" ? compare : -compare;
}

function comparePromptHomePriceNumber(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: PromptHomePriceSortDirection,
): number {
  const normalizedLeft =
    typeof left === "number" && Number.isFinite(left) ? left : null;
  const normalizedRight =
    typeof right === "number" && Number.isFinite(right) ? right : null;
  if (normalizedLeft === null && normalizedRight !== null) {
    return 1;
  }
  if (normalizedLeft !== null && normalizedRight === null) {
    return -1;
  }
  if (normalizedLeft === null && normalizedRight === null) {
    return 0;
  }

  const compare = (normalizedLeft ?? 0) - (normalizedRight ?? 0);
  return direction === "asc" ? compare : -compare;
}

export function listPromptHomePriceProviders(
  priceIndices: PriceIndexRecord[],
): string[] {
  return Array.from(
    new Set(
      priceIndices
        .map((priceIndex) => priceIndex.provider.trim())
        .filter((provider) => provider.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function listPromptHomePriceQuoteTypes(
  priceIndices: PriceIndexRecord[],
): PriceIndexQuoteType[] {
  return Array.from(
    new Set(
      priceIndices.map((priceIndex) =>
        normalizePromptHomePriceQuoteType(priceIndex),
      ),
    ),
  ).sort((left, right) =>
    PROMPT_HOME_PRICE_QUOTE_TYPE_LABELS[left].localeCompare(
      PROMPT_HOME_PRICE_QUOTE_TYPE_LABELS[right],
    ),
  );
}

function promptHomePriceSearchCorpus(priceIndex: PriceIndexRecord): string {
  return [
    priceIndex.code,
    priceIndex.name,
    priceIndex.description,
    priceIndex.provider,
    priceIndex.quote_type,
    formatPromptHomePriceQuoteType(priceIndex),
    priceIndex.market,
    priceIndex.location_code,
    priceIndex.commodity_code,
    priceIndex.currency_code,
    priceIndex.unit_code,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

export function filterPromptHomeDisplayPriceIndices(
  priceIndices: PriceIndexRecord[],
  latestMarksByCode: Record<string, PriceIndexObservationRecord>,
  filters: PromptHomePriceFilters,
): PriceIndexRecord[] {
  const normalizedQuery = filters.query.trim().toLowerCase();
  const normalizedProvider = filters.provider.trim().toUpperCase();
  const normalizedQuoteType = (
    filters.quoteType ?? PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE
  )
    .trim()
    .toUpperCase();
  const normalizedCommodityCode = filters.commodityCode?.trim().toUpperCase();
  const normalizedLocationCode = filters.locationCode?.trim().toUpperCase();
  const normalizedPriceIndexCode = filters.priceIndexCode?.trim().toUpperCase();
  const normalizedRegion = filters.region?.trim().toUpperCase();

  return priceIndices.filter((priceIndex) => {
    if (
      normalizedPriceIndexCode &&
      priceIndex.code.trim().toUpperCase() !== normalizedPriceIndexCode
    ) {
      return false;
    }
    if (
      normalizedCommodityCode &&
      priceIndex.commodity_code.trim().toUpperCase() !== normalizedCommodityCode
    ) {
      return false;
    }
    if (
      normalizedLocationCode &&
      priceIndex.location_code?.trim().toUpperCase() !== normalizedLocationCode
    ) {
      return false;
    }
    if (
      normalizedRegion &&
      priceIndex.market?.trim().toUpperCase() !== normalizedRegion
    ) {
      return false;
    }
    if (
      normalizedProvider !== PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER &&
      priceIndex.provider.trim().toUpperCase() !== normalizedProvider
    ) {
      return false;
    }
    if (
      normalizedQuoteType !== PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE &&
      normalizePromptHomePriceQuoteType(priceIndex) !== normalizedQuoteType
    ) {
      return false;
    }

    const hasMark = Boolean(latestMarksByCode[priceIndex.code]);
    if (filters.markFilter === "with_marks" && !hasMark) {
      return false;
    }
    if (filters.markFilter === "missing_marks" && hasMark) {
      return false;
    }

    if (
      normalizedQuery &&
      !promptHomePriceSearchCorpus(priceIndex).includes(normalizedQuery)
    ) {
      return false;
    }

    return true;
  });
}

export function promptHomePriceFiltersAreActive(
  filters: PromptHomePriceFilters,
): boolean {
  return (
    filters.query.trim().length > 0 ||
    Boolean(filters.priceIndexCode?.trim()) ||
    Boolean(filters.commodityCode?.trim()) ||
    Boolean(filters.locationCode?.trim()) ||
    Boolean(filters.region?.trim()) ||
    filters.provider.trim().toUpperCase() !==
      PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER ||
    (filters.quoteType ?? PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE)
      .trim()
      .toUpperCase() !== PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE ||
    filters.markFilter !== "all"
  );
}

export function countPromptHomeLatestMarks(
  priceIndices: PriceIndexRecord[],
  latestMarksByCode: Record<string, PriceIndexObservationRecord>,
): number {
  return priceIndices.reduce(
    (count, priceIndex) => count + (latestMarksByCode[priceIndex.code] ? 1 : 0),
    0,
  );
}

function buildPromptHomePriceRowViewModel(
  priceIndex: PriceIndexRecord,
  latestMark: PriceIndexObservationRecord | null,
  previousMark: PriceIndexObservationRecord | null,
): PromptHomePriceRowViewModel {
  return {
    key: priceIndex.code,
    priceIndexCode: priceIndex.code,
    product: formatPromptHomePriceProduct(priceIndex),
    location: formatPromptHomePriceLocation(latestMark, priceIndex),
    price: formatPromptHomePriceNumber(latestMark, priceIndex),
    change: formatPromptHomePriceChange(latestMark, previousMark, priceIndex),
    changeTone: promptHomePriceChangeTone(latestMark, previousMark),
    unit: formatPromptHomePriceUnit(latestMark, priceIndex),
    currency: formatPromptHomePriceCurrency(latestMark, priceIndex),
    frequency: formatPromptHomePriceRowFrequency(latestMark),
    dateTime: formatPromptHomePriceDateTime(latestMark, priceIndex),
    updated: formatPromptHomePriceUpdatedAt(latestMark),
    source: formatPromptHomePriceSource(latestMark, priceIndex),
    hasLatestMark: Boolean(latestMark),
    priceIndex,
    latestMark,
    previousMark,
  };
}

function resolvePromptHomePriceFilters(
  filters: PromptHomePriceFilters,
  providerOptions: readonly string[],
  quoteTypeOptions: readonly PriceIndexQuoteType[],
): PromptHomePriceFilters {
  const provider = filters.provider.trim();
  const quoteType = (
    filters.quoteType ?? PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE
  ).trim();
  return {
    query: filters.query,
    provider:
      provider === PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER ||
      providerOptions.includes(provider)
        ? provider
        : PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER,
    quoteType:
      quoteType === PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE ||
      quoteTypeOptions.includes(quoteType as PriceIndexQuoteType)
        ? quoteType
        : PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE,
    commodityCode: filters.commodityCode?.trim().toUpperCase() || undefined,
    locationCode: filters.locationCode?.trim().toUpperCase() || undefined,
    priceIndexCode: filters.priceIndexCode?.trim().toUpperCase() || undefined,
    region: filters.region?.trim() || undefined,
    markFilter: filters.markFilter,
  };
}

export function buildPromptHomePricesCardViewModel(
  source: PromptHomePricingSnapshotSource,
  options: {
    filters: PromptHomePriceFilters;
    sortState: PromptHomePriceSortState | null;
    manualOrder?: readonly string[];
    referenceDataLoading?: boolean;
  },
): PromptHomePricesCardViewModel {
  const activePriceIndices = selectPromptHomePriceIndices([
    ...source.priceIndices,
  ]);
  const providerOptions = listPromptHomePriceProviders(activePriceIndices);
  const quoteTypeOptions = listPromptHomePriceQuoteTypes(activePriceIndices);
  const effectiveFilters = resolvePromptHomePriceFilters(
    options.filters,
    providerOptions,
    quoteTypeOptions,
  );
  const hasActiveFilters = promptHomePriceFiltersAreActive(effectiveFilters);
  const markPairsByCode = buildPromptHomePriceMarkPairsByCode(
    source.latestMarks,
  );
  const latestMarksByCode = Object.fromEntries(
    Object.entries(markPairsByCode).map(([priceIndexCode, pair]) => [
      priceIndexCode,
      pair.latestMark,
    ]),
  );
  const previousMarksByCode = Object.fromEntries(
    Object.entries(markPairsByCode)
      .filter((entry): entry is [string, PromptHomePriceMarkPair] =>
        Boolean(entry[1].previousMark),
      )
      .map(([priceIndexCode, pair]) => [
        priceIndexCode,
        pair.previousMark as PriceIndexObservationRecord,
      ]),
  );
  const sortedPriceIndices = selectPromptHomeDisplayPriceIndices(
    activePriceIndices,
    latestMarksByCode,
  );
  const filteredPriceIndices = filterPromptHomeDisplayPriceIndices(
    sortedPriceIndices,
    latestMarksByCode,
    effectiveFilters,
  );
  const displayedPriceIndices = sortPromptHomeDisplayPriceIndices(
    filteredPriceIndices,
    latestMarksByCode,
    options.sortState,
    options.manualOrder,
    previousMarksByCode,
  );
  const latestMarkCount = countPromptHomeLatestMarks(
    activePriceIndices,
    latestMarksByCode,
  );
  const allRows = sortPromptHomeDisplayPriceIndices(
    sortedPriceIndices,
    latestMarksByCode,
    null,
    options.manualOrder,
  ).map((priceIndex) =>
    buildPromptHomePriceRowViewModel(
      priceIndex,
      latestMarksByCode[priceIndex.code] ?? null,
      previousMarksByCode[priceIndex.code] ?? null,
    ),
  );
  const rows = displayedPriceIndices.map((priceIndex) =>
    buildPromptHomePriceRowViewModel(
      priceIndex,
      latestMarksByCode[priceIndex.code] ?? null,
      previousMarksByCode[priceIndex.code] ?? null,
    ),
  );

  let status: PromptHomePricesCardStatus = "ready";
  if (options.referenceDataLoading && activePriceIndices.length === 0) {
    status = "reference_loading";
  } else if (activePriceIndices.length === 0) {
    status = "no_active_indices";
  } else if (rows.length === 0) {
    status = "filtered_empty";
  }

  return {
    status,
    activePriceIndexCount: activePriceIndices.length,
    latestMarkCount,
    providerOptions,
    quoteTypeOptions,
    effectiveFilters,
    hasActiveFilters,
    allRows,
    rows,
    latestMarksByCode,
    previousMarksByCode,
  };
}
