import { useEffect, useMemo, useState } from 'react'

import {
  applyAppearanceSettingsToDocument,
  clearAppearanceSettingsSnapshot,
  detectSystemPrefersDark,
  getAppearanceSettingsSnapshot,
  resolveColorMode,
  saveAppearanceSettingsSnapshot,
} from '../../shared/appearance'

export function useAppAppearance() {
  const [appearanceSettings, setAppearanceSettings] = useState(() => getAppearanceSettingsSnapshot())
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => detectSystemPrefersDark())

  const resolvedColorMode = useMemo(
    () => resolveColorMode(appearanceSettings.colorMode, systemPrefersDark),
    [appearanceSettings.colorMode, systemPrefersDark],
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    function handlePreferenceChange(event: MediaQueryListEvent) {
      setSystemPrefersDark(event.matches)
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handlePreferenceChange)
      return () => {
        mediaQuery.removeEventListener('change', handlePreferenceChange)
      }
    }

    mediaQuery.addListener(handlePreferenceChange)

    return () => {
      mediaQuery.removeListener(handlePreferenceChange)
    }
  }, [])

  useEffect(() => {
    applyAppearanceSettingsToDocument(appearanceSettings, systemPrefersDark)
  }, [appearanceSettings, systemPrefersDark])

  function handleAppearanceSettingsChange(nextSettings: Parameters<typeof saveAppearanceSettingsSnapshot>[0]) {
    const savedSettings = saveAppearanceSettingsSnapshot(nextSettings)
    setAppearanceSettings(savedSettings)
    return savedSettings
  }

  function handleAppearanceSettingsReset() {
    const defaultSettings = clearAppearanceSettingsSnapshot()
    setAppearanceSettings(defaultSettings)
    return defaultSettings
  }

  function handleToggleColorMode() {
    const nextColorMode = resolvedColorMode === 'dark' ? 'light' : 'dark'
    handleAppearanceSettingsChange({
      ...appearanceSettings,
      colorMode: nextColorMode,
    })
  }

  return {
    appearanceSettings,
    handleAppearanceSettingsChange,
    handleAppearanceSettingsReset,
    handleToggleColorMode,
    resolvedColorMode,
    systemPrefersDark,
    themeToggleActionLabel:
      resolvedColorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    themeToggleLabel: resolvedColorMode === 'dark' ? 'Dark mode' : 'Light mode',
  }
}
