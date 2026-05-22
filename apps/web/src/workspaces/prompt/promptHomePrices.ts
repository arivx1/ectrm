import type {
  PriceIndexObservationRecord,
  PriceIndexRecord,
  PriceIndexQuoteType,
} from "../../shared/models";

export type PromptHomePriceMarkFilter = "all" | "with_marks" | "missing_marks";

export type PromptHomePriceFilters = {
  query: string;
  provider: string;
  markFilter: PromptHomePriceMarkFilter;
  quoteType?: string;
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

const PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER = "ALL";
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

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsedDate);
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

function formatPromptHomeObservationTimestamp(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
}

function formatPromptHomeObservationTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
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
): PriceIndexRecord[] {
  if (!sortState) {
    return priceIndices;
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

  return priceIndices.filter((priceIndex) => {
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

export function countPromptHomeLatestMarks(
  priceIndices: PriceIndexRecord[],
  latestMarksByCode: Record<string, PriceIndexObservationRecord>,
): number {
  return priceIndices.reduce(
    (count, priceIndex) => count + (latestMarksByCode[priceIndex.code] ? 1 : 0),
    0,
  );
}
