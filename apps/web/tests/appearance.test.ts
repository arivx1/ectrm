import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  getDefaultAppearanceSettings,
  normalizeAppearanceSettings,
  resolvePreferredHomeView,
  resolveButtonInkColor,
  resolveColorMode,
} from '../src/shared/appearance.ts'

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

test('resolvePreferredHomeView maps workspace modes to the signed-in root landing', () => {
  assert.equal(resolvePreferredHomeView(getDefaultAppearanceSettings()), 'prompt')
  assert.equal(
    resolvePreferredHomeView({
      ...getDefaultAppearanceSettings(),
      workspaceMode: 'terminal',
    }),
    'dashboard',
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
