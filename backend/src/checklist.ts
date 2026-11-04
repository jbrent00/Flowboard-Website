import { getAuth } from '@clerk/express'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { getPrisma } from './prisma.js'

export const checklistRoutes = Router({ mergeParams: true })

function parseId(value: string | string[] | undefined) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

function parseBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function cleanText(value: unknown) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && text.length <= 200 ? text : null
}

async function ownedTaskId(request: Request, response: Response) {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const taskId = parseId(request.params.taskId)
  if (!taskId) {
    response.status(400).json({ error: 'Invalid task id' })
    return null
  }
  const task = await getPrisma().task.findFirst({ where: { id: taskId, createdById: userId }, select: { id: true } })
  if (!task) {
    response.status(404).json({ error: 'Task not found' })
    return null
  }
  return taskId
}

checklistRoutes.post('/', async (request, response) => {
  try {
    const taskId = await ownedTaskId(request, response)
    if (!taskId) return
    const body = parseBody(request.body)
    const text = body && Object.keys(body).length === 1 ? cleanText(body.text) : null
    if (!text) {
      response.status(400).json({ error: 'Invalid checklist item text' })
      return
    }
    const item = await getPrisma().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${taskId})`
      const items = await tx.checklistItem.findMany({ where: { taskId }, select: { orderIndex: true } })
      if (items.length >= 100) return null
      const orderIndex = items.length ? Math.max(...items.map((entry) => entry.orderIndex)) + 1 : 0
      return tx.checklistItem.create({ data: { taskId, text, orderIndex } })
    })
    if (!item) {
      response.status(400).json({ error: 'A task can contain at most 100 checklist items' })
      return
    }
    response.status(201).json(item)
  } catch (error) {
    console.error('Could not create checklist item', error)
    response.status(503).json({ error: 'Checklist item could not be saved' })
  }
})

checklistRoutes.patch('/:itemId', async (request, response) => {
  try {
    const taskId = await ownedTaskId(request, response)
    if (!taskId) return
    const itemId = parseId(request.params.itemId)
    const body = parseBody(request.body)
    if (!itemId || !body || Object.keys(body).length === 0 ||
        Object.keys(body).some((key) => key !== 'text' && key !== 'completed')) {
      response.status(400).json({ error: 'Invalid checklist item changes' })
      return
    }
    const changes: { text?: string; completed?: boolean } = {}
    if ('text' in body) {
      const text = cleanText(body.text)
      if (!text) {
        response.status(400).json({ error: 'Invalid checklist item text' })
        return
      }
      changes.text = text
    }
    if ('completed' in body) {
      if (typeof body.completed !== 'boolean') {
        response.status(400).json({ error: 'Invalid completed state' })
        return
      }
      changes.completed = body.completed
    }
    const updated = await getPrisma().checklistItem.updateMany({ where: { id: itemId, taskId }, data: changes })
    if (!updated.count) {
      response.status(404).json({ error: 'Checklist item not found' })
      return
    }
    response.json(await getPrisma().checklistItem.findUnique({ where: { id: itemId } }))
  } catch (error) {
    console.error('Could not update checklist item', error)
    response.status(503).json({ error: 'Checklist item could not be updated' })
  }
})

checklistRoutes.delete('/:itemId', async (request, response) => {
  try {
    const taskId = await ownedTaskId(request, response)
    if (!taskId) return
    const itemId = parseId(request.params.itemId)
    if (!itemId) {
      response.status(400).json({ error: 'Invalid checklist item id' })
      return
    }
    const deleted = await getPrisma().checklistItem.deleteMany({ where: { id: itemId, taskId } })
    if (!deleted.count) {
      response.status(404).json({ error: 'Checklist item not found' })
      return
    }
    response.sendStatus(204)
  } catch (error) {
    console.error('Could not delete checklist item', error)
    response.status(503).json({ error: 'Checklist item could not be deleted' })
  }
})

checklistRoutes.put('/order', async (request, response) => {
  try {
    const taskId = await ownedTaskId(request, response)
    if (!taskId) return
    const body = parseBody(request.body)
    const ids = body?.itemIds
    if (!body || Object.keys(body).length !== 1 || !Array.isArray(ids) || ids.length > 100 ||
        !ids.every((id) => Number.isSafeInteger(id) && id > 0) || new Set(ids).size !== ids.length) {
      response.status(400).json({ error: 'Invalid checklist order' })
      return
    }
    const prisma = getPrisma()
    const items = await prisma.checklistItem.findMany({ where: { taskId }, select: { id: true } })
    if (items.length !== ids.length || items.some((item) => !ids.includes(item.id))) {
      response.status(409).json({ error: 'Checklist changed. Reload and try again.' })
      return
    }
    await prisma.$transaction(ids.map((id, orderIndex) => prisma.checklistItem.update({
      where: { id, taskId }, data: { orderIndex },
    })))
    response.json(await prisma.checklistItem.findMany({ where: { taskId }, orderBy: { orderIndex: 'asc' } }))
  } catch (error) {
    console.error('Could not reorder checklist items', error)
    response.status(503).json({ error: 'Checklist order could not be saved' })
  }
})
