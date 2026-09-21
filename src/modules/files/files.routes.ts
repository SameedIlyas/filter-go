import type { FastifyPluginAsync } from 'fastify'

/**
 * Files: upload + authorised download.
 * Registered in app.ts with prefix "/v1". Define the full sub-paths inside this plugin.
 */
export const fileRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
