import { PrismaPg } from '@prisma/adapter-pg'

import { Prisma, PrismaClient } from '../generated/prisma/client.js'

export const createPrisma = (databaseUrl: string): PrismaClient =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })

/** Either the client or an interactive-transaction client. Services that may run inside a transaction take this. */
export type Db = PrismaClient | Prisma.TransactionClient

export type { PrismaClient }
