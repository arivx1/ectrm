import { APP_VIEWS } from '../entities/app/appViews'
import type { ViewKey } from '../shared/models'

export const MAX_PRIMARY_NAV_SECTIONS = 5

const PRIMARY_NAV_SECTION_DEFINITIONS = [
  {
    key: 'overview',
    label: 'Start',
    kicker: 'Start here',
    heroTitle: 'Start',
    heroBody: '',
    landingBody: '',
    landingViewKey: 'prompt',
    viewKeys: ['prompt', 'dashboard'],
    startPaths: [],
  },
  {
    key: 'trading',
    label: 'Trade & Exposure',
    kicker: 'Commercial',
    heroTitle: 'Capture trades and understand exposure',
    heroBody:
      'Move from ticket entry into activity, exposure, and net positions without guessing which screen owns which job.',
    landingBody:
      'Use this section when the job is booking a trade, tracing its recent changes, or understanding where open exposure sits.',
    viewKeys: ['pretrade', 'trades', 'events', 'risk', 'positions'],
    startPaths: [
      {
        title: 'Build a pre-trade view',
        detail: 'Pull desk context, live external signals, and a proposed structure together before the trade reaches capture.',
        viewKey: 'pretrade',
        actionLabel: 'Open Pre-Trade',
      },
      {
        title: 'Capture a trade',
        detail: 'Open the trade blotter and ticket-entry workflow when the desk needs to book or amend a position.',
        viewKey: 'trades',
        actionLabel: 'Open Trade Capture',
      },
      {
        title: 'Investigate a trade issue',
        detail: 'Open the activity feed first when you need to see what changed, who changed it, and which trade needs follow-up.',
        viewKey: 'events',
        actionLabel: 'Open Activity Feed',
      },
      {
        title: 'Check exposure',
        detail: 'See concentration, unpriced risk, and the books carrying the most open exposure first.',
        viewKey: 'risk',
        actionLabel: 'Open Exposure',
      },
      {
        title: 'Inspect net positions',
        detail: 'Review commodity and book-level net positions when the question is inventory or directional balance.',
        viewKey: 'positions',
        actionLabel: 'Open Net Positions',
      },
    ],
  },
  {
    key: 'execution',
    label: 'Post-Trade',
    kicker: 'Follow-through',
    heroTitle: 'Deliveries, work queues, and settlement',
    heroBody:
      'Follow a trade from delivery readiness into operational queues and cash settlement without losing the story.',
    landingBody:
      'Use this section when the work has moved past capture and into delivery, coordination, exception clearing, or cash follow-through.',
    viewKeys: ['shipments', 'scheduling', 'operations', 'settlement'],
    startPaths: [
      {
        title: 'Review delivery blockers',
        detail: 'Start with delivery obligations when the question is what needs to move, schedule, or clear operationally.',
        viewKey: 'shipments',
        actionLabel: 'Open Deliveries',
      },
      {
        title: 'Run the work queue',
        detail: 'Use the operational queue when teams are working confirmations, blockers, approvals, and open handoffs.',
        viewKey: 'operations',
        actionLabel: 'Open Work Queue',
      },
      {
        title: 'Check cash status',
        detail: 'Open settlement when the question is invoicing, payment aging, or downstream cash exceptions.',
        viewKey: 'settlement',
        actionLabel: 'Open Settlement',
      },
    ],
  },
  {
    key: 'intelligence',
    label: 'Analysis',
    kicker: 'Understand',
    heroTitle: 'Messaging, documents, reports, maps, and desk support',
    heroBody:
      'Jump between messaging, uploaded documents, reporting, spatial context, reference data, and the assistant when you need answers faster than raw tables can give them.',
    landingBody:
      'Use this section for analyst-style work: inbox review, document inspection, map analysis, reporting, desk reference maintenance, and grounded AI assistance.',
    viewKeys: ['messages', 'library', 'reports', 'map', 'reference', 'assistant'],
    startPaths: [
      {
        title: 'Review messages',
        detail: 'Open the unified messaging view when the work starts with inbox follow-up across desk messages, queue digests, and system notices.',
        viewKey: 'messages',
        actionLabel: 'Open Messages',
      },
      {
        title: 'Browse uploaded files',
        detail: 'Open the document library when the work starts with a PDF, confirmation packet, invoice, or other file that has already been uploaded.',
        viewKey: 'library',
        actionLabel: 'Open Library',
      },
      {
        title: 'Review physical footprint',
        detail: 'Open the dedicated map workspace to inspect map-ready assets, shared routes, and governed regions without entering maintenance mode.',
        viewKey: 'map',
        actionLabel: 'Open Map',
      },
      {
        title: 'Run a report',
        detail: 'Open curated desk reporting when someone needs an answer on exposure, activity, credit, or settlement.',
        viewKey: 'reports',
        actionLabel: 'Open Reports',
      },
      {
        title: 'Maintain reference data',
        detail: 'Update books, portfolios, commodities, locations, or counterparties without leaving the product.',
        viewKey: 'reference',
        actionLabel: 'Open Reference Data',
      },
      {
        title: 'Ask for help',
        detail: 'Use the assistant when you need grounded desk context or a quicker explanation of what is happening.',
        viewKey: 'assistant',
        actionLabel: 'Open Assistant',
      },
    ],
  },
  {
    key: 'administration',
    label: 'Settings & Admin',
    kicker: 'Control',
    heroTitle: 'Access, settings, and privileged controls',
    heroBody:
      'Keep sign-in, runtime settings, sync health, AI usage, and privileged controls together without burying them under trading screens.',
    landingBody:
      'Use this section when the task is configuring the console, signing in, checking runtime health, reviewing token usage, or running privileged maintenance.',
    viewKeys: ['token-analysis', 'admin', 'settings'],
    startPaths: [
      {
        title: 'Review token usage',
        detail: 'Open the token tracker when you want AI provider usage by day, week, or month without opening the Assistant Console.',
        viewKey: 'token-analysis',
        actionLabel: 'Open Token Tracker',
      },
      {
        title: 'Sign in or configure access',
        detail: 'Open settings when you need to connect the app, manage session details, or adjust runtime behavior.',
        viewKey: 'settings',
        actionLabel: 'Open Settings',
      },
      {
        title: 'Run admin controls',
        detail: 'Open the admin console for governance, sync operations, privileged tooling, and runtime oversight.',
        viewKey: 'admin',
        actionLabel: 'Open Admin Console',
      },
    ],
  },
] satisfies Array<{
  key: string
  label: string
  kicker: string
  heroTitle: string
  heroBody: string
  landingBody: string
  landingViewKey?: ViewKey
  viewKeys: ViewKey[]
  startPaths: Array<{
    title: string
    detail: string
    viewKey: ViewKey
    actionLabel: string
  }>
}>

export type PrimaryNavigationSectionKey = (typeof PRIMARY_NAV_SECTION_DEFINITIONS)[number]['key']

export type PrimaryNavigationSection = {
  key: PrimaryNavigationSectionKey
  label: string
  kicker: string
  heroTitle: string
  heroBody: string
  landingBody: string
  landingViewKey: ViewKey | null
  views: typeof APP_VIEWS
  startPaths: Array<{
    title: string
    detail: string
    actionLabel: string
    view: (typeof APP_VIEWS)[number]
  }>
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
  landingViewKey: section.landingViewKey ?? null,
  views: section.viewKeys.map((viewKey) => {
    const view = APP_VIEW_BY_KEY.get(viewKey)
    if (!view) {
      throw new Error(`Missing view definition for ${viewKey}`)
    }
    return view
  }),
  startPaths: section.startPaths.map((path) => {
    const view = APP_VIEW_BY_KEY.get(path.viewKey)
    if (!view) {
      throw new Error(`Missing view definition for ${path.viewKey}`)
    }
    return {
      title: path.title,
      detail: path.detail,
      actionLabel: path.actionLabel,
      view,
    }
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

export function primaryNavigationSectionLandingView(sectionKey: PrimaryNavigationSectionKey): ViewKey | null {
  return primaryNavigationSectionByKey(sectionKey).landingViewKey
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
