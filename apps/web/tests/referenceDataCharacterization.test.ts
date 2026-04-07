import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildCounterpartyCreditProfileForm,
  parseDelimitedLine,
  parsePastedGrid,
  resolveBookPasteMapping,
  stageBooksFromPasteInput,
} from '../src/features/reference-data/useReferenceDataController.ts'
import {
  emptyCounterpartyForm,
  emptyLocationForm,
  resolveSelectedCode,
} from '../src/features/reference-data/useReferenceDataWorkspace.ts'

test('resolveSelectedCode preserves missing selections only when explicitly requested', () => {
  const records = [
    { code: 'BOOK_A' },
    { code: 'BOOK_B' },
  ]

  assert.equal(resolveSelectedCode('BOOK_Z', records, { preserveMissingSelection: true }), 'BOOK_Z')
  assert.equal(resolveSelectedCode('BOOK_Z', records), 'BOOK_A')
  assert.equal(resolveSelectedCode(null, records), 'BOOK_A')
  assert.equal(resolveSelectedCode(null, []), null)
})

test('emptyLocationForm follows location standards and falls back to the first type when needed', () => {
  assert.deepEqual(
    emptyLocationForm({
      default_location_kind: 'POINT',
      default_location_type_by_kind: { POINT: 'HUB' },
      location_kinds: ['POINT'],
      location_types_by_kind: { POINT: ['HUB', 'PLANT'] },
      market_codes: [],
      continent_codes: [],
    }),
    {
      code: '',
      name: '',
      location_kind: 'POINT',
      location_type: 'HUB',
      parent_location_code: '',
      market: '',
      city: '',
      subdivision_code: '',
      country_code: '',
      continent_code: '',
      latitude: '',
      longitude: '',
      region: '',
      timezone: '',
      description: '',
    },
  )

  assert.equal(
    emptyLocationForm({
      default_location_kind: 'REGION',
      default_location_type_by_kind: {},
      location_kinds: ['REGION'],
      location_types_by_kind: { REGION: ['ISO', 'MARKET'] },
      market_codes: [],
      continent_codes: [],
    }).location_type,
    'ISO',
  )
})

test('emptyCounterpartyForm respects counterparty standard defaults', () => {
  assert.deepEqual(
    emptyCounterpartyForm({
      default_counterparty_type: 'BROKER',
      counterparty_types: ['BROKER'],
      default_counterparty_credit_status: 'WATCHLIST',
      counterparty_credit_statuses: ['WATCHLIST'],
      default_counterparty_credit_breach_action: 'BLOCK',
      counterparty_credit_breach_actions: ['BLOCK'],
    }),
    {
      code: '',
      name: '',
      short_name: '',
      legal_entity_name: '',
      counterparty_type: 'BROKER',
      country_code: '',
      lei_code: '',
      duns_number: '',
      ticker_symbol: '',
      credit_status: 'WATCHLIST',
      description: '',
    },
  )
})

test('parseDelimitedLine and parsePastedGrid keep quoted comma content intact', () => {
  assert.deepEqual(parseDelimitedLine('BOOK_A,"Prompt, East",Desk note', ','), [
    'BOOK_A',
    'Prompt, East',
    'Desk note',
  ])

  assert.deepEqual(parsePastedGrid('Code,Name,Description\nBOOK_A,"Prompt, East",Desk note'), {
    rows: [
      ['Code', 'Name', 'Description'],
      ['BOOK_A', 'Prompt, East', 'Desk note'],
    ],
    delimiter: 'comma',
  })
})

test('resolveBookPasteMapping accepts header synonyms and rejects partial header rows', () => {
  assert.deepEqual(resolveBookPasteMapping([['Book Code', 'Book Name', 'Notes'], ['BOOK_A', 'Prompt', 'Desk note']]), {
    codeIndex: 0,
    nameIndex: 1,
    descriptionIndex: 2,
    startIndex: 1,
    usedHeader: true,
  })

  assert.deepEqual(resolveBookPasteMapping([['Code', 'Notes'], ['BOOK_A', 'Desk note']]), {
    error: 'Header rows must include Code and Name columns. Description is optional.',
  })
})

test('stageBooksFromPasteInput clears descriptions when the pasted description column is present but blank', () => {
  const result = stageBooksFromPasteInput({
    input: [
      'Code\tName\tDescription',
      'BOOK_A\tPrompt Crude',
      'BOOK_B\t',
      '\tMissing Code\tIgnored',
      'BOOK_C\tWest Desk\tFresh draft',
    ].join('\n'),
    books: [
      { code: 'BOOK_A', name: 'Legacy Prompt', description: 'Legacy note', is_active: true },
      { code: 'BOOK_B', name: 'Current Book B', description: 'Current note', is_active: true },
    ],
    existingDrafts: {
      BOOK_A: { code: 'BOOK_A', name: 'Legacy Prompt', description: 'Staged note' },
    },
    existingApplyErrors: {
      BOOK_A: 'Old error',
      BOOK_Z: 'Keep unrelated error',
    },
  })

  assert.deepEqual(result.nextDrafts, {
    BOOK_A: { code: 'BOOK_A', name: 'Prompt Crude', description: '' },
    BOOK_B: { code: 'BOOK_B', name: '', description: '' },
    BOOK_C: { code: 'BOOK_C', name: 'West Desk', description: 'Fresh draft' },
  })
  assert.deepEqual(result.nextApplyErrors, {
    BOOK_B: 'Name is required.',
    BOOK_Z: 'Keep unrelated error',
  })
  assert.deepEqual(result.summary, {
    total_rows: 4,
    staged_rows: 3,
    new_rows: 1,
    updated_rows: 2,
    invalid_rows: 1,
    unchanged_rows: 0,
    blocked_rows: 1,
    issues: [{ row_number: 4, code: null, message: 'Missing Code.' }],
    used_header: true,
    delimiter: 'tab',
  })
  assert.equal(result.successMessage, 'Staged 3 pasted book rows.')
  assert.equal(result.errorMessage, '2 pasted rows need attention before apply.')
})

test('stageBooksFromPasteInput clears unchanged staged drafts and reports a no-op paste', () => {
  const result = stageBooksFromPasteInput({
    input: 'Code,Name,Description\nBOOK_A,Prompt Book,Desk note',
    books: [
      { code: 'BOOK_A', name: 'Prompt Book', description: 'Desk note', is_active: true },
    ],
    existingDrafts: {
      BOOK_A: { code: 'BOOK_A', name: 'Prompt Book', description: 'Desk note' },
    },
    existingApplyErrors: {
      BOOK_A: 'Stale error',
    },
  })

  assert.deepEqual(result.nextDrafts, {})
  assert.deepEqual(result.nextApplyErrors, {})
  assert.deepEqual(result.summary, {
    total_rows: 1,
    staged_rows: 0,
    new_rows: 0,
    updated_rows: 0,
    invalid_rows: 0,
    unchanged_rows: 1,
    blocked_rows: 0,
    issues: [],
    used_header: true,
    delimiter: 'comma',
  })
  assert.equal(
    result.successMessage,
    'Paste matched 1 existing book row but added no new staged changes.',
  )
  assert.equal(result.errorMessage, '')
})

test('buildCounterpartyCreditProfileForm falls back to the standard breach action and stringifies amounts', () => {
  assert.deepEqual(
    buildCounterpartyCreditProfileForm(
      {
        counterparty_code: 'CP-1',
        credit_rating: 'BBB+',
        review_due_at: '2026-04-30',
        limit_currency_code: 'USD',
        limit_amount: 1250000,
        breach_action: null,
        notes: 'Watch closely',
        created_at: '2026-04-01T00:00:00Z',
        created_by: 'ops',
        updated_at: '2026-04-02T00:00:00Z',
        updated_by: 'ops',
        version: 2,
      },
      {
        default_counterparty_type: 'CUSTOMER',
        counterparty_types: ['CUSTOMER'],
        default_counterparty_credit_status: 'APPROVED',
        counterparty_credit_statuses: ['APPROVED'],
        default_counterparty_credit_breach_action: 'REQUIRE_APPROVAL',
        counterparty_credit_breach_actions: ['REQUIRE_APPROVAL'],
      },
    ),
    {
      credit_rating: 'BBB+',
      review_due_at: '2026-04-30',
      limit_currency_code: 'USD',
      limit_amount: '1250000',
      breach_action: 'REQUIRE_APPROVAL',
      notes: 'Watch closely',
    },
  )
})
