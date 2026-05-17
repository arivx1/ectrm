export type WikiPageTemplateKey =
  | 'blank'
  | 'runbook'
  | 'decision'
  | 'policy'
  | 'faq'
  | 'meeting-notes'

export type WikiPageTemplate = {
  key: WikiPageTemplateKey
  label: string
  description: string
  title: string
  contentMarkdown: string
}

export type WikiPageTemplateDraft = {
  title: string
  contentMarkdown: string
}

export const DEFAULT_WIKI_PAGE_TEMPLATE_KEY: WikiPageTemplateKey = 'blank'

const BLANK_WIKI_PAGE_TEMPLATE: WikiPageTemplate = {
  key: 'blank',
  label: 'Blank',
  description: 'Start with an empty page and name it yourself.',
  title: 'Untitled Page',
  contentMarkdown: '',
}

export const WIKI_PAGE_TEMPLATES: WikiPageTemplate[] = [
  BLANK_WIKI_PAGE_TEMPLATE,
  {
    key: 'runbook',
    label: 'Runbook',
    description: 'Step-by-step operational guidance for repeatable work.',
    title: 'Untitled Runbook',
    contentMarkdown: [
      '# Untitled Runbook',
      '',
      '## Purpose',
      '',
      '- What job does this runbook help someone complete?',
      '',
      '## When To Use',
      '',
      '- Trigger or symptom:',
      '- Owning desk or role:',
      '- Required inputs:',
      '',
      '## Steps',
      '',
      '1. Confirm the source record or workflow item.',
      '2. Complete the required checks.',
      '3. Record the outcome and next owner.',
      '',
      '## Stop Conditions',
      '',
      '- Stop and escalate when:',
      '',
      '## Related Pages',
      '',
      '- Add wiki links with `[[Page Title]]`.',
    ].join('\n'),
  },
  {
    key: 'decision',
    label: 'Decision',
    description: 'Capture a durable decision, context, and follow-up owner.',
    title: 'Untitled Decision',
    contentMarkdown: [
      '# Untitled Decision',
      '',
      '## Decision',
      '',
      '- We decided to:',
      '',
      '## Context',
      '',
      '- Problem or opportunity:',
      '- Options considered:',
      '',
      '## Rationale',
      '',
      '- Why this path:',
      '- Tradeoffs accepted:',
      '',
      '## Follow-Up',
      '',
      '- Owner:',
      '- Review date:',
      '- Related pages:',
    ].join('\n'),
  },
  {
    key: 'policy',
    label: 'Policy',
    description: 'Set durable rules, exceptions, and review expectations.',
    title: 'Untitled Policy',
    contentMarkdown: [
      '# Untitled Policy',
      '',
      '## Policy',
      '',
      '- Rule:',
      '',
      '## Scope',
      '',
      '- Applies to:',
      '- Does not apply to:',
      '',
      '## Exceptions',
      '',
      '- Allowed exceptions:',
      '- Required approval:',
      '',
      '## Audit Notes',
      '',
      '- Evidence to retain:',
      '- Review cadence:',
    ].join('\n'),
  },
  {
    key: 'faq',
    label: 'FAQ',
    description: 'Collect common questions with crisp operational answers.',
    title: 'Untitled FAQ',
    contentMarkdown: [
      '# Untitled FAQ',
      '',
      '## Questions',
      '',
      '### What problem does this answer?',
      '',
      '- Answer:',
      '',
      '### Who owns this workflow?',
      '',
      '- Answer:',
      '',
      '### What should someone check first?',
      '',
      '- Answer:',
      '',
      '## Related Pages',
      '',
      '- Add wiki links with `[[Page Title]]`.',
    ].join('\n'),
  },
  {
    key: 'meeting-notes',
    label: 'Meeting Notes',
    description: 'Capture agenda, decisions, action items, and linked context.',
    title: 'Meeting Notes',
    contentMarkdown: [
      '# Meeting Notes',
      '',
      '## Details',
      '',
      '- Date:',
      '- Attendees:',
      '- Related pages:',
      '',
      '## Agenda',
      '',
      '-',
      '',
      '## Decisions',
      '',
      '-',
      '',
      '## Action Items',
      '',
      '- [ ] Owner - action item',
    ].join('\n'),
  },
]

export function resolveWikiPageTemplate(key: string): WikiPageTemplate {
  return (
    WIKI_PAGE_TEMPLATES.find((template) => template.key === key) ??
    BLANK_WIKI_PAGE_TEMPLATE
  )
}

export function buildWikiPageTemplateDraft(key: string): WikiPageTemplateDraft {
  const template = resolveWikiPageTemplate(key)
  return {
    title: template.title,
    contentMarkdown: template.contentMarkdown,
  }
}
