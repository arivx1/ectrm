import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildOptionExposureSummary,
  calculateDaysToExpiration,
  calculatePremiumCashflow,
  calculateUnderlyingEquivalentVolume,
} from '../src/shared/optionExposure.ts'

test('option exposure helper calculates signed delta proxy and premium cashflow', () => {
  assert.equal(calculateUnderlyingEquivalentVolume('BUY', 'CALL', 12), 12)
  assert.equal(calculateUnderlyingEquivalentVolume('BUY', 'PUT', 12), -12)
  assert.equal(calculateUnderlyingEquivalentVolume('SELL', 'CALL', 12), -12)
  assert.equal(calculateUnderlyingEquivalentVolume('SELL', 'PUT', 12), 12)

  assert.equal(calculatePremiumCashflow('BUY', 4.25, 12), 51)
  assert.equal(calculatePremiumCashflow('SELL', 4.25, 12), -51)
})

test('option exposure summary groups option exposure and identifies the next expiry', () => {
  const summary = buildOptionExposureSummary(
    [
      {
        trade_id: 'T-OPTION-1',
        book: 'CRUDE_PHYS',
        portfolio: null,
        counterparty: null,
        commodity_class: 'CRUDE_OIL',
        commodity: 'WTI',
        trade_side: 'BUY',
        option_type: 'CALL',
        option_style: 'AMERICAN',
        option_strike_price: 82.5,
        option_expiration_date: '2026-04-10',
        contract_volume: 12,
        premium_price: 4.25,
        premium_cashflow: 51,
        underlying_equivalent_volume: 12,
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-06T12:00:00Z',
      },
      {
        trade_id: 'T-OPTION-2',
        book: 'CRUDE_PHYS',
        portfolio: null,
        counterparty: null,
        commodity_class: 'CRUDE_OIL',
        commodity: 'WTI',
        trade_side: 'SELL',
        option_type: 'PUT',
        option_style: 'EUROPEAN',
        option_strike_price: 75,
        option_expiration_date: '2026-04-08',
        contract_volume: 5,
        premium_price: 2,
        premium_cashflow: -10,
        underlying_equivalent_volume: 5,
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-06T12:30:00Z',
      },
    ],
    new Date('2026-04-06T00:00:00Z'),
  )

  assert.equal(summary.optionCount, 2)
  assert.equal(summary.grossContracts, 17)
  assert.equal(summary.netUnderlyingEquivalentVolume, 17)
  assert.equal(summary.grossPremiumAtRisk, 61)
  assert.deepEqual(summary.exposureByClass, [
    {
      commodityClass: 'CRUDE_OIL',
      underlyingEquivalentVolume: 17,
    },
  ])
  assert.equal(summary.soonestExpirationTradeId, 'T-OPTION-2')
  assert.equal(summary.soonestExpirationDate, '2026-04-08')
  assert.equal(summary.soonestExpirationDays, 2)
  assert.equal(calculateDaysToExpiration('2026-04-08', new Date('2026-04-06T00:00:00Z')), 2)
})
