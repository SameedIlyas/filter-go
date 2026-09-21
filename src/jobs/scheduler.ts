import type { AppContext } from '../context.js'

export interface JobDefinition {
  /** Unique, stable. Used as the lease key. */
  name: string
  /** Minimum gap between runs, across ALL server instances. */
  everySeconds: number
  run(ctx: AppContext): Promise<void>
}

/**
 * Tries to take the lease for a job: true only for the one instance that gets to run it now.
 * The lease doubles as "next allowed run", so `everySeconds` is honoured cluster-wide.
 */
const claim = async (ctx: AppContext, job: JobDefinition): Promise<boolean> => {
  // Raw INSERT .. DO NOTHING: concurrent upserts on a fresh key race on the unique index
  await ctx.prisma.$executeRaw`INSERT INTO job_leases ("name", "lockedUntil") VALUES (${job.name}, to_timestamp(0)) ON CONFLICT ("name") DO NOTHING`

  const seconds = Math.max(5, job.everySeconds)
  const claimed = await ctx.prisma.$executeRaw`
    UPDATE job_leases SET "lockedUntil" = now() + make_interval(secs => ${seconds})
    WHERE name = ${job.name} AND "lockedUntil" <= now()`

  return claimed === 1
}

/** Runs one job now, ignoring its lease. Errors are recorded, never thrown (a job must not kill the server). */
export const runJobNow = async (ctx: AppContext, job: JobDefinition): Promise<void> => {
  try {
    await job.run(ctx)
    await ctx.prisma.jobLease.upsert({
      where: { name: job.name },
      create: { name: job.name, lockedUntil: new Date(0), lastRunAt: new Date() },
      update: { lastRunAt: new Date(), lastError: null }
    })
  } catch (error) {
    ctx.log.error({ err: error, job: job.name }, 'scheduled job failed')
    await ctx.prisma.jobLease
      .upsert({
        where: { name: job.name },
        create: { name: job.name, lockedUntil: new Date(0), lastError: String(error).slice(0, 500) },
        update: { lastError: String(error).slice(0, 500) }
      })
      .catch(() => undefined)
  }
}

/** Called on a timer by the server: runs every job whose lease this instance can take. */
export const runDueJobs = async (ctx: AppContext, jobs: JobDefinition[]): Promise<string[]> => {
  const ran: string[] = []

  for (const job of jobs) {
    if (await claim(ctx, job)) {
      await runJobNow(ctx, job)
      ran.push(job.name)
    }
  }

  return ran
}
