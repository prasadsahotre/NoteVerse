import { getToken } from '../auth/authStorage'

const API_BASE_URL = 'http://localhost:5000/api/v1'

type ApiOptions = RequestInit

export async function apiRequest<T>(
  endpoint: string,
  options: ApiOptions = {},
): Promise<T> {
  const token = getToken()

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      data?.message || `Request failed with status ${response.status}`,
    )
  }

  return data
}

export async function apiDownload(endpoint: string): Promise<Blob> {
  const token = getToken()
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(
      data?.message || `Request failed with status ${response.status}`,
    )
  }

  return response.blob()
}
