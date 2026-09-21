import type { FastifyPluginAsync } from 'fastify'

/**
 * Contracts module: services, tax rates, clients, sites, contracts.
 * Registered in app.ts with prefix "/v1". Define the full sub-paths inside this plugin.
 */
export const contractRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
