import { getAuth } from '@clerk/express'
import { Router, type ErrorRequestHandler, type Request, type Response } from 'express'
import { isNonOwnerProjectRole, isProjectOwner, projectId, projectRole } from './projectAccess.js'
import { getPrisma } from './prisma.js'

export const projectMemberRoutes = Router({ mergeParams: true })

function memberRequest(request: Request, response: Response) {
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
  return { id, userId }
}

projectMemberRoutes.get('/', async (request, response) => {
  const access = memberRequest(request, response)
  if (!access) return

  const project = await getPrisma().project.findFirst({
    where: { id: access.id, memberships: { some: { userId: access.userId } } },
    select: { memberships: {
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      select: { userId: true, role: true, user: { select: { firstName: true, lastName: true, primaryEmail: true } } },
    } },
  })
  if (!project) {
    response.status(404).json({ error: 'Project not found' })
    return
  }
  response.set('Cache-Control', 'no-store').json(project.memberships)
})

async function changeMember(request: Request, response: Response) {
  const access = memberRequest(request, response)
  if (!access) return

  const callerRole = await projectRole(access.id, access.userId)
  if (!callerRole) {
    response.status(404).json({ error: 'Project not found' })
    return
  }
  if (!isProjectOwner(callerRole)) {
    response.status(403).json({ error: 'Only project owners can manage members' })
    return
  }

  const userId = request.params.userId
  if (typeof userId !== 'string' || !userId.trim()) {
    response.status(400).json({ error: 'Invalid member id' })
    return
  }
  const where = {
    projectId: access.id, userId, role: { not: 'owner' as const },
    project: { memberships: { some: { userId: access.userId, role: 'owner' as const } } },
  }
  const memberships = getPrisma().projectMembership
  let changed
  if (request.method === 'DELETE') {
    changed = await memberships.deleteMany({ where })
  } else {
    const role: unknown = request.body?.role
    if (!isNonOwnerProjectRole(role)) {
      response.status(400).json({ error: 'Choose Editor or Viewer' })
      return
    }
    changed = await memberships.updateMany({ where, data: { role } })
  }

  if (!changed.count) {
    if (isProjectOwner(await projectRole(access.id, userId))) {
      response.status(409).json({ error: 'Transfer ownership before changing or removing an owner' })
      return
    }
    response.status(404).json({ error: 'Member not found' })
    return
  }
  response.sendStatus(204)
}

projectMemberRoutes.patch('/:userId', changeMember)
projectMemberRoutes.delete('/:userId', changeMember)

const memberFailure: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  console.error('Project member request failed', code ?? 'unknown error')
  response.status(503).json({ error: 'Project members are unavailable' })
}

projectMemberRoutes.use(memberFailure)
