import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  ADMIN_PRICE_SOURCE_DETAIL_PREFIX,
  adminPriceSourceDetailAnchorId,
  readAdminPriceSourceIdFromHash,
} from '../src/workspaces/admin/adminRouteAnchors.ts'

test('admin price source anchors round-trip source ids', () => {
  assert.equal(adminPriceSourceDetailAnchorId(42), `${ADMIN_PRICE_SOURCE_DETAIL_PREFIX}42`)
  assert.equal(readAdminPriceSourceIdFromHash('#admin-price-source-42'), 42)
  assert.equal(readAdminPriceSourceIdFromHash('admin-price-source-42'), 42)
})

test('admin price source hash reader rejects unrelated or invalid anchors', () => {
  assert.equal(readAdminPriceSourceIdFromHash('#admin-price-sources'), null)
  assert.equal(readAdminPriceSourceIdFromHash('#admin-price-source-zero'), null)
  assert.equal(readAdminPriceSourceIdFromHash('#admin-price-source-0'), null)
})
