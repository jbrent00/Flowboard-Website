import { getAuth } from '@clerk/express'
import { Router } from 'express'
import type { Prisma, ProjectTask } from './generated/prisma/client.js'
import { getPrisma } from './prisma.js'
import { projectId, projectRole } from './projectAccess.js'
import { projectInvitationRoutes } from './projectInvitations.js'
import { projectMemberRoutes } from './projectMembers.js'
import { projectTagRoutes } from './projectTags.js'
import { parseTagIds } from './tagValidation.js'

export const projectRoutes = Router()
projectRoutes.patch('/:id/archive', async (request, response) => {
  const { userId } = getAuth(request)
  const id = projectId(request.params.id)
  const archived: unknown = request.body?.archived
  if (!userId) return void response.status(401).json({ error: 'Unauthorized' })
  if (!id || typeof archived !== 'boolean') return void response.status(400).json({ error: 'Invalid archive request' })

  try {
    const role = await projectRole(id, userId)
    if (!role) return void response.status(404).json({ error: 'Project not found' })
    if (role !== 'owner') return void response.status(403).json({ error: 'Only the owner can archive or restore this project' })
    const project = await getPrisma().project.update({
      where: { id, memberships: { some: { userId, role: 'owner' } } },
      data: { archivedAt: archived ? new Date() : null },
    })
    response.json(project)
  } catch (error) {
    if (missingProject(error)) return void response.status(404).json({ error: 'Project not found' })
    console.error('Could not change project archive state', error)
    response.status(503).json({ error: 'Project archive state could not be saved' })
  }
})

projectRoutes.use('/:id', async (request, response, next) => {
  if (request.method === 'GET' || request.method === 'HEAD') return next()
  const { userId } = getAuth(request)
  const id = projectId(request.params.id)
  if (!userId || !id) return next()
  try {
    const project = await getPrisma().project.findFirst({
      where: { id, memberships: { some: { userId } } },
      select: { archivedAt: true },
    })
    if (project?.archivedAt) return void response.status(403).json({ error: 'Archived projects are read-only' })
    next()
  } catch (error) {
    console.error('Could not check project archive state', error)
    response.status(503).json({ error: 'Project is unavailable' })
  }
})

projectRoutes.use('/:id/invitations', projectInvitationRoutes)
projectRoutes.use('/:id/members', projectMemberRoutes)
projectRoutes.use('/:id/tags', projectTagRoutes)

const projectTaskInclude = {
  taskTags: { select: { tagId: true } },
  assignments: { select: { userId: true }, orderBy: { userId: 'asc' } },
} as const

function projectTaskResponse(task: ProjectTask & { taskTags: { tagId: number }[]; assignments: { userId: string }[] }) {
  const { taskTags, assignments, ...fields } = task
  return { ...fields, tagIds: taskTags.map(({ tagId }) => tagId), assigneeIds: assignments.map(({ userId }) => userId) }
}

function parseAssigneeIds(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) return null
  const ids: string[] = []
  for (const id of value) {
    if (typeof id !== 'string' || !id || id.trim() !== id || ids.includes(id)) return null
    ids.push(id)
  }
  return ids
}

async function projectHasAssignees(id: number, assigneeIds: string[]) {
  if (assigneeIds.length === 0) return true
  const count = await getPrisma().projectMembership.count({
    where: { projectId: id, userId: { in: assigneeIds } },
  })
  return count === assigneeIds.length
}

async function projectOwnsTags(id: number, tagIds: number[]) {
  if (tagIds.length === 0) return true
  return await getPrisma().projectTag.count({ where: { projectId: id, id: { in: tagIds } } }) === tagIds.length
}

function projectInput(body: unknown, partial: boolean) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const input = body as Record<string, unknown>
  const keys = Object.keys(input)
  if (keys.some((key) => key !== 'title' && key !== 'description') ||
      (partial && keys.length === 0) || (!partial && !('title' in input))) return null

  const changes: { title?: string; description?: string | null } = {}
  if ('title' in input) {
    if (typeof input.title !== 'string') return null
    const title = input.title.trim()
    if (!title || title.length > 100) return null
    changes.title = title
  }
  if ('description' in input) {
    if (input.description !== null && typeof input.description !== 'string') return null
    const description = input.description?.trim()
    if (description && description.length > 500) return null
    changes.description = description || null
  }
  return changes
}

function missingProject(error: unknown) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2025'
}

class ArchivedProjectError extends Error {}

function writeProjectTask<T>(id: number, write: (tx: Prisma.TransactionClient) => Promise<T>) {
  return getPrisma().$transaction(async (tx) => {
    // Archiving updates the same project row and waits for an in-flight task write.
    const active = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "Project" WHERE "id" = ${id} AND "archivedAt" IS NULL FOR SHARE
    `
    if (!active.length) throw new ArchivedProjectError()
    return write(tx)
  })
}

function projectTaskChanges(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const input = body as Record<string, unknown>
  const keys = Object.keys(input)
  if (!keys.length || keys.some((key) => !['title', 'description', 'status', 'priority', 'dueDate', 'tagIds', 'assigneeIds'].includes(key))) return null
  const tagIds = 'tagIds' in input ? parseTagIds(input.tagIds) : undefined
  const assigneeIds = 'assigneeIds' in input ? parseAssigneeIds(input.assigneeIds) : undefined
  if (tagIds === null || assigneeIds === null) return null

  const changes: {
    title?: string
    description?: string | null
    status?: 'todo' | 'in_progress' | 'completed'
    priority?: 'low' | 'medium' | 'high'
    dueDate?: Date | null
    completedAt?: Date | null
    orderIndex?: number
  } = {}
  if ('title' in input) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 100) return null
    changes.title = input.title.trim()
  }
  if ('description' in input) {
    if (input.description !== null && typeof input.description !== 'string') return null
    const description = input.description
    if (typeof description === 'string' && description.trim().length > 500) return null
    changes.description = typeof description === 'string' ? description.trim() || null : null
  }
  if ('status' in input) {
    if (input.status !== 'todo' && input.status !== 'in_progress' && input.status !== 'completed') return null
    changes.status = input.status
  }
  if ('priority' in input) {
    if (input.priority !== 'low' && input.priority !== 'medium' && input.priority !== 'high') return null
    changes.priority = input.priority
  }
  if ('dueDate' in input) {
    if (input.dueDate !== null) {
      if (typeof input.dueDate !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.dueDate)) return null
      const date = new Date(input.dueDate)
      if (!Number.isFinite(date.getTime())) return null
      changes.dueDate = date
    } else {
      changes.dueDate = null
    }
  }
  return { changes, tagIds, assigneeIds }
}

projectRoutes.get('/', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const projects = await getPrisma().project.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    response.set('Cache-Control', 'no-store').json(projects)
  } catch (error) {
    console.error('Could not load projects', error)
    response.status(503).json({ error: 'Projects could not be loaded' })
  }
})

projectRoutes.post('/', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const input = projectInput(request.body, false)
  if (!input?.title) {
    response.status(400).json({ error: 'Invalid project details' })
    return
  }
  try {
    const project = await getPrisma().project.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        memberships: { create: {
          role: 'owner',
          user: { connectOrCreate: { where: { id: userId }, create: { id: userId } } },
        } },
      },
    })
    response.status(201).json(project)
  } catch (error) {
    console.error('Could not create project', error)
    response.status(503).json({ error: 'Project could not be saved' })
  }
})

projectRoutes.get('/:id', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = projectId(request.params.id)
  if (!id) {
    response.status(400).json({ error: 'Invalid project id' })
    return
  }
  try {
    const membership = await getPrisma().projectMembership.findUnique({
      where: { projectId_userId: { projectId: id, userId } },
      select: { project: true, role: true },
    })
    if (!membership) {
      response.status(404).json({ error: 'Project not found' })
      return
    }
    response.set('Cache-Control', 'no-store').json({ ...membership.project, role: membership.role })
  } catch (error) {
    console.error('Could not load project', error)
    response.status(503).json({ error: 'Project could not be loaded' })
  }
})

projectRoutes.get('/:id/tasks', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = projectId(request.params.id)
  if (!id) {
    response.status(400).json({ error: 'Invalid project id' })
    return
  }
  try {
    if (!await projectRole(id, userId)) {
      response.status(404).json({ error: 'Project not found' })
      return
    }
    const tasks = await getPrisma().projectTask.findMany({
      where: { projectId: id },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
      include: projectTaskInclude,
    })
    response.set('Cache-Control', 'no-store').json(tasks.map(projectTaskResponse))
  } catch (error) {
    console.error('Could not load project tasks', error)
    response.status(503).json({ error: 'Project tasks could not be loaded' })
  }
})

projectRoutes.post('/:id/tasks', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = projectId(request.params.id)
  if (!id) {
    response.status(400).json({ error: 'Invalid project id' })
    return
  }
  const body: unknown = request.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    response.status(400).json({ error: 'Invalid task details' })
    return
  }
  const input = body as Record<string, unknown>
  const title = input.title
  const description = input.description ?? null
  const tagIds = 'tagIds' in input ? parseTagIds(input.tagIds) : []
  const assigneeIds = 'assigneeIds' in input ? parseAssigneeIds(input.assigneeIds) : undefined
  if (Object.keys(input).some((key) => !['title', 'description', 'tagIds', 'assigneeIds'].includes(key)) ||
      tagIds === null || assigneeIds === null ||
      typeof title !== 'string' || !title.trim() || title.trim().length > 100 ||
      (description !== null && (typeof description !== 'string' || description.trim().length > 500))) {
    response.status(400).json({ error: 'Invalid task details' })
    return
  }
  try {
    const role = await projectRole(id, userId)
    if (!role) {
      response.status(404).json({ error: 'Project not found' })
      return
    }
    if (role === 'viewer') {
      response.status(403).json({ error: 'Viewers cannot create tasks' })
      return
    }
    if (assigneeIds && role !== 'owner') {
      response.status(403).json({ error: 'Only project owners can set assignees' })
      return
    }
    if (assigneeIds && !await projectHasAssignees(id, assigneeIds)) {
      response.status(400).json({ error: 'Assignees must be members of this project' })
      return
    }
    if (!await projectOwnsTags(id, tagIds)) {
      response.status(400).json({ error: 'Tags must belong to this project' })
      return
    }
    const latest = await getPrisma().projectTask.aggregate({
      where: { projectId: id, status: 'todo' },
      _max: { orderIndex: true },
    })
    const task = await writeProjectTask(id, (tx) => tx.projectTask.create({
      data: {
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() || null : null,
        projectId: id,
        createdById: userId,
        orderIndex: (latest._max.orderIndex ?? -1) + 1,
        taskTags: { create: tagIds.map((tagId) => ({ tagId })) },
        assignments: { create: (assigneeIds ?? []).map((userId) => ({ userId })) },
      },
      include: projectTaskInclude,
    }))
    response.status(201).json(projectTaskResponse(task))
  } catch (error) {
    if (error instanceof ArchivedProjectError) return void response.status(403).json({ error: 'Archived projects are read-only' })
    console.error('Could not create project task', error)
    response.status(503).json({ error: 'Project task could not be saved' })
  }
})

projectRoutes.patch('/:id/tasks/:taskId', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = projectId(request.params.id)
  const taskId = projectId(request.params.taskId)
  const input = projectTaskChanges(request.body)
  if (!id || !taskId || !input) {
    response.status(400).json({ error: 'Invalid task details' })
    return
  }
  const { changes, tagIds, assigneeIds } = input
  try {
    const role = await projectRole(id, userId)
    if (!role) {
      response.status(404).json({ error: 'Project not found' })
      return
    }
    if (role === 'viewer') {
      response.status(403).json({ error: 'Viewers cannot edit tasks' })
      return
    }
    if (assigneeIds && role !== 'owner') {
      response.status(403).json({ error: 'Only project owners can set assignees' })
      return
    }
    const prisma = getPrisma()
    const current = await prisma.projectTask.findFirst({ where: { id: taskId, projectId: id } })
    if (!current) {
      response.status(404).json({ error: 'Task not found' })
      return
    }
    if (tagIds && !await projectOwnsTags(id, tagIds)) {
      response.status(400).json({ error: 'Tags must belong to this project' })
      return
    }
    if (assigneeIds && !await projectHasAssignees(id, assigneeIds)) {
      response.status(400).json({ error: 'Assignees must be members of this project' })
      return
    }
    if (changes.status && changes.status !== current.status) {
      const latest = await prisma.projectTask.aggregate({
        where: { projectId: id, status: changes.status },
        _max: { orderIndex: true },
      })
      changes.orderIndex = (latest._max.orderIndex ?? -1) + 1
      changes.completedAt = changes.status === 'completed' ? new Date() : null
    }
    const task = await writeProjectTask(id, (tx) => tx.projectTask.update({
      where: { id: taskId, projectId: id },
      data: {
        ...changes,
        ...(tagIds ? { taskTags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) } } : {}),
        ...(assigneeIds ? { assignments: { deleteMany: {}, create: assigneeIds.map((userId) => ({ userId })) } } : {}),
      },
      include: projectTaskInclude,
    }))
    response.json(projectTaskResponse(task))
  } catch (error) {
    if (error instanceof ArchivedProjectError) return void response.status(403).json({ error: 'Archived projects are read-only' })
    if (missingProject(error)) {
      response.status(404).json({ error: 'Task not found' })
      return
    }
    console.error('Could not edit project task', error)
    response.status(503).json({ error: 'Project task could not be updated' })
  }
})

projectRoutes.delete('/:id/tasks/:taskId', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = projectId(request.params.id)
  const taskId = projectId(request.params.taskId)
  if (!id || !taskId) {
    response.status(400).json({ error: 'Invalid task id' })
    return
  }
  try {
    const role = await projectRole(id, userId)
    if (!role) {
      response.status(404).json({ error: 'Project not found' })
      return
    }
    if (role === 'viewer') {
      response.status(403).json({ error: 'Viewers cannot delete tasks' })
      return
    }
    await writeProjectTask(id, (tx) => tx.projectTask.delete({ where: { id: taskId, projectId: id } }))
    response.sendStatus(204)
  } catch (error) {
    if (error instanceof ArchivedProjectError) return void response.status(403).json({ error: 'Archived projects are read-only' })
    if (missingProject(error)) {
      response.status(404).json({ error: 'Task not found' })
      return
    }
    console.error('Could not delete project task', error)
    response.status(503).json({ error: 'Project task could not be deleted' })
  }
})

projectRoutes.patch('/:id', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = projectId(request.params.id)
  const changes = projectInput(request.body, true)
  if (!id || !changes) {
    response.status(400).json({ error: 'Invalid project details' })
    return
  }
  try {
    const project = await getPrisma().project.update({
      where: { id, archivedAt: null, memberships: { some: { userId, role: 'owner' } } },
      data: changes,
    })
    response.json(project)
  } catch (error) {
    if (missingProject(error)) {
      response.status(404).json({ error: 'Project not found' })
      return
    }
    console.error('Could not update project', error)
    response.status(503).json({ error: 'Project could not be updated' })
  }
})
