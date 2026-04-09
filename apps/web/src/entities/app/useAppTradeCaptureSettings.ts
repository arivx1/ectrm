import { useState } from 'react'

import {
  clearTradeCaptureSettingsSnapshot,
  getTradeCaptureSettingsSnapshot,
  saveTradeCaptureSettingsSnapshot,
} from '../../shared/tradeCaptureSettings'

export function useAppTradeCaptureSettings() {
  const [tradeCaptureSettings, setTradeCaptureSettings] = useState(() => getTradeCaptureSettingsSnapshot())

  function handleTradeCaptureSettingsChange(
    nextSettings: Parameters<typeof saveTradeCaptureSettingsSnapshot>[0],
  ) {
    const savedSettings = saveTradeCaptureSettingsSnapshot(nextSettings)
    setTradeCaptureSettings(savedSettings)
    return savedSettings
  }

  function handleTradeCaptureSettingsReset() {
    const defaultSettings = clearTradeCaptureSettingsSnapshot()
    setTradeCaptureSettings(defaultSettings)
    return defaultSettings
  }

  return {
    tradeCaptureSettings,
    handleTradeCaptureSettingsChange,
    handleTradeCaptureSettingsReset,
  }
}
