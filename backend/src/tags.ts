import { getAuth } from '@clerk/express'
import { Router } from 'express'
import { getPrisma } from './prisma.js'
import { tagInput } from './tagValidation.js'

export const tagRoutes = Router()

function errorCode(error: unknown) {
  if (error !== null && typeof error === 'object' && 'code' in error) return error.code
  return null
}

function tagId(value: string | string[] | undefined) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

tagRoutes.get('/', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const tags = await getPrisma().tag.findMany({
      where: { userId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
    response.json(tags)
  } catch (error) {
    console.error('Could not load tags', error)
    response.status(503).json({ error: 'Tags could not be loaded' })
  }
})

tagRoutes.post('/', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const input = tagInput(request.body, false)
  if (!input || !input.name || !input.normalizedName || !input.color) {
    response.status(400).json({ error: 'Invalid tag details' })
    return
  }
  try {
    const tag = await getPrisma().tag.create({
      data: {
        name: input.name,
        normalizedName: input.normalizedName,
        color: input.color,
        user: { connectOrCreate: { where: { id: userId }, create: { id: userId } } },
      },
    })
    response.status(201).json(tag)
  } catch (error) {
    if (errorCode(error) === 'P2002') {
      response.status(409).json({ error: 'You already have a tag with that name' })
      return
    }
    console.error('Could not create tag', error)
    response.status(503).json({ error: 'Tag could not be saved' })
  }
})

tagRoutes.patch('/:id', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = tagId(request.params.id)
  const input = tagInput(request.body, true)
  if (!id || !input) {
    response.status(400).json({ error: 'Invalid tag details' })
    return
  }
  try {
    const tag = await getPrisma().tag.update({ where: { id, userId }, data: input })
    response.json(tag)
  } catch (error) {
    if (errorCode(error) === 'P2002') {
      response.status(409).json({ error: 'You already have a tag with that name' })
      return
    }
    if (errorCode(error) === 'P2025') {
      response.status(404).json({ error: 'Tag not found' })
      return
    }
    console.error('Could not update tag', error)
    response.status(503).json({ error: 'Tag could not be updated' })
  }
})

tagRoutes.delete('/:id', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = tagId(request.params.id)
  if (!id) {
    response.status(400).json({ error: 'Invalid tag id' })
    return
  }
  try {
    await getPrisma().tag.delete({ where: { id, userId } })
    response.sendStatus(204)
  } catch (error) {
    if (errorCode(error) === 'P2025') {
      response.status(404).json({ error: 'Tag not found' })
      return
    }
    console.error('Could not delete tag', error)
    response.status(503).json({ error: 'Tag could not be deleted' })
  }
})
