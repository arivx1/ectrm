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
  | "unit"
  | "currency"
  | "date"
  | "time"
  | "updated"
  | "source";

export type PromptHomePriceSortDirection = "asc" | "desc";

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
  unit: string;
  currency: string;
  date: string;
  time: string;
  updated: string;
  source: string;
  hasLatestMark: boolean;
  priceIndex: PriceIndexRecord;
  latestMark: PriceIndexObservationRecord | null;
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
  "date",
  "time",
  "updated",
]);

function normalizePromptHomePriceIndexCode(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized === "" ? null : normalized;
}

export function buildPromptHomeLatestMarksByCode(
  latestMarks: readonly PriceIndexObservationRecord[],
): Record<string, PriceIndexObservationRecord> {
  const latestMarksByCode: Record<string, PriceIndexObservationRecord> = {};
  for (const latestMark of latestMarks) {
    const normalizedCode = normalizePromptHomePriceIndexCode(
      latestMark.price_index_code,
    );
    if (!normalizedCode) {
      continue;
    }

    const existingMark = latestMarksByCode[normalizedCode];
    if (
      !existingMark ||
      comparePromptHomePriceMarkRecency(latestMark, existingMark) > 0
    ) {
      latestMarksByCode[normalizedCode] = latestMark;
    }
  }
  return latestMarksByCode;
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

function promptHomePriceRevisionTimestamp(value: string): Date | null {
  const isoTimestampMatch =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(value.trim());
  if (!isoTimestampMatch?.[1]) {
    return null;
  }

  return promptHomePriceTimestamp(`${isoTimestampMatch[1]}Z`);
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

function formatPromptHomeSourceRevisionTime(
  value: string | null | undefined,
): string {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return "—";
  }

  const isoRevisionTimestamp = promptHomePriceRevisionTimestamp(normalizedValue);
  if (isoRevisionTimestamp) {
    return formatPromptHomeObservationTime(isoRevisionTimestamp);
  }

  const caisoMatch = /^\d{4}-\d{2}-\d{2}:HE(\d{2}):I(\d{2})$/i.exec(
    normalizedValue,
  );
  if (caisoMatch) {
    return `HE${caisoMatch[1]} I${caisoMatch[2]}`;
  }

  const ercotMatch = /^\d{4}-\d{2}-\d{2}:IE(.+)$/i.exec(normalizedValue);
  if (ercotMatch?.[1]) {
    return `IE ${ercotMatch[1].trim()}`;
  }

  return "—";
}

export function formatPromptHomePriceDate(
  observation: PriceIndexObservationRecord | null | undefined,
): string {
  return observation
    ? formatPromptHomeObservationDate(observation.observation_date)
    : "—";
}

export function formatPromptHomePriceTime(
  observation: PriceIndexObservationRecord | null | undefined,
): string {
  if (!observation) {
    return "—";
  }

  const sourcePublishedAt = promptHomePriceTimestamp(
    observation.source_published_at,
  );
  if (sourcePublishedAt) {
    return formatPromptHomeObservationTime(sourcePublishedAt);
  }

  return formatPromptHomeSourceRevisionTime(observation.source_revision);
}

export function formatPromptHomePriceUpdatedAt(
  observation: PriceIndexObservationRecord | null | undefined,
): string {
  const downloadedAt = promptHomePriceTimestamp(observation?.downloaded_at);
  return downloadedAt ? formatPromptHomeObservationTimestamp(downloadedAt) : "—";
}

export function formatPromptHomePriceSource(
  observation: PriceIndexObservationRecord | null | undefined,
  priceIndex: PriceIndexRecord,
): string {
  const provider =
    observation?.source_provider.trim() || priceIndex.provider.trim();
  const seriesId = observation?.source_series_id.trim();
  if (provider && seriesId) {
    return `${provider} · ${seriesId}`;
  }
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

export function formatPromptHomePriceDateTime(
  observation: PriceIndexObservationRecord | null | undefined,
): string {
  if (!observation) {
    return "No mark yet";
  }

  const frequencyLabel = formatPromptHomePriceFrequency(
    observation.source_frequency,
  );
  const sourcePublishedAt = promptHomePriceTimestamp(
    observation.source_published_at,
  );
  const observationDate = formatPromptHomeObservationDate(
    observation.observation_date,
  );
  if (sourcePublishedAt) {
    return `${frequencyLabel} · source date ${observationDate} · published ${formatPromptHomeObservationTimestamp(sourcePublishedAt)}`;
  }

  const downloadedAt = promptHomePriceTimestamp(observation.downloaded_at);
  return downloadedAt
    ? `${frequencyLabel} · source date ${observationDate} · synced ${formatPromptHomeObservationTimestamp(downloadedAt)}`
    : `${frequencyLabel} · source date ${observationDate}`;
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
    case "date":
      return comparePromptHomePriceNumber(
        leftMark ? promptHomePriceMarkTimestamp(leftMark) : null,
        rightMark ? promptHomePriceMarkTimestamp(rightMark) : null,
        sortState.direction,
      );
    case "time":
      return comparePromptHomePriceNumber(
        promptHomePriceMarkTimeOfDay(leftMark),
        promptHomePriceMarkTimeOfDay(rightMark),
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
  const provider = observation?.source_provider.trim() || priceIndex.provider.trim();
  const seriesId = observation?.source_series_id.trim();
  return [provider, seriesId].filter(Boolean).join(" ");
}

function promptHomePriceMarkTimeOfDay(
  observation: PriceIndexObservationRecord | null | undefined,
): number | null {
  if (!observation) {
    return null;
  }

  const sourcePublishedAt = promptHomePriceTimestamp(
    observation.source_published_at,
  );
  if (sourcePublishedAt) {
    return promptHomeTimeOfDaySeconds(sourcePublishedAt);
  }

  const sourceRevision = observation.source_revision?.trim();
  if (!sourceRevision) {
    return null;
  }

  const isoRevisionTimestamp = promptHomePriceRevisionTimestamp(sourceRevision);
  if (isoRevisionTimestamp) {
    return promptHomeTimeOfDaySeconds(isoRevisionTimestamp);
  }

  const caisoMatch = /^\d{4}-\d{2}-\d{2}:HE(\d{2}):I(\d{2})$/i.exec(
    sourceRevision,
  );
  if (caisoMatch?.[1] && caisoMatch[2]) {
    return Number(caisoMatch[1]) * 3600 + Number(caisoMatch[2]) * 60;
  }

  const ercotMatch = /^\d{4}-\d{2}-\d{2}:IE(\d{1,2})(?::?(\d{2}))?$/i.exec(
    sourceRevision,
  );
  if (ercotMatch?.[1]) {
    return Number(ercotMatch[1]) * 3600 + Number(ercotMatch[2] ?? 0) * 60;
  }

  return null;
}

function promptHomeTimeOfDaySeconds(timestamp: Date): number {
  return (
    timestamp.getUTCHours() * 3600 +
    timestamp.getUTCMinutes() * 60 +
    timestamp.getUTCSeconds()
  );
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
): PromptHomePriceRowViewModel {
  return {
    key: priceIndex.code,
    priceIndexCode: priceIndex.code,
    product: formatPromptHomePriceProduct(priceIndex),
    location: formatPromptHomePriceLocation(latestMark, priceIndex),
    price: formatPromptHomePriceNumber(latestMark, priceIndex),
    unit: formatPromptHomePriceUnit(latestMark, priceIndex),
    currency: formatPromptHomePriceCurrency(latestMark, priceIndex),
    date: formatPromptHomePriceDate(latestMark),
    time: formatPromptHomePriceTime(latestMark),
    updated: formatPromptHomePriceUpdatedAt(latestMark),
    source: formatPromptHomePriceSource(latestMark, priceIndex),
    hasLatestMark: Boolean(latestMark),
    priceIndex,
    latestMark,
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
  const latestMarksByCode = buildPromptHomeLatestMarksByCode(
    source.latestMarks,
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
    ),
  );
  const rows = displayedPriceIndices.map((priceIndex) =>
    buildPromptHomePriceRowViewModel(
      priceIndex,
      latestMarksByCode[priceIndex.code] ?? null,
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
  };
}
