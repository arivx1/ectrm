import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WIKI_PAGE_TEMPLATE_KEY,
  WIKI_PAGE_TEMPLATES,
  buildWikiPageTemplateDraft,
  resolveWikiPageTemplate,
} from '../src/workspaces/docs/wikiTemplates'

describe('wiki page templates', () => {
  it('keeps blank page creation backward-compatible by default', () => {
    expect(DEFAULT_WIKI_PAGE_TEMPLATE_KEY).toBe('blank')
    expect(buildWikiPageTemplateDraft(DEFAULT_WIKI_PAGE_TEMPLATE_KEY)).toEqual({
      title: 'Untitled Page',
      contentMarkdown: '',
    })
  })

  it('provides deterministic markdown scaffolds for common wiki page types', () => {
    const templateLabels = WIKI_PAGE_TEMPLATES.map((template) => template.label)

    expect(templateLabels).toEqual([
      'Blank',
      'Runbook',
      'Decision',
      'Policy',
      'FAQ',
      'Meeting Notes',
    ])
    expect(buildWikiPageTemplateDraft('runbook')).toEqual({
      title: 'Untitled Runbook',
      contentMarkdown: expect.stringContaining('## Stop Conditions'),
    })
  })

  it('falls back to the blank template for unknown keys', () => {
    expect(resolveWikiPageTemplate('not-a-real-template').key).toBe('blank')
  })
})
