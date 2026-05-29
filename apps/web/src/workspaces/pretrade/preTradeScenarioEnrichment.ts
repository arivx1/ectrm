import type {
  PreTradeRecommendationDraftAnalysisRecord,
  PreTradeRecommendationResultRecord,
  PreTradeRecommendationRunRecord,
  PreTradeRecommendationSourceSnapshotRecord,
  PreTradeScenarioEnrichmentRecord,
} from '../../shared/models'

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function compactFocusItems(values: Array<string | null | undefined>): string[] {
  const items: string[] = []
  const seenItems = new Set<string>()
  values.forEach((value) => {
    const normalized = normalizeOptionalText(value)
    if (!normalized) {
      return
    }
    const key = normalized.toLocaleLowerCase()
    if (seenItems.has(key)) {
      return
    }
    items.push(normalized)
    seenItems.add(key)
  })
  return items.slice(0, 8)
}

function sourceLabel(snapshot: PreTradeRecommendationSourceSnapshotRecord): string {
  return snapshot.adapter_label ?? snapshot.adapter_key ?? snapshot.source_key
}

export function buildPreTradeSourceFreshnessSummary(
  snapshots: PreTradeRecommendationSourceSnapshotRecord[],
): string | null {
  if (snapshots.length === 0) {
    return 'No source snapshots were captured with this recommendation.'
  }

  const impairedSnapshots = snapshots.filter(
    (snapshot) =>
      !snapshot.source_available ||
      snapshot.quality_status !== 'OK' ||
      snapshot.freshness === 'STALE' ||
      snapshot.freshness === 'DEGRADED' ||
      snapshot.freshness === 'UNKNOWN',
  )
  if (impairedSnapshots.length === 0) {
    return `All ${snapshots.length} source snapshot${snapshots.length === 1 ? '' : 's'} were OK at capture.`
  }

  const labels = impairedSnapshots.slice(0, 4).map(sourceLabel)
  const suffix = impairedSnapshots.length > 4 ? ` plus ${impairedSnapshots.length - 4} more` : ''
  return `${impairedSnapshots.length} of ${snapshots.length} source snapshot${snapshots.length === 1 ? '' : 's'} need review: ${labels.join(', ')}${suffix}.`
}

function buildResidualExposureSummary(recommendation: PreTradeRecommendationResultRecord): string | null {
  const residual = recommendation.residual_exposure
  if (!residual) {
    return null
  }

  const details = [
    typeof residual.current_net_position === 'number' ? `current ${residual.current_net_position}` : null,
    typeof residual.proposed_trade_delta === 'number'
      ? `delta ${residual.proposed_trade_delta > 0 ? '+' : ''}${residual.proposed_trade_delta}`
      : null,
    typeof residual.residual_after_trade === 'number' ? `residual ${residual.residual_after_trade}` : null,
    residual.exposure_effect !== 'UNKNOWN' ? residual.exposure_effect.replaceAll('_', ' ').toLocaleLowerCase() : null,
  ].filter(Boolean)

  return details.length > 0 ? `${residual.detail} (${details.join('; ')}).` : residual.detail
}

function buildReviewerFocus(recommendation: PreTradeRecommendationResultRecord): string[] {
  return compactFocusItems([
    ...recommendation.explanation.reviewer_focus,
    ...recommendation.next_actions,
    ...recommendation.missing_evidence.map((item) => `${item.severity}: ${item.detail}`),
    ...(recommendation.hedge_recommendation?.policy_stops ?? []),
    ...(recommendation.arbitrage_candidate?.missing_evidence ?? []),
    ...(recommendation.arbitrage_candidate?.stop_reasons ?? []),
  ])
}

export function buildPreTradeScenarioEnrichmentFromRun(
  run: PreTradeRecommendationRunRecord,
): PreTradeScenarioEnrichmentRecord {
  return {
    opportunity_category: run.recommendation.opportunity_summary?.category ?? null,
    hedge_intent: run.recommendation.hedge_recommendation?.instrument_type ?? null,
    residual_exposure_summary: buildResidualExposureSummary(run.recommendation),
    source_freshness_summary: buildPreTradeSourceFreshnessSummary(run.input_snapshots),
    reviewer_focus: buildReviewerFocus(run.recommendation),
    recommendation_run_id: run.run_id,
    recommendation_run_key: run.run_key,
    recommendation_stance: run.recommendation.stance,
    recommendation_score: run.recommendation.score,
    recommendation_headline: run.recommendation.headline,
    captured_at: run.created_at,
  }
}

export function buildPreTradeScenarioEnrichmentFromAnalysis(
  analysis: PreTradeRecommendationDraftAnalysisRecord | null,
): PreTradeScenarioEnrichmentRecord | null {
  if (!analysis) {
    return null
  }
  return {
    opportunity_category: analysis.recommendation.opportunity_summary?.category ?? null,
    hedge_intent: analysis.recommendation.hedge_recommendation?.instrument_type ?? null,
    residual_exposure_summary: buildResidualExposureSummary(analysis.recommendation),
    source_freshness_summary: buildPreTradeSourceFreshnessSummary(analysis.input_snapshots),
    reviewer_focus: buildReviewerFocus(analysis.recommendation),
    recommendation_run_id: null,
    recommendation_run_key: null,
    recommendation_stance: analysis.recommendation.stance,
    recommendation_score: analysis.recommendation.score,
    recommendation_headline: analysis.recommendation.headline,
    captured_at: analysis.evaluated_at,
  }
}
