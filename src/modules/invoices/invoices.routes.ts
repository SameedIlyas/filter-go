import type { FastifyPluginAsync } from 'fastify'

/**
 * Invoices module: invoice runs, lines, approval, sync, send, payments, trace.
 * Registered in app.ts with prefix "/v1". Define the full sub-paths inside this plugin.
 */
export const invoiceRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
