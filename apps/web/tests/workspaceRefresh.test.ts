import assert from 'node:assert/strict'
import { test } from 'vitest'

import { buildMutationRefreshGroups } from '../src/entities/app/workspaceRefresh.ts'
import { EMPTY_GROUP_FLAGS } from '../src/entities/app/workspaceLoading.ts'

test('trade-event refresh keeps the trading workspace dependencies warm', () => {
  const groups = buildMutationRefreshGroups({
    currentView: 'trades',
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      reference: true,
    },
    mutation: 'trade-event',
  })

  assert.deepEqual(groups, ['core', 'reference', 'operations'])
})

test('workflow-item refresh includes settlement when operations mutate', () => {
  const groups = buildMutationRefreshGroups({
    currentView: 'operations',
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      deliveries: true,
      admin: true,
    },
    mutation: 'workflow-item',
  })

  assert.deepEqual(groups, ['core', 'deliveries', 'operations', 'admin', 'settlement'])
})

test('payment refresh preserves already loaded risk data while forcing settlement reloads', () => {
  const groups = buildMutationRefreshGroups({
    currentView: 'settlement',
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      operations: true,
      settlement: true,
      risk: true,
    },
    mutation: 'payment',
  })

  assert.deepEqual(groups, ['core', 'operations', 'settlement', 'risk'])
})

test('admin counterparty-credit refresh fans out to the dependent datasets', () => {
  const groups = buildMutationRefreshGroups({
    currentView: 'admin',
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      reference: true,
      admin: true,
    },
    mutation: 'admin-counterparty-credit',
  })

  assert.deepEqual(groups, ['core', 'reference', 'admin', 'reports', 'operations'])
})
