import { getAuth } from '@clerk/express'
import { Router, type ErrorRequestHandler, type Request, type Response } from 'express'
import { projectId, projectRole } from './projectAccess.js'
import { getPrisma } from './prisma.js'
import { normalizeEmail } from './verifiedEmail.js'

export const projectInvitationRoutes = Router({ mergeParams: true })

const invitationLifetime = 7 * 24 * 60 * 60 * 1000
const invitationFields = { id: true, email: true, role: true, createdAt: true, expiresAt: true } as const

async function ownerProject(request: Request, response: Response) {
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
  if (role !== 'owner') {
    response.status(403).json({ error: 'Only project owners can manage invitations' })
    return null
  }
  return { id, userId }
}

projectInvitationRoutes.get('/', async (request, response) => {
  const project = await ownerProject(request, response)
  if (!project) return

  const invitations = await getPrisma().projectInvitation.findMany({
    where: { projectId: project.id, status: 'pending', expiresAt: { gt: new Date() } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: invitationFields,
  })
  response.json(invitations)
})

projectInvitationRoutes.post('/', async (request, response) => {
  const project = await ownerProject(request, response)
  if (!project) return

  const body: unknown = request.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    response.status(400).json({ error: 'An email and an editor or viewer role are required' })
    return
  }
  const input = body as Record<string, unknown>
  const email = typeof input.email === 'string' ? input.email.trim() : ''
  const role = input.role
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (role !== 'editor' && role !== 'viewer')) {
    response.status(400).json({ error: 'A valid email and an editor or viewer role are required' })
    return
  }

  const prisma = getPrisma()
  const normalizedEmail = normalizeEmail(email)
  const member = await prisma.projectMembership.findFirst({
    where: { projectId: project.id, user: { verifiedEmails: { some: { normalizedEmail } } } },
    select: { userId: true },
  })
  if (member) {
    response.status(409).json({ error: 'That email already belongs to a project member' })
    return
  }

  const now = new Date()
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.projectInvitation.updateMany({
      where: { projectId: project.id, normalizedEmail, status: 'pending', expiresAt: { lte: now } },
      data: { status: 'expired' },
    })
    return tx.projectInvitation.create({
      data: {
        projectId: project.id, inviterId: project.userId, email, normalizedEmail, role,
        expiresAt: new Date(now.getTime() + invitationLifetime),
      },
      select: invitationFields,
    })
  })
  response.status(201).json(invitation)
})

projectInvitationRoutes.delete('/:invitationId', async (request, response) => {
  const project = await ownerProject(request, response)
  if (!project) return
  const id = projectId(request.params.invitationId)
  if (!id) {
    response.status(400).json({ error: 'Invalid invitation id' })
    return
  }
  const revoked = await getPrisma().projectInvitation.updateMany({
    where: { id, projectId: project.id, status: 'pending', expiresAt: { gt: new Date() } },
    data: { status: 'revoked' },
  })
  if (!revoked.count) {
    response.status(404).json({ error: 'Pending invitation not found' })
    return
  }
  response.sendStatus(204)
})

const invitationFailure: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  if (code === 'P2002') {
    response.status(409).json({ error: 'A pending invitation already exists for that email' })
    return
  }
  console.error('Project invitation request failed', code ?? 'unknown error')
  response.status(503).json({ error: 'Project invitations are unavailable' })
}

projectInvitationRoutes.use(invitationFailure)
