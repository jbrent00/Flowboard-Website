import { backendBaseUrl } from './taskApi.js'

async function request(token, path, options = {}) {
  if (!backendBaseUrl) throw new Error('Project service URL is not configured.')
  if (!token) throw new Error('Sign in again to manage project invitations.')

  const response = await fetch(`${backendBaseUrl}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'The invitation request failed. Try again.', { cause: response.status })
  }
  return response.status === 204 ? null : response.json()
}

async function listInvitations(token, path, signal) {
  const invitations = await request(token, path, { signal })
  if (!Array.isArray(invitations)) throw new Error('The invitation service returned invalid data.')
  return invitations
}

export function listProjectInvitations(token, projectId, signal) {
  return listInvitations(token, `/api/projects/${projectId}/invitations`, signal)
}

export function createProjectInvitation(token, projectId, email, role) {
  return request(token, `/api/projects/${projectId}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  })
}

export function revokeProjectInvitation(token, projectId, invitationId) {
  return request(token, `/api/projects/${projectId}/invitations/${invitationId}`, { method: 'DELETE' })
}

export function listReceivedInvitations(token, signal) {
  return listInvitations(token, '/api/project-invitations', signal)
}

export function respondToReceivedInvitation(token, invitationId, action) {
  return request(token, `/api/project-invitations/${invitationId}/${action}`, { method: 'POST' })
}
