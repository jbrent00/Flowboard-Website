import { backendBaseUrl } from './taskApi.js'

async function changeProject(token, projectId, path, method, body) {
  if (!backendBaseUrl) throw new Error('Project service URL is not configured.')
  if (!token) throw new Error('Sign in again to manage this project.')
  const response = await fetch(`${backendBaseUrl}/api/projects/${projectId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    throw new Error(result?.error || 'Project could not be changed. Try again.')
  }
}

export function transferProjectOwnership(token, projectId, userId) {
  return changeProject(token, projectId, '/transfer-ownership', 'POST', { userId })
}

export function deleteProject(token, projectId, confirmTitle) {
  return changeProject(token, projectId, '', 'DELETE', { confirmTitle })
}
