import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, test, vi } from 'vitest'

import { getDefaultAppearanceSettings } from '../src/shared/appearance'
import { getDefaultTradeCaptureSettings } from '../src/shared/tradeCaptureSettings'
import { SettingsWorkspace } from '../src/workspaces/settings/SettingsWorkspace'

const { usePersistentCollapsibleCardStateMock } = vi.hoisted(() => ({
  usePersistentCollapsibleCardStateMock: vi.fn(),
}))

vi.mock('../src/shared/collapsibleCardState', () => ({
  usePersistentCollapsibleCardState: usePersistentCollapsibleCardStateMock,
}))

function renderSettingsWorkspace() {
  return renderToStaticMarkup(
    createElement(SettingsWorkspace, {
      health: 'ok',
      authSession: {
        sessionId: 'session-1',
        accessToken: 'token-1',
        expiresAt: '2026-05-11T00:00:00Z',
        user: {
          user_id: 'ops.user',
          email: 'ops@example.com',
          display_name: 'Ops User',
          role: 'OPS_ADMIN',
          default_assistant_persona: 'risk',
          assistant_context_blurb: 'I cover morning operations and prefer exposure risk first.',
        },
      },
      appearanceSettings: getDefaultAppearanceSettings(),
      tradeCaptureSettings: getDefaultTradeCaptureSettings(),
      bookOptions: [
        {
          code: 'NG',
          name: 'Natural Gas',
        },
      ],
      commodityClassOptions: ['Gas'],
      resolvedColorMode: 'light',
      onAppearanceSettingsChange: (settings) => settings,
      onAppearanceSettingsReset: () => getDefaultAppearanceSettings(),
      onTradeCaptureSettingsChange: (settings) => settings,
      onTradeCaptureSettingsReset: () => getDefaultTradeCaptureSettings(),
      onSessionChange: () => undefined,
    }),
  )
}

beforeEach(() => {
  usePersistentCollapsibleCardStateMock.mockReset()
  usePersistentCollapsibleCardStateMock.mockImplementation(
    (_cardKey: string, defaultExpanded: boolean) => ({
      expanded: defaultExpanded,
      hasPersistedValue: false,
      setExpanded: () => undefined,
    }),
  )
})

test('settings workspace renders top-level settings cards collapsed by default', () => {
  const markup = renderSettingsWorkspace()

  assert.match(
    markup,
    /aria-expanded="false" aria-controls="settings-active-session-card-panel"/,
  )
  assert.match(
    markup,
    /id="settings-active-session-card-panel" class="settings-disclosure-body" hidden=""/,
  )
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="settings-appearance-card-panel"/,
  )
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="settings-user-profile-card-panel"/,
  )
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="settings-trade-ticket-defaults-card-panel"/,
  )
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="settings-public-api-settings-card-panel"/,
  )
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="settings-google-calendar-card-panel"/,
  )
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="settings-custom-events-card-panel"/,
  )
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="settings-quick-read-card-panel"/,
  )
})

test('settings workspace renders persistent user profile controls', () => {
  usePersistentCollapsibleCardStateMock.mockImplementation((cardKey: string) => ({
    expanded: cardKey === 'settings.user-profile-card',
    hasPersistedValue: cardKey === 'settings.user-profile-card',
    setExpanded: () => undefined,
  }))

  const markup = renderSettingsWorkspace()

  assert.match(
    markup,
    /aria-expanded="true" aria-controls="settings-user-profile-card-panel"/,
  )
  assert.match(markup, /User Profile/)
  assert.match(markup, /Default persona/)
  assert.match(markup, /Risk/)
  assert.match(markup, /AI context/)
  assert.match(markup, /I cover morning operations and prefer exposure risk first\./)
  assert.match(markup, />Save Profile</)
  assert.match(markup, /does not change permissions or approval policy/)
})

test('settings workspace renders expanded card bodies when persisted open', () => {
  usePersistentCollapsibleCardStateMock.mockImplementation((cardKey: string) => ({
    expanded: cardKey === 'settings.trade-ticket-defaults-card',
    hasPersistedValue: cardKey === 'settings.trade-ticket-defaults-card',
    setExpanded: () => undefined,
  }))

  const markup = renderSettingsWorkspace()

  assert.match(
    markup,
    /aria-expanded="true" aria-controls="settings-trade-ticket-defaults-card-panel"/,
  )
  assert.match(markup, /id="settings-trade-ticket-defaults-card-panel" class="settings-disclosure-body"/)
  assert.doesNotMatch(
    markup,
    /id="settings-trade-ticket-defaults-card-panel" class="settings-disclosure-body" hidden=""/,
  )
  assert.match(markup, /Hide card/)
  assert.match(markup, /New Ticket Starting Values/)
  assert.match(markup, /Rule Stack/)
})

test('settings workspace renders the custom event entry form when that card is expanded', () => {
  usePersistentCollapsibleCardStateMock.mockImplementation((cardKey: string) => ({
    expanded: cardKey === 'settings.custom-events-card',
    hasPersistedValue: cardKey === 'settings.custom-events-card',
    setExpanded: () => undefined,
  }))

  const markup = renderSettingsWorkspace()

  assert.match(
    markup,
    /id="settings-custom-events-card" class="surface settings-disclosure-card is-expanded"/,
  )
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="settings-custom-events-card-panel"/,
  )
  assert.match(markup, /Event name/)
  assert.match(markup, /This first pass saves custom events in the current browser timezone\./)
  assert.match(markup, /Add Event/)
})

test('settings workspace exposes guided and market terminal shell modes in the appearance card', () => {
  usePersistentCollapsibleCardStateMock.mockImplementation((cardKey: string) => ({
    expanded: cardKey === 'settings.appearance-card',
    hasPersistedValue: cardKey === 'settings.appearance-card',
    setExpanded: () => undefined,
  }))

  const markup = renderSettingsWorkspace()

  assert.match(
    markup,
    /aria-expanded="true" aria-controls="settings-appearance-card-panel"/,
  )
  assert.match(markup, /Workspace mode/)
  assert.match(markup, /Guided workspace/)
  assert.match(markup, /Market terminal/)
  assert.match(markup, /Landing and density mode/)
  assert.match(markup, /Theme and palette/)
  assert.match(markup, />Reset Appearance</)
})

test('settings workspace renders home calendar overlay controls inside the Google Calendar card', () => {
  usePersistentCollapsibleCardStateMock.mockImplementation((cardKey: string) => ({
    expanded: cardKey === 'settings.google-calendar-card',
    hasPersistedValue: cardKey === 'settings.google-calendar-card',
    setExpanded: () => undefined,
  }))

  const markup = renderSettingsWorkspace()

  assert.match(
    markup,
    /aria-expanded="true" aria-controls="settings-google-calendar-card-panel"/,
  )
  assert.match(markup, /Home overlays/)
  assert.match(markup, /3 of 3 enabled/)
  assert.match(markup, /Day card/)
  assert.match(markup, /Week card/)
  assert.match(markup, /Month card/)
  assert.match(markup, /These preferences stay in this browser and update Home right away\./)
})
