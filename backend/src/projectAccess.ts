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
