import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  basePath: process.env.BASEPATH

  /*
   * `/` used to redirect to the portal dashboard. It now serves the public
   * marketing site (`src/app/(public)`); the portal keeps its own routes under
   * `/dashboards/*` and `/apps/*`.
   */
}

export default nextConfig
