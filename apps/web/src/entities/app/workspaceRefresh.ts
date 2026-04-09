import type { ViewKey } from '../../shared/models'
import { VIEW_DATA_GROUPS, type AppDataGroup, type AppDataGroupFlags } from './workspaceLoading'

export type WorkspaceMutationKind =
  | 'trade-event'
  | 'delivery'
  | 'confirmation'
  | 'workflow-item'
  | 'actualization'
  | 'invoice'
  | 'payment'
  | 'admin-external-data'
  | 'admin-counterparty-credit'
  | 'admin-weather-sync'

const MUTATION_GROUPS: Record<WorkspaceMutationKind, AppDataGroup[]> = {
  'trade-event': ['core', 'operations'],
  delivery: ['deliveries'],
  confirmation: ['core', 'deliveries', 'operations'],
  'workflow-item': ['core', 'operations', 'settlement'],
  actualization: ['core', 'deliveries', 'operations'],
  invoice: ['core', 'settlement'],
  payment: ['core', 'settlement'],
  'admin-external-data': ['admin', 'operations'],
  'admin-counterparty-credit': ['admin', 'reference', 'reports', 'operations'],
  'admin-weather-sync': ['admin', 'operations'],
}

export function buildMutationRefreshGroups(args: {
  currentView: ViewKey
  groupLoaded: AppDataGroupFlags
  mutation: WorkspaceMutationKind
}): AppDataGroup[] {
  const { currentView, groupLoaded, mutation } = args
  const loadedGroups = (Object.entries(groupLoaded) as Array<[AppDataGroup, boolean]>)
    .filter(([, loaded]) => loaded)
    .map(([group]) => group)

  return Array.from(
    new Set<AppDataGroup>([
      'core',
      ...VIEW_DATA_GROUPS[currentView],
      ...loadedGroups,
      ...MUTATION_GROUPS[mutation],
    ]),
  )
}
