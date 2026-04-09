import type { ViewKey } from '../../shared/models'

export type AppDataGroup =
  | 'core'
  | 'reference'
  | 'risk'
  | 'deliveries'
  | 'operations'
  | 'settlement'
  | 'reports'
  | 'admin'

export type AppDataGroupFlags = Record<AppDataGroup, boolean>
export type AppDataGroupErrors = Record<AppDataGroup, string>

export const EMPTY_GROUP_FLAGS: AppDataGroupFlags = {
  core: false,
  reference: false,
  risk: false,
  deliveries: false,
  operations: false,
  settlement: false,
  reports: false,
  admin: false,
}

export const EMPTY_GROUP_ERRORS: AppDataGroupErrors = {
  core: '',
  reference: '',
  risk: '',
  deliveries: '',
  operations: '',
  settlement: '',
  reports: '',
  admin: '',
}

export const VIEW_DATA_GROUPS: Record<ViewKey, AppDataGroup[]> = {
  dashboard: ['reference'],
  guide: [],
  trades: ['reference', 'operations'],
  events: [],
  risk: ['reference', 'risk'],
  positions: ['reference'],
  shipments: ['deliveries'],
  scheduling: ['deliveries'],
  operations: ['deliveries', 'operations', 'admin'],
  settlement: ['operations', 'settlement'],
  reports: ['reports'],
  reference: ['reference'],
  admin: ['reference', 'admin'],
  settings: [],
  assistant: [],
}

export const VIEW_BLOCKING_GROUPS: Record<ViewKey, AppDataGroup[]> = {
  dashboard: [],
  guide: [],
  trades: ['reference'],
  events: [],
  risk: ['risk'],
  positions: [],
  shipments: ['deliveries'],
  scheduling: ['deliveries'],
  operations: ['deliveries', 'operations'],
  settlement: ['operations', 'settlement'],
  reports: [],
  reference: ['reference'],
  admin: ['admin'],
  settings: [],
  assistant: [],
}

type BuildRequestedGroupsArgs = {
  currentView: ViewKey
  force?: boolean
  groupLoaded: AppDataGroupFlags
  groupLoading: AppDataGroupFlags
  groups?: AppDataGroup[]
}

export function buildRequestedGroups({
  currentView,
  force = true,
  groupLoaded,
  groupLoading,
  groups,
}: BuildRequestedGroupsArgs): AppDataGroup[] {
  return Array.from(
    new Set<AppDataGroup>([
      'core',
      ...(groups ??
        [
          ...VIEW_DATA_GROUPS[currentView],
          ...(Object.entries(groupLoaded) as Array<[AppDataGroup, boolean]>)
            .filter(([, loaded]) => loaded)
            .map(([group]) => group),
        ]),
    ]),
  ).filter((group) => force || (!groupLoaded[group] && !groupLoading[group]))
}

type DeriveWorkspaceStatusArgs = {
  appLoading: boolean
  currentView: ViewKey
  error: string
  groupErrors: AppDataGroupErrors
  groupLoaded: AppDataGroupFlags
  groupLoading: AppDataGroupFlags
}

export function deriveWorkspaceStatus({
  appLoading,
  currentView,
  error,
  groupErrors,
  groupLoaded,
  groupLoading,
}: DeriveWorkspaceStatusArgs): {
  blockingWorkspaceError: AppDataGroup | null
  workspaceLoading: boolean
  workspaceWarning: AppDataGroup | null
  systemStateLabel: string
  systemStateTone: 'active' | 'cancelled'
} {
  const blockingGroups = VIEW_BLOCKING_GROUPS[currentView]
  const blockingWorkspaceError =
    blockingGroups.find((group) => !groupLoaded[group] && groupErrors[group]) ?? null
  const workspaceLoading = blockingGroups.some(
    (group) => groupLoading[group] && !groupLoaded[group],
  )
  const workspaceWarning =
    VIEW_DATA_GROUPS[currentView].find(
      (group) => groupErrors[group] && group !== blockingWorkspaceError,
    ) ?? null
  const authenticationIssue =
    /authentication is required/i.test(error) ||
    Object.values(groupErrors).some((message) => /authentication is required/i.test(message))

  const systemStateLabel = error
    ? authenticationIssue
      ? 'Authentication required'
      : 'API unavailable'
    : appLoading
      ? 'Loading shell'
      : blockingWorkspaceError
        ? 'Workspace issue'
        : workspaceLoading
          ? 'Loading workspace'
          : workspaceWarning
            ? groupLoaded[workspaceWarning]
              ? 'Using cached data'
              : 'Partial data'
            : 'Connected'

  return {
    blockingWorkspaceError,
    workspaceLoading,
    workspaceWarning,
    systemStateLabel,
    systemStateTone: error || blockingWorkspaceError ? 'cancelled' : 'active',
  }
}
