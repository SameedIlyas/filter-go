import type { FastifyPluginAsync } from 'fastify'

/**
 * Public lead intake for website forms. No session; protect with honeypot + rate limit + org intake key.
 * Registered in app.ts with prefix "/public". Define the full sub-paths inside this plugin.
 */
export const publicLeadRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
