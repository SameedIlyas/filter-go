import type { Config } from './config/env.js'
import type { PrismaClient } from './lib/prisma.js'
import type { PasswordHasher } from './lib/password.js'
import type { BackgroundTasks } from './lib/background.js'
import type { Mailer } from './modules/mail/mailer.js'

export interface Logger {
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
}

/** Everything a service needs, passed explicitly so tests can swap any piece. */
export interface AppContext {
  config: Config
  prisma: PrismaClient
  mailer: Mailer
  hasher: PasswordHasher
  background: BackgroundTasks
  log: Logger
}

export interface ClientMeta {
  ip: string
  userAgent: string | null
}
