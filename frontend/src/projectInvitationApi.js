import { backendBaseUrl } from './taskApi.js'

async function request(token, projectId, path = '', options = {}) {
  if (!backendBaseUrl) throw new Error('Project service URL is not configured.')
  if (!token) throw new Error('Sign in again to manage project invitations.')

  const response = await fetch(`${backendBaseUrl}/api/projects/${projectId}/invitations${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'The invitation request failed. Try again.')
  }
  return response.status === 204 ? null : response.json()
}

export async function listProjectInvitations(token, projectId, signal) {
  const invitations = await request(token, projectId, '', { signal })
  if (!Array.isArray(invitations)) throw new Error('The invitation service returned invalid data.')
  return invitations
}

export function createProjectInvitation(token, projectId, email, role) {
  return request(token, projectId, '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  })
}

export function revokeProjectInvitation(token, projectId, invitationId) {
  return request(token, projectId, `/${invitationId}`, { method: 'DELETE' })
}
