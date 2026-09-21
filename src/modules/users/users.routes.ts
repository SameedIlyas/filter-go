import type { FastifyPluginAsync } from 'fastify'

/**
 * Users module: /v1/users, availability, site access, documents, compliance.
 * Registered in app.ts with prefix "/v1". Define the full sub-paths inside this plugin.
 */
export const userRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
