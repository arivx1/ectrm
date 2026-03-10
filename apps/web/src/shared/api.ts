export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}


export async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  init?: Omit<RequestInit, 'body' | 'method'>,
): Promise<T> {
  return fetchJson<T>(url, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  })
}

export async function putJson<T>(
  url: string,
  body: Record<string, unknown>,
  init?: Omit<RequestInit, 'body' | 'method'>,
): Promise<T> {
  return fetchJson<T>(url, {
    ...init,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  })
}
