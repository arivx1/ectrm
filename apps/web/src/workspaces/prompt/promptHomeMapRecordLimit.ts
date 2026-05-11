export const PROMPT_HOME_MAP_RECORD_LIMIT_OPTIONS = [
  100,
  250,
  500,
  1000,
] as const;

export type PromptHomeMapRecordLimit =
  (typeof PROMPT_HOME_MAP_RECORD_LIMIT_OPTIONS)[number];

export const DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT: PromptHomeMapRecordLimit =
  1000;

const PROMPT_HOME_MAP_RECORD_LIMIT_STORAGE_KEY =
  "ectrm.prompt-home.map-record-limit";

export function normalizePromptHomeMapRecordLimit(
  value: unknown,
): PromptHomeMapRecordLimit {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return PROMPT_HOME_MAP_RECORD_LIMIT_OPTIONS.includes(
    parsedValue as PromptHomeMapRecordLimit,
  )
    ? (parsedValue as PromptHomeMapRecordLimit)
    : DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT;
}

export function getPromptHomeMapRecordLimit(): PromptHomeMapRecordLimit {
  if (typeof window === "undefined") {
    return DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT;
  }

  return normalizePromptHomeMapRecordLimit(
    window.localStorage.getItem(PROMPT_HOME_MAP_RECORD_LIMIT_STORAGE_KEY),
  );
}

export function savePromptHomeMapRecordLimit(
  value: unknown,
): PromptHomeMapRecordLimit {
  const normalizedValue = normalizePromptHomeMapRecordLimit(value);

  if (typeof window !== "undefined") {
    if (normalizedValue === DEFAULT_PROMPT_HOME_MAP_RECORD_LIMIT) {
      window.localStorage.removeItem(PROMPT_HOME_MAP_RECORD_LIMIT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        PROMPT_HOME_MAP_RECORD_LIMIT_STORAGE_KEY,
        String(normalizedValue),
      );
    }
  }

  return normalizedValue;
}
