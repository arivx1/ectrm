import type {
  PersonalizableWorkspaceId,
  WorkspaceLayoutState,
  WorkspaceTileSpan,
} from './layouts'
import {
  sanitizeLayout,
  type WorkspaceTileLayoutSpec,
  type WorkspaceTileSectionLayoutSpec,
} from './tileLayoutState'

type WorkspaceLayoutPresetCandidate = {
  order?: string[]
  hidden?: string[]
  spans?: Record<string, WorkspaceTileSpan>
  sections?: Record<string, string[]>
}

export type WorkspaceLayoutPreset = {
  id: string
  label: string
  description: string
  layout: WorkspaceLayoutPresetCandidate
}

export type ResolvedWorkspaceLayoutPreset = Omit<WorkspaceLayoutPreset, 'layout'> & {
  layout: WorkspaceLayoutState
}

const WORKSPACE_LAYOUT_PRESETS: Partial<Record<PersonalizableWorkspaceId, WorkspaceLayoutPreset[]>> = {
  dashboard: [
    {
      id: 'market-overview',
      label: 'Market Overview',
      description:
        'Lead with a terminal-style market strip and monitor board before rolling into desk reporting, prices, exposure, and attention.',
      layout: {
        order: [
          'market-monitor-strip',
          'market-monitor-board',
          'desk-headlines',
          'watchlist-alerts',
          'instrument-brief',
          'quote-curve-panel',
          'market-prices',
          'position-snapshot',
          'operational-attention',
          'market-context',
          'desk-snapshot',
          'recent-timeline',
          'external-series',
          'weather-intelligence',
          'quick-start',
        ],
        hidden: ['quick-start'],
        spans: {
          'market-monitor-strip': 'wide',
          'market-monitor-board': 'wide',
          'desk-headlines': 'wide',
          'watchlist-alerts': 'side',
          'instrument-brief': 'wide',
          'quote-curve-panel': 'wide',
          'desk-snapshot': 'wide',
          'market-prices': 'half',
          'position-snapshot': 'half',
          'operational-attention': 'side',
          'recent-timeline': 'half',
          'market-context': 'wide',
        },
      },
    },
  ],
  risk: [
    {
      id: 'risk-board',
      label: 'Risk Board',
      description:
        'Lead with the risk snapshot, concentration, and pricing coverage before rolling into expiry, marks, and settlement detail.',
      layout: {
        order: [
          'risk-summary',
          'risk-exposure',
          'risk-pricing',
          'risk-option-expiry-queue',
          'risk-open-option-marks',
          'risk-books',
          'risk-option-settlements',
        ],
        spans: {
          'risk-summary': 'wide',
          'risk-exposure': 'half',
          'risk-pricing': 'half',
          'risk-option-expiry-queue': 'wide',
          'risk-open-option-marks': 'wide',
          'risk-books': 'wide',
        },
        sections: {
          'risk-summary-cards': [
            'gross-linear-exposure',
            'net-option-delta-proxy',
            'pricing-coverage',
            'expiry-alerts',
            'largest-linear-class',
            'largest-linear-ticket',
            'premium-at-risk',
            'profitable-at-mark',
            'open-option-tickets',
            'next-option-expiry',
            'marked-open-options',
            'itm-open-options',
            'booked-option-pairs',
            'net-package-cashflow',
          ],
        },
      },
    },
  ],
  operations: [
    {
      id: 'operations-monitor',
      label: 'Operations Monitor',
      description:
        'Put the queue, confirmations, and ticket pressure front and center, with supporting document, exception, and feed visibility beside them.',
      layout: {
        order: [
          'operations-queue',
          'operations-confirmation-ledger',
          'operations-snapshot',
          'operations-documents',
          'operations-credit-exceptions',
          'operations-option-expiry',
          'operations-coverage',
          'operations-feeds',
          'operations-system',
        ],
        spans: {
          'operations-queue': 'wide',
          'operations-confirmation-ledger': 'wide',
          'operations-snapshot': 'half',
          'operations-documents': 'half',
          'operations-credit-exceptions': 'half',
          'operations-option-expiry': 'wide',
          'operations-coverage': 'half',
          'operations-feeds': 'half',
          'operations-system': 'half',
        },
        sections: {
          'operations-snapshot-cards': [
            'open-workflow',
            'blocked-queue',
            'due-next-48h',
            'unassigned',
            'active-credit-exceptions',
            'option-expiry-alerts',
          ],
        },
      },
    },
  ],
}

export function getWorkspaceLayoutPresets(
  workspaceId: PersonalizableWorkspaceId,
): WorkspaceLayoutPreset[] {
  return WORKSPACE_LAYOUT_PRESETS[workspaceId] ?? []
}

export function resolveWorkspaceLayoutPresets(
  workspaceId: PersonalizableWorkspaceId,
  tiles: WorkspaceTileLayoutSpec[],
  sections: WorkspaceTileSectionLayoutSpec[],
): ResolvedWorkspaceLayoutPreset[] {
  return getWorkspaceLayoutPresets(workspaceId).map((preset) => ({
    ...preset,
    layout: sanitizeLayout(tiles, sections, preset.layout),
  }))
}
