import { postJson, putJson } from '../../shared/api'
import { buildMutationHeaders } from '../../shared/mutation'

export async function submitReferenceMutation(
  apiBase: string,
  path: string,
  method: 'POST' | 'PUT',
  payload: Record<string, unknown>,
): Promise<void> {
  if (method === 'POST') {
    await postJson<void>(`${apiBase}${path}`, payload, { headers: buildMutationHeaders() })
    return
  }

  await putJson<void>(`${apiBase}${path}`, payload, { headers: buildMutationHeaders() })
}

export async function toggleReferenceActivation(
  apiBase: string,
  path: string,
  updatedBy: string,
): Promise<void> {
  await postJson<void>(`${apiBase}${path}`, { updated_by: updatedBy }, { headers: buildMutationHeaders() })
}
