import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildRequestedGroups,
  deriveWorkspaceStatus,
  EMPTY_GROUP_ERRORS,
  EMPTY_GROUP_FLAGS,
} from '../src/entities/app/workspaceLoading.ts'

test('buildRequestedGroups starts with core plus the current workspace dependencies', () => {
  const requestedGroups = buildRequestedGroups({
    currentView: 'trades',
    force: false,
    groupLoaded: { ...EMPTY_GROUP_FLAGS },
    groupLoading: { ...EMPTY_GROUP_FLAGS },
  })

  assert.deepEqual(requestedGroups, ['core', 'reference', 'operations'])
})

test('buildRequestedGroups skips groups that are already loaded or in flight when not forced', () => {
  const requestedGroups = buildRequestedGroups({
    currentView: 'operations',
    force: false,
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      deliveries: true,
    },
    groupLoading: {
      ...EMPTY_GROUP_FLAGS,
      operations: true,
    },
  })

  assert.deepEqual(requestedGroups, ['admin'])
})

test('buildRequestedGroups includes previously loaded groups during a forced refresh', () => {
  const requestedGroups = buildRequestedGroups({
    currentView: 'dashboard',
    force: true,
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      reports: true,
    },
    groupLoading: { ...EMPTY_GROUP_FLAGS },
  })

  assert.deepEqual(requestedGroups, ['core', 'reference', 'reports'])
})

test('deriveWorkspaceStatus reports blocking workspace errors before rendering the workspace', () => {
  const status = deriveWorkspaceStatus({
    appLoading: false,
    currentView: 'settlement',
    error: '',
    groupErrors: {
      ...EMPTY_GROUP_ERRORS,
      operations: 'Workflow queue is unavailable.',
    },
    groupLoaded: { ...EMPTY_GROUP_FLAGS, core: true },
    groupLoading: { ...EMPTY_GROUP_FLAGS },
  })

  assert.equal(status.blockingWorkspaceError, 'operations')
  assert.equal(status.workspaceLoading, false)
  assert.equal(status.workspaceWarning, null)
  assert.equal(status.systemStateLabel, 'Workspace issue')
  assert.equal(status.systemStateTone, 'cancelled')
})

test('deriveWorkspaceStatus treats loaded group failures as cached-data warnings', () => {
  const status = deriveWorkspaceStatus({
    appLoading: false,
    currentView: 'dashboard',
    error: '',
    groupErrors: {
      ...EMPTY_GROUP_ERRORS,
      reference: 'Reference refresh failed.',
    },
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      reference: true,
    },
    groupLoading: { ...EMPTY_GROUP_FLAGS },
  })

  assert.equal(status.blockingWorkspaceError, null)
  assert.equal(status.workspaceWarning, 'reference')
  assert.equal(status.systemStateLabel, 'Using cached data')
  assert.equal(status.systemStateTone, 'active')
})

test('deriveWorkspaceStatus distinguishes partial non-blocking data from shell failures', () => {
  const status = deriveWorkspaceStatus({
    appLoading: false,
    currentView: 'dashboard',
    error: '',
    groupErrors: {
      ...EMPTY_GROUP_ERRORS,
      reference: 'Reference warmup failed.',
    },
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
    },
    groupLoading: { ...EMPTY_GROUP_FLAGS },
  })

  assert.equal(status.blockingWorkspaceError, null)
  assert.equal(status.workspaceWarning, 'reference')
  assert.equal(status.systemStateLabel, 'Partial data')
  assert.equal(status.systemStateTone, 'active')
})
