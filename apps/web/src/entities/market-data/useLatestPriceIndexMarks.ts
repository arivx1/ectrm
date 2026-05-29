import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
    if (!nextMarksByCode[normalizedCode]) {
      nextMarksByCode[normalizedCode] = observation
    }
  }
  return nextMarksByCode
}

export function useLatestPriceIndexMarks(
  priceIndexCodes: Array<string | null | undefined>,
  options: {
    limitPerCode?: number
    refreshIntervalMs?: number
    pauseWhenHidden?: boolean
  } = {},
): {
  latestMarks: PriceIndexObservationRecord[]
  latestMarksByCode: Record<string, PriceIndexObservationRecord>
  loading: boolean
  refreshing: boolean
  error: string
  refresh: () => Promise<PriceIndexObservationRecord[]>
} {
  const refreshIntervalMs = Math.max(0, options.refreshIntervalMs ?? 0)
  const limitPerCode = Math.max(1, Math.floor(options.limitPerCode ?? 1))
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
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const mountedRef = useRef(false)
  const requestSerialRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      const requestSerial = requestSerialRef.current + 1
      requestSerialRef.current = requestSerial

      if (normalizedCodes.length === 0) {
        if (mountedRef.current) {
          setLatestMarks([])
          setLatestMarksByCode({})
          setError('')
          setLoading(false)
          setRefreshing(false)
        }
        return []
      }

      if (mountedRef.current) {
        if (background) {
          setRefreshing(true)
        } else {
          setLoading(true)
          setRefreshing(false)
        }
        setError('')
      }

      try {
        const payload = await loadLatestPriceIndexObservations(appConfig.apiBase, normalizedCodes, {
          limitPerCode,
        })
        if (mountedRef.current && requestSerialRef.current === requestSerial) {
          setLatestMarks(payload)
          setLatestMarksByCode(buildMarksMap(payload))
        }
        return payload
      } catch (nextError) {
        if (mountedRef.current && requestSerialRef.current === requestSerial) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load latest price index marks.')
        }
        throw nextError
      } finally {
        if (mountedRef.current && requestSerialRef.current === requestSerial) {
          if (!background) {
            setLoading(false)
          }
          setRefreshing(false)
        }
      }
    },
    [limitPerCode, normalizedCodes],
  )

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

        void loadAndSchedule({ background: true })
      }, refreshIntervalMs)
    }

    async function loadAndSchedule({ background = false }: { background?: boolean } = {}) {
      try {
        await refresh({ background })
      } catch {
        // Keep the polling loop alive; the hook state carries the load error.
      } finally {
        if (!cancelled) {
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
      void loadAndSchedule({ background: true })
    }

    if (pauseWhenHidden && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    void loadAndSchedule()
    return () => {
      cancelled = true
      clearRefreshTimer()
      if (pauseWhenHidden && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [normalizedCodes.length, pauseWhenHidden, refresh, refreshIntervalMs])

  return {
    latestMarks,
    latestMarksByCode,
    loading,
    refreshing,
    error,
    refresh,
  }
}
