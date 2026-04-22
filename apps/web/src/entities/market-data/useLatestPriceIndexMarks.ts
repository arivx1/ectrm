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
): {
  latestMarksByCode: Record<string, PriceIndexObservationRecord>
  loading: boolean
  error: string
} {
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (normalizedCodes.length === 0) {
        setLatestMarksByCode({})
        setError('')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')
      try {
        const payload = await loadLatestPriceIndexObservations(appConfig.apiBase, normalizedCodes)
        if (!cancelled) {
          setLatestMarksByCode(buildMarksMap(payload))
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load latest price index marks.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [normalizedCodes])

  return {
    latestMarksByCode,
    loading,
    error,
  }
}
