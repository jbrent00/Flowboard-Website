import { backendBaseUrl } from './taskApi.js'

async function request(token, projectId, path = '', options = {}) {
  if (!backendBaseUrl) throw new Error('Project service URL is not configured.')
  if (!token) throw new Error('Sign in again to access project members.')

  const response = await fetch(`${backendBaseUrl}/api/projects/${projectId}/members${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'The member request failed. Try again.')
  }
  return response.status === 204 ? null : response.json()
}

export async function listProjectMembers(token, projectId, signal) {
  const members = await request(token, projectId, '', { signal })
  if (!Array.isArray(members)) throw new Error('The member service returned invalid data.')
  return members
}

export function changeProjectMemberRole(token, projectId, userId, role) {
  return request(token, projectId, `/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
}

export function removeProjectMember(token, projectId, userId) {
  return request(token, projectId, `/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}
