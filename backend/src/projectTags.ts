import { getAuth } from '@clerk/express'
import { Router, type Request, type Response } from 'express'
import { getPrisma } from './prisma.js'
import { projectId, projectRole } from './projectAccess.js'
import { tagInput } from './tagValidation.js'

export const projectTagRoutes = Router({ mergeParams: true })

async function tagProject(request: Request, response: Response, write = false) {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const id = projectId(request.params.id)
  if (!id) {
    response.status(400).json({ error: 'Invalid project id' })
    return null
  }
  const role = await projectRole(id, userId)
  if (!role) {
    response.status(404).json({ error: 'Project not found' })
    return null
  }
  if (write && role === 'viewer') {
    response.status(403).json({ error: 'Viewers cannot manage project tags' })
    return null
  }
  return id
}

function tagFailure(response: Response, error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  if (code === 'P2002') {
    response.status(409).json({ error: 'This project already has a tag with that name' })
    return
  }
  if (code === 'P2025') {
    response.status(404).json({ error: 'Project tag not found' })
    return
  }
  console.error('Project tag request failed', error)
  response.status(503).json({ error: 'Project tag service is unavailable' })
}

const tagFields = { id: true, name: true, color: true } as const

projectTagRoutes.get('/', async (request, response) => {
  try {
    const id = await tagProject(request, response)
    if (id === null) return
    const tags = await getPrisma().projectTag.findMany({
      where: { projectId: id },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: tagFields,
    })
    response.json(tags)
  } catch (error) {
    tagFailure(response, error)
  }
})

projectTagRoutes.post('/', async (request, response) => {
  try {
    const id = await tagProject(request, response, true)
    if (id === null) return
    const input = tagInput(request.body, false)
    if (!input?.name || !input.normalizedName || !input.color) {
      response.status(400).json({ error: 'Invalid tag details' })
      return
    }
    const tag = await getPrisma().projectTag.create({
      data: { projectId: id, name: input.name, normalizedName: input.normalizedName, color: input.color },
      select: tagFields,
    })
    response.status(201).json(tag)
  } catch (error) {
    tagFailure(response, error)
  }
})

projectTagRoutes.patch('/:tagId', async (request, response) => {
  try {
    const id = await tagProject(request, response, true)
    if (id === null) return
    const tagId = projectId(request.params.tagId)
    const changes = tagInput(request.body, true)
    if (!tagId || !changes) {
      response.status(400).json({ error: 'Invalid tag details' })
      return
    }
    const tag = await getPrisma().projectTag.update({
      where: { id: tagId, projectId: id }, data: changes, select: tagFields,
    })
    response.json(tag)
  } catch (error) {
    tagFailure(response, error)
  }
})

projectTagRoutes.delete('/:tagId', async (request, response) => {
  try {
    const id = await tagProject(request, response, true)
    if (id === null) return
    const tagId = projectId(request.params.tagId)
    if (!tagId) {
      response.status(400).json({ error: 'Invalid tag id' })
      return
    }
    await getPrisma().projectTag.delete({ where: { id: tagId, projectId: id } })
    response.sendStatus(204)
  } catch (error) {
    tagFailure(response, error)
  }
})
