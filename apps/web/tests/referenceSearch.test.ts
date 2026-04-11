import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildReferenceSearchDisplayValue,
  buildVisibleReferenceSearchOptions,
  findReferenceSearchMatch,
} from '../src/features/trades/referenceSearch.ts'

const books = [
  { code: 'ERCOT_POWER', name: 'ERCOT Power Desk' },
  { code: 'GULF_GAS', name: 'Gulf Gas Book' },
  { code: 'NEPOOL', name: 'NEPOOL Prompt' },
] as const

test('buildReferenceSearchDisplayValue keeps search selections readable', () => {
  assert.equal(buildReferenceSearchDisplayValue(books[0]), 'ERCOT Power Desk (ERCOT_POWER)')
  assert.equal(buildReferenceSearchDisplayValue(null), '')
})

test('findReferenceSearchMatch resolves exact code, name, and combined display values', () => {
  assert.equal(findReferenceSearchMatch(books, 'gulf_gas')?.code, 'GULF_GAS')
  assert.equal(findReferenceSearchMatch(books, 'NEPOOL Prompt')?.code, 'NEPOOL')
  assert.equal(findReferenceSearchMatch(books, 'ERCOT Power Desk (ERCOT_POWER)')?.code, 'ERCOT_POWER')
  assert.equal(findReferenceSearchMatch(books, 'missing'), null)
})

test('buildVisibleReferenceSearchOptions keeps the current selection on top when the query is empty', () => {
  assert.deepEqual(
    buildVisibleReferenceSearchOptions(books, '', 'GULF_GAS', (book) => book.code, 3).map((option) => option.code),
    ['GULF_GAS', 'ERCOT_POWER', 'NEPOOL'],
  )
})

test('buildVisibleReferenceSearchOptions ranks exact and fuzzy matches ahead of looser hits', () => {
  assert.deepEqual(
    buildVisibleReferenceSearchOptions(books, 'erc', '', (book) => book.code, 3).map((option) => option.code),
    ['ERCOT_POWER'],
  )

  assert.deepEqual(
    buildVisibleReferenceSearchOptions(books, 'prompt', '', (book) => book.code, 3).map((option) => option.code),
    ['NEPOOL'],
  )
})
