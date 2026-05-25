import type { DocumentProcessorRuntimeSettingsRecord } from '../../shared/models'

export const FALLBACK_AI_CONFIDENCE_THRESHOLD_PERCENT = 46

export function normalizeAiConfidenceThresholdPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return FALLBACK_AI_CONFIDENCE_THRESHOLD_PERCENT
  }
  return Math.round(Math.min(Math.max(value, 0), 100))
}

export function aiConfidenceThresholdPercentFromSettings(
  settings: DocumentProcessorRuntimeSettingsRecord | null,
): number {
  const threshold = settings?.ai_processing_confidence_threshold
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    return FALLBACK_AI_CONFIDENCE_THRESHOLD_PERCENT
  }
  return normalizeAiConfidenceThresholdPercent(threshold * 100)
}

export function aiConfidenceThresholdFractionFromPercent(value: number): number {
  return normalizeAiConfidenceThresholdPercent(value) / 100
}
