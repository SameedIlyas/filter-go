import type { Logger } from '../context.js'

/**
 * Tracks fire-and-forget work (sending emails after the response is already on its way) so it
 * can be awaited on shutdown and in tests instead of being silently dropped.
 */
export interface BackgroundTasks {
  run(label: string, task: () => Promise<unknown>): void
  flush(): Promise<void>
}

export const createBackgroundTasks = (log: Logger): BackgroundTasks => {
  const pending = new Set<Promise<unknown>>()

  return {
    run: (label, task) => {
      const promise = task()
        .catch(error => log.error({ err: error, task: label }, 'background task failed'))
        .finally(() => pending.delete(promise))

      pending.add(promise)
    },
    flush: async () => {
      await Promise.allSettled([...pending])
    }
  }
}
