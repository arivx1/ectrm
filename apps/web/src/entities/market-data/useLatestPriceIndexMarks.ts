import { useEffect, useMemo, useState } from 'react'

import { loadLatestPriceIndexObservations } from './api'
import { appConfig } from '../../shared/config'
import type { PriceIndexObservationRecord } from '../../shared/models'

function normalizePriceIndexCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? ''
  return normalized === '' ? null : normalized
}

function buildMarksMap(
  observations: PriceIndexObservationRecord[],
): Record<string, PriceIndexObservationRecord> {
  const nextMarksByCode: Record<string, PriceIndexObservationRecord> = {}
  for (const observation of observations) {
    const normalizedCode = normalizePriceIndexCode(observation.price_index_code)
    if (!normalizedCode) {
      continue
    }
    nextMarksByCode[normalizedCode] = observation
  }
  return nextMarksByCode
}

export function useLatestPriceIndexMarks(
  priceIndexCodes: Array<string | null | undefined>,
  options: {
    refreshIntervalMs?: number
    pauseWhenHidden?: boolean
  } = {},
): {
  latestMarks: PriceIndexObservationRecord[]
  latestMarksByCode: Record<string, PriceIndexObservationRecord>
  loading: boolean
  error: string
} {
  const refreshIntervalMs = Math.max(0, options.refreshIntervalMs ?? 0)
  const pauseWhenHidden = options.pauseWhenHidden ?? true
  const normalizedCodes = useMemo(
    () =>
      Array.from(
        new Set(
          priceIndexCodes
            .map((value) => normalizePriceIndexCode(value))
            .filter((value): value is string => value !== null),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [priceIndexCodes],
  )
  const [latestMarksByCode, setLatestMarksByCode] = useState<Record<string, PriceIndexObservationRecord>>({})
  const [latestMarks, setLatestMarks] = useState<PriceIndexObservationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    function clearRefreshTimer() {
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer)
        refreshTimer = null
      }
    }

    function documentIsHidden() {
      return pauseWhenHidden && typeof document !== 'undefined' && document.visibilityState === 'hidden'
    }

    function scheduleRefresh() {
      clearRefreshTimer()
      if (cancelled || refreshIntervalMs <= 0 || normalizedCodes.length === 0) {
        return
      }

      refreshTimer = setTimeout(() => {
        if (documentIsHidden()) {
          scheduleRefresh()
          return
        }

        void load({ background: true })
      }, refreshIntervalMs)
    }

    async function load({ background = false }: { background?: boolean } = {}) {
      if (normalizedCodes.length === 0) {
        clearRefreshTimer()
        setLatestMarks([])
        setLatestMarksByCode({})
        setError('')
        setLoading(false)
        return
      }

      if (!background) {
        setLoading(true)
      }
      setError('')
      try {
        const payload = await loadLatestPriceIndexObservations(appConfig.apiBase, normalizedCodes)
        if (!cancelled) {
          setLatestMarks(payload)
          setLatestMarksByCode(buildMarksMap(payload))
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load latest price index marks.')
        }
      } finally {
        if (!cancelled) {
          if (!background) {
            setLoading(false)
          }
          scheduleRefresh()
        }
      }
    }

    function handleVisibilityChange() {
      if (
        cancelled ||
        !pauseWhenHidden ||
        refreshIntervalMs <= 0 ||
        typeof document === 'undefined' ||
        document.visibilityState !== 'visible'
      ) {
        return
      }

      clearRefreshTimer()
      void load({ background: true })
    }

    if (pauseWhenHidden && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    void load()
    return () => {
      cancelled = true
      clearRefreshTimer()
      if (pauseWhenHidden && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [normalizedCodes, pauseWhenHidden, refreshIntervalMs])

  return {
    latestMarks,
    latestMarksByCode,
    loading,
    error,
  }
}
