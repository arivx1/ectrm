import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  getDefaultTradeCaptureSettings,
  normalizeTradeCaptureSettings,
  resolveTradeCaptureDefaultsForInstrument,
  resolveTradeCaptureRuleEvaluation,
  resolveTradeCaptureVisibilityState,
} from '../src/shared/tradeCaptureSettings.ts'

test('normalizeTradeCaptureSettings keeps valid configured values and migrates legacy option defaults into the rule stack', () => {
  const settings = normalizeTradeCaptureSettings({
    defaults: {
      instrumentType: 'OPTION',
      tradeNature: 'FINANCIAL',
      tradeStructure: 'SINGLE',
      tradeSide: 'SELL',
      pricingType: 'HYBRID',
      pricingStatus: 'PRICED',
      settlementStatus: 'SETTLED',
      optionType: 'PUT',
      optionStyle: 'EUROPEAN',
    },
    linkedDefaults: {
      optionInstrument: {
        enabled: true,
        tradeNature: 'NOT_A_REAL_VALUE',
        tradeStructure: 'SINGLE',
        pricingType: 'FIXED',
      },
    },
    visibility: {
      optionDetails: 'always',
      priceIndex: 'not-real',
    },
  })

  assert.equal(settings.defaults.instrumentType, 'OPTION')
  assert.equal(settings.defaults.tradeSide, 'SELL')
  assert.equal(settings.defaults.pricingStatus, 'PRICED')
  assert.equal(settings.defaults.optionStyle, 'EUROPEAN')
  assert.equal(settings.rules[0]?.name, 'Option instrument defaults')
  assert.equal(settings.rules[0]?.defaults.tradeNature, 'FINANCIAL')
  assert.equal(settings.visibility.optionDetails, 'always')
  assert.equal(settings.visibility.priceIndex, 'auto')
})

test('resolveTradeCaptureDefaultsForInstrument only returns linked defaults for option instruments when enabled', () => {
  const settings = getDefaultTradeCaptureSettings()

  assert.deepEqual(resolveTradeCaptureDefaultsForInstrument('OPTION', settings), {
    tradeNature: 'FINANCIAL',
    tradeStructure: 'SINGLE',
    pricingType: 'FIXED',
  })
  assert.equal(resolveTradeCaptureDefaultsForInstrument('LINEAR', settings), null)
})

test('normalizeTradeCaptureSettings preserves an explicitly empty modern rule stack', () => {
  const settings = normalizeTradeCaptureSettings({
    rules: [],
  })

  assert.equal(settings.rules.length, 0)
})

test('resolveTradeCaptureRuleEvaluation cascades matching rules and lets later rules win', () => {
  const settings = normalizeTradeCaptureSettings({
    rules: [
      {
        id: 'option',
        name: 'Option defaults',
        enabled: true,
        conditions: {
          instrumentType: 'OPTION',
          tradeStructure: null,
          pricingType: null,
          commodityClass: null,
          book: null,
        },
        defaults: {
          tradeNature: 'FINANCIAL',
          tradeStructure: 'SINGLE',
          tradeSide: null,
          pricingType: 'FIXED',
          pricingStatus: null,
          settlementStatus: null,
          optionType: null,
          optionStyle: null,
        },
        visibility: {
          optionDetails: 'show',
          priceIndex: 'hide',
        },
      },
      {
        id: 'fixed',
        name: 'Fixed pricing status',
        enabled: true,
        conditions: {
          instrumentType: null,
          tradeStructure: null,
          pricingType: 'FIXED',
          commodityClass: null,
          book: null,
        },
        defaults: {
          tradeNature: null,
          tradeStructure: null,
          tradeSide: null,
          pricingType: null,
          pricingStatus: 'PRICED',
          settlementStatus: null,
          optionType: null,
          optionStyle: null,
        },
        visibility: {
          optionDetails: 'inherit',
          priceIndex: 'inherit',
        },
      },
    ],
  })

  const evaluation = resolveTradeCaptureRuleEvaluation({
    context: {
      instrumentType: 'OPTION',
      tradeStructure: 'SWAP',
      pricingType: 'INDEX',
      commodityClass: 'REFINED_PRODUCTS',
      book: 'DISTILLATES',
    },
    settings,
  })

  assert.equal(evaluation.defaultOverrides.tradeNature, 'FINANCIAL')
  assert.equal(evaluation.defaultOverrides.tradeStructure, 'SINGLE')
  assert.equal(evaluation.defaultOverrides.pricingType, 'FIXED')
  assert.equal(evaluation.defaultOverrides.pricingStatus, 'PRICED')
  assert.equal(evaluation.matchedRules.length, 2)
  assert.equal(evaluation.matchedRules[1]?.name, 'Fixed pricing status')
})

test('resolveTradeCaptureVisibilityState respects auto and always modes plus rule overrides', () => {
  const autoState = resolveTradeCaptureVisibilityState({
    instrumentType: 'LINEAR',
    tradeStructure: 'SINGLE',
    pricingType: 'FIXED',
    commodityClass: 'REFINED_PRODUCTS',
    book: 'DISTILLATES',
    settings: getDefaultTradeCaptureSettings(),
  })

  assert.equal(autoState.showOptionDetails, false)
  assert.equal(autoState.showPriceIndex, false)
  assert.equal(autoState.showTopLevelVolume, true)

  const alwaysSettings = normalizeTradeCaptureSettings({
    visibility: {
      optionDetails: 'always',
      priceIndex: 'always',
    },
    rules: [
      {
        id: 'hide-option-price-index',
        name: 'Hide option price index',
        enabled: true,
        conditions: {
          instrumentType: 'OPTION',
          tradeStructure: null,
          pricingType: null,
          commodityClass: null,
          book: null,
        },
        defaults: {
          tradeNature: null,
          tradeStructure: null,
          tradeSide: null,
          pricingType: null,
          pricingStatus: null,
          settlementStatus: null,
          optionType: null,
          optionStyle: null,
        },
        visibility: {
          optionDetails: 'show',
          priceIndex: 'hide',
        },
      },
    ],
  })

  const alwaysState = resolveTradeCaptureVisibilityState({
    instrumentType: 'OPTION',
    tradeStructure: 'SINGLE',
    pricingType: 'INDEX',
    commodityClass: 'REFINED_PRODUCTS',
    book: 'DISTILLATES',
    settings: alwaysSettings,
  })

  assert.equal(alwaysState.showOptionDetails, true)
  assert.equal(alwaysState.showPriceIndex, false)
})
