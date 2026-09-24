import 'dotenv/config'

import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { allJobs } from './jobs/registry.js'
import { runDueJobs } from './jobs/scheduler.js'
import { createPrisma } from './lib/prisma.js'
import { purgeExpired } from './modules/maintenance/cleanup.js'

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

const main = async () => {
  const config = loadConfig()
  const prisma = createPrisma(config.databaseUrl)
  const { app, ctx } = await buildApp({ config, prisma })

  const cleanup = setInterval(() => {
    purgeExpired(ctx).catch(error => app.log.error({ err: error }, 'cleanup failed'))
  }, CLEANUP_INTERVAL_MS)

  cleanup.unref()

  // Scheduled jobs: every instance ticks, a lease in the database decides who actually runs each job
  const jobTimer = config.jobs.enabled
    ? setInterval(() => {
        runDueJobs(ctx, allJobs).catch(error => app.log.error({ err: error }, 'job tick failed'))
      }, 15_000)
    : undefined

  jobTimer?.unref()

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    clearInterval(cleanup)
    if (jobTimer) clearInterval(jobTimer)

    try {
      await app.close()
      await prisma.$disconnect()
      process.exit(0)
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ host: config.host, port: config.port })
}

main().catch(error => {
  // The logger may not exist yet (bad config), so this one goes straight to stderr
  process.stderr.write(`Failed to start: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
