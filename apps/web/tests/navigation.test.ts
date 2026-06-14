import { describe, expect, it } from 'vitest'

import {
  isPrimaryNavigationSectionKey,
  MAX_PRIMARY_NAV_SECTIONS,
  MOBILE_NAV_MEDIA_QUERY,
  MOBILE_NAVIGATION_PANEL_ID,
  mobileNavigationToggleLabel,
  PRIMARY_NAV_SECTIONS,
  primaryNavigationSectionLandingView,
  primaryNavigationSectionForView,
  primaryNavigationSectionRendersNestedViews,
  shouldHandleClientSideNavigation,
  shouldHideMobileNavigation,
} from '../src/app/navigation'
import { APP_VIEWS } from '../src/entities/app/appViews'

describe('mobile navigation helpers', () => {
  it('hides the drawer only when the mobile nav is closed on a mobile viewport', () => {
    expect(shouldHideMobileNavigation({ isMobileViewport: true, mobileNavOpen: false })).toBe(true)
    expect(shouldHideMobileNavigation({ isMobileViewport: true, mobileNavOpen: true })).toBe(false)
    expect(shouldHideMobileNavigation({ isMobileViewport: false, mobileNavOpen: false })).toBe(false)
  })

  it('returns descriptive toggle labels for assistive technology', () => {
    expect(mobileNavigationToggleLabel(false)).toBe('Open navigation menu')
    expect(mobileNavigationToggleLabel(true)).toBe('Close navigation menu')
  })

  it('only intercepts plain left clicks for in-app link handling', () => {
    expect(
      shouldHandleClientSideNavigation({
        altKey: false,
        button: 0,
        ctrlKey: false,
        defaultPrevented: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(true)

    expect(
      shouldHandleClientSideNavigation({
        altKey: false,
        button: 1,
        ctrlKey: false,
        defaultPrevented: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(false)

    expect(
      shouldHandleClientSideNavigation({
        altKey: false,
        button: 0,
        ctrlKey: true,
        defaultPrevented: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(false)
  })

  it('keeps the drawer wiring constants stable', () => {
    expect(MOBILE_NAVIGATION_PANEL_ID).toBe('primary-navigation-panel')
    expect(MOBILE_NAV_MEDIA_QUERY).toBe('(max-width: 960px)')
  })

  it('keeps primary navigation grouped to five sections or fewer', () => {
    expect(PRIMARY_NAV_SECTIONS.length).toBeLessThanOrEqual(MAX_PRIMARY_NAV_SECTIONS)

    const sectionViewKeys = PRIMARY_NAV_SECTIONS.flatMap((section) => section.views.map((view) => view.key))
    const navigableViewKeys = APP_VIEWS.map((view) => view.key).filter((viewKey) => viewKey !== 'dashboard')

    expect(sectionViewKeys).toHaveLength(navigableViewKeys.length)
    expect(new Set(sectionViewKeys)).toEqual(new Set(navigableViewKeys))
    expect(PRIMARY_NAV_SECTIONS.find((section) => section.key === 'overview')?.views.map((view) => view.key)).toEqual([
      'prompt',
    ])
  })

  it('defines clear start paths for each section landing', () => {
    for (const section of PRIMARY_NAV_SECTIONS) {
      if (section.landingViewKey !== null) {
        expect(section.startPaths).toEqual([])
        continue
      }

      expect(section.startPaths.length).toBeGreaterThan(0)

      const sectionViewKeys = new Set(section.views.map((view) => view.key))
      const startPathViewKeys = section.startPaths.map((path) => path.view.key)

      expect(new Set(startPathViewKeys).size).toBe(section.startPaths.length)
      startPathViewKeys.forEach((viewKey) => expect(sectionViewKeys.has(viewKey)).toBe(true))
    }

    expect(PRIMARY_NAV_SECTIONS.find((section) => section.key === 'trading')?.startPaths.map((path) => path.title)).toEqual([
      'Build a pre-trade view',
      'Capture a trade',
      'Investigate a trade issue',
      'Check exposure',
      'Inspect net positions',
    ])
  })

  it('routes the overview section directly to Apps instead of rendering a duplicate Home landing page', () => {
    expect(primaryNavigationSectionLandingView('overview')).toBe('prompt')
    expect(primaryNavigationSectionLandingView('trading')).toBeNull()
  })

  it('renders Home as a single nav button without an Apps sub-button', () => {
    const overviewSection = PRIMARY_NAV_SECTIONS.find((section) => section.key === 'overview')

    expect(overviewSection).toBeDefined()
    expect(primaryNavigationSectionRendersNestedViews(overviewSection!)).toBe(false)
    expect(
      PRIMARY_NAV_SECTIONS.filter(primaryNavigationSectionRendersNestedViews).map((section) => section.key),
    ).toEqual(['trading', 'execution', 'intelligence', 'administration'])
  })

  it('maps representative workspaces into their grouped nav sections', () => {
    expect(primaryNavigationSectionForView('prompt').key).toBe('overview')
    expect(primaryNavigationSectionForView('dashboard').key).toBe('overview')
    expect(primaryNavigationSectionForView('pretrade').key).toBe('trading')
    expect(primaryNavigationSectionForView('trades').key).toBe('trading')
    expect(primaryNavigationSectionForView('shipments').key).toBe('execution')
    expect(primaryNavigationSectionForView('messages').key).toBe('intelligence')
    expect(primaryNavigationSectionForView('library').key).toBe('intelligence')
    expect(primaryNavigationSectionForView('map').key).toBe('intelligence')
    expect(primaryNavigationSectionForView('assistant').key).toBe('intelligence')
    expect(primaryNavigationSectionForView('token-analysis').key).toBe('administration')
    expect(primaryNavigationSectionForView('settings').key).toBe('administration')
  })

  it('recognizes supported primary navigation section keys', () => {
    expect(isPrimaryNavigationSectionKey('overview')).toBe(true)
    expect(isPrimaryNavigationSectionKey('trading')).toBe(true)
    expect(isPrimaryNavigationSectionKey('execution')).toBe(true)
    expect(isPrimaryNavigationSectionKey('intelligence')).toBe(true)
    expect(isPrimaryNavigationSectionKey('administration')).toBe(true)
    expect(isPrimaryNavigationSectionKey('dashboard')).toBe(false)
    expect(isPrimaryNavigationSectionKey(null)).toBe(false)
  })
})
