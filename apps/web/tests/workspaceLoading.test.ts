import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildRequestedGroups,
  deriveWorkspaceStatus,
  deriveRetryableWorkspaceGroups,
  EMPTY_GROUP_ERRORS,
  EMPTY_GROUP_FLAGS,
  isApiReachabilityMessage,
  isAuthenticationRequiredMessage,
  shouldPresentSignedOutAuthGate,
  shouldPresentStartHereOverlay,
  summarizeWorkspaceIssueMessage,
  shouldPresentSettingsSignInState,
} from '../src/entities/app/workspaceLoading.ts'

test('buildRequestedGroups starts with core plus the current workspace dependencies', () => {
  const requestedGroups = buildRequestedGroups({
    currentView: 'trades',
    force: false,
    groupLoaded: { ...EMPTY_GROUP_FLAGS },
    groupLoading: { ...EMPTY_GROUP_FLAGS },
  })

  assert.deepEqual(requestedGroups, ['core', 'trades', 'reference', 'operations'])
})

test('buildRequestedGroups skips groups that are already loaded or in flight when not forced', () => {
  const requestedGroups = buildRequestedGroups({
    currentView: 'operations',
    force: false,
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      trades: true,
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
      trades: true,
      reports: true,
    },
    groupLoading: { ...EMPTY_GROUP_FLAGS },
  })

  assert.deepEqual(requestedGroups, ['core', 'trades', 'events', 'reference', 'reports'])
})

test('deriveRetryableWorkspaceGroups only retries current-view groups that failed before loading', () => {
  const retryableGroups = deriveRetryableWorkspaceGroups({
    currentView: 'trades',
    groupErrors: {
      ...EMPTY_GROUP_ERRORS,
      reference: 'Reference bootstrap failed.',
      operations: 'Workflow queue failed.',
      admin: 'Admin warmup failed.',
    },
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      operations: true,
    },
  })

  assert.deepEqual(retryableGroups, ['reference'])
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

test('deriveWorkspaceStatus keeps blocking workspaces in a loading state until their required groups arrive', () => {
  const status = deriveWorkspaceStatus({
    appLoading: false,
    currentView: 'trades',
    error: '',
    groupErrors: { ...EMPTY_GROUP_ERRORS },
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
    },
    groupLoading: { ...EMPTY_GROUP_FLAGS },
  })

  assert.equal(status.blockingWorkspaceError, null)
  assert.equal(status.workspaceLoading, true)
  assert.equal(status.workspaceWarning, null)
  assert.equal(status.systemStateLabel, 'Loading workspace')
  assert.equal(status.systemStateTone, 'active')
})

test('deriveWorkspaceStatus keeps the workspace blocked while the shell is reloading', () => {
  const status = deriveWorkspaceStatus({
    appLoading: true,
    currentView: 'settings',
    error: '',
    groupErrors: { ...EMPTY_GROUP_ERRORS },
    groupLoaded: { ...EMPTY_GROUP_FLAGS },
    groupLoading: { ...EMPTY_GROUP_FLAGS },
  })

  assert.equal(status.blockingWorkspaceError, null)
  assert.equal(status.workspaceLoading, true)
  assert.equal(status.workspaceWarning, null)
  assert.equal(status.systemStateLabel, 'Loading shell')
  assert.equal(status.systemStateTone, 'active')
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
      trades: true,
      events: true,
      positions: true,
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
    currentView: 'operations',
    error: '',
    groupErrors: {
      ...EMPTY_GROUP_ERRORS,
      admin: 'Admin warmup failed.',
    },
    groupLoaded: {
      ...EMPTY_GROUP_FLAGS,
      core: true,
      trades: true,
      deliveries: true,
      operations: true,
    },
    groupLoading: { ...EMPTY_GROUP_FLAGS },
  })

  assert.equal(status.blockingWorkspaceError, null)
  assert.equal(status.workspaceWarning, 'admin')
  assert.equal(status.systemStateLabel, 'Partial data')
  assert.equal(status.systemStateTone, 'active')
})

test('isAuthenticationRequiredMessage matches the startup auth failure banner', () => {
  assert.equal(isAuthenticationRequiredMessage('Authentication is required for protected workspace data.'), true)
  assert.equal(isAuthenticationRequiredMessage('Could not reach API at http://127.0.0.1:8000.'), false)
})

test('isApiReachabilityMessage identifies reconnectable API failures', () => {
  assert.equal(isApiReachabilityMessage('Could not reach API at http://127.0.0.1:8000.'), true)
  assert.equal(
    isApiReachabilityMessage('Could not reach API. Make sure backend is running on 127.0.0.1:8000 and CORS is enabled.'),
    true,
  )
  assert.equal(isApiReachabilityMessage('Authentication is required for protected workspace data.'), false)
})

test('summarizeWorkspaceIssueMessage keeps correlation ids out of workspace copy', () => {
  assert.equal(
    summarizeWorkspaceIssueMessage(
      'Request failed: 404 Correlation ID: abc-123',
      'weather',
    ),
    'Weather Error',
  )

  assert.equal(
    summarizeWorkspaceIssueMessage(
      'Authentication is required for protected workspace data. Correlation ID: abc-123',
      'weather',
    ),
    'Authentication required',
  )

  assert.equal(
    summarizeWorkspaceIssueMessage('Could not reach API at http://127.0.0.1:8000.'),
    'API unavailable. Check that the backend is running at 127.0.0.1:8000, or update API Base Override in Settings.',
  )
})

test('shouldPresentSettingsSignInState treats auth redirects into Settings as a sign-in state, not a shell failure', () => {
  assert.equal(
    shouldPresentSettingsSignInState({
      currentView: 'settings',
      error: 'Authentication is required for protected workspace data.',
      hasAuthSession: false,
      showingNavigationSectionLanding: false,
    }),
    true,
  )

  assert.equal(
    shouldPresentSettingsSignInState({
      currentView: 'settings',
      error: '',
      hasAuthSession: false,
      showingNavigationSectionLanding: false,
    }),
    true,
  )

  assert.equal(
    shouldPresentSettingsSignInState({
      currentView: 'dashboard',
      error: 'Authentication is required for protected workspace data.',
      hasAuthSession: false,
      showingNavigationSectionLanding: false,
    }),
    false,
  )

  assert.equal(
    shouldPresentSettingsSignInState({
      currentView: 'settings',
      error: 'Could not reach API at http://127.0.0.1:8000.',
      hasAuthSession: false,
      showingNavigationSectionLanding: false,
    }),
    false,
  )
})

test('shouldPresentSignedOutAuthGate locks every signed-out route behind the auth gate', () => {
  assert.equal(
    shouldPresentSignedOutAuthGate({
      currentView: 'prompt',
      hasAuthSession: false,
    }),
    true,
  )

  assert.equal(
    shouldPresentSignedOutAuthGate({
      currentView: 'messages',
      hasAuthSession: false,
    }),
    true,
  )

  assert.equal(
    shouldPresentSignedOutAuthGate({
      currentView: 'assistant',
      hasAuthSession: false,
    }),
    true,
  )

  assert.equal(
    shouldPresentSignedOutAuthGate({
      currentView: 'operations',
      hasAuthSession: false,
    }),
    true,
  )

  assert.equal(
    shouldPresentSignedOutAuthGate({
      currentView: 'messages',
      hasAuthSession: true,
    }),
    false,
  )
})

test('shouldPresentStartHereOverlay stays hidden until a session is authenticated', () => {
  assert.equal(
    shouldPresentStartHereOverlay({
      currentView: 'dashboard',
      hasAuthSession: false,
      hasStartHereOnboarding: true,
      hasStartHereReturnIntent: false,
      authInterruptionReason: null,
      hasAuthInterruptionResume: false,
      usesTerminalMode: false,
    }),
    false,
  )

  assert.equal(
    shouldPresentStartHereOverlay({
      currentView: 'messages',
      hasAuthSession: false,
      hasStartHereOnboarding: true,
      hasStartHereReturnIntent: false,
      authInterruptionReason: null,
      hasAuthInterruptionResume: false,
      usesTerminalMode: false,
    }),
    false,
  )

  assert.equal(
    shouldPresentStartHereOverlay({
      currentView: 'prompt',
      hasAuthSession: false,
      hasStartHereOnboarding: true,
      hasStartHereReturnIntent: false,
      authInterruptionReason: null,
      hasAuthInterruptionResume: false,
      usesTerminalMode: false,
    }),
    false,
  )

  assert.equal(
    shouldPresentStartHereOverlay({
      currentView: 'operations',
      hasAuthSession: true,
      hasStartHereOnboarding: true,
      hasStartHereReturnIntent: false,
      authInterruptionReason: null,
      hasAuthInterruptionResume: false,
      usesTerminalMode: false,
    }),
    true,
  )
})

test('shouldPresentStartHereOverlay stays hidden on Home so the landing brief remains visible', () => {
  assert.equal(
    shouldPresentStartHereOverlay({
      currentView: 'dashboard',
      hasAuthSession: true,
      hasStartHereOnboarding: true,
      hasStartHereReturnIntent: false,
      authInterruptionReason: null,
      hasAuthInterruptionResume: false,
      usesTerminalMode: false,
    }),
    false,
  )
})

test('shouldPresentStartHereOverlay suppresses the signed-in onboarding overlay in terminal mode', () => {
  assert.equal(
    shouldPresentStartHereOverlay({
      currentView: 'dashboard',
      hasAuthSession: true,
      hasStartHereOnboarding: true,
      hasStartHereReturnIntent: false,
      authInterruptionReason: null,
      hasAuthInterruptionResume: false,
      usesTerminalMode: true,
    }),
    false,
  )

  assert.equal(
    shouldPresentStartHereOverlay({
      currentView: 'dashboard',
      hasAuthSession: false,
      hasStartHereOnboarding: true,
      hasStartHereReturnIntent: false,
      authInterruptionReason: null,
      hasAuthInterruptionResume: false,
      usesTerminalMode: true,
    }),
    false,
  )
})

test('shouldPresentStartHereOverlay suppresses onboarding during focused route handoffs', () => {
  assert.equal(
    shouldPresentStartHereOverlay({
      currentView: 'operations',
      hasAuthSession: true,
      hasStartHereOnboarding: true,
      hasStartHereReturnIntent: false,
      hasRouteHandoff: true,
      authInterruptionReason: null,
      hasAuthInterruptionResume: false,
      usesTerminalMode: false,
    }),
    false,
  )
})
