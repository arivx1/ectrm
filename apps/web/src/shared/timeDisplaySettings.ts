const TIME_DISPLAY_SETTINGS_STORAGE_KEY = 'ectrm.time-display-settings'
const SYSTEM_TIME_ZONE_PREFERENCE = 'system'
const FALLBACK_TIME_ZONE = 'UTC'
const FALLBACK_TIME_ZONE_OPTIONS = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
]

type IntlWithSupportedValuesOf = typeof Intl & {
  supportedValuesOf?: (key: string) => string[]
}

export type TimeDisplaySettings = {
  timeZone: string
}

export type TimeDisplayTimeZoneOption = {
  value: string
  label: string
}

let cachedTimeZoneOptions: TimeDisplayTimeZoneOption[] | null = null

function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }

  const normalizedValue = value.trim()
  if (!normalizedValue || normalizedValue === SYSTEM_TIME_ZONE_PREFERENCE) {
    return false
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalizedValue }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function getSystemTimeZone(): string {
  const resolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return isValidIanaTimeZone(resolvedTimeZone) ? resolvedTimeZone : FALLBACK_TIME_ZONE
}

function formatTimeZoneLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

export function getDefaultTimeDisplaySettings(): TimeDisplaySettings {
  return {
    timeZone: SYSTEM_TIME_ZONE_PREFERENCE,
  }
}

export function normalizeTimeDisplaySettings(
  value: Partial<TimeDisplaySettings> | null | undefined,
): TimeDisplaySettings {
  return {
    timeZone:
      typeof value?.timeZone === 'string' &&
      value.timeZone.trim() === SYSTEM_TIME_ZONE_PREFERENCE
        ? SYSTEM_TIME_ZONE_PREFERENCE
        : isValidIanaTimeZone(value?.timeZone)
          ? value.timeZone.trim()
          : getDefaultTimeDisplaySettings().timeZone,
  }
}

export function getTimeDisplaySettingsSnapshot(): TimeDisplaySettings {
  if (typeof window === 'undefined') {
    return getDefaultTimeDisplaySettings()
  }

  const storedValue = window.localStorage.getItem(TIME_DISPLAY_SETTINGS_STORAGE_KEY)
  if (!storedValue) {
    return getDefaultTimeDisplaySettings()
  }

  try {
    return normalizeTimeDisplaySettings(JSON.parse(storedValue) as Partial<TimeDisplaySettings>)
  } catch {
    return getDefaultTimeDisplaySettings()
  }
}

export function saveTimeDisplaySettingsSnapshot(snapshot: TimeDisplaySettings): TimeDisplaySettings {
  const normalizedSnapshot = normalizeTimeDisplaySettings(snapshot)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TIME_DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSnapshot))
  }

  return normalizedSnapshot
}

export function clearTimeDisplaySettingsSnapshot(): TimeDisplaySettings {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TIME_DISPLAY_SETTINGS_STORAGE_KEY)
  }

  return getDefaultTimeDisplaySettings()
}

export function resolveTimeDisplayTimeZone(settings: TimeDisplaySettings): string {
  return settings.timeZone === SYSTEM_TIME_ZONE_PREFERENCE ? getSystemTimeZone() : settings.timeZone
}

export function formatTimeDisplayTimeZonePreferenceLabel(settings: TimeDisplaySettings): string {
  const resolvedTimeZone = resolveTimeDisplayTimeZone(settings)
  return settings.timeZone === SYSTEM_TIME_ZONE_PREFERENCE
    ? `System default (${formatTimeZoneLabel(resolvedTimeZone)})`
    : formatTimeZoneLabel(resolvedTimeZone)
}

export function listTimeDisplayTimeZoneOptions(): TimeDisplayTimeZoneOption[] {
  if (cachedTimeZoneOptions) {
    return cachedTimeZoneOptions
  }

  const intlWithSupportedValuesOf = Intl as IntlWithSupportedValuesOf
  const supportedTimeZones =
    typeof intlWithSupportedValuesOf.supportedValuesOf === 'function'
      ? intlWithSupportedValuesOf.supportedValuesOf('timeZone')
      : FALLBACK_TIME_ZONE_OPTIONS

  const uniqueTimeZones = new Set<string>([
    ...FALLBACK_TIME_ZONE_OPTIONS,
    ...supportedTimeZones,
    getSystemTimeZone(),
  ])

  const sortedTimeZones = [...uniqueTimeZones]
    .filter((timeZone) => isValidIanaTimeZone(timeZone))
    .sort((left, right) => formatTimeZoneLabel(left).localeCompare(formatTimeZoneLabel(right)))

  cachedTimeZoneOptions = [
    {
      value: SYSTEM_TIME_ZONE_PREFERENCE,
      label: `System default (${formatTimeZoneLabel(getSystemTimeZone())})`,
    },
    ...sortedTimeZones.map((timeZone) => ({
      value: timeZone,
      label: formatTimeZoneLabel(timeZone),
    })),
  ]

  return cachedTimeZoneOptions
}
