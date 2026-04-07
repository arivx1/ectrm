export const WORKSPACE_NAV_ITEMS = [
  'Dashboard',
  'Guide',
  'Trading',
  'Events',
  'Deliveries',
  'Scheduling',
  'Risk',
  'Positions',
  'Operations',
  'Settlement',
  'Reports',
  'Reference Data',
  'Admin',
  'Settings',
  'Assistant',
] as const

export const MOBILE_NAVIGATION_PANEL_ID = 'primary-navigation-panel'
export const MOBILE_NAV_MEDIA_QUERY = '(max-width: 960px)'

type ClientSideNavigationEvent = {
  altKey: boolean
  button: number
  ctrlKey: boolean
  defaultPrevented: boolean
  metaKey: boolean
  shiftKey: boolean
}

export function shouldHideMobileNavigation(args: {
  isMobileViewport: boolean
  mobileNavOpen: boolean
}) {
  return args.isMobileViewport && !args.mobileNavOpen
}

export function mobileNavigationToggleLabel(mobileNavOpen: boolean) {
  return mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'
}

export function shouldHandleClientSideNavigation(event: ClientSideNavigationEvent) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  )
}
