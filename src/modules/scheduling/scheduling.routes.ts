import type { FastifyPluginAsync } from 'fastify'

/**
 * Scheduling module: schedules, shifts, assignment, offers, coverage.
 * Registered in app.ts with prefix "/v1". Define the full sub-paths inside this plugin.
 */
export const schedulingRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
