import type { FastifyPluginAsync } from 'fastify'

import { catalogRoutes } from './catalog.routes.js'
import { clientRoutes, siteRoutes } from './clients.routes.js'
import { contractCrudRoutes } from './contract.routes.js'

/**
 * Contracts module: services, tax rates, clients, sites, contracts.
 * Registered in app.ts with prefix "/v1". Each sub-plugin defines its full sub-paths.
 */
export const contractRoutes: FastifyPluginAsync = async app => {
  app.register(catalogRoutes)
  app.register(clientRoutes)
  app.register(siteRoutes)
  app.register(contractCrudRoutes)
}
