import { postJson, putJson } from '../../shared/api'

export async function submitReferenceMutation(
  apiBase: string,
  path: string,
  method: 'POST' | 'PUT',
  payload: Record<string, unknown>,
): Promise<void> {
  if (method === 'POST') {
    await postJson<void>(`${apiBase}${path}`, payload)
    return
  }

  await putJson<void>(`${apiBase}${path}`, payload)
}

export async function toggleReferenceActivation(
  apiBase: string,
  path: string,
  updatedBy: string,
): Promise<void> {
  await postJson<void>(`${apiBase}${path}`, { updated_by: updatedBy })
}
