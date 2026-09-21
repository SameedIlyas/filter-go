import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Read directly so `prisma generate` works on machines without a database configured.
    url: process.env.DATABASE_URL ?? 'postgresql://filter:filter@localhost:5433/filter_portal'
  }
})
