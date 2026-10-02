import { clerkClient } from '@clerk/express'
import { getPrisma } from './prisma.js'

export async function syncClerkUser(userId: string) {
  const clerkUser = await clerkClient.users.getUser(userId)
  const email = clerkUser.emailAddresses.find((address) =>
    address.id === clerkUser.primaryEmailAddressId && address.verification?.status === 'verified',
  )
  const profile = {
    firstName: clerkUser.firstName,
    lastName: clerkUser.lastName,
    primaryEmail: email?.emailAddress ?? null,
    imageUrl: clerkUser.imageUrl,
  }
  return getPrisma().user.upsert({
    where: { id: userId },
    create: { id: userId, ...profile },
    update: profile,
  })
}
