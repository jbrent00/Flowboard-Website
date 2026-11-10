import { clerkClient } from '@clerk/express'
import { getPrisma } from './prisma.js'
import { verifiedEmailKeys } from './verifiedEmail.js'

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
  const emailKeys = verifiedEmailKeys(clerkUser.emailAddresses)
  return getPrisma().$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { id: userId },
      create: { id: userId, ...profile },
      update: profile,
    })
    await tx.userEmail.deleteMany({ where: { userId } })
    if (emailKeys.length) {
      await tx.userEmail.createMany({
        data: emailKeys.map((normalizedEmail) => ({ userId, normalizedEmail })),
      })
    }
    return user
  })
}
