import type {
  PreTradeRecommendationDraftAnalysisRecord,
  PreTradeRecommendationResultRecord,
  PreTradeRecommendationSourceSnapshotRecord,
} from '../../shared/models'

export type PreTradeRecommendationReadinessTone = 'active' | 'in-progress' | 'blocked'

export type PreTradeRecommendationReadinessItem = {
  key: 'opportunity' | 'exposure' | 'source-freshness' | 'missing-evidence' | 'hedge'
  label: string
  headline: string
  detail: string
  tone: PreTradeRecommendationReadinessTone
  bullets: string[]
}

export type PreTradeRecommendationWorkspaceBrief = {
  ready: boolean
  tone: PreTradeRecommendationReadinessTone
  stanceLabel: string
  headline: string
  summary: string
  sourceSummary: string
  missingEvidenceSummary: string
  sections: PreTradeRecommendationReadinessItem[]
  primaryFocus: string[]
}

function labelize(value: string): string {
  return value.replaceAll('_', ' ')
}

function formatNumber(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })
}

function sourceLabel(snapshot: PreTradeRecommendationSourceSnapshotRecord): string {
  return snapshot.adapter_label ?? snapshot.adapter_key ?? snapshot.source_key
}

function impairedSourceSnapshots(
  snapshots: PreTradeRecommendationSourceSnapshotRecord[],
): PreTradeRecommendationSourceSnapshotRecord[] {
  return snapshots.filter(
    (snapshot) =>
      !snapshot.source_available ||
      snapshot.quality_status !== 'OK' ||
      snapshot.freshness === 'STALE' ||
      snapshot.freshness === 'DEGRADED' ||
      snapshot.freshness === 'UNKNOWN',
  )
}

function sourceTone(snapshots: PreTradeRecommendationSourceSnapshotRecord[]): PreTradeRecommendationReadinessTone {
  if (snapshots.length === 0) {
    return 'blocked'
  }
  const impaired = impairedSourceSnapshots(snapshots)
  if (impaired.some((snapshot) => !snapshot.source_available || snapshot.quality_status === 'MISSING')) {
    return 'blocked'
  }
  return impaired.length > 0 ? 'in-progress' : 'active'
}

function sourceSummary(snapshots: PreTradeRecommendationSourceSnapshotRecord[]): string {
  if (snapshots.length === 0) {
    return 'No source snapshots are attached.'
  }
  const impaired = impairedSourceSnapshots(snapshots)
  if (impaired.length === 0) {
    return `${snapshots.length} source${snapshots.length === 1 ? '' : 's'} clean.`
  }
  return `${impaired.length} of ${snapshots.length} source${snapshots.length === 1 ? '' : 's'} need review.`
}

function missingEvidenceTone(
  recommendation: PreTradeRecommendationResultRecord,
): PreTradeRecommendationReadinessTone {
  if (recommendation.missing_evidence.some((item) => item.severity === 'BLOCKING')) {
    return 'blocked'
  }
  return recommendation.missing_evidence.length > 0 ? 'in-progress' : 'active'
}

function recommendationTone(
  recommendation: PreTradeRecommendationResultRecord,
  sourceReadiness: PreTradeRecommendationReadinessTone,
  missingReadiness: PreTradeRecommendationReadinessTone,
): PreTradeRecommendationReadinessTone {
  if (
    recommendation.stance === 'ESCALATE' ||
    recommendation.stance === 'WAIT_FOR_DATA' ||
    sourceReadiness === 'blocked' ||
    missingReadiness === 'blocked'
  ) {
    return 'blocked'
  }
  if (
    recommendation.stance === 'PROCEED_WITH_CARE' ||
    sourceReadiness === 'in-progress' ||
    missingReadiness === 'in-progress'
  ) {
    return 'in-progress'
  }
  return 'active'
}

function residualExposureHeadline(recommendation: PreTradeRecommendationResultRecord): string {
  const residual = recommendation.residual_exposure
  if (!residual) {
    return 'Residual exposure not calculated'
  }
  const residualValue = formatNumber(residual.residual_after_trade)
  return residualValue
    ? `${labelize(residual.exposure_effect)} | residual ${residualValue}`
    : labelize(residual.exposure_effect)
}

function residualExposureDetail(recommendation: PreTradeRecommendationResultRecord): string {
  const residual = recommendation.residual_exposure
  if (!residual) {
    return 'Review current and proposed exposure manually before the handoff.'
  }
  const details = [
    typeof residual.current_net_position === 'number' ? `current ${formatNumber(residual.current_net_position)}` : null,
    typeof residual.proposed_trade_delta === 'number'
      ? `draft ${residual.proposed_trade_delta > 0 ? '+' : ''}${formatNumber(residual.proposed_trade_delta)}`
      : null,
    typeof residual.residual_after_trade === 'number' ? `after ${formatNumber(residual.residual_after_trade)}` : null,
  ].filter(Boolean)
  return details.length > 0 ? `${residual.detail} ${details.join(' | ')}.` : residual.detail
}

function hedgeTone(recommendation: PreTradeRecommendationResultRecord): PreTradeRecommendationReadinessTone {
  const hedge = recommendation.hedge_recommendation
  if (!hedge || hedge.instrument_type === 'NO_HEDGE') {
    return 'in-progress'
  }
  if (hedge.instrument_type === 'WAIT_FOR_DATA') {
    return 'blocked'
  }
  return hedge.policy_stops.length > 0 ? 'in-progress' : 'active'
}

function focusItems(recommendation: PreTradeRecommendationResultRecord): string[] {
  const values = [
    ...recommendation.explanation.reviewer_focus,
    ...recommendation.next_actions,
    ...recommendation.missing_evidence.map((item) => item.detail),
    ...(recommendation.hedge_recommendation?.policy_stops ?? []),
    ...(recommendation.arbitrage_candidate?.missing_evidence ?? []),
    ...(recommendation.arbitrage_candidate?.stop_reasons ?? []),
  ]
  const seen = new Set<string>()
  const items: string[] = []
  values.forEach((value) => {
    const normalized = value.trim()
    if (!normalized) {
      return
    }
    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    items.push(normalized)
  })
  return items.slice(0, 5)
}

export function buildPreTradeRecommendationWorkspaceBrief(
  analysis: PreTradeRecommendationDraftAnalysisRecord | null,
): PreTradeRecommendationWorkspaceBrief {
  if (!analysis) {
    return {
      ready: false,
      tone: 'in-progress',
      stanceLabel: 'MANUAL REVIEW',
      headline: 'Manual scenario entry is available.',
      summary: 'Recommendation analysis is not available yet. The scenario can still be saved, reviewed, or opened as a manual Trade Capture draft.',
      sourceSummary: 'No source snapshots are attached.',
      missingEvidenceSummary: 'Evidence checks have not run.',
      sections: [
        {
          key: 'source-freshness',
          label: 'Source Freshness',
          headline: 'No source snapshots',
          detail: 'Review the scenario fields manually or sign in to run deterministic source checks.',
          tone: 'in-progress',
          bullets: [],
        },
        {
          key: 'missing-evidence',
          label: 'Missing Evidence',
          headline: 'Not evaluated',
          detail: 'Missing-evidence rules are only available after a recommendation analysis completes.',
          tone: 'in-progress',
          bullets: [],
        },
      ],
      primaryFocus: ['Confirm structure, pricing basis, delivery window, and evidence freshness before capture.'],
    }
  }

  const recommendation = analysis.recommendation
  const sourceReadiness = sourceTone(analysis.input_snapshots)
  const missingReadiness = missingEvidenceTone(recommendation)
  const tone = recommendationTone(recommendation, sourceReadiness, missingReadiness)
  const impairedSources = impairedSourceSnapshots(analysis.input_snapshots)
  const blockingEvidenceCount = recommendation.missing_evidence.filter((item) => item.severity === 'BLOCKING').length
  const warningEvidenceCount = recommendation.missing_evidence.length - blockingEvidenceCount

  return {
    ready: true,
    tone,
    stanceLabel: labelize(recommendation.stance),
    headline: recommendation.headline,
    summary: recommendation.summary,
    sourceSummary: sourceSummary(analysis.input_snapshots),
    missingEvidenceSummary:
      recommendation.missing_evidence.length === 0
        ? 'No missing evidence flagged.'
        : `${blockingEvidenceCount} blocking and ${warningEvidenceCount} warning evidence item${recommendation.missing_evidence.length === 1 ? '' : 's'}.`,
    sections: [
      {
        key: 'opportunity',
        label: 'Opportunity',
        headline: recommendation.opportunity_summary
          ? `${recommendation.opportunity_summary.title} | ${labelize(recommendation.opportunity_summary.category)}`
          : 'No opportunity category',
        detail: recommendation.opportunity_summary?.detail ?? 'No typed opportunity summary was produced for this draft.',
        tone: recommendation.opportunity_summary?.category === 'WAIT_FOR_DATA' ? 'blocked' : tone,
        bullets: recommendation.opportunity_summary?.driver_keys.slice(0, 3) ?? [],
      },
      {
        key: 'exposure',
        label: 'Residual Exposure',
        headline: residualExposureHeadline(recommendation),
        detail: residualExposureDetail(recommendation),
        tone:
          recommendation.residual_exposure?.exposure_effect === 'DEEPENS'
            ? 'in-progress'
            : recommendation.residual_exposure
              ? 'active'
              : 'in-progress',
        bullets: [],
      },
      {
        key: 'source-freshness',
        label: 'Source Freshness',
        headline: sourceSummary(analysis.input_snapshots),
        detail: recommendation.explanation.source_quality_rationale,
        tone: sourceReadiness,
        bullets: impairedSources.slice(0, 4).map((snapshot) => `${sourceLabel(snapshot)}: ${snapshot.quality_status} / ${snapshot.freshness}`),
      },
      {
        key: 'missing-evidence',
        label: 'Missing Evidence',
        headline:
          recommendation.missing_evidence.length === 0
            ? 'No missing evidence flagged'
            : `${recommendation.missing_evidence.length} evidence item${recommendation.missing_evidence.length === 1 ? '' : 's'} need review`,
        detail:
          recommendation.missing_evidence.length === 0
            ? 'Required evidence checks are satisfied for the current recommendation.'
            : recommendation.missing_evidence[0]?.detail ?? 'Review missing evidence before handoff.',
        tone: missingReadiness,
        bullets: recommendation.missing_evidence.slice(0, 4).map((item) => `${item.severity}: ${item.detail}`),
      },
      {
        key: 'hedge',
        label: 'Hedge Draft',
        headline: recommendation.hedge_recommendation
          ? labelize(recommendation.hedge_recommendation.instrument_type)
          : 'No hedge draft',
        detail: recommendation.hedge_recommendation?.rationale ?? 'No hedge recommendation was generated for this draft.',
        tone: hedgeTone(recommendation),
        bullets: recommendation.hedge_recommendation?.policy_stops.slice(0, 3) ?? [],
      },
    ],
    primaryFocus: focusItems(recommendation),
  }
}
