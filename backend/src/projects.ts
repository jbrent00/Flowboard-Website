import { getAuth } from '@clerk/express'
import { Router } from 'express'
import { getPrisma } from './prisma.js'

export const projectRoutes = Router()

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

function projectId(value: string | string[] | undefined) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

function missingProject(error: unknown) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2025'
}

projectRoutes.get('/', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const projects = await getPrisma().project.findMany({
      where: { memberships: { some: { userId, role: 'owner' } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    response.json(projects)
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
    const project = await getPrisma().project.findFirst({
      where: { id, memberships: { some: { userId, role: 'owner' } } },
    })
    if (!project) {
      response.status(404).json({ error: 'Project not found' })
      return
    }
    response.json(project)
  } catch (error) {
    console.error('Could not load project', error)
    response.status(503).json({ error: 'Project could not be loaded' })
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
      where: { id, memberships: { some: { userId, role: 'owner' } } },
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
