import { getAuth } from '@clerk/express'
import { Router, type Request, type Response } from 'express'
import { isProjectOwner, projectId } from './projectAccess.js'
import { getPrisma } from './prisma.js'

export const projectLifecycleRoutes = Router({ mergeParams: true })

projectLifecycleRoutes.post('/transfer-ownership', changeProject)
projectLifecycleRoutes.delete('/', changeProject)

async function changeProject(request: Request, response: Response) {
  const { userId } = getAuth(request)
  const id = projectId(request.params.id)
  if (!userId) return void response.status(401).json({ error: 'Unauthorized' })
  if (!id) return void response.status(400).json({ error: 'Invalid project id' })

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      // Serialize transfers, deletion, and archive changes for this project.
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${id} FOR UPDATE`
      // Keep a selected editor from being removed or demoted during transfer.
      await tx.$queryRaw`SELECT "userId" FROM "ProjectMembership" WHERE "projectId" = ${id} ORDER BY "userId" FOR UPDATE`
      const project = await tx.project.findUnique({ where: { id } })
      const caller = await tx.projectMembership.findUnique({ where: { projectId_userId: { projectId: id, userId } } })
      if (!project || !caller) return { status: 404, error: 'Project not found' }
      if (!isProjectOwner(caller.role)) return { status: 403, error: 'Only the owner can transfer or delete this project' }

      if (request.method === 'DELETE') {
        if (request.body?.confirmTitle !== project.title) {
          return { status: 400, error: 'Enter the exact project title to confirm deletion' }
        }
        await tx.project.delete({ where: { id } })
      } else {
        if (project.archivedAt) return { status: 403, error: 'Restore the project before transferring ownership' }
        const nextOwnerId: unknown = request.body?.userId
        if (typeof nextOwnerId !== 'string' || !nextOwnerId || nextOwnerId === userId) {
          return { status: 400, error: 'Choose another editor as the new owner' }
        }
        const recipient = await tx.projectMembership.findUnique({
          where: { projectId_userId: { projectId: id, userId: nextOwnerId } },
        })
        if (recipient?.role !== 'editor') return { status: 400, error: 'Ownership can only be transferred to an editor in this project' }
        await tx.projectMembership.update({
          where: { projectId_userId: { projectId: id, userId } }, data: { role: 'editor' },
        })
        await tx.projectMembership.update({
          where: { projectId_userId: { projectId: id, userId: nextOwnerId } }, data: { role: 'owner' },
        })
      }
      return { status: 204, error: '' }
    })
    if (result.status === 204) response.sendStatus(204)
    else response.status(result.status).json({ error: result.error })
  } catch (error) {
    console.error('Project ownership or deletion request failed', error)
    response.status(503).json({ error: 'Project could not be changed. Reload and try again.' })
  }
}
