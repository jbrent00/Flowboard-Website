import { getAuth } from '@clerk/express'
import { Router, type Response } from 'express'
import type { Prisma, ProjectRole, ProjectTask } from './generated/prisma/client.js'
import { getPrisma } from './prisma.js'
import { canChangeProjectTaskAssignees, canCommentOnProjectTask, canCreateProjectTask, canEditProjectTask, canWriteProjectContent,
  isProjectOwner, projectId, projectRole, type AssignmentPolicy } from './projectAccess.js'
import { projectInvitationRoutes } from './projectInvitations.js'
import { projectMemberRoutes } from './projectMembers.js'
import { projectLifecycleRoutes } from './projectLifecycle.js'
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
    if (!isProjectOwner(role)) return void response.status(403).json({ error: 'Only the owner can archive or restore this project' })
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

// Deletion is also available to owners of archived projects.
projectRoutes.use('/:id', projectLifecycleRoutes)

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

const maxProjectTaskAssignees = 100

function parseAssigneeIds(value: unknown) {
  if (!Array.isArray(value) || value.length > maxProjectTaskAssignees) return null
  const ids: string[] = []
  for (const id of value) {
    if (typeof id !== 'string' || !id || id.trim() !== id || ids.includes(id)) return null
    ids.push(id)
  }
  return ids
}

async function validateProjectAssignmentChanges(
  tx: Prisma.TransactionClient, id: number, access: ProjectWriteAccess, userId: string,
  nextIds: string[] | undefined, currentIds: string[] = [],
) {
  if (!nextIds) return
  const added = nextIds.filter((id) => !currentIds.includes(id))
  const removed = currentIds.filter((id) => !nextIds.includes(id))
  if (added.length === 0 && removed.length === 0) return
  if (!canChangeProjectTaskAssignees(access, userId, added, removed)) {
    throw new ProjectWriteError(403, 'You cannot change one or more of these assignees')
  }
  if (added.length > 0) {
    const count = await tx.projectMembership.count({ where: { projectId: id, userId: { in: added } } })
    if (count !== added.length) throw new ProjectWriteError(400, 'Assignees must be members of this project')
  }
  return { added, removed }
}

async function projectOwnsTags(tx: Prisma.TransactionClient, id: number, tagIds: number[]) {
  if (tagIds.length === 0) return true
  return await tx.projectTag.count({ where: { projectId: id, id: { in: tagIds } } }) === tagIds.length
}

const projectPolicyKeys = [
  'editorsCanCreateTasks', 'editorsCanEditAllTasks', 'editorsCanAssignOthers',
  'editorsCanJoinTasks', 'editorsCanLeaveTasks',
  'viewersCanComment',
] as const

function projectInput(body: unknown, partial: boolean) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const input = body as Record<string, unknown>
  const keys = Object.keys(input)
  const allowedKeys = ['title', 'description', ...(partial ? projectPolicyKeys : [])]
  if (keys.some((key) => !allowedKeys.includes(key)) ||
      (partial && keys.length === 0) || (!partial && !('title' in input))) return null

  const changes: {
    title?: string
    description?: string | null
    editorsCanCreateTasks?: boolean
    editorsCanEditAllTasks?: boolean
    editorsCanAssignOthers?: boolean
    editorsCanJoinTasks?: boolean
    editorsCanLeaveTasks?: boolean
    viewersCanComment?: boolean
  } = {}
  for (const key of projectPolicyKeys) {
    if (!(key in input)) continue
    if (typeof input[key] !== 'boolean') return null
    changes[key] = input[key]
  }
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

class ProjectWriteError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message)
  }
}

type ProjectPolicy = AssignmentPolicy & {
  editorsCanCreateTasks: boolean
  editorsCanEditAllTasks: boolean
  viewersCanComment: boolean
}
type ProjectWriteAccess = ProjectPolicy & { role: ProjectRole }

function writeActiveProject<T>(id: number, userId: string, write: (tx: Prisma.TransactionClient, access: ProjectWriteAccess) => Promise<T>) {
  return getPrisma().$transaction(async (tx) => {
    // Serialize task and comment writes with project policy changes.
    const [project] = await tx.$queryRaw<(ProjectPolicy & { archivedAt: Date | null })[]>`
      SELECT "archivedAt", "editorsCanCreateTasks", "editorsCanEditAllTasks", "editorsCanAssignOthers",
        "editorsCanJoinTasks", "editorsCanLeaveTasks", "viewersCanComment"
      FROM "Project" WHERE "id" = ${id} FOR NO KEY UPDATE
    `
    if (!project) throw new ProjectWriteError(404, 'Project not found')
    const [member] = await tx.$queryRaw<{ role: ProjectRole }[]>`
      SELECT "role" FROM "ProjectMembership" WHERE "projectId" = ${id} AND "userId" = ${userId} FOR SHARE
    `
    if (!member) throw new ProjectWriteError(404, 'Project not found')
    if (project.archivedAt) throw new ProjectWriteError(403, 'Archived projects are read-only')
    return write(tx, { ...project, role: member.role })
  })
}

async function editableProjectTask(tx: Prisma.TransactionClient, id: number, taskId: number, userId: string, access: ProjectWriteAccess) {
  if (!canWriteProjectContent(access.role)) throw new ProjectWriteError(403, 'Viewers cannot change tasks')
  const task = await tx.projectTask.findUniqueOrThrow({
    where: { id: taskId, projectId: id }, include: { assignments: projectTaskInclude.assignments },
  })
  if (canEditProjectTask(access.role, access.editorsCanEditAllTasks, task, userId)) return task
  throw new ProjectWriteError(403, 'You cannot change this project task')
}

function handleTaskWriteError(response: Response, error: unknown) {
  if (error instanceof ProjectWriteError) {
    response.status(error.status).json({ error: error.message })
    return true
  }
  if (!missingProject(error)) return false
  response.status(404).json({ error: 'Task not found' })
  return true
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
  await writeActiveProject(id, userId, async (tx, access) => {
    if (!canCreateProjectTask(access.role, access.editorsCanCreateTasks)) {
      throw new ProjectWriteError(403, 'You cannot create tasks in this project')
    }
    const assignments = await validateProjectAssignmentChanges(tx, id, access, userId, assigneeIds)
    if (!await projectOwnsTags(tx, id, tagIds)) throw new ProjectWriteError(400, 'Tags must belong to this project')
    const latest = await tx.projectTask.aggregate({
      where: { projectId: id, status: 'todo' },
      _max: { orderIndex: true },
    })
    return tx.projectTask.create({
      data: {
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() || null : null,
        projectId: id,
        createdById: userId,
        orderIndex: (latest._max.orderIndex ?? -1) + 1,
        taskTags: { create: tagIds.map((tagId) => ({ tagId })) },
        assignments: { create: (assignments?.added ?? []).map((userId) => ({ userId })) },
      },
      include: projectTaskInclude,
    })
  }).then((task) => {
    response.status(201).json(projectTaskResponse(task))
  }).catch((error: unknown) => {
    if (handleTaskWriteError(response, error)) return
    console.error('Could not create project task', error)
    response.status(503).json({ error: 'Project task could not be saved' })
  })
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
  await writeActiveProject(id, userId, async (tx, access) => {
    const current = await editableProjectTask(tx, id, taskId, userId, access)
    const assignments = await validateProjectAssignmentChanges(
      tx, id, access, userId, assigneeIds, current.assignments.map((assignment) => assignment.userId),
    )
    if (tagIds && !await projectOwnsTags(tx, id, tagIds)) throw new ProjectWriteError(400, 'Tags must belong to this project')
    if (changes.status && changes.status !== current.status) {
      const latest = await tx.projectTask.aggregate({
        where: { projectId: id, status: changes.status },
        _max: { orderIndex: true },
      })
      changes.orderIndex = (latest._max.orderIndex ?? -1) + 1
      changes.completedAt = changes.status === 'completed' ? new Date() : null
    }
    return tx.projectTask.update({
      where: { id: taskId, projectId: id },
      data: {
        ...changes,
        ...(tagIds ? { taskTags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) } } : {}),
        assignments: assignments ? {
          deleteMany: { userId: { in: assignments.removed } },
          create: assignments.added.map((userId) => ({ userId })),
        } : undefined,
      },
      include: projectTaskInclude,
    })
  }).then((task) => {
    response.json(projectTaskResponse(task))
  }).catch((error: unknown) => {
    if (handleTaskWriteError(response, error)) return
    console.error('Could not edit project task', error)
    response.status(503).json({ error: 'Project task could not be updated' })
  })
})

for (const action of ['join', 'leave'] as const) {
  projectRoutes.post(`/:id/tasks/:taskId/${action}`, async (request, response) => {
    const { userId } = getAuth(request)
    if (!userId) return void response.status(401).json({ error: 'Unauthorized' })
    const id = projectId(request.params.id)
    const taskId = projectId(request.params.taskId)
    if (!id || !taskId) return void response.status(400).json({ error: 'Invalid task id' })

    const joining = action === 'join'
    try {
      const task = await writeActiveProject(id, userId, async (tx, access) => {
        const added = joining ? [userId] : []
        const removed = joining ? [] : [userId]
        if (!canChangeProjectTaskAssignees(access, userId, added, removed)) {
          throw new ProjectWriteError(403, `You cannot ${action} this task`)
        }
        const current = await tx.projectTask.findUniqueOrThrow({
          where: { id: taskId, projectId: id }, include: { assignments: projectTaskInclude.assignments },
        })
        const assigned = current.assignments.some((assignment) => assignment.userId === userId)
        if (assigned === joining) {
          throw new ProjectWriteError(409, joining ? 'You have already joined this task' : 'You are not assigned to this task')
        }
        if (joining && current.assignments.length >= maxProjectTaskAssignees) {
          throw new ProjectWriteError(409, 'This task has reached its assignee limit')
        }
        return tx.projectTask.update({
          where: { id: taskId, projectId: id },
          data: { assignments: joining ? { create: { userId } } : { deleteMany: { userId } } },
          include: projectTaskInclude,
        })
      })
      response.json(projectTaskResponse(task))
    } catch (error) {
      if (handleTaskWriteError(response, error)) return
      console.error(`Could not ${action} project task`, error)
      response.status(503).json({ error: `Could not ${action} project task` })
    }
  })
}

const commentAuthor = { select: { firstName: true, lastName: true } } as const

projectRoutes.get('/:id/tasks/:taskId/comments', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) return void response.status(401).json({ error: 'Unauthorized' })
  const id = projectId(request.params.id)
  const taskId = projectId(request.params.taskId)
  if (!id || !taskId) return void response.status(400).json({ error: 'Invalid task id' })

  try {
    const task = await getPrisma().projectTask.findFirst({
      where: { id: taskId, projectId: id, project: { memberships: { some: { userId } } } },
      select: { comments: { orderBy: { id: 'asc' }, include: { author: commentAuthor } } },
    })
    if (!task) return void response.status(404).json({ error: 'Task not found' })
    response.set('Cache-Control', 'no-store').json(task.comments)
  } catch (error) {
    console.error('Could not load project task comments', error)
    response.status(503).json({ error: 'Comments could not be loaded' })
  }
})

projectRoutes.post('/:id/tasks/:taskId/comments', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) return void response.status(401).json({ error: 'Unauthorized' })
  const id = projectId(request.params.id)
  const taskId = projectId(request.params.taskId)
  if (!id || !taskId) return void response.status(400).json({ error: 'Invalid task id' })

  const body: unknown = request.body?.body
  if (typeof body !== 'string' || !body.trim() || body.length > 2000) {
    return void response.status(400).json({ error: 'Enter a comment up to 2000 characters' })
  }

  try {
    const comment = await writeActiveProject(id, userId, (tx, access) => {
      if (!canCommentOnProjectTask(access.role, access.viewersCanComment)) {
        throw new ProjectWriteError(403, 'Viewer comments are disabled for this project')
      }
      return tx.projectTaskComment.create({
        data: {
          body,
          task: { connect: { id: taskId, projectId: id } },
          author: { connect: { id: userId } },
        },
        include: { author: commentAuthor },
      })
    })
    response.status(201).json(comment)
  } catch (error) {
    if (handleTaskWriteError(response, error)) return
    console.error('Could not create project task comment', error)
    response.status(503).json({ error: 'Comment could not be saved' })
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
    await writeActiveProject(id, userId, async (tx, access) => {
      await editableProjectTask(tx, id, taskId, userId, access)
      await tx.projectTask.delete({ where: { id: taskId, projectId: id } })
    })
    response.sendStatus(204)
  } catch (error) {
    if (handleTaskWriteError(response, error)) return
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
    const project = await writeActiveProject(id, userId, (tx, access) => {
      if (!isProjectOwner(access.role)) throw new ProjectWriteError(404, 'Project not found')
      return tx.project.update({ where: { id }, data: changes })
    })
    response.json(project)
  } catch (error) {
    if (error instanceof ProjectWriteError) return void response.status(error.status).json({ error: error.message })
    if (missingProject(error)) {
      response.status(404).json({ error: 'Project not found' })
      return
    }
    console.error('Could not update project', error)
    response.status(503).json({ error: 'Project could not be updated' })
  }
})
