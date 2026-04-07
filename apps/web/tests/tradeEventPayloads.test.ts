import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildCreateTradeSubmission,
  type TradeEditorValues,
} from '../src/features/trades/tradeEventPayloads.ts'

function buildBaseValues(overrides: Partial<TradeEditorValues> = {}): TradeEditorValues {
  return {
    tradeId: 'T-OPTION-1',
    externalTradeId: '',
    sourceSystem: 'ETRM',
    executionTimestamp: '',
    tradeDate: '',
    effectiveStartDate: '',
    effectiveEndDate: '',
    qualitySpec: '',
    unitOfMeasure: '',
    tradeCurrencyCode: '',
    locationCode: '',
    deliveryStart: '',
    deliveryEnd: '',
    priceUnitCode: '',
    instrumentType: 'LINEAR',
    optionType: 'CALL',
    optionStyle: 'AMERICAN',
    optionExpirationDate: '',
    optionStrikePriceInput: '',
    tradeNature: 'PHYSICAL',
    tradeStructure: 'SINGLE',
    tradeSide: 'BUY',
    book: 'CRUDE_PHYS',
    portfolio: '',
    counterparty: '',
    commodityClass: 'CRUDE_OIL',
    commodity: 'WTI',
    pricingType: 'FIXED',
    pricingStatus: 'PENDING',
    confirmationStatus: 'PENDING',
    nominationStatus: 'PENDING',
    allocationStatus: 'PENDING',
    priceIndexCode: '',
    priceInput: '80.25',
    volumeInput: '100',
    invoiceStatus: 'PENDING',
    paymentStatus: 'PENDING',
    settlementStatus: 'PENDING',
    traderUser: '',
    legs: [],
    ...overrides,
  }
}

test('buildCreateTradeSubmission includes option fields for option trades', () => {
  const submission = buildCreateTradeSubmission(
    buildBaseValues({
      tradeId: 'T-OPTION-CREATE-1',
      instrumentType: 'OPTION',
      tradeNature: 'FINANCIAL',
      tradeStructure: 'SINGLE',
      pricingType: 'FIXED',
      priceInput: '4.25',
      volumeInput: '12',
      optionType: 'CALL',
      optionStyle: 'EUROPEAN',
      optionExpirationDate: '2026-06-30',
      optionStrikePriceInput: '82.5',
    }),
  )

  assert.equal(submission.tradeId, 'T-OPTION-CREATE-1')
  assert.equal(submission.validationError, null)
  assert.equal(submission.payload.instrument_type, 'OPTION')
  assert.equal(submission.payload.trade_nature, 'FINANCIAL')
  assert.equal(submission.payload.trade_structure, 'SINGLE')
  assert.equal(submission.payload.option_type, 'CALL')
  assert.equal(submission.payload.option_style, 'EUROPEAN')
  assert.equal(submission.payload.option_expiration_date, '2026-06-30')
  assert.equal(submission.payload.option_strike_price, 82.5)
  assert.equal(submission.payload.price, 4.25)
  assert.equal(submission.payload.volume, 12)
})

test('buildCreateTradeSubmission rejects option trades missing strike price', () => {
  const submission = buildCreateTradeSubmission(
    buildBaseValues({
      tradeId: 'T-OPTION-INVALID-1',
      instrumentType: 'OPTION',
      tradeNature: 'FINANCIAL',
      tradeStructure: 'SINGLE',
      pricingType: 'FIXED',
      priceInput: '4.25',
      volumeInput: '12',
      optionType: 'PUT',
      optionStyle: 'AMERICAN',
      optionExpirationDate: '2026-06-30',
      optionStrikePriceInput: '',
    }),
  )

  assert.equal(submission.validationError, 'Strike Price is required for options.')
})
