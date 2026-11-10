import { backendBaseUrl } from './taskApi.js'

async function request(token, projectId, path = '', options = {}) {
  if (!backendBaseUrl) throw new Error('Project service URL is not configured.')
  if (!token) throw new Error('Sign in to access project tasks.')
  const response = await fetch(`${backendBaseUrl}/api/projects/${projectId}/tasks${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!response.ok) throw new Error(`Project task service returned ${response.status}.`)
  return response.status === 204 ? null : response.json()
}

export async function listProjectTasks(token, projectId) {
  const tasks = await request(token, projectId)
  if (!Array.isArray(tasks)) throw new Error('Project task service returned invalid data.')
  return tasks
}

export function createProjectTask(token, projectId, fields) {
  return request(token, projectId, '', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
  })
}

export function updateProjectTask(token, projectId, taskId, fields) {
  return request(token, projectId, `/${taskId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
  })
}

export function deleteProjectTask(token, projectId, taskId) {
  return request(token, projectId, `/${taskId}`, { method: 'DELETE' })
}
