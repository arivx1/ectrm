import type { ViewKey } from '../../shared/models'
import {
  type AppDataGroup,
  VIEW_BLOCKING_GROUPS,
  VIEW_DATA_GROUPS,
} from './workspaceRegistry'

export type { AppDataGroup } from './workspaceRegistry'

export type AppDataGroupFlags = Record<AppDataGroup, boolean>
export type AppDataGroupErrors = Record<AppDataGroup, string>

export const EMPTY_GROUP_FLAGS: AppDataGroupFlags = {
  core: false,
  trades: false,
  events: false,
  positions: false,
  reference: false,
  weather: false,
  risk: false,
  deliveries: false,
  operations: false,
  settlement: false,
  reports: false,
  admin: false,
}

export const EMPTY_GROUP_ERRORS: AppDataGroupErrors = {
  core: '',
  trades: '',
  events: '',
  positions: '',
  reference: '',
  weather: '',
  risk: '',
  deliveries: '',
  operations: '',
  settlement: '',
  reports: '',
  admin: '',
}

const WORKSPACE_GROUP_ISSUE_LABELS: Record<AppDataGroup, string> = {
  core: 'Shell Error',
  trades: 'Trade Data Error',
  events: 'Event Data Error',
  positions: 'Position Data Error',
  reference: 'Reference Data Error',
  weather: 'Weather Error',
  risk: 'Risk Data Error',
  deliveries: 'Delivery Data Error',
  operations: 'Operations Error',
  settlement: 'Settlement Error',
  reports: 'Report Error',
  admin: 'Admin Error',
}

export { VIEW_BLOCKING_GROUPS, VIEW_DATA_GROUPS } from './workspaceRegistry'

export function isAuthenticationRequiredMessage(message: string): boolean {
  return /authentication is required|session expired|unauthorized/i.test(message)
}

export function isApiReachabilityMessage(message: string): boolean {
  return /could not reach api/i.test(message)
}

function extractApiReachabilityTargets(message: string): string[] {
  const explicitTargetsMatch = message.match(/could not reach api at\s+(.+?)\.(?:\s|$)/i)
  if (explicitTargetsMatch) {
    return explicitTargetsMatch[1]
      .split(/\s+or\s+/i)
      .map((target) => target.trim())
      .filter((target) => target.length > 0)
  }

  const backendHostMatch = message.match(/backend is running on\s+([^\s.]+)(?:\s+and|[.])/i)
  if (backendHostMatch) {
    return [backendHostMatch[1]]
  }

  return []
}

function summarizeApiReachabilityMessage(message: string): string {
  const targets = Array.from(
    new Set(
      extractApiReachabilityTargets(message).map((target) => {
        try {
          return new URL(target).host
        } catch {
          return target
        }
      }),
    ),
  )

  if (targets.length === 0) {
    return 'API unavailable. Check that the backend is running, or update API Base Override in Settings.'
  }

  return `API unavailable. Check that the backend is running at ${targets.join(' or ')}, or update API Base Override in Settings.`
}

export function summarizeWorkspaceIssueMessage(
  message: string,
  group?: AppDataGroup | null,
): string {
  if (!message.trim()) {
    return ''
  }

  if (isAuthenticationRequiredMessage(message)) {
    return 'Authentication required'
  }

  if (isApiReachabilityMessage(message)) {
    return summarizeApiReachabilityMessage(message)
  }

  if (group) {
    return WORKSPACE_GROUP_ISSUE_LABELS[group]
  }

  return 'Workspace Error'
}

type SettingsSignInStateArgs = {
  currentView: ViewKey
  error: string
  hasAuthSession: boolean
  showingNavigationSectionLanding: boolean
}

export function shouldPresentSettingsSignInState({
  currentView,
  error,
  hasAuthSession,
  showingNavigationSectionLanding,
}: SettingsSignInStateArgs): boolean {
  const hasNonAuthError = Boolean(error) && !isAuthenticationRequiredMessage(error)

  return (
    currentView === 'settings' &&
    !hasAuthSession &&
    !showingNavigationSectionLanding &&
    !hasNonAuthError
  )
}

export function shouldPresentSignedOutAuthGate(args: {
  currentView: ViewKey
  hasAuthSession: boolean
}): boolean {
  return !args.hasAuthSession
}

type StartHereOverlayArgs = {
  currentView: ViewKey
  hasAuthSession: boolean
  hasStartHereOnboarding: boolean
  hasStartHereReturnIntent: boolean
  hasRouteHandoff?: boolean
  authInterruptionReason: string | null
  hasAuthInterruptionResume: boolean
  usesTerminalMode: boolean
}

export function shouldPresentStartHereOverlay({
  currentView,
  hasAuthSession,
  hasStartHereOnboarding,
  hasStartHereReturnIntent,
  hasRouteHandoff = false,
  authInterruptionReason,
  hasAuthInterruptionResume,
  usesTerminalMode,
}: StartHereOverlayArgs): boolean {
  return (
    hasAuthSession &&
    hasStartHereOnboarding &&
    !(hasStartHereReturnIntent || hasRouteHandoff || usesTerminalMode) &&
    currentView !== 'prompt' &&
    currentView !== 'settings' &&
    currentView !== 'messages' &&
    authInterruptionReason !== 'session_expired' &&
    !hasAuthInterruptionResume
  )
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

type DeriveRetryableWorkspaceGroupsArgs = {
  currentView: ViewKey
  groupErrors: AppDataGroupErrors
  groupLoaded: AppDataGroupFlags
}

export function deriveRetryableWorkspaceGroups({
  currentView,
  groupErrors,
  groupLoaded,
}: DeriveRetryableWorkspaceGroupsArgs): AppDataGroup[] {
  return VIEW_DATA_GROUPS[currentView].filter(
    (group) => !groupLoaded[group] && groupErrors[group].trim().length > 0,
  )
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
  const workspaceLoading =
    appLoading ||
    (blockingWorkspaceError === null &&
      blockingGroups.some((group) => !groupLoaded[group] && !groupErrors[group]))
  const workspaceWarning =
    VIEW_DATA_GROUPS[currentView].find(
      (group) => groupErrors[group] && group !== blockingWorkspaceError,
    ) ?? null
  const authenticationIssue =
    isAuthenticationRequiredMessage(error) ||
    Object.values(groupErrors).some((message) => isAuthenticationRequiredMessage(message))

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
