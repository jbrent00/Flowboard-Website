import { backendBaseUrl } from './taskApi.js'

async function tagRequest(token, path = '', options = {}) {
  if (!backendBaseUrl || !token) throw new Error('Sign in to manage tags.')
  const response = await fetch(`${backendBaseUrl}/api/tags${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (response.status === 409) throw new Error('A tag with that name already exists.')
  if (!response.ok) throw new Error('Tag changes could not be saved. Please try again.')
  return response.status === 204 ? null : response.json()
}

export function listTags(token) {
  return tagRequest(token)
}

export function createTag(token, name, color) {
  return tagRequest(token, '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  })
}

export function updateTag(token, id, name, color) {
  return tagRequest(token, `/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  })
}

export function deleteTag(token, id) {
  return tagRequest(token, `/${id}`, { method: 'DELETE' })
}
