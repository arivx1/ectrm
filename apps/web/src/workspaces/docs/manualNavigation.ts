import type { ViewKey } from '../../shared/models'

type ManualSectionId =
  | 'start-here'
  | 'book-or-amend-a-trade'
  | 'investigate-a-trade-or-exposure-question'
  | 'run-post-trade-work'
  | 'troubleshooting-matrix'
  | 'access-and-safe-use'
  | 'visual-walkthroughs'

type RelatedHelpLink = {
  sectionId: ManualSectionId
  label: string
}

type RelatedWorkspaceLink = {
  view: Exclude<ViewKey, 'guide'>
  label: string
}

export type RelatedManualHelp = {
  title: string
  sectionLinks: RelatedHelpLink[]
  workspaceLinks: RelatedWorkspaceLink[]
}

const KNOWN_MANUAL_SECTIONS = new Set<ManualSectionId>([
  'start-here',
  'book-or-amend-a-trade',
  'investigate-a-trade-or-exposure-question',
  'run-post-trade-work',
  'troubleshooting-matrix',
  'access-and-safe-use',
  'visual-walkthroughs',
])

const VIEW_MANUAL_SECTION: Partial<Record<ViewKey, ManualSectionId>> = {
  dashboard: 'start-here',
  demo: 'start-here',
  pretrade: 'book-or-amend-a-trade',
  trades: 'book-or-amend-a-trade',
  events: 'book-or-amend-a-trade',
  risk: 'investigate-a-trade-or-exposure-question',
  positions: 'investigate-a-trade-or-exposure-question',
  reports: 'investigate-a-trade-or-exposure-question',
  shipments: 'run-post-trade-work',
  scheduling: 'run-post-trade-work',
  operations: 'run-post-trade-work',
  settlement: 'troubleshooting-matrix',
  reference: 'access-and-safe-use',
  admin: 'access-and-safe-use',
  settings: 'access-and-safe-use',
  assistant: 'access-and-safe-use',
}

export function manualSectionIdForView(view: ViewKey): ManualSectionId {
  return VIEW_MANUAL_SECTION[view] ?? 'start-here'
}

export function authGateManualSectionId(): ManualSectionId {
  return 'access-and-safe-use'
}

export function normalizeManualSectionId(value: string | null | undefined): ManualSectionId {
  const normalized = (value ?? '').trim().toLowerCase()
  return KNOWN_MANUAL_SECTIONS.has(normalized as ManualSectionId)
    ? (normalized as ManualSectionId)
    : 'start-here'
}

export function relatedHelpForManualSection(sectionId: string): RelatedManualHelp {
  const normalizedSectionId = normalizeManualSectionId(sectionId)
  if (normalizedSectionId === 'book-or-amend-a-trade') {
    return {
      title: 'Related Help',
      sectionLinks: [
        {
          sectionId: 'investigate-a-trade-or-exposure-question',
          label: 'Investigate trade or exposure questions',
        },
        {
          sectionId: 'troubleshooting-matrix',
          label: 'Troubleshooting matrix',
        },
      ],
      workspaceLinks: [
        {
          view: 'trades',
          label: 'Open Trade Capture',
        },
      ],
    }
  }

  if (normalizedSectionId === 'run-post-trade-work') {
    return {
      title: 'Related Help',
      sectionLinks: [
        {
          sectionId: 'book-or-amend-a-trade',
          label: 'Book or amend a trade',
        },
        {
          sectionId: 'troubleshooting-matrix',
          label: 'Troubleshooting matrix',
        },
      ],
      workspaceLinks: [
        {
          view: 'operations',
          label: 'Open Operations',
        },
      ],
    }
  }

  return {
    title: 'Related Help',
    sectionLinks: [
      {
        sectionId: 'start-here',
        label: 'Start here',
      },
      {
        sectionId: 'access-and-safe-use',
        label: 'Access and safe use',
      },
    ],
    workspaceLinks: [
      {
        view: 'dashboard',
        label: 'Open Dashboard',
      },
    ],
  }
}
