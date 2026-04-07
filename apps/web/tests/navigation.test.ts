import { describe, expect, it } from 'vitest'

import {
  MOBILE_NAV_MEDIA_QUERY,
  MOBILE_NAVIGATION_PANEL_ID,
  mobileNavigationToggleLabel,
  shouldHandleClientSideNavigation,
  shouldHideMobileNavigation,
} from '../src/app/navigation'

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
})
