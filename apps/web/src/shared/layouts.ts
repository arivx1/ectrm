import type { ViewKey } from './models'

export type PersonalizableWorkspaceId = Extract<ViewKey, 'dashboard' | 'trades' | 'events' | 'positions' | 'shipments'>
export type WorkspaceTileSpan = 'full' | 'wide' | 'half' | 'side'

export type WorkspaceLayoutState = {
  order: string[]
  hidden: string[]
  spans: Record<string, WorkspaceTileSpan>
}

export type WorkspaceLayoutDefinition = WorkspaceLayoutState & {
  workspace_id: PersonalizableWorkspaceId
  updated_at: string
  updated_by: string
  version: number
}
