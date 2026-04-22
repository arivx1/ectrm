import { describe, expect, it } from 'vitest'

import {
  authGateManualSectionId,
  manualSectionIdForView,
  normalizeManualSectionId,
  relatedHelpForManualSection,
} from '../src/workspaces/docs/manualNavigation'

describe('manual navigation helpers', () => {
  it('maps representative workspaces to the most relevant manual section', () => {
    expect(manualSectionIdForView('prompt')).toBe('start-here')
    expect(manualSectionIdForView('dashboard')).toBe('start-here')
    expect(manualSectionIdForView('pretrade')).toBe('book-or-amend-a-trade')
    expect(manualSectionIdForView('trades')).toBe('book-or-amend-a-trade')
    expect(manualSectionIdForView('risk')).toBe('investigate-a-trade-or-exposure-question')
    expect(manualSectionIdForView('operations')).toBe('run-post-trade-work')
    expect(manualSectionIdForView('settlement')).toBe('troubleshooting-matrix')
    expect(manualSectionIdForView('settings')).toBe('access-and-safe-use')
  })

  it('routes auth-gate help to the access and safe use section', () => {
    expect(authGateManualSectionId()).toBe('access-and-safe-use')
  })

  it('normalizes unknown section ids safely', () => {
    expect(normalizeManualSectionId('visual-walkthroughs')).toBe('visual-walkthroughs')
    expect(normalizeManualSectionId('definitely-not-a-section')).toBe('start-here')
    expect(normalizeManualSectionId(null)).toBe('start-here')
  })

  it('returns related help links for the active section context', () => {
    const relatedHelp = relatedHelpForManualSection('book-or-amend-a-trade')

    expect(relatedHelp.title).toBe('Related Help')
    expect(relatedHelp.sectionLinks).toEqual([
      expect.objectContaining({ sectionId: 'investigate-a-trade-or-exposure-question' }),
      expect.objectContaining({ sectionId: 'troubleshooting-matrix' }),
    ])
    expect(relatedHelp.workspaceLinks).toEqual([
      expect.objectContaining({ view: 'trades', label: 'Open Trade Capture' }),
    ])
  })
})
