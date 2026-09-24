import type { FastifyPluginAsync } from 'fastify'

import { meRoutes } from './me.routes.js'
import { scheduleRoutes } from './schedules.routes.js'
import { shiftRoutes } from './shifts.routes.js'

/**
 * Scheduling module: schedules, shifts, assignment, offers, coverage (docs/ARCHITECTURE.md section 5).
 * Registered in app.ts with prefix "/v1". Each plugin defines its full sub-paths and an explicit role guard per route.
 */
export const schedulingRoutes: FastifyPluginAsync = async app => {
  await app.register(scheduleRoutes)
  await app.register(shiftRoutes)
  await app.register(meRoutes)
}
