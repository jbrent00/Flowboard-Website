import { clerkClient, getAuth } from '@clerk/express'
import { Router, type ErrorRequestHandler, type Request, type Response } from 'express'
import { projectId } from './projectAccess.js'
import { getPrisma } from './prisma.js'
import { syncClerkUser } from './userProfile.js'
import { verifiedEmailKeys } from './verifiedEmail.js'

export const receivedInvitationRoutes = Router()

async function currentVerifiedEmails(userId: string) {
  const user = await clerkClient.users.getUser(userId)
  return verifiedEmailKeys(user.emailAddresses)
}

function pendingInvitations(emailKeys: string[]) {
  return { normalizedEmail: { in: emailKeys }, status: 'pending' as const, expiresAt: { gt: new Date() } }
}

receivedInvitationRoutes.get('/', async (request, response) => {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }

  const emailKeys = await currentVerifiedEmails(userId)
  const invitations = await getPrisma().projectInvitation.findMany({
    where: { ...pendingInvitations(emailKeys), project: { archivedAt: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, email: true, role: true, expiresAt: true,
      project: { select: { id: true, title: true } },
    },
  })
  response.set('Cache-Control', 'no-store').json(invitations)
})

async function respondToInvitation(request: Request, response: Response, status: 'accepted' | 'declined') {
  const { userId } = getAuth(request)
  if (!userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const id = projectId(request.params.invitationId)
  if (!id) {
    response.status(400).json({ error: 'Invalid invitation id' })
    return
  }

  const emailKeys = status === 'accepted'
    ? (await syncClerkUser(userId)).emailKeys
    : await currentVerifiedEmails(userId)
  const invitation = await getPrisma().$transaction(async (tx) => {
    const [claimed] = await tx.projectInvitation.updateManyAndReturn({
      where: { id, ...pendingInvitations(emailKeys), project: { archivedAt: null } },
      data: { status },
      select: { projectId: true, role: true },
    })
    if (claimed && status === 'accepted') {
      await tx.projectMembership.createMany({
        data: { projectId: claimed.projectId, userId, role: claimed.role },
        skipDuplicates: true,
      })
    }
    return claimed
  })

  if (!invitation) {
    response.status(404).json({ error: 'Invitation not found or no longer valid' })
    return
  }
  if (status === 'accepted') response.json({ projectId: invitation.projectId })
  else response.sendStatus(204)
}

receivedInvitationRoutes.post('/:invitationId/accept', (request, response) =>
  respondToInvitation(request, response, 'accepted'))

receivedInvitationRoutes.post('/:invitationId/decline', (request, response) =>
  respondToInvitation(request, response, 'declined'))

const invitationFailure: ErrorRequestHandler = (error, _request, response, _next) => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  console.error('Received project invitation request failed', code ?? 'unknown error')
  response.status(503).json({ error: 'Project invitations are unavailable' })
}

receivedInvitationRoutes.use(invitationFailure)
