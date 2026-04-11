import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildCounterpartySearchDisplayValue,
  buildCounterpartySearchSelectionLabel,
  buildVisibleCounterpartySearchOptions,
  findCounterpartySearchMatch,
} from '../src/features/trades/counterpartySearch.ts'

const counterparties = [
  {
    code: 'ALPHA_GAS',
    name: 'Alpha Gas Marketing',
    credit_status: 'APPROVED',
  },
  {
    code: 'BETA_PWR',
    name: 'Beta Power Trading',
    credit_status: 'ON_HOLD',
  },
  {
    code: 'CASCADE',
    name: 'Cascade Renewables',
    credit_status: 'REVIEW_REQUIRED',
  },
] as const

test('buildCounterpartySearchDisplayValue keeps the visible selection readable', () => {
  assert.equal(buildCounterpartySearchDisplayValue(counterparties[0]), 'Alpha Gas Marketing (ALPHA_GAS)')
  assert.equal(buildCounterpartySearchDisplayValue(null), '')
})

test('buildCounterpartySearchSelectionLabel surfaces non-approved status in the confirmed selection state', () => {
  assert.equal(buildCounterpartySearchSelectionLabel(counterparties[0]), 'Submitting as ALPHA_GAS.')
  assert.equal(buildCounterpartySearchSelectionLabel(counterparties[1]), 'Submitting as BETA_PWR · ON HOLD.')
})

test('findCounterpartySearchMatch resolves exact code, name, and combined display values', () => {
  assert.equal(findCounterpartySearchMatch(counterparties, 'beta_pwr')?.code, 'BETA_PWR')
  assert.equal(findCounterpartySearchMatch(counterparties, 'Cascade Renewables')?.code, 'CASCADE')
  assert.equal(findCounterpartySearchMatch(counterparties, 'Alpha Gas Marketing (ALPHA_GAS)')?.code, 'ALPHA_GAS')
  assert.equal(findCounterpartySearchMatch(counterparties, 'missing'), null)
})

test('buildVisibleCounterpartySearchOptions keeps the selected counterparty visible when the field is empty', () => {
  assert.deepEqual(
    buildVisibleCounterpartySearchOptions(counterparties, '', 'BETA_PWR', 3).map((option) => option.code),
    ['BETA_PWR', 'ALPHA_GAS', 'CASCADE'],
  )
})

test('buildVisibleCounterpartySearchOptions ranks exact code and fuzzy name matches ahead of looser hits', () => {
  assert.deepEqual(
    buildVisibleCounterpartySearchOptions(counterparties, 'cas', '', 3).map((option) => option.code),
    ['CASCADE'],
  )

  assert.deepEqual(
    buildVisibleCounterpartySearchOptions(counterparties, 'beta', '', 3).map((option) => option.code),
    ['BETA_PWR'],
  )

  assert.deepEqual(
    buildVisibleCounterpartySearchOptions(counterparties, 'power', '', 3).map((option) => option.code),
    ['BETA_PWR'],
  )
})
