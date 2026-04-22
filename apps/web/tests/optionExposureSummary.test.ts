import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildOpenOptionActionQueue,
  buildOpenOptionValuation,
  buildOpenOptionValuationSummary,
  buildOptionExposureSummary,
  buildOptionSettlementSummary,
  buildOptionSettlementValuation,
  calculateDaysToExpiration,
  calculateOptionIntrinsicValue,
  calculatePremiumCashflow,
  calculateTradeCashflow,
  calculateUnderlyingEquivalentVolume,
  describeOptionMoneyness,
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

test('open option valuation uses the latest linked market mark for intrinsic value and moneyness', () => {
  const valuation = buildOpenOptionValuation(
    {
      trade_id: 'T-OPTION-OPEN-1',
      instrument_type: 'OPTION',
      status: 'ACTIVE',
      trade_side: 'BUY',
      option_type: 'CALL',
      option_style: 'AMERICAN',
      option_strike_price: 81,
      option_expiration_date: '2026-04-10',
      price: 3.5,
      price_index_code: 'WTI_M1',
      volume: 10,
      book: 'CRUDE_PHYS',
      commodity: 'WTI',
      trade_currency_code: 'USD',
      price_unit_code: 'BBL',
      updated_at: '2026-04-07T00:00:00Z',
    },
    {
      WTI_M1: {
        price_index_code: 'WTI_M1',
        value: 84,
        observation_date: '2026-04-07',
        downloaded_at: '2026-04-07T00:10:00Z',
        currency_code: 'USD',
        unit_code: 'BBL',
      },
    },
    new Date('2026-04-07T00:00:00Z'),
  )

  assert.ok(valuation)
  assert.equal(valuation?.referencePriceIndexCode, 'WTI_M1')
  assert.equal(valuation?.referencePrice, 84)
  assert.equal(valuation?.daysToExpiration, 3)
  assert.equal(valuation?.premiumCashflow, 35)
  assert.equal(valuation?.underlyingEquivalentVolume, 10)
  assert.equal(valuation?.markStatus, 'VALUED')
  assert.equal(valuation?.intrinsicValuePerUnit, 3)
  assert.equal(valuation?.intrinsicValue, 30)
  assert.equal(valuation?.intrinsicExposure, 30)
  assert.equal(valuation?.breakEvenPrice, 84.5)
  assert.equal(valuation?.expiryPnlAtMark, -5)
  assert.equal(valuation?.profitStateAtMark, 'LOSS_MAKING')
  assert.equal(valuation?.moneyness, 'ITM')
})

test('open option valuation summary groups marked, unpriced, and in-the-money tickets', () => {
  const summary = buildOpenOptionValuationSummary(
    [
      {
        trade_id: 'T-OPTION-OPEN-SHORT-PUT',
        instrument_type: 'OPTION',
        status: 'ACTIVE',
        trade_side: 'SELL',
        option_type: 'PUT',
        option_style: 'AMERICAN',
        option_strike_price: 80,
        option_expiration_date: '2026-04-09',
        price: 2,
        price_index_code: 'WTI_M2',
        volume: 5,
        book: 'CRUDE_PHYS',
        commodity: 'WTI',
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-07T01:00:00Z',
      },
      {
        trade_id: 'T-OPTION-OPEN-LONG-CALL',
        instrument_type: 'OPTION',
        status: 'ACTIVE',
        trade_side: 'BUY',
        option_type: 'CALL',
        option_style: 'AMERICAN',
        option_strike_price: 81,
        option_expiration_date: '2026-04-10',
        price: 3.5,
        price_index_code: 'WTI_M1',
        volume: 10,
        book: 'CRUDE_PHYS',
        commodity: 'WTI',
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-07T00:00:00Z',
      },
      {
        trade_id: 'T-OPTION-OPEN-AWAITING-MARK',
        instrument_type: 'OPTION',
        status: 'ACTIVE',
        trade_side: 'BUY',
        option_type: 'CALL',
        option_style: 'AMERICAN',
        option_strike_price: 90,
        option_expiration_date: '2026-04-11',
        price: 1.25,
        price_index_code: null,
        volume: 7,
        book: 'CRUDE_PHYS',
        commodity: 'WTI',
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-07T02:00:00Z',
      },
      {
        trade_id: 'T-OPTION-CLOSED-IGNORE',
        instrument_type: 'OPTION',
        status: 'EXPIRED',
        trade_side: 'BUY',
        option_type: 'CALL',
        option_style: 'AMERICAN',
        option_strike_price: 81,
        option_expiration_date: '2026-04-10',
        price: 1,
        price_index_code: 'WTI_M1',
        volume: 1,
        book: 'CRUDE_PHYS',
        commodity: 'WTI',
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-07T03:00:00Z',
      },
    ],
    {
      WTI_M1: {
        price_index_code: 'WTI_M1',
        value: 84,
        observation_date: '2026-04-07',
        downloaded_at: '2026-04-07T00:10:00Z',
        currency_code: 'USD',
        unit_code: 'BBL',
      },
      WTI_M2: {
        price_index_code: 'WTI_M2',
        value: 70,
        observation_date: '2026-04-07',
        downloaded_at: '2026-04-07T01:10:00Z',
        currency_code: 'USD',
        unit_code: 'BBL',
      },
    },
    new Date('2026-04-07T00:00:00Z'),
  )

  assert.equal(summary.optionCount, 3)
  assert.equal(summary.markedCount, 2)
  assert.equal(summary.awaitingMarkCount, 1)
  assert.equal(summary.inTheMoneyCount, 2)
  assert.equal(summary.expiringSoonCount, 3)
  assert.equal(summary.expiringTodayCount, 0)
  assert.equal(summary.pastExpiryCount, 0)
  assert.equal(summary.profitableCount, 0)
  assert.equal(summary.netIntrinsicExposure, -20)
  assert.equal(summary.grossIntrinsicExposure, 80)
  assert.equal(summary.netExpiryPnlAtMark, -45)
  assert.equal(summary.valuations[0]?.tradeId, 'T-OPTION-OPEN-SHORT-PUT')
  assert.equal(summary.valuations[0]?.intrinsicExposure, -50)
  assert.equal(summary.valuations[0]?.breakEvenPrice, 78)
  assert.equal(summary.valuations[0]?.expiryPnlAtMark, -40)
  assert.equal(summary.valuations[1]?.tradeId, 'T-OPTION-OPEN-LONG-CALL')
  assert.equal(summary.valuations[1]?.intrinsicExposure, 30)
  assert.equal(summary.valuations[1]?.breakEvenPrice, 84.5)
  assert.equal(summary.valuations[1]?.expiryPnlAtMark, -5)
  assert.equal(summary.valuations[2]?.tradeId, 'T-OPTION-OPEN-AWAITING-MARK')
  assert.equal(summary.valuations[2]?.markStatus, 'UNPRICED_MISSING_PRICE_INDEX')
})

test('open option expiry queue prioritizes past-expiry and expiry-day actions with style-aware recommendations', () => {
  const queue = buildOpenOptionActionQueue(
    [
      {
        trade_id: 'T-OPTION-PAST-EXPIRY',
        instrument_type: 'OPTION',
        status: 'ACTIVE',
        trade_side: 'BUY',
        option_type: 'CALL',
        option_style: 'AMERICAN',
        option_strike_price: 81,
        option_expiration_date: '2026-04-06',
        price: 2,
        price_index_code: 'WTI_M1',
        volume: 4,
        book: 'CRUDE_PHYS',
        commodity: 'WTI',
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-07T03:00:00Z',
      },
      {
        trade_id: 'T-OPTION-EXPIRY-DAY-ITM',
        instrument_type: 'OPTION',
        status: 'ACTIVE',
        trade_side: 'BUY',
        option_type: 'CALL',
        option_style: 'EUROPEAN',
        option_strike_price: 81,
        option_expiration_date: '2026-04-08',
        price: 3.5,
        price_index_code: 'WTI_M1',
        volume: 10,
        book: 'CRUDE_PHYS',
        commodity: 'WTI',
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-07T00:00:00Z',
      },
      {
        trade_id: 'T-OPTION-SHORT-AMERICAN-ITM',
        instrument_type: 'OPTION',
        status: 'ACTIVE',
        trade_side: 'SELL',
        option_type: 'PUT',
        option_style: 'AMERICAN',
        option_strike_price: 80,
        option_expiration_date: '2026-04-11',
        price: 2,
        price_index_code: 'WTI_M2',
        volume: 5,
        book: 'CRUDE_PHYS',
        commodity: 'WTI',
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-07T01:00:00Z',
      },
      {
        trade_id: 'T-OPTION-EUROPEAN-PRE-EXPIRY',
        instrument_type: 'OPTION',
        status: 'ACTIVE',
        trade_side: 'BUY',
        option_type: 'CALL',
        option_style: 'EUROPEAN',
        option_strike_price: 81,
        option_expiration_date: '2026-04-11',
        price: 3.5,
        price_index_code: 'WTI_M1',
        volume: 8,
        book: 'CRUDE_PHYS',
        commodity: 'WTI',
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-07T02:00:00Z',
      },
      {
        trade_id: 'T-OPTION-NOT-IN-QUEUE',
        instrument_type: 'OPTION',
        status: 'ACTIVE',
        trade_side: 'BUY',
        option_type: 'CALL',
        option_style: 'AMERICAN',
        option_strike_price: 81,
        option_expiration_date: '2026-04-20',
        price: 3.5,
        price_index_code: 'WTI_M1',
        volume: 8,
        book: 'CRUDE_PHYS',
        commodity: 'WTI',
        trade_currency_code: 'USD',
        price_unit_code: 'BBL',
        updated_at: '2026-04-07T04:00:00Z',
      },
    ],
    {
      WTI_M1: {
        price_index_code: 'WTI_M1',
        value: 84,
        observation_date: '2026-04-08',
        downloaded_at: '2026-04-08T00:10:00Z',
        currency_code: 'USD',
        unit_code: 'BBL',
      },
      WTI_M2: {
        price_index_code: 'WTI_M2',
        value: 70,
        observation_date: '2026-04-08',
        downloaded_at: '2026-04-08T00:10:00Z',
        currency_code: 'USD',
        unit_code: 'BBL',
      },
    },
    new Date('2026-04-08T00:00:00Z'),
  )

  assert.equal(queue.length, 4)
  assert.equal(queue[0]?.tradeId, 'T-OPTION-PAST-EXPIRY')
  assert.equal(queue[0]?.expiryState, 'PAST_EXPIRY_UNRESOLVED')
  assert.equal(queue[0]?.recommendedAction, 'OptionExpired')
  assert.deepEqual(queue[0]?.availableActions, ['OptionExpired'])

  assert.equal(queue[1]?.tradeId, 'T-OPTION-EXPIRY-DAY-ITM')
  assert.equal(queue[1]?.expiryState, 'EXPIRING_TODAY')
  assert.equal(queue[1]?.recommendedAction, 'OptionExercised')
  assert.deepEqual(queue[1]?.availableActions, ['OptionExercised', 'OptionExpired'])

  const shortAmerican = queue.find((valuation) => valuation.tradeId === 'T-OPTION-SHORT-AMERICAN-ITM')
  assert.equal(shortAmerican?.expiryState, 'EXPIRING_SOON')
  assert.equal(shortAmerican?.recommendedAction, 'OptionAssigned')
  assert.deepEqual(shortAmerican?.availableActions, ['OptionAssigned'])
  assert.equal(shortAmerican?.decisionLabel, 'Assignment risk into expiry')

  const europeanPreExpiry = queue.find((valuation) => valuation.tradeId === 'T-OPTION-EUROPEAN-PRE-EXPIRY')
  assert.equal(europeanPreExpiry?.expiryState, 'EXPIRING_SOON')
  assert.equal(europeanPreExpiry?.recommendedAction, null)
  assert.deepEqual(europeanPreExpiry?.availableActions, [])
  assert.match(europeanPreExpiry?.decisionReason ?? '', /only be recorded on expiry day/i)
})

test('option settlement valuation combines premium and linked underlying economics', () => {
  const valuation = buildOptionSettlementValuation(
    {
      trade_id: 'T-OPTION-EXERCISED-1',
      originating_option_trade_id: null,
      instrument_type: 'OPTION',
      status: 'EXERCISED',
      trade_side: 'BUY',
      option_type: 'CALL',
      option_strike_price: 81,
      option_expiration_date: '2026-06-30',
      price: 3.5,
      price_index_code: 'WTI_M1',
      volume: 10,
      book: 'CRUDE_PHYS',
      commodity: 'WTI',
      updated_at: '2026-04-07T00:00:00Z',
    },
    {
      trade_id: 'T-OPTION-EXERCISED-1-UNDERLYING',
      originating_option_trade_id: 'T-OPTION-EXERCISED-1',
      instrument_type: 'LINEAR',
      status: 'ACTIVE',
      trade_side: 'BUY',
      option_type: null,
      option_strike_price: null,
      option_expiration_date: null,
      price: 81,
      price_index_code: 'WTI_M1',
      volume: 10,
      book: 'CRUDE_PHYS',
      commodity: 'WTI',
      updated_at: '2026-04-07T00:05:00Z',
    },
    {
      WTI_M1: {
        price_index_code: 'WTI_M1',
        value: 84,
        observation_date: '2026-04-07',
        downloaded_at: '2026-04-07T00:10:00Z',
        currency_code: 'USD',
        unit_code: 'BBL',
      },
    },
  )

  assert.ok(valuation)
  assert.equal(valuation?.referencePriceIndexCode, 'WTI_M1')
  assert.equal(valuation?.referencePrice, 84)
  assert.equal(valuation?.markStatus, 'VALUED')
  assert.equal(valuation?.premiumCashflow, 35)
  assert.equal(valuation?.underlyingCashflow, 810)
  assert.equal(valuation?.netPackageCashflow, 845)
  assert.equal(valuation?.effectiveUnitPrice, 84.5)
  assert.equal(valuation?.underlyingMarkToMarket, 30)
  assert.equal(valuation?.packageMarkToMarket, -5)
  assert.equal(valuation?.intrinsicValue, 30)
  assert.equal(valuation?.moneyness, 'ITM')
  assert.equal(calculateTradeCashflow('SELL', 83, 5), -415)
  assert.equal(calculateOptionIntrinsicValue('CALL', 81, 84, 10), 30)
  assert.equal(describeOptionMoneyness('PUT', 74, 70), 'ITM')
})

test('option settlement summary rolls linked option pairs into package cashflow totals', () => {
  const summary = buildOptionSettlementSummary([
    {
      trade_id: 'T-OPTION-EXERCISED-1',
      originating_option_trade_id: null,
      instrument_type: 'OPTION',
      status: 'EXERCISED',
      trade_side: 'BUY',
      option_type: 'CALL',
      option_strike_price: 81,
      option_expiration_date: '2026-06-30',
      price: 3.5,
      price_index_code: 'WTI_M1',
      volume: 10,
      book: 'CRUDE_PHYS',
      commodity: 'WTI',
      updated_at: '2026-04-07T00:00:00Z',
    },
    {
      trade_id: 'T-OPTION-EXERCISED-1-UNDERLYING',
      originating_option_trade_id: 'T-OPTION-EXERCISED-1',
      instrument_type: 'LINEAR',
      status: 'ACTIVE',
      trade_side: 'BUY',
      option_type: null,
      option_strike_price: null,
      option_expiration_date: null,
      price: 81,
      price_index_code: 'WTI_M1',
      volume: 10,
      book: 'CRUDE_PHYS',
      commodity: 'WTI',
      updated_at: '2026-04-07T00:05:00Z',
    },
    {
      trade_id: 'T-OPTION-ASSIGNED-1',
      originating_option_trade_id: null,
      instrument_type: 'OPTION',
      status: 'ASSIGNED',
      trade_side: 'SELL',
      option_type: 'CALL',
      option_strike_price: 83,
      option_expiration_date: '2026-06-30',
      price: 1.8,
      price_index_code: 'WTI_M2',
      volume: 5,
      book: 'CRUDE_PHYS',
      commodity: 'WTI',
      updated_at: '2026-04-07T01:00:00Z',
    },
    {
      trade_id: 'T-OPTION-ASSIGNED-1-UNDERLYING',
      originating_option_trade_id: 'T-OPTION-ASSIGNED-1',
      instrument_type: 'LINEAR',
      status: 'ACTIVE',
      trade_side: 'SELL',
      option_type: null,
      option_strike_price: null,
      option_expiration_date: null,
      price: 83,
      price_index_code: 'WTI_M2',
      volume: 5,
      book: 'CRUDE_PHYS',
      commodity: 'WTI',
      updated_at: '2026-04-07T01:05:00Z',
    },
  ], {
    WTI_M1: {
      price_index_code: 'WTI_M1',
      value: 84,
      observation_date: '2026-04-07',
      downloaded_at: '2026-04-07T00:10:00Z',
      currency_code: 'USD',
      unit_code: 'BBL',
    },
    WTI_M2: {
      price_index_code: 'WTI_M2',
      value: 80,
      observation_date: '2026-04-07',
      downloaded_at: '2026-04-07T01:10:00Z',
      currency_code: 'USD',
      unit_code: 'BBL',
    },
  })

  assert.equal(summary.pairCount, 2)
  assert.equal(summary.grossContracts, 15)
  assert.equal(summary.netUnderlyingVolume, 5)
  assert.equal(summary.netPackageCashflow, 421)
  assert.equal(summary.grossPackageCashflow, 1269)
  assert.equal(summary.valuations[0]?.optionTradeId, 'T-OPTION-ASSIGNED-1')
  assert.equal(summary.valuations[1]?.optionTradeId, 'T-OPTION-EXERCISED-1')
  assert.equal(summary.valuations[0]?.packageMarkToMarket, 24)
  assert.equal(summary.valuations[1]?.packageMarkToMarket, -5)
})

test('option settlement valuation reports missing live mark context when no market observation exists', () => {
  const valuation = buildOptionSettlementValuation(
    {
      trade_id: 'T-OPTION-MISSING-MARK',
      originating_option_trade_id: null,
      instrument_type: 'OPTION',
      status: 'EXERCISED',
      trade_side: 'BUY',
      option_type: 'CALL',
      option_strike_price: 81,
      option_expiration_date: '2026-06-30',
      price: 3.5,
      price_index_code: 'WTI_M1',
      volume: 10,
      book: 'CRUDE_PHYS',
      commodity: 'WTI',
      updated_at: '2026-04-07T00:00:00Z',
    },
    {
      trade_id: 'T-OPTION-MISSING-MARK-UNDERLYING',
      originating_option_trade_id: 'T-OPTION-MISSING-MARK',
      instrument_type: 'LINEAR',
      status: 'ACTIVE',
      trade_side: 'BUY',
      option_type: null,
      option_strike_price: null,
      option_expiration_date: null,
      price: 81,
      price_index_code: null,
      volume: 10,
      book: 'CRUDE_PHYS',
      commodity: 'WTI',
      updated_at: '2026-04-07T00:05:00Z',
    },
  )

  assert.ok(valuation)
  assert.equal(valuation?.referencePriceIndexCode, 'WTI_M1')
  assert.equal(valuation?.referencePrice, null)
  assert.equal(valuation?.markStatus, 'UNPRICED_MISSING_MARK')
  assert.equal(valuation?.packageMarkToMarket, null)
  assert.equal(valuation?.moneyness, null)
})
