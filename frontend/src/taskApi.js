export const backendBaseUrl = import.meta.env.VITE_BACKEND_BASE_URL?.replace(/\/+$/, '')

function fromApi(task) {
  let dueDate = ''
  if (task.dueDate) {
    const date = new Date(task.dueDate)
    dueDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  return {
    ...task,
    description: task.description ?? '',
    status: task.status === 'in_progress' ? 'in-progress' : task.status,
    dueDate,
  }
}

function toApi(fields) {
  const result = { ...fields }
  if (result.status === 'in-progress') result.status = 'in_progress'
  if ('dueDate' in result) result.dueDate = result.dueDate ? new Date(result.dueDate).toISOString() : null
  return result
}

async function taskRequest(token, path = '', options = {}) {
  if (!backendBaseUrl) throw new Error('Task service URL is not configured.')
  if (!token) throw new Error('Sign in to access your tasks.')

  const response = await fetch(`${backendBaseUrl}/api/tasks${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!response.ok) throw new Error(`Task service returned ${response.status}.`)
  if (response.status === 204) return null
  return response.json()
}

export async function listTasks(token) {
  const tasks = await taskRequest(token)
  if (!Array.isArray(tasks)) throw new Error('Task service returned invalid data.')
  return tasks.map(fromApi)
}

export async function createTask(token, task) {
  const saved = await taskRequest(token, '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toApi(task)),
  })
  return fromApi(saved)
}

export async function updateTask(token, id, changes) {
  const saved = await taskRequest(token, `/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toApi(changes)),
  })
  return fromApi(saved)
}

export function deleteTask(token, id) {
  return taskRequest(token, `/${id}`, { method: 'DELETE' })
}
