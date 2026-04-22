import { describe, expect, it } from 'vitest'

import {
  APP_VIEWS,
  HERO_BODY_BY_VIEW,
  HERO_TITLE_BY_VIEW,
  workspaceLabel,
} from '../src/entities/app/appViews'
import { VIEW_BLOCKING_GROUPS, VIEW_DATA_GROUPS } from '../src/entities/app/workspaceLoading'

describe('workspace registry', () => {
  it('keeps every app view backed by shared metadata', () => {
    const viewKeys = APP_VIEWS.map((view) => view.key)

    expect(new Set(Object.keys(VIEW_DATA_GROUPS))).toEqual(new Set(viewKeys))
    expect(new Set(Object.keys(VIEW_BLOCKING_GROUPS))).toEqual(new Set(viewKeys))
    expect(new Set(Object.keys(HERO_TITLE_BY_VIEW))).toEqual(new Set(viewKeys))
    expect(new Set(Object.keys(HERO_BODY_BY_VIEW))).toEqual(new Set(viewKeys))
  })

  it('preserves representative workspace loading contracts', () => {
    expect(VIEW_DATA_GROUPS.prompt).toEqual([])
    expect(VIEW_DATA_GROUPS.dashboard).toEqual(['trades', 'events', 'positions', 'reference'])
    expect(VIEW_DATA_GROUPS.operations).toEqual(['trades', 'deliveries', 'operations', 'admin'])
    expect(VIEW_BLOCKING_GROUPS.settlement).toEqual(['trades', 'operations', 'settlement'])
    expect(VIEW_DATA_GROUPS.reports).toEqual(['trades', 'reports'])
  })

  it('preserves labels and hero copy through the registry', () => {
    expect(workspaceLabel('prompt')).toBe('Prompt Home')
    expect(workspaceLabel('assistant')).toBe('Assistant')
    expect(HERO_TITLE_BY_VIEW.prompt).toBe('Start from the prompt')
    expect(HERO_TITLE_BY_VIEW.dashboard).toBe('Live desk overview and market pulse')
    expect(HERO_BODY_BY_VIEW.reference).toContain('books')
  })
})
