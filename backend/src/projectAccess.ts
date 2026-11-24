import type { ProjectRole } from './generated/prisma/client.js'
import { getPrisma } from './prisma.js'

export function projectId(value: string | string[] | undefined) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return id <= 2147483647 ? id : null
}

export async function projectRole(id: number, userId: string) {
  const membership = await getPrisma().projectMembership.findUnique({
    where: { projectId_userId: { projectId: id, userId } },
    select: { role: true },
  })
  return membership?.role
}

export function isProjectOwner(role: ProjectRole | undefined) {
  return role === 'owner'
}

export function canWriteProjectContent(role: ProjectRole) {
  return isProjectOwner(role) || role === 'editor'
}

export function canCommentOnProjectTask(role: ProjectRole, viewersCanComment: boolean) {
  return canWriteProjectContent(role) || (role === 'viewer' && viewersCanComment)
}

export function canCreateProjectTask(role: ProjectRole, editorsCanCreateTasks: boolean) {
  return isProjectOwner(role) || (role === 'editor' && editorsCanCreateTasks)
}

export function canEditProjectTask(
  role: ProjectRole, editorsCanEditAllTasks: boolean,
  task: { createdById: string; assignments: { userId: string }[] }, userId: string,
) {
  if (role !== 'editor') return isProjectOwner(role)
  if (editorsCanEditAllTasks) return true
  return task.assignments.some((assignment) => assignment.userId === userId) ||
    (task.assignments.length === 0 && task.createdById === userId)
}

export type AssignmentPolicy = {
  editorsCanAssignOthers: boolean
  editorsCanJoinTasks: boolean
  editorsCanLeaveTasks: boolean
}

export function canChangeProjectTaskAssignees(
  access: AssignmentPolicy & { role: ProjectRole }, userId: string, added: string[], removed: string[],
) {
  if (access.role !== 'editor') return isProjectOwner(access.role)
  if (added.includes(userId) && !access.editorsCanJoinTasks) return false
  if (removed.includes(userId) && !access.editorsCanLeaveTasks) return false
  return access.editorsCanAssignOthers || [...added, ...removed].every((id) => id === userId)
}

export function isNonOwnerProjectRole(role: unknown): role is 'editor' | 'viewer' {
  return role === 'editor' || role === 'viewer'
}
