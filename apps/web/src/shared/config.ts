const API_BASE_OVERRIDE_STORAGE_KEY = 'ectrm.api-base-override'
const BOOTSTRAP_EVENTS_LIMIT_OVERRIDE_STORAGE_KEY = 'ectrm.bootstrap.events-limit'
const SELECTED_TRADE_EVENTS_LIMIT_OVERRIDE_STORAGE_KEY = 'ectrm.bootstrap.selected-trade-events-limit'
const REFERENCE_DATA_LIMIT_OVERRIDE_STORAGE_KEY = 'ectrm.bootstrap.reference-data-limit'
const EXTERNAL_DATA_RUNS_LIMIT_OVERRIDE_STORAGE_KEY = 'ectrm.bootstrap.external-data-runs-limit'
const TRADING_SOURCES_LIMIT_OVERRIDE_STORAGE_KEY = 'ectrm.bootstrap.trading-sources-limit'

export type ClientRuntimeOverrideSnapshot = {
  apiBaseOverride: string
  eventsLimitOverride: string
  selectedTradeEventsLimitOverride: string
  referenceDataLimitOverride: string
  externalDataRunsLimitOverride: string
  tradingSourcesLimitOverride: string
}

function readEnvString(name: string): string | null {
  const rawValue = import.meta.env[name]
  if (typeof rawValue !== 'string') {
    return null
  }

  const trimmedValue = rawValue.trim()
  return trimmedValue ? trimmedValue : null
}

function readStoredString(key: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(key)?.trim() ?? ''
  return storedValue || null
}

function writeStoredString(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedValue = value.trim()
  if (!normalizedValue) {
    window.localStorage.removeItem(key)
    return
  }

  window.localStorage.setItem(key, normalizedValue)
}

function readPositiveInt(rawValue: string | null, fallback: number): number {
  if (!rawValue) {
    return fallback
  }

  const parsedValue = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

function resolvePositiveIntSetting(storageKey: string, envName: string, fallback: number): number {
  const overrideValue = readStoredString(storageKey)
  if (overrideValue) {
    return readPositiveInt(overrideValue, fallback)
  }

  return readPositiveInt(readEnvString(envName), fallback)
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function resolveBrowserReachableApiBase(configuredBase: string): string {
  if (typeof window === 'undefined') {
    return configuredBase
  }

  try {
    const parsedBase = new URL(configuredBase, window.location.href)
    if (isLoopbackHost(parsedBase.hostname) && !isLoopbackHost(window.location.hostname)) {
      parsedBase.hostname = window.location.hostname
    }

    return parsedBase.toString().replace(/\/+$/, '')
  } catch {
    return configuredBase.replace(/\/+$/, '')
  }
}

function resolveApiBase(): string {
  const storedOverride = readStoredString(API_BASE_OVERRIDE_STORAGE_KEY)
  if (storedOverride) {
    return storedOverride.replace(/\/+$/, '')
  }

  const configuredBase = readEnvString('VITE_API_BASE')
  if (configuredBase) {
    return resolveBrowserReachableApiBase(configuredBase)
  }

  const configuredPort = readEnvString('VITE_API_PORT') ?? '8000'
  return `${window.location.protocol}//${window.location.hostname}:${configuredPort}`
}

function resolveApiDisplayHost(apiBase: string): string {
  try {
    return new URL(apiBase).host
  } catch {
    return apiBase
  }
}

const apiBase = resolveApiBase()

export const appConfig = Object.freeze({
  apiBase,
  apiDisplayHost: resolveApiDisplayHost(apiBase),
})

export const bootstrapQueryLimits = Object.freeze({
  events: resolvePositiveIntSetting(BOOTSTRAP_EVENTS_LIMIT_OVERRIDE_STORAGE_KEY, 'VITE_BOOTSTRAP_EVENTS_LIMIT', 100),
  workspaceRecords: readPositiveInt(readEnvString('VITE_BOOTSTRAP_WORKSPACE_RECORDS_LIMIT'), 250),
  selectedTradeEvents: resolvePositiveIntSetting(
    SELECTED_TRADE_EVENTS_LIMIT_OVERRIDE_STORAGE_KEY,
    'VITE_SELECTED_TRADE_EVENTS_LIMIT',
    500,
  ),
  referenceData: resolvePositiveIntSetting(
    REFERENCE_DATA_LIMIT_OVERRIDE_STORAGE_KEY,
    'VITE_BOOTSTRAP_REFERENCE_LIMIT',
    2000,
  ),
  externalDataRuns: resolvePositiveIntSetting(
    EXTERNAL_DATA_RUNS_LIMIT_OVERRIDE_STORAGE_KEY,
    'VITE_BOOTSTRAP_EXTERNAL_RUNS_LIMIT',
    10,
  ),
  tradingSources: resolvePositiveIntSetting(
    TRADING_SOURCES_LIMIT_OVERRIDE_STORAGE_KEY,
    'VITE_BOOTSTRAP_TRADING_SOURCES_LIMIT',
    500,
  ),
})

export function getClientRuntimeOverrideSnapshot(): ClientRuntimeOverrideSnapshot {
  return {
    apiBaseOverride: readStoredString(API_BASE_OVERRIDE_STORAGE_KEY) ?? '',
    eventsLimitOverride: readStoredString(BOOTSTRAP_EVENTS_LIMIT_OVERRIDE_STORAGE_KEY) ?? '',
    selectedTradeEventsLimitOverride: readStoredString(SELECTED_TRADE_EVENTS_LIMIT_OVERRIDE_STORAGE_KEY) ?? '',
    referenceDataLimitOverride: readStoredString(REFERENCE_DATA_LIMIT_OVERRIDE_STORAGE_KEY) ?? '',
    externalDataRunsLimitOverride: readStoredString(EXTERNAL_DATA_RUNS_LIMIT_OVERRIDE_STORAGE_KEY) ?? '',
    tradingSourcesLimitOverride: readStoredString(TRADING_SOURCES_LIMIT_OVERRIDE_STORAGE_KEY) ?? '',
  }
}

export function saveClientRuntimeOverrideSnapshot(snapshot: ClientRuntimeOverrideSnapshot): void {
  writeStoredString(API_BASE_OVERRIDE_STORAGE_KEY, snapshot.apiBaseOverride)
  writeStoredString(BOOTSTRAP_EVENTS_LIMIT_OVERRIDE_STORAGE_KEY, snapshot.eventsLimitOverride)
  writeStoredString(
    SELECTED_TRADE_EVENTS_LIMIT_OVERRIDE_STORAGE_KEY,
    snapshot.selectedTradeEventsLimitOverride,
  )
  writeStoredString(REFERENCE_DATA_LIMIT_OVERRIDE_STORAGE_KEY, snapshot.referenceDataLimitOverride)
  writeStoredString(EXTERNAL_DATA_RUNS_LIMIT_OVERRIDE_STORAGE_KEY, snapshot.externalDataRunsLimitOverride)
  writeStoredString(TRADING_SOURCES_LIMIT_OVERRIDE_STORAGE_KEY, snapshot.tradingSourcesLimitOverride)
}

export function clearClientRuntimeOverrides(): void {
  saveClientRuntimeOverrideSnapshot({
    apiBaseOverride: '',
    eventsLimitOverride: '',
    selectedTradeEventsLimitOverride: '',
    referenceDataLimitOverride: '',
    externalDataRunsLimitOverride: '',
    tradingSourcesLimitOverride: '',
  })
}
