import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  MIXED_UOM_LABEL,
  UNIT_TBD_LABEL,
  buildUnitLabelByCommodity,
  buildUnitLabelByCommodityClass,
  summarizeUnitLabels,
} from '../src/shared/unitDisplay.ts'

test('unit display helpers summarize single, mixed, and missing units', () => {
  assert.equal(summarizeUnitLabels(['BBL', 'bbl']), 'BBL')
  assert.equal(summarizeUnitLabels(['BBL', 'MWH']), MIXED_UOM_LABEL)
  assert.equal(summarizeUnitLabels([]), UNIT_TBD_LABEL)
  assert.equal(summarizeUnitLabels([null, '']), UNIT_TBD_LABEL)
})

test('unit display helpers build commodity and class unit labels from trades', () => {
  const trades = [
    { commodity: 'WTI', commodity_class: 'CRUDE_OIL', unit_of_measure: 'BBL' },
    { commodity: 'WTI', commodity_class: 'CRUDE_OIL', unit_of_measure: 'bbl' },
    { commodity: 'HEAT', commodity_class: 'REFINED_PRODUCTS', unit_of_measure: 'GAL' },
    { commodity: 'RBOB', commodity_class: 'REFINED_PRODUCTS', unit_of_measure: 'BBL' },
    { commodity: 'POWER', commodity_class: 'POWER', unit_of_measure: null },
  ]

  const commodityLabels = buildUnitLabelByCommodity(trades)
  const classLabels = buildUnitLabelByCommodityClass(trades)

  assert.equal(commodityLabels.get('WTI'), 'BBL')
  assert.equal(commodityLabels.get('POWER'), UNIT_TBD_LABEL)
  assert.equal(classLabels.get('CRUDE_OIL'), 'BBL')
  assert.equal(classLabels.get('REFINED_PRODUCTS'), MIXED_UOM_LABEL)
  assert.equal(classLabels.get('POWER'), UNIT_TBD_LABEL)
})
