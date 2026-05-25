import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildAuthInterruptionContinueLabel,
  resolveAuthInterruptionResumeAction,
} from '../src/entities/app/useAuthInterruptionFlow.ts'
import {
  DEFAULT_APP_VIEW_KEY,
  resolveAppBackAction,
} from '../src/entities/app/useAppRouteState.ts'
import { resolveStartHereRoutingAction } from '../src/entities/app/useStartHereRouting.ts'

test('the app default route starts at the prompt home', () => {
  assert.equal(DEFAULT_APP_VIEW_KEY, 'prompt')
})

test('app back uses tracked in-app history before falling back to home', () => {
  assert.deepEqual(
    resolveAppBackAction({
      appHistoryIndex: 2,
      activeNavigationSectionKey: null,
      currentView: 'trades',
    }),
    { kind: 'history-back' },
  )

  assert.deepEqual(
    resolveAppBackAction({
      appHistoryIndex: 0,
      activeNavigationSectionKey: null,
      currentView: 'trades',
    }),
    {
      kind: 'fallback',
      view: 'prompt',
    },
  )

  assert.deepEqual(
    resolveAppBackAction({
      appHistoryIndex: 0,
      activeNavigationSectionKey: null,
      currentView: 'prompt',
    }),
    { kind: 'noop' },
  )
})

test('app back leaves section landing views through the default home fallback', () => {
  assert.deepEqual(
    resolveAppBackAction({
      appHistoryIndex: 0,
      activeNavigationSectionKey: 'trading',
      currentView: 'prompt',
    }),
    {
      kind: 'fallback',
      view: 'prompt',
    },
  )
})

test('auth interruption labels prioritize the trade amendment flow', () => {
  assert.equal(
    buildAuthInterruptionContinueLabel({
      currentView: 'trades',
      selectedTradeId: 'TRD-1001',
      inspectorTab: 'amend',
      activeNavigationSectionLabel: null,
    }),
    'the amendment for trade TRD-1001',
  )
})

test('auth interruption labels fall back to the active section landing or workspace label', () => {
  assert.equal(
    buildAuthInterruptionContinueLabel({
      currentView: 'dashboard',
      selectedTradeId: null,
      inspectorTab: 'overview',
      activeNavigationSectionLabel: 'Overview',
    }),
    'Overview',
  )

  assert.equal(
    buildAuthInterruptionContinueLabel({
      currentView: 'risk',
      selectedTradeId: null,
      inspectorTab: 'overview',
      activeNavigationSectionLabel: null,
    }),
    'Exposure',
  )
})

test('auth interruption resume restores the saved url before any trade-specific shell state', () => {
  assert.deepEqual(
    resolveAuthInterruptionResumeAction({
      authSessionId: 'session-1',
      snapshot: {
        reason: 'session_expired',
        url: '/?view=trades&trade=TRD-1001',
        continueLabel: 'trade TRD-1001 in Trade Capture',
        inspectorTab: 'amend',
      },
      currentUrl: '/?view=dashboard',
      currentView: 'dashboard',
      selectedTradeId: null,
      selectedTradeRecordId: null,
      inspectorTab: 'overview',
    }),
    {
      kind: 'restore-url',
      url: '/?view=trades&trade=TRD-1001',
    },
  )
})

test('auth interruption resume waits for the selected trade before restoring the inspector tab', () => {
  assert.deepEqual(
    resolveAuthInterruptionResumeAction({
      authSessionId: 'session-1',
      snapshot: {
        reason: 'session_expired',
        url: '/?view=trades&trade=TRD-1001',
        continueLabel: 'the amendment for trade TRD-1001',
        inspectorTab: 'amend',
      },
      currentUrl: '/?view=trades&trade=TRD-1001',
      currentView: 'trades',
      selectedTradeId: 'TRD-1001',
      selectedTradeRecordId: 'TRD-2002',
      inspectorTab: 'overview',
    }),
    { kind: 'noop' },
  )
})

test('auth interruption resume restores the inspector tab once the trade is available, then clears the snapshot', () => {
  assert.deepEqual(
    resolveAuthInterruptionResumeAction({
      authSessionId: 'session-1',
      snapshot: {
        reason: 'session_expired',
        url: '/?view=trades&trade=TRD-1001',
        continueLabel: 'the amendment for trade TRD-1001',
        inspectorTab: 'amend',
      },
      currentUrl: '/?view=trades&trade=TRD-1001',
      currentView: 'trades',
      selectedTradeId: 'TRD-1001',
      selectedTradeRecordId: 'TRD-1001',
      inspectorTab: 'overview',
    }),
    {
      kind: 'restore-inspector-tab',
      inspectorTab: 'amend',
    },
  )

  assert.deepEqual(
    resolveAuthInterruptionResumeAction({
      authSessionId: 'session-1',
      snapshot: {
        reason: 'session_expired',
        url: '/?view=trades&trade=TRD-1001',
        continueLabel: 'the amendment for trade TRD-1001',
        inspectorTab: 'amend',
      },
      currentUrl: '/?view=trades&trade=TRD-1001',
      currentView: 'trades',
      selectedTradeId: 'TRD-1001',
      selectedTradeRecordId: 'TRD-1001',
      inspectorTab: 'amend',
    }),
    { kind: 'clear' },
  )
})

test('start-here return routing resumes only after sign-in or from settings', () => {
  assert.deepEqual(
    resolveStartHereRoutingAction({
      authSessionId: null,
      previousAuthSessionId: null,
      authInterruptionActive: false,
      currentView: 'dashboard',
      startHereReturnIntent: 'operations',
    }),
    { kind: 'noop' },
  )

  assert.deepEqual(
    resolveStartHereRoutingAction({
      authSessionId: 'session-1',
      previousAuthSessionId: null,
      authInterruptionActive: false,
      currentView: 'dashboard',
      startHereReturnIntent: 'operations',
    }),
    {
      kind: 'resume',
      view: 'operations',
    },
  )

  assert.deepEqual(
    resolveStartHereRoutingAction({
      authSessionId: 'session-1',
      previousAuthSessionId: 'session-0',
      authInterruptionActive: false,
      currentView: 'settings',
      startHereReturnIntent: 'trades',
    }),
    {
      kind: 'resume',
      view: 'trades',
    },
  )
})

test('start-here return routing clears stale intents once the user is active elsewhere', () => {
  assert.deepEqual(
    resolveStartHereRoutingAction({
      authSessionId: 'session-1',
      previousAuthSessionId: 'session-1',
      authInterruptionActive: false,
      currentView: 'dashboard',
      startHereReturnIntent: 'risk',
    }),
    { kind: 'clear' },
  )

  assert.deepEqual(
    resolveStartHereRoutingAction({
      authSessionId: 'session-1',
      previousAuthSessionId: 'session-1',
      authInterruptionActive: true,
      currentView: 'settings',
      startHereReturnIntent: 'risk',
    }),
    { kind: 'noop' },
  )
})
