import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildMutationRefreshGroups,
  buildTargetedMutationRefreshPlan,
} from '../src/entities/app/workspaceRefresh.ts'
import { EMPTY_GROUP_FLAGS } from '../src/entities/app/workspaceLoading.ts'

test('trade-event refresh keeps the trading workspace dependencies warm', () => {
  const groups = buildMutationRefreshGroups({
    currentView: 'trades',
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      trades: true,
      reference: true,
    },
    mutation: 'trade-event',
  })

  assert.deepEqual(groups, ['core', 'trades', 'reference', 'operations', 'positions'])
})

test('workflow-item refresh includes settlement when operations mutate', () => {
  const groups = buildMutationRefreshGroups({
    currentView: 'operations',
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      trades: true,
      deliveries: true,
      admin: true,
    },
    mutation: 'workflow-item',
  })

  assert.deepEqual(groups, ['core', 'trades', 'deliveries', 'operations', 'admin', 'settlement'])
})

test('delivery refresh keeps loaded groups warm while forcing deliveries reload', () => {
  const groups = buildMutationRefreshGroups({
    currentView: 'shipments',
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      deliveries: true,
      operations: true,
    },
    mutation: 'delivery',
  })

  assert.deepEqual(groups, ['core', 'deliveries', 'operations'])
})

test('payment refresh preserves already loaded risk data while forcing settlement reloads', () => {
  const groups = buildMutationRefreshGroups({
    currentView: 'settlement',
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      trades: true,
      operations: true,
      settlement: true,
      risk: true,
    },
    mutation: 'payment',
  })

  assert.deepEqual(groups, ['core', 'trades', 'operations', 'settlement', 'risk'])
})

test('admin counterparty-credit refresh fans out to the dependent datasets', () => {
  const groups = buildMutationRefreshGroups({
    currentView: 'admin',
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      trades: true,
      reference: true,
      admin: true,
    },
    mutation: 'admin-counterparty-credit',
  })

  assert.deepEqual(groups, ['core', 'trades', 'events', 'positions', 'reference', 'admin', 'reports', 'operations'])
})

test('settlement payment mutations use a narrow targeted refresh plan', () => {
  const plan = buildTargetedMutationRefreshPlan({
    currentView: 'settlement',
    mutation: 'payment',
  })

  assert.deepEqual(plan, {
    groups: ['core'],
    collections: ['trades', 'invoices', 'payments', 'settlementWorkItems'],
  })
})

test('scheduling workflow changes refresh deliveries instead of refetching the full workspace graph', () => {
  const plan = buildTargetedMutationRefreshPlan({
    currentView: 'scheduling',
    mutation: 'workflow-item',
  })

  assert.deepEqual(plan, {
    groups: ['core'],
    collections: ['deliveries'],
  })
})

test('trade-event mutations use a narrow targeted refresh plan on the trading screen', () => {
  const plan = buildTargetedMutationRefreshPlan({
    currentView: 'trades',
    mutation: 'trade-event',
  })

  assert.deepEqual(plan, {
    groups: ['core'],
    collections: ['trades', 'positions', 'operationsWorkItems', 'settlementWorkItems'],
  })
})

test('admin counterparty-credit imports refresh only the dependent groups', () => {
  const plan = buildTargetedMutationRefreshPlan({
    currentView: 'admin',
    mutation: 'admin-counterparty-credit',
  })

  assert.deepEqual(plan, {
    groups: ['admin', 'reference', 'reports', 'operations'],
    collections: [],
  })
})

test('admin sync mutations stay scoped to the admin loader', () => {
  const plan = buildTargetedMutationRefreshPlan({
    currentView: 'admin',
    mutation: 'admin-external-data',
  })

  assert.deepEqual(plan, {
    groups: ['admin'],
    collections: [],
  })
})

test('admin weather mutations stay scoped to the admin loader', () => {
  const plan = buildTargetedMutationRefreshPlan({
    currentView: 'admin',
    mutation: 'admin-weather-sync',
  })

  assert.deepEqual(plan, {
    groups: ['admin'],
    collections: [],
  })
})
