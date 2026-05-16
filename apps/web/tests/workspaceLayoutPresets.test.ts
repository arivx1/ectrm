import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { TileLayout, type WorkspaceTile } from '../src/shared/ui/TileLayout'
import type { WorkspaceTileLayoutSpec, WorkspaceTileSectionLayoutSpec } from '../src/shared/tileLayoutState'
import {
  getWorkspaceLayoutPresets,
  resolveWorkspaceLayoutPresets,
} from '../src/shared/workspaceLayoutPresets'

function tileSpec(
  id: string,
  availableSpans: WorkspaceTileLayoutSpec['availableSpans'] = ['full', 'wide'],
): WorkspaceTileLayoutSpec {
  return {
    id,
    span: 'full',
    availableSpans,
  }
}

describe('workspace layout presets', () => {
  test('exposes terminal familiarity presets across the target workspaces', () => {
    expect(getWorkspaceLayoutPresets('dashboard').map((preset) => preset.label)).toContain('Market Overview')
    expect(getWorkspaceLayoutPresets('risk').map((preset) => preset.label)).toContain('Risk Board')
    expect(getWorkspaceLayoutPresets('operations').map((preset) => preset.label)).toContain(
      'Operations Monitor',
    )
  })

  test('sanitizes missing dashboard tiles when a preset is resolved against a changed workspace', () => {
    const presets = resolveWorkspaceLayoutPresets(
      'dashboard',
      [
        tileSpec('desk-snapshot'),
        tileSpec('market-prices'),
        tileSpec('position-snapshot', ['full', 'wide', 'half']),
        tileSpec('operational-attention', ['full', 'wide', 'half', 'side']),
        tileSpec('recent-timeline', ['full', 'wide', 'half', 'side']),
        tileSpec('market-context'),
        tileSpec('weather-intelligence'),
      ],
      [],
    )

    const preset = presets.find((candidate) => candidate.id === 'market-overview')
    expect(preset).not.toBeNull()
    expect(preset?.layout.order).toEqual([
      'desk-snapshot',
      'market-prices',
      'position-snapshot',
      'operational-attention',
      'recent-timeline',
      'market-context',
      'weather-intelligence',
    ])
    expect(preset?.layout.hidden).toEqual([])
    expect(preset?.layout.spans).toEqual({
      'desk-snapshot': 'wide',
      'market-prices': 'wide',
      'operational-attention': 'side',
      'position-snapshot': 'half',
      'recent-timeline': 'half',
    })
  })

  test('preserves the intended risk summary card order inside sectioned presets', () => {
    const riskSummarySection: WorkspaceTileSectionLayoutSpec = {
      id: 'risk-summary-cards',
      itemIds: [
        'gross-linear-exposure',
        'pricing-coverage',
        'largest-linear-class',
        'largest-linear-ticket',
        'open-option-tickets',
        'net-option-delta-proxy',
        'premium-at-risk',
        'marked-open-options',
        'itm-open-options',
        'profitable-at-mark',
        'expiry-alerts',
        'booked-option-pairs',
        'net-package-cashflow',
        'next-option-expiry',
      ],
    }

    const presets = resolveWorkspaceLayoutPresets(
      'risk',
      [
        tileSpec('risk-summary'),
        tileSpec('risk-exposure', ['full', 'wide', 'half']),
        tileSpec('risk-pricing', ['full', 'wide', 'half']),
        tileSpec('risk-option-expiry-queue'),
        tileSpec('risk-open-option-marks'),
        tileSpec('risk-option-settlements'),
        tileSpec('risk-books'),
      ],
      [riskSummarySection],
    )

    const preset = presets.find((candidate) => candidate.id === 'risk-board')
    expect(preset).not.toBeNull()
    expect(preset?.layout.sections['risk-summary-cards'].slice(0, 6)).toEqual([
      'gross-linear-exposure',
      'net-option-delta-proxy',
      'pricing-coverage',
      'expiry-alerts',
      'largest-linear-class',
      'largest-linear-ticket',
    ])
  })

  test('tile layout renders the monitor preset chooser for workspaces with preset support', () => {
    const tiles: WorkspaceTile[] = [
      {
        id: 'desk-snapshot',
        eyebrow: 'Desk',
        title: 'Desk Snapshot',
        description: 'Summary tile.',
        span: 'full',
        availableSpans: ['full', 'wide'],
        content: createElement('div', null, 'Desk'),
      },
      {
        id: 'market-prices',
        eyebrow: 'Markets',
        title: 'Market Prices',
        description: 'Market tile.',
        span: 'full',
        availableSpans: ['full', 'wide'],
        content: createElement('div', null, 'Prices'),
      },
    ]

    const markup = renderToStaticMarkup(
      createElement(TileLayout, {
        workspaceId: 'dashboard',
        workspaceLabel: 'Live Desk',
        authSession: null,
        tiles,
      }),
    )

    assert.match(markup, /Monitor preset/)
    assert.match(markup, /Personal layout/)
    assert.match(markup, /Market Overview/)
  })
})
