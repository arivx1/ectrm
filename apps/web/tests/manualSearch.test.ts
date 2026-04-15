import { describe, expect, it } from 'vitest'

import userManualMarkdown from '../../../docs/user-manual.md?raw'
import { filterGuideSections, parseMarkdownDocument } from '../src/workspaces/docs/DocumentationWorkspace'

describe('manual search helpers', () => {
  const guide = parseMarkdownDocument(userManualMarkdown)

  it('returns the full manual when the query is empty', () => {
    expect(filterGuideSections(guide.sections, '')).toHaveLength(guide.sections.length)
  })

  it('matches operator tasks and symptoms across titles and section body text', () => {
    const matchingTitles = filterGuideSections(guide.sections, 'invoice missing').map((section) => section.title)

    expect(matchingTitles).toEqual(expect.arrayContaining(['Task Playbooks', 'Troubleshooting Matrix']))
  })

  it('normalizes punctuation-heavy queries like sign-in', () => {
    const matchingTitles = filterGuideSections(guide.sections, 'sign-in').map((section) => section.title)

    expect(matchingTitles).toEqual(expect.arrayContaining(['Task Playbooks', 'Access And Safe Use']))
  })

  it('finds amendment guidance without requiring an exact heading match', () => {
    const matchingTitles = filterGuideSections(guide.sections, 'trade amendment').map((section) => section.title)

    expect(matchingTitles).toEqual(expect.arrayContaining(['Task Playbooks', 'Book Or Amend A Trade']))
  })
})
