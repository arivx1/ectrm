import { useEffect, useMemo, useState } from 'react'

import {
  applyAppearanceSettingsToDocument,
  clearAppearanceSettingsSnapshot,
  detectSystemPrefersDark,
  getAppearanceSettingsSnapshot,
  resolvePreferredHomeView,
  resolveColorMode,
  saveAppearanceSettingsSnapshot,
  type AppearanceColorModeScope,
} from '../../shared/appearance'

export function useAppAppearance(colorModeScope: AppearanceColorModeScope = 'strata') {
  const [appearanceSettingsRevision, setAppearanceSettingsRevision] = useState(0)
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => detectSystemPrefersDark())
  const appearanceSettings = useMemo(
    () => {
      void appearanceSettingsRevision
      return getAppearanceSettingsSnapshot(colorModeScope)
    },
    [appearanceSettingsRevision, colorModeScope],
  )

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
    const savedSettings = saveAppearanceSettingsSnapshot(nextSettings, colorModeScope)
    setAppearanceSettingsRevision((currentRevision) => currentRevision + 1)
    return savedSettings
  }

  function handleAppearanceSettingsReset() {
    const defaultSettings = clearAppearanceSettingsSnapshot()
    setAppearanceSettingsRevision((currentRevision) => currentRevision + 1)
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
    isTerminalMode: appearanceSettings.workspaceMode === 'terminal',
    preferredHomeView: resolvePreferredHomeView(appearanceSettings),
    resolvedColorMode,
    systemPrefersDark,
    themeToggleActionLabel:
      resolvedColorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    themeToggleLabel: resolvedColorMode === 'dark' ? 'Dark mode' : 'Light mode',
  }
}
