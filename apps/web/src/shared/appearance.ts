const APPEARANCE_SETTINGS_STORAGE_KEY = 'ectrm.appearance-settings'
const APPEARANCE_COLOR_MODE_BY_SCOPE_STORAGE_KEY = 'ectrm.appearance-color-mode-by-product'

export type ColorModePreference = 'system' | 'light' | 'dark'
export type ResolvedColorMode = 'light' | 'dark'
export type WorkspaceModePreference = 'default' | 'terminal'
export type AppearanceColorModeScope = 'strata' | 'nexus'

export type AppearancePalette = {
  accent: string
  highlight: string
}

export type AppearanceSettings = {
  colorMode: ColorModePreference
  workspaceMode: WorkspaceModePreference
  lightMode: AppearancePalette
  darkMode: AppearancePalette
}

type AppearanceSettingsSnapshotOptions = {
  materializeColorModePreference?: boolean
}

const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = Object.freeze({
  colorMode: 'system',
  workspaceMode: 'default',
  lightMode: {
    accent: '#127c6c',
    highlight: '#4c78b6',
  },
  darkMode: {
    accent: '#3dd6a0',
    highlight: '#4ea7ff',
  },
})

const APPEARANCE_COLOR_MODE_SCOPES: AppearanceColorModeScope[] = ['strata', 'nexus']

function normalizeColorModePreference(
  value: unknown,
  fallback: ColorModePreference,
): ColorModePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : fallback
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return fallback
  }

  const shortHexMatch = /^#([0-9a-f]{3})$/i.exec(trimmedValue)
  if (shortHexMatch) {
    const [, shortHex] = shortHexMatch
    return `#${shortHex
      .split('')
      .map((character) => `${character}${character}`)
      .join('')
      .toLowerCase()}`
  }

  const longHexMatch = /^#([0-9a-f]{6})$/i.exec(trimmedValue)
  if (longHexMatch) {
    return `#${longHexMatch[1].toLowerCase()}`
  }

  return fallback
}

function normalizePalette(
  value: Partial<AppearancePalette> | null | undefined,
  fallback: AppearancePalette,
): AppearancePalette {
  return {
    accent: normalizeHexColor(value?.accent, fallback.accent),
    highlight: normalizeHexColor(value?.highlight, fallback.highlight),
  }
}

export function getDefaultAppearanceSettings(): AppearanceSettings {
  return {
    colorMode: DEFAULT_APPEARANCE_SETTINGS.colorMode,
    workspaceMode: DEFAULT_APPEARANCE_SETTINGS.workspaceMode,
    lightMode: { ...DEFAULT_APPEARANCE_SETTINGS.lightMode },
    darkMode: { ...DEFAULT_APPEARANCE_SETTINGS.darkMode },
  }
}

export function normalizeAppearanceSettings(
  value: Partial<AppearanceSettings> | null | undefined,
): AppearanceSettings {
  const defaults = getDefaultAppearanceSettings()

  return {
    colorMode: normalizeColorModePreference(value?.colorMode, defaults.colorMode),
    workspaceMode:
      value?.workspaceMode === 'terminal' || value?.workspaceMode === 'default'
        ? value.workspaceMode
        : defaults.workspaceMode,
    lightMode: normalizePalette(value?.lightMode, defaults.lightMode),
    darkMode: normalizePalette(value?.darkMode, defaults.darkMode),
  }
}

export function normalizeAppearanceColorModePreferences(
  value: unknown,
): Partial<Record<AppearanceColorModeScope, ColorModePreference>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const candidate = value as Partial<Record<AppearanceColorModeScope, unknown>>

  return APPEARANCE_COLOR_MODE_SCOPES.reduce<Partial<Record<AppearanceColorModeScope, ColorModePreference>>>(
    (preferences, scope) => {
      const normalizedPreference = normalizeColorModePreference(candidate[scope], 'system')
      if (candidate[scope] === normalizedPreference) {
        preferences[scope] = normalizedPreference
      }
      return preferences
    },
    {},
  )
}

export function getAppearanceColorModePreferencesSnapshot(): Partial<
  Record<AppearanceColorModeScope, ColorModePreference>
> {
  if (typeof window === 'undefined') {
    return {}
  }

  const storedValue = window.localStorage.getItem(APPEARANCE_COLOR_MODE_BY_SCOPE_STORAGE_KEY)
  if (!storedValue) {
    return {}
  }

  try {
    return normalizeAppearanceColorModePreferences(JSON.parse(storedValue))
  } catch {
    return {}
  }
}

function saveAppearanceColorModePreference(scope: AppearanceColorModeScope, colorMode: ColorModePreference) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    APPEARANCE_COLOR_MODE_BY_SCOPE_STORAGE_KEY,
    JSON.stringify({
      ...getAppearanceColorModePreferencesSnapshot(),
      [scope]: colorMode,
    }),
  )
}

export function getAppearanceSettingsSnapshot(
  colorModeScope?: AppearanceColorModeScope,
  options: AppearanceSettingsSnapshotOptions = {},
): AppearanceSettings {
  if (typeof window === 'undefined') {
    return getDefaultAppearanceSettings()
  }

  const storedValue = window.localStorage.getItem(APPEARANCE_SETTINGS_STORAGE_KEY)
  let settings = getDefaultAppearanceSettings()
  if (!storedValue) {
    settings = getDefaultAppearanceSettings()
  } else {
    try {
      settings = normalizeAppearanceSettings(JSON.parse(storedValue) as Partial<AppearanceSettings>)
    } catch {
      settings = getDefaultAppearanceSettings()
    }
  }

  if (!colorModeScope) {
    return settings
  }

  const colorModePreferences = getAppearanceColorModePreferencesSnapshot()
  const colorMode = colorModePreferences[colorModeScope] ?? settings.colorMode
  if (!colorModePreferences[colorModeScope] && options.materializeColorModePreference) {
    saveAppearanceColorModePreference(colorModeScope, colorMode)
  }

  return {
    ...settings,
    colorMode,
  }
}

export function saveAppearanceSettingsSnapshot(
  snapshot: AppearanceSettings,
  colorModeScope?: AppearanceColorModeScope,
): AppearanceSettings {
  const normalizedSnapshot = normalizeAppearanceSettings(snapshot)

  if (typeof window !== 'undefined') {
    if (colorModeScope) {
      const existingSettings = getAppearanceSettingsSnapshot()
      const existingPreferences = getAppearanceColorModePreferencesSnapshot()
      const nextPreferences = APPEARANCE_COLOR_MODE_SCOPES.reduce<Record<AppearanceColorModeScope, ColorModePreference>>(
        (preferences, scope) => {
          preferences[scope] = existingPreferences[scope] ?? existingSettings.colorMode
          return preferences
        },
        {} as Record<AppearanceColorModeScope, ColorModePreference>,
      )
      nextPreferences[colorModeScope] = normalizedSnapshot.colorMode
      window.localStorage.setItem(APPEARANCE_COLOR_MODE_BY_SCOPE_STORAGE_KEY, JSON.stringify(nextPreferences))
    }
    window.localStorage.setItem(APPEARANCE_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSnapshot))
  }

  return normalizedSnapshot
}

export function clearAppearanceSettingsSnapshot(): AppearanceSettings {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(APPEARANCE_SETTINGS_STORAGE_KEY)
    window.localStorage.removeItem(APPEARANCE_COLOR_MODE_BY_SCOPE_STORAGE_KEY)
  }

  return getDefaultAppearanceSettings()
}

export function detectSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveColorMode(
  preference: ColorModePreference,
  systemPrefersDark: boolean,
): ResolvedColorMode {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light'
  }

  return preference
}

export function resolveAppearancePalette(
  settings: AppearanceSettings,
  colorMode: ResolvedColorMode,
): AppearancePalette {
  return colorMode === 'light' ? settings.lightMode : settings.darkMode
}

export function resolvePreferredHomeView(settings: Pick<AppearanceSettings, 'workspaceMode'>): 'prompt' {
  void settings
  return 'prompt'
}

export function hexToRgbChannels(value: string): string {
  const normalizedValue = normalizeHexColor(value, '#000000')
  const red = Number.parseInt(normalizedValue.slice(1, 3), 16)
  const green = Number.parseInt(normalizedValue.slice(3, 5), 16)
  const blue = Number.parseInt(normalizedValue.slice(5, 7), 16)

  return `${red} ${green} ${blue}`
}

function channelLuminance(channel: number): number {
  const normalizedChannel = channel / 255
  if (normalizedChannel <= 0.03928) {
    return normalizedChannel / 12.92
  }

  return ((normalizedChannel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(value: string): number {
  const normalizedValue = normalizeHexColor(value, '#000000')
  const red = Number.parseInt(normalizedValue.slice(1, 3), 16)
  const green = Number.parseInt(normalizedValue.slice(3, 5), 16)
  const blue = Number.parseInt(normalizedValue.slice(5, 7), 16)

  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  )
}

export function resolveButtonInkColor(palette: AppearancePalette): string {
  const averageLuminance = (relativeLuminance(palette.accent) + relativeLuminance(palette.highlight)) / 2
  return averageLuminance >= 0.42 ? '#071018' : '#f7fbff'
}

export function applyAppearanceSettingsToDocument(
  settings: AppearanceSettings,
  systemPrefersDark = detectSystemPrefersDark(),
): ResolvedColorMode {
  const resolvedColorMode = resolveColorMode(settings.colorMode, systemPrefersDark)
  const palette = resolveAppearancePalette(settings, resolvedColorMode)

  if (typeof document === 'undefined') {
    return resolvedColorMode
  }

  const root = document.documentElement
  root.dataset.colorMode = resolvedColorMode
  root.dataset.workspaceMode = settings.workspaceMode
  root.style.setProperty('--theme-accent', palette.accent)
  root.style.setProperty('--theme-accent-rgb', hexToRgbChannels(palette.accent))
  root.style.setProperty('--theme-highlight', palette.highlight)
  root.style.setProperty('--theme-highlight-rgb', hexToRgbChannels(palette.highlight))
  root.style.setProperty('--theme-button-ink', resolveButtonInkColor(palette))

  return resolvedColorMode
}
