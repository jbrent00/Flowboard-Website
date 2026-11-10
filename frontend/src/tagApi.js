import { backendBaseUrl } from './taskApi.js'

async function tagRequest(token, projectId, path = '', options = {}) {
  if (!backendBaseUrl || !token) throw new Error('Sign in to manage tags.')
  const tagPath = projectId === undefined ? '/api/tags' : `/api/projects/${projectId}/tags`
  const response = await fetch(`${backendBaseUrl}${tagPath}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (response.status === 409) throw new Error('A tag with that name already exists.')
  if (!response.ok) throw new Error('Tag changes could not be saved. Please try again.')
  return response.status === 204 ? null : response.json()
}

export function listTags(token, projectId) {
  return tagRequest(token, projectId)
}

export function createTag(token, name, color, projectId) {
  return tagRequest(token, projectId, '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  })
}

export function updateTag(token, id, name, color, projectId) {
  return tagRequest(token, projectId, `/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  })
}

export function deleteTag(token, id, projectId) {
  return tagRequest(token, projectId, `/${id}`, { method: 'DELETE' })
}
