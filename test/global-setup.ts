import { execSync } from 'node:child_process'

import { TEST_DATABASE_URL } from './helpers.js'

/** Brings the test database up to the current schema before any test runs. */
export default function setup(): void {
  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe'
  })
}
