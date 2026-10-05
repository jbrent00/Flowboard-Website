import { getAuth } from '@clerk/express'
import { Router } from 'express'
import { getPrisma } from './prisma.js'

export const taskRoutes = Router()

function parseDueDate(value: unknown): Date | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

function isMissingTask(error: unknown) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2025'
}

taskRoutes.get('/', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const tasks = await getPrisma().task.findMany({
      where: { createdById: userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    response.json(tasks)
  } catch (error) {
    console.error('Could not load tasks', error)
    response.status(503).json({ error: 'Tasks could not be loaded' })
  }
})

taskRoutes.post('/', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }

  const body: unknown = request.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    response.status(400).json({ error: 'Invalid task details' })
    return
  }

  const input = body as Record<string, unknown>
  const title = input.title
  const description = input.description ?? ''
  const status = input.status ?? 'todo'
  const priority = input.priority ?? 'low'
  const dueDate = input.dueDate ?? null
  const parsedDueDate = parseDueDate(dueDate)

  if (typeof title !== 'string' || !title.trim() || title.trim().length > 100 ||
      typeof description !== 'string' || description.trim().length > 500 ||
      (status !== 'todo' && status !== 'in_progress' && status !== 'completed') ||
      (priority !== 'low' && priority !== 'medium' && priority !== 'high') ||
      parsedDueDate === undefined) {
    response.status(400).json({ error: 'Invalid task details' })
    return
  }

  try {
    const task = await getPrisma().task.create({
      data: {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        dueDate: parsedDueDate,
        completedAt: status === 'completed' ? new Date() : null,
        createdBy: {
          connectOrCreate: { where: { id: userId }, create: { id: userId } },
        },
      },
    })
    response.status(201).json(task)
  } catch (error) {
    console.error('Could not create task', error)
    response.status(503).json({ error: 'Task could not be saved' })
  }
})

taskRoutes.patch('/:id', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = Number(request.params.id)
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'Invalid task id' })
    return
  }

  const body: unknown = request.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    response.status(400).json({ error: 'Invalid task details' })
    return
  }
  const input = body as Record<string, unknown>
  const allowed = ['title', 'description', 'status', 'priority', 'dueDate']
  if (Object.keys(input).length === 0 || Object.keys(input).some((key) => !allowed.includes(key))) {
    response.status(400).json({ error: 'Invalid task details' })
    return
  }

  const title = input.title
  const description = input.description
  const status = input.status
  const priority = input.priority
  const dueDate = 'dueDate' in input ? parseDueDate(input.dueDate) : undefined
  if (('title' in input && (typeof title !== 'string' || !title.trim() || title.trim().length > 100)) ||
      ('description' in input && description !== null &&
        (typeof description !== 'string' || description.trim().length > 500)) ||
      ('status' in input && status !== 'todo' && status !== 'in_progress' && status !== 'completed') ||
      ('priority' in input && priority !== 'low' && priority !== 'medium' && priority !== 'high') ||
      ('dueDate' in input && dueDate === undefined)) {
    response.status(400).json({ error: 'Invalid task details' })
    return
  }

  const changes: {
    title?: string
    description?: string | null
    status?: 'todo' | 'in_progress' | 'completed'
    priority?: 'low' | 'medium' | 'high'
    dueDate?: Date | null
    completedAt?: Date | null
  } = {}
  if (typeof title === 'string') changes.title = title.trim()
  if (description === null || typeof description === 'string') changes.description = description?.trim() || null
  if (status === 'todo' || status === 'in_progress' || status === 'completed') changes.status = status
  if (priority === 'low' || priority === 'medium' || priority === 'high') changes.priority = priority
  if ('dueDate' in input) changes.dueDate = dueDate

  try {
    const prisma = getPrisma()
    const current = await prisma.task.findFirst({ where: { id, createdById: userId } })
    if (!current) {
      response.status(404).json({ error: 'Task not found' })
      return
    }
    if (changes.status && changes.status !== current.status) {
      changes.completedAt = changes.status === 'completed' ? new Date() : null
    }
    const task = await prisma.task.update({ where: { id, createdById: userId }, data: changes })
    response.json(task)
  } catch (error) {
    if (isMissingTask(error)) {
      response.status(404).json({ error: 'Task not found' })
      return
    }
    console.error('Could not update task', error)
    response.status(503).json({ error: 'Task could not be updated' })
  }
})

taskRoutes.delete('/:id', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = Number(request.params.id)
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'Invalid task id' })
    return
  }

  try {
    await getPrisma().task.delete({ where: { id, createdById: userId } })
    response.sendStatus(204)
  } catch (error) {
    if (isMissingTask(error)) {
      response.status(404).json({ error: 'Task not found' })
      return
    }
    console.error('Could not delete task', error)
    response.status(503).json({ error: 'Task could not be deleted' })
  }
})
