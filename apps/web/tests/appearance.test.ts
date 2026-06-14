import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'

import {
  clearAppearanceSettingsSnapshot,
  getAppearanceColorModePreferencesSnapshot,
  getDefaultAppearanceSettings,
  getAppearanceSettingsSnapshot,
  normalizeAppearanceSettings,
  saveAppearanceSettingsSnapshot,
  resolvePreferredHomeView,
  resolveButtonInkColor,
  resolveColorMode,
} from '../src/shared/appearance.ts'

type LocalStorageMock = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const originalWindow = globalThis.window

function installWindowWithStorage(initialEntries: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initialEntries))
  const localStorage: LocalStorageMock = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value)
    },
    removeItem: (key) => {
      storage.delete(key)
    },
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage },
  })
}

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
})

test('normalizeAppearanceSettings falls back to defaults for invalid values', () => {
  const normalized = normalizeAppearanceSettings({
    colorMode: 'moonlight' as never,
    lightMode: {
      accent: '#abc',
      highlight: 'not-a-color',
    },
    darkMode: {
      accent: '#123456',
      highlight: '#7f8',
    },
  })

  const defaults = getDefaultAppearanceSettings()

  assert.deepEqual(normalized, {
    colorMode: defaults.colorMode,
    workspaceMode: defaults.workspaceMode,
    lightMode: {
      accent: '#aabbcc',
      highlight: defaults.lightMode.highlight,
    },
    darkMode: {
      accent: '#123456',
      highlight: '#77ff88',
    },
  })
})

test('appearance snapshots persist separate color modes for Strata and Nexus', () => {
  installWindowWithStorage()
  const defaults = getDefaultAppearanceSettings()

  saveAppearanceSettingsSnapshot(
    {
      ...defaults,
      colorMode: 'dark',
      lightMode: {
        accent: '#abcdef',
        highlight: '#123456',
      },
    },
    'strata',
  )
  saveAppearanceSettingsSnapshot(
    {
      ...getAppearanceSettingsSnapshot('nexus'),
      colorMode: 'light',
    },
    'nexus',
  )

  assert.equal(getAppearanceSettingsSnapshot('strata').colorMode, 'dark')
  assert.equal(getAppearanceSettingsSnapshot('nexus').colorMode, 'light')
  assert.deepEqual(getAppearanceSettingsSnapshot('nexus').lightMode, {
    accent: '#abcdef',
    highlight: '#123456',
  })
  assert.deepEqual(getAppearanceColorModePreferencesSnapshot(), {
    strata: 'dark',
    nexus: 'light',
  })

  clearAppearanceSettingsSnapshot()
  assert.equal(getAppearanceSettingsSnapshot('strata').colorMode, defaults.colorMode)
  assert.deepEqual(getAppearanceColorModePreferencesSnapshot(), {})
})

test('appearance snapshots materialize a legacy global color mode for the active product', () => {
  const defaults = getDefaultAppearanceSettings()
  installWindowWithStorage({
    'ectrm.appearance-settings': JSON.stringify({
      ...defaults,
      colorMode: 'dark',
    }),
  })

  assert.equal(
    getAppearanceSettingsSnapshot('strata', { materializeColorModePreference: true }).colorMode,
    'dark',
  )
  assert.deepEqual(getAppearanceColorModePreferencesSnapshot(), {
    strata: 'dark',
  })

  saveAppearanceSettingsSnapshot(
    {
      ...getAppearanceSettingsSnapshot('nexus'),
      colorMode: 'light',
    },
    'nexus',
  )

  assert.equal(getAppearanceSettingsSnapshot('strata').colorMode, 'dark')
  assert.equal(getAppearanceSettingsSnapshot('nexus').colorMode, 'light')
})

test('scoped appearance saves preserve legacy global color modes for unsaved products', () => {
  const defaults = getDefaultAppearanceSettings()
  installWindowWithStorage({
    'ectrm.appearance-settings': JSON.stringify({
      ...defaults,
      colorMode: 'dark',
    }),
  })

  saveAppearanceSettingsSnapshot(
    {
      ...getAppearanceSettingsSnapshot('nexus'),
      colorMode: 'light',
    },
    'nexus',
  )

  assert.deepEqual(getAppearanceColorModePreferencesSnapshot(), {
    strata: 'dark',
    nexus: 'light',
  })
  assert.equal(getAppearanceSettingsSnapshot('strata').colorMode, 'dark')
  assert.equal(getAppearanceSettingsSnapshot('nexus').colorMode, 'light')
})

test('resolvePreferredHomeView maps workspace modes to the signed-in root landing', () => {
  assert.equal(resolvePreferredHomeView(getDefaultAppearanceSettings()), 'prompt')
  assert.equal(
    resolvePreferredHomeView({
      ...getDefaultAppearanceSettings(),
      workspaceMode: 'terminal',
    }),
    'prompt',
  )
})

test('resolveColorMode honors explicit selections and system fallback', () => {
  assert.equal(resolveColorMode('light', true), 'light')
  assert.equal(resolveColorMode('dark', false), 'dark')
  assert.equal(resolveColorMode('system', true), 'dark')
  assert.equal(resolveColorMode('system', false), 'light')
})

test('resolveButtonInkColor chooses contrast based on palette brightness', () => {
  assert.equal(
    resolveButtonInkColor({
      accent: '#d7f7e5',
      highlight: '#cfe7ff',
    }),
    '#071018',
  )

  assert.equal(
    resolveButtonInkColor({
      accent: '#0c4f3e',
      highlight: '#123a63',
    }),
    '#f7fbff',
  )
})
