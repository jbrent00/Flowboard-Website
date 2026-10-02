import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'

let prisma: PrismaClient | undefined

export function getPrisma() {
  if (!prisma) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is required')
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  }
  return prisma
}
