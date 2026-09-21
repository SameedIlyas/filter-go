import type { FastifyPluginAsync } from 'fastify'

/**
 * Timesheets module: clock in/out, exceptions, approval, work logs.
 * Registered in app.ts with prefix "/v1". Define the full sub-paths inside this plugin.
 */
export const timesheetRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
