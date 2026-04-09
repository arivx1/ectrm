import { APP_VIEWS } from '../entities/app/appViews'
import type { ViewKey } from '../shared/models'

export const MAX_PRIMARY_NAV_SECTIONS = 5

const PRIMARY_NAV_SECTION_DEFINITIONS = [
  {
    key: 'overview',
    label: 'Overview',
    kicker: 'Start here',
    heroTitle: 'Overview surfaces and desk orientation',
    heroBody: 'Start with the live desk picture, then move into the operator guide when you need workflow context and operating language.',
    landingBody: 'Use this section to get oriented quickly before drilling into a specific trading, execution, or control workflow.',
    viewKeys: ['dashboard', 'guide'],
  },
  {
    key: 'trading',
    label: 'Trading',
    kicker: 'Front office',
    heroTitle: 'Trading surfaces for capture and exposure context',
    heroBody: 'Move from blotter entry into lifecycle review, exposure concentration, and positions without losing the active trading thread.',
    landingBody: 'This section groups the front-office and near-trade surfaces operators use when entering, reviewing, and sizing exposure.',
    viewKeys: ['trades', 'events', 'risk', 'positions'],
  },
  {
    key: 'execution',
    label: 'Execution',
    kicker: 'Lifecycle',
    heroTitle: 'Execution surfaces for post-trade flow',
    heroBody: 'Follow obligations from deliveries into scheduling, operational queues, and settlement so post-trade work stays connected.',
    landingBody: 'This section is where commodity movement, workflow readiness, and cash follow-through stay visible as one operating loop.',
    viewKeys: ['shipments', 'scheduling', 'operations', 'settlement'],
  },
  {
    key: 'intelligence',
    label: 'Intelligence',
    kicker: 'Analyze',
    heroTitle: 'Intelligence surfaces for analysis and support',
    heroBody: 'Jump between reporting, reference maintenance, and the desk copilot when you need answers, master data, or grounded assistance.',
    landingBody: 'Use this section for analyst-style work: reporting, registry maintenance, and AI-assisted desk investigation.',
    viewKeys: ['reports', 'reference', 'assistant'],
  },
  {
    key: 'administration',
    label: 'Admin',
    kicker: 'Control',
    heroTitle: 'Administrative controls and runtime governance',
    heroBody: 'Keep privileged controls, governance flows, and runtime configuration close together without burying them under trading screens.',
    landingBody: 'This section is for operators and admins managing runtime access, governance, sync health, and privileged maintenance.',
    viewKeys: ['admin', 'settings'],
  },
] satisfies Array<{
  key: string
  label: string
  kicker: string
  heroTitle: string
  heroBody: string
  landingBody: string
  viewKeys: ViewKey[]
}>

export type PrimaryNavigationSectionKey = (typeof PRIMARY_NAV_SECTION_DEFINITIONS)[number]['key']

export type PrimaryNavigationSection = {
  key: PrimaryNavigationSectionKey
  label: string
  kicker: string
  heroTitle: string
  heroBody: string
  landingBody: string
  views: typeof APP_VIEWS
}

const APP_VIEW_BY_KEY = new Map(APP_VIEWS.map((view) => [view.key, view]))
const PRIMARY_NAV_SECTION_BY_KEY = new Map<PrimaryNavigationSectionKey, PrimaryNavigationSection>()
const PRIMARY_NAV_SECTION_KEYS = new Set<PrimaryNavigationSectionKey>(
  PRIMARY_NAV_SECTION_DEFINITIONS.map((section) => section.key),
)

export const PRIMARY_NAV_SECTIONS: PrimaryNavigationSection[] = PRIMARY_NAV_SECTION_DEFINITIONS.map((section) => ({
  key: section.key,
  label: section.label,
  kicker: section.kicker,
  heroTitle: section.heroTitle,
  heroBody: section.heroBody,
  landingBody: section.landingBody,
  views: section.viewKeys.map((viewKey) => {
    const view = APP_VIEW_BY_KEY.get(viewKey)
    if (!view) {
      throw new Error(`Missing view definition for ${viewKey}`)
    }
    return view
  }),
}))
PRIMARY_NAV_SECTIONS.forEach((section) => PRIMARY_NAV_SECTION_BY_KEY.set(section.key, section))

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

export function isPrimaryNavigationSectionKey(value: string | null): value is PrimaryNavigationSectionKey {
  return value !== null && PRIMARY_NAV_SECTION_KEYS.has(value as PrimaryNavigationSectionKey)
}

export function primaryNavigationSectionByKey(sectionKey: PrimaryNavigationSectionKey): PrimaryNavigationSection {
  return PRIMARY_NAV_SECTION_BY_KEY.get(sectionKey) ?? PRIMARY_NAV_SECTIONS[0]
}

export function primaryNavigationSectionForView(view: ViewKey): PrimaryNavigationSection {
  return PRIMARY_NAV_SECTIONS.find((section) => section.views.some((entry) => entry.key === view)) ?? PRIMARY_NAV_SECTIONS[0]
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
