import { describe, expect, it } from 'vitest'

import { buildWikiDescendantIdSet, buildWikiPageTree, filterWikiPageTree } from '../src/workspaces/docs/wikiTree'

const pages = [
  {
    page_id: 'root',
    parent_page_id: null,
    title: 'Desk Handbook',
    summary: 'Desk-wide onboarding context.',
    child_count: 2,
    word_count: 12,
    sort_order: 100,
    created_at: '2026-05-16T12:00:00Z',
    created_by: 'ops_admin',
    updated_at: '2026-05-16T12:00:00Z',
    updated_by: 'ops_admin',
    version: 1,
  },
  {
    page_id: 'child-a',
    parent_page_id: 'root',
    title: 'Confirmations',
    summary: 'Confirmation runbook for operations.',
    child_count: 1,
    word_count: 10,
    sort_order: 100,
    created_at: '2026-05-16T12:00:00Z',
    created_by: 'ops_admin',
    updated_at: '2026-05-16T12:00:00Z',
    updated_by: 'ops_admin',
    version: 1,
  },
  {
    page_id: 'grandchild',
    parent_page_id: 'child-a',
    title: 'Mismatch Triage',
    summary: 'How to clear pricing and economics mismatches.',
    child_count: 0,
    word_count: 8,
    sort_order: 100,
    created_at: '2026-05-16T12:00:00Z',
    created_by: 'ops_admin',
    updated_at: '2026-05-16T12:00:00Z',
    updated_by: 'ops_admin',
    version: 1,
  },
  {
    page_id: 'child-b',
    parent_page_id: 'root',
    title: 'Settlement',
    summary: 'Cash and invoice controls.',
    child_count: 0,
    word_count: 8,
    sort_order: 200,
    created_at: '2026-05-16T12:00:00Z',
    created_by: 'ops_admin',
    updated_at: '2026-05-16T12:00:00Z',
    updated_by: 'ops_admin',
    version: 1,
  },
]

describe('buildWikiPageTree', () => {
  it('nests children underneath their parents in sort order', () => {
    const tree = buildWikiPageTree(pages)

    expect(tree).toHaveLength(1)
    expect(tree[0].title).toBe('Desk Handbook')
    expect(tree[0].children.map((page) => page.title)).toEqual(['Confirmations', 'Settlement'])
    expect(tree[0].children[0].children[0].title).toBe('Mismatch Triage')
  })
})

describe('filterWikiPageTree', () => {
  it('keeps matching descendants and their ancestor path', () => {
    const tree = buildWikiPageTree(pages)
    const filtered = filterWikiPageTree(tree, 'mismatch')

    expect(filtered).toHaveLength(1)
    expect(filtered[0].title).toBe('Desk Handbook')
    expect(filtered[0].children).toHaveLength(1)
    expect(filtered[0].children[0].title).toBe('Confirmations')
    expect(filtered[0].children[0].children[0].title).toBe('Mismatch Triage')
  })
})

describe('buildWikiDescendantIdSet', () => {
  it('returns every nested descendant for cycle prevention', () => {
    expect(buildWikiDescendantIdSet(pages, 'root')).toEqual(new Set(['child-a', 'child-b', 'grandchild']))
    expect(buildWikiDescendantIdSet(pages, 'child-a')).toEqual(new Set(['grandchild']))
  })
})
