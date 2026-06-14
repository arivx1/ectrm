import assert from 'node:assert/strict'

import { test } from 'vitest'

import { searchWikiPages } from '../src/entities/wiki/api'

test('searchWikiPages builds the ranked search URL and auth headers', async () => {
  const originalFetch = globalThis.fetch
  const requests: { url: string; init?: RequestInit }[] = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    return new Response(
      JSON.stringify({
        query: 'cash handoff',
        result_count: 1,
        results: [
          {
            page: {
              page_id: 'wiki-settlement',
              parent_page_id: null,
              title: 'Settlement Runbook',
              summary: 'Cash handoff notes.',
              links: [],
              child_count: 0,
              word_count: 3,
              sort_order: 100,
              created_at: '2026-05-16T12:00:00Z',
              created_by: 'ops_admin',
              updated_at: '2026-05-16T12:00:00Z',
              updated_by: 'ops_admin',
              is_archived: false,
              archived_at: null,
              archived_by: null,
              version: 1,
            },
            score: 120,
            snippet: 'Cash handoff notes.',
            matched_terms: ['cash', 'handoff'],
            match_reasons: ['content phrase'],
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }) as typeof fetch

  try {
    const payload = await searchWikiPages('http://api.test', 'wiki-token', 'cash handoff', {
      includeArchived: true,
      limit: 8,
    })

    assert.equal(payload.results[0]?.page.page_id, 'wiki-settlement')
    assert.equal(
      requests[0]?.url,
      'http://api.test/wiki/pages/search?q=cash+handoff&include_archived=true&limit=8',
    )
    const headers = new Headers(requests[0]?.init?.headers)
    assert.equal(headers.get('Authorization'), 'Bearer wiki-token')
  } finally {
    globalThis.fetch = originalFetch
  }
})
