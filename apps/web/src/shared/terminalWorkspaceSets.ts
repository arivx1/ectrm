import type { PersonalizableWorkspaceId } from './layouts'
import type { ViewKey } from './models'
import { getWorkspaceLayoutPresets } from './workspaceLayoutPresets'

export const TERMINAL_WORKSPACE_SET_STORAGE_KEY = 'ectrm.terminal-workspace-set.v1'

export const TERMINAL_WORKSPACE_SET_IDS = [
  'trader-morning',
  'risk-review',
  'ops-close',
] as const

export type TerminalWorkspaceSetId = (typeof TERMINAL_WORKSPACE_SET_IDS)[number]

export type TerminalWorkspaceSetRouteRole = 'primary' | 'monitor' | 'reference'

export type TerminalWorkspaceSetPreset = {
  workspaceId: PersonalizableWorkspaceId
  presetId: string
  label: string
}

export type TerminalWorkspaceSetRoute = {
  id: string
  view: ViewKey
  label: string
  purpose: string
  role: TerminalWorkspaceSetRouteRole
  preset?: TerminalWorkspaceSetPreset
}

export type TerminalWorkspaceSet = {
  id: TerminalWorkspaceSetId
  label: string
  shortLabel: string
  description: string
  operatorGoal: string
  routes: readonly TerminalWorkspaceSetRoute[]
}

export type TerminalWorkspaceSetLaunchTarget = TerminalWorkspaceSetRoute & {
  href: string
  presetAvailable: boolean
}

export type TerminalWorkspaceSetStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const DEFAULT_TERMINAL_WORKSPACE_SET_ID: TerminalWorkspaceSetId = 'trader-morning'

const TERMINAL_WORKSPACE_SETS: readonly TerminalWorkspaceSet[] = [
  {
    id: 'trader-morning',
    label: 'Trader Morning',
    shortLabel: 'Trader AM',
    description: 'Start with market pulse, desk work, exposure, and reporting before the trading day gets loud.',
    operatorGoal: 'Open the screens a trader usually wants before deciding where to act.',
    routes: [
      {
        id: 'home',
        view: 'prompt',
        label: 'Apps',
        purpose: 'Configurable Home apps, saved views, market cards, and assistant prompts.',
        role: 'primary',
      },
      {
        id: 'trade-capture',
        view: 'trades',
        label: 'Trade Capture',
        purpose: 'Blotter and ticket panel for governed booking or amendment work.',
        role: 'monitor',
      },
      {
        id: 'exposure',
        view: 'risk',
        label: 'Exposure',
        purpose: 'Risk summary, concentration, pricing coverage, and option-expiry pressure.',
        role: 'monitor',
        preset: {
          workspaceId: 'risk',
          presetId: 'risk-board',
          label: 'Risk Board',
        },
      },
      {
        id: 'reports',
        view: 'reports',
        label: 'Reports',
        purpose: 'Desk reporting, EOD packages, and operator-ready summaries.',
        role: 'reference',
      },
    ],
  },
  {
    id: 'risk-review',
    label: 'Risk Review',
    shortLabel: 'Risk',
    description: 'Bring exposure, net positions, market context, and reports together for risk review.',
    operatorGoal: 'Compare Home apps with risk and position screens without losing route safety.',
    routes: [
      {
        id: 'exposure',
        view: 'risk',
        label: 'Exposure',
        purpose: 'Risk Board preset for exposure, pricing gaps, marks, and expiry queues.',
        role: 'primary',
        preset: {
          workspaceId: 'risk',
          presetId: 'risk-board',
          label: 'Risk Board',
        },
      },
      {
        id: 'net-positions',
        view: 'positions',
        label: 'Net Positions',
        purpose: 'Commodity and book balances to reconcile against exposure and market context.',
        role: 'monitor',
      },
      {
        id: 'home',
        view: 'prompt',
        label: 'Apps',
        purpose: 'Configurable Home apps and market context before risk drill-down.',
        role: 'monitor',
      },
      {
        id: 'reports',
        view: 'reports',
        label: 'Reports',
        purpose: 'Risk and desk reporting packets for review or escalation.',
        role: 'reference',
      },
    ],
  },
  {
    id: 'ops-close',
    label: 'Ops Close',
    shortLabel: 'Ops',
    description: 'Line up post-trade blockers, settlement, scheduling, and delivery execution near day close.',
    operatorGoal: 'Give operations a repeatable end-of-day cockpit over the workspaces that own the queues.',
    routes: [
      {
        id: 'work-queue',
        view: 'operations',
        label: 'Work Queue',
        purpose: 'Operations Monitor preset for queues, confirmations, documents, exceptions, and feeds.',
        role: 'primary',
        preset: {
          workspaceId: 'operations',
          presetId: 'operations-monitor',
          label: 'Operations Monitor',
        },
      },
      {
        id: 'settlement',
        view: 'settlement',
        label: 'Settlement',
        purpose: 'Invoice, payment, and settlement exceptions owned by the settlement workspace.',
        role: 'monitor',
      },
      {
        id: 'scheduling',
        view: 'scheduling',
        label: 'Scheduling',
        purpose: 'Delivery windows, nomination readiness, and scheduler blockers.',
        role: 'monitor',
      },
      {
        id: 'deliveries',
        view: 'shipments',
        label: 'Deliveries',
        purpose: 'Logistics execution, movements, checkpoints, and exception state.',
        role: 'reference',
      },
      {
        id: 'reports',
        view: 'reports',
        label: 'Reports',
        purpose: 'Operational closeout reporting and review packages.',
        role: 'reference',
      },
    ],
  },
]

const TERMINAL_WORKSPACE_SET_BY_ID = Object.fromEntries(
  TERMINAL_WORKSPACE_SETS.map((workspaceSet) => [workspaceSet.id, workspaceSet]),
) as Record<TerminalWorkspaceSetId, TerminalWorkspaceSet>

function browserTerminalWorkspaceSetStorage(): TerminalWorkspaceSetStorage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function listTerminalWorkspaceSets(): readonly TerminalWorkspaceSet[] {
  return TERMINAL_WORKSPACE_SETS
}

export function isTerminalWorkspaceSetId(value: string | null | undefined): value is TerminalWorkspaceSetId {
  return TERMINAL_WORKSPACE_SET_IDS.includes(value as TerminalWorkspaceSetId)
}

export function parseTerminalWorkspaceSetId(value: string | null | undefined): TerminalWorkspaceSetId | null {
  return isTerminalWorkspaceSetId(value) ? value : null
}

export function resolveTerminalWorkspaceSet(
  value: string | null | undefined,
): TerminalWorkspaceSet {
  const workspaceSetId = parseTerminalWorkspaceSetId(value) ?? DEFAULT_TERMINAL_WORKSPACE_SET_ID
  return TERMINAL_WORKSPACE_SET_BY_ID[workspaceSetId]
}

export function readDefaultTerminalWorkspaceSetId(
  storage: TerminalWorkspaceSetStorage | null = browserTerminalWorkspaceSetStorage(),
): TerminalWorkspaceSetId {
  if (!storage) {
    return DEFAULT_TERMINAL_WORKSPACE_SET_ID
  }

  try {
    return parseTerminalWorkspaceSetId(storage.getItem(TERMINAL_WORKSPACE_SET_STORAGE_KEY)) ??
      DEFAULT_TERMINAL_WORKSPACE_SET_ID
  } catch {
    return DEFAULT_TERMINAL_WORKSPACE_SET_ID
  }
}

export function saveDefaultTerminalWorkspaceSetId(
  workspaceSetId: TerminalWorkspaceSetId,
  storage: TerminalWorkspaceSetStorage | null = browserTerminalWorkspaceSetStorage(),
): boolean {
  if (!storage) {
    return false
  }

  try {
    storage.setItem(TERMINAL_WORKSPACE_SET_STORAGE_KEY, workspaceSetId)
    return true
  } catch {
    return false
  }
}

export function clearDefaultTerminalWorkspaceSetId(
  storage: TerminalWorkspaceSetStorage | null = browserTerminalWorkspaceSetStorage(),
): boolean {
  if (!storage) {
    return false
  }

  try {
    storage.removeItem(TERMINAL_WORKSPACE_SET_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

export function buildTerminalWorkspaceSetLaunchTargets(
  workspaceSet: TerminalWorkspaceSet,
  hrefForView: (view: ViewKey) => string,
): TerminalWorkspaceSetLaunchTarget[] {
  return workspaceSet.routes.map((route) => ({
    ...route,
    href: hrefForView(route.view),
    presetAvailable: isTerminalWorkspaceSetPresetAvailable(route),
  }))
}

export function getPrimaryTerminalWorkspaceSetRoute(
  workspaceSet: TerminalWorkspaceSet,
): TerminalWorkspaceSetRoute {
  return workspaceSet.routes.find((route) => route.role === 'primary') ?? workspaceSet.routes[0]
}

export function isTerminalWorkspaceSetPresetAvailable(route: TerminalWorkspaceSetRoute): boolean {
  if (!route.preset) {
    return true
  }

  return getWorkspaceLayoutPresets(route.preset.workspaceId).some(
    (preset) => preset.id === route.preset?.presetId,
  )
}

export function getInvalidTerminalWorkspaceSetPresetReferences(): string[] {
  return TERMINAL_WORKSPACE_SETS.flatMap((workspaceSet) =>
    workspaceSet.routes
      .filter((route) => !isTerminalWorkspaceSetPresetAvailable(route))
      .map((route) => `${workspaceSet.id}:${route.id}:${route.preset?.presetId ?? 'missing'}`),
  )
}
