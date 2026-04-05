import { fetchJson, putJson } from '../../shared/api'
import type {
  PersonalizableWorkspaceId,
  WorkspaceLayoutDefinition,
  WorkspaceLayoutState,
} from '../../shared/layouts'

function authorizationHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` }
}

export async function loadPersonalWorkspaceLayout(
  apiBase: string,
  accessToken: string,
  workspaceId: PersonalizableWorkspaceId,
): Promise<WorkspaceLayoutDefinition | null> {
  return fetchJson<WorkspaceLayoutDefinition | null>(`${apiBase}/layout-definitions/${workspaceId}`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function savePersonalWorkspaceLayout(
  apiBase: string,
  accessToken: string,
  workspaceId: PersonalizableWorkspaceId,
  layout: WorkspaceLayoutState,
): Promise<WorkspaceLayoutDefinition> {
  return putJson<WorkspaceLayoutDefinition>(`${apiBase}/layout-definitions/${workspaceId}`, layout, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function resetPersonalWorkspaceLayout(
  apiBase: string,
  accessToken: string,
  workspaceId: PersonalizableWorkspaceId,
): Promise<void> {
  const response = await fetch(`${apiBase}/layout-definitions/${workspaceId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }
}
