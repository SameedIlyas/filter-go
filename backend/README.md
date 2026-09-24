# filter-portal-be

Authentication backend for the FilterGO portal (`filter-portal`, Next.js).
Node 22+ · TypeScript · Fastify 5 · PostgreSQL · Prisma 7 · Zod · argon2id.

**Frontend developer? Start with [`docs/FRONTEND_HANDOVER.md`](docs/FRONTEND_HANDOVER.md)**: every endpoint, response, error and
sample request, plus the integration guide. The typed contract is [`docs/api-types.ts`](docs/api-types.ts).

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm db:up          # Postgres in Docker on localhost:5433 (dev DB + test DB)
pnpm db:deploy      # apply migrations
pnpm admin:create --email you@filter-go.com --name "Your Name"   # first admin: prints a one-time set-password link
pnpm dev            # http://localhost:4000
pnpm test           # 190+ tests against a real Postgres
```

| Script | What it does |
|---|---|
| `pnpm dev` | watch mode |
| `pnpm build` / `pnpm start` | compile to `dist/` / run it |
| `pnpm typecheck` | `tsc --noEmit` (also checks `docs/api-types.ts` against the backend) |
| `pnpm test`, `test:coverage` | vitest |
| `pnpm db:migrate` | create a new migration after editing `prisma/schema.prisma` |
| `pnpm db:deploy` | apply migrations (use this in production) |
| `pnpm admin:create [--force]` | bootstrap / recover an admin (see below) |

## What it does

- **Invite-only accounts.** Admin invites -> emailed single-use link -> invitee chooses their password. No public sign-up.
- **Opaque server-side sessions** (256-bit random token, only its SHA-256 stored). Idle + absolute expiry, "remember me",
  per-user session cap, instant revocation (logout, logout-all, password reset/change, disable user).
- **Password reset / change**, admin user management (list, invite, role, disable/enable, force sign-out), own profile, device list.
- **Audit trail** of security events in `audit_events` (never contains secrets), pruned after `AUDIT_RETENTION_DAYS`.

## Security design (short version)

| Threat | Defence |
|---|---|
| Password theft from a DB leak | argon2id (m=19456 KiB, t=2, p=1; production refuses weaker) |
| Session theft from a DB leak | only SHA-256 of tokens stored; tokens are 256-bit random |
| Brute force / spraying | DB-backed throttle per email+IP, per email, per IP; written **before** the password check so parallel bursts can't slip through; route rate limits on top |
| Account enumeration | identical response and timing for unknown email vs wrong password (dummy hash), same for forgot-password (answers first, works after), same `INVALID_TOKEN` for every bad link |
| Link reuse / races | single-use enforced by an atomic conditional update; issuing a new link voids old ones under a row lock |
| Stale access after disable/reset/change | sessions revoked in the same transaction; user status re-checked on every request |
| Mass assignment / typos | every body is a strict Zod schema; unknown fields are 400 |
| Weak passwords | 10-128 chars, common-password and repetition checks, no email/name inside |
| Direct API abuse | `X-Service-Key` shared secret (required in production); CORS off by default; only JSON accepted; 16 KB body cap |
| Spoofed client IP | `TRUST_PROXY` must be a hop count/CIDR (never `true`); refused to start in production without it |
| Information leaks | uniform error envelope, 500s are generic with a request id, logger redacts `Authorization`/`Cookie`, `passwordHash` cannot be serialised |
| Misconfiguration | config validated at startup, all problems listed; `NODE_ENV` defaults to **production** so forgetting it can't disable the strict checks |

Known trade-offs (intentional): a determined attacker who knows an email can hold that account in the 15-minute
lockout (recovery: the owner uses "Forgot password", which clears it). There is no 2FA.

## Configuration

See [`.env.example`](.env.example): every variable is documented there. Required in production:
`DATABASE_URL`, `FRONTEND_URL` (https), `SERVICE_API_KEY` (>= 32 chars), `TRUST_PROXY`, `MAIL_DRIVER=smtp` + `SMTP_*`.

## Deploying

1. Provision Postgres 15+. Set `DATABASE_URL`.
2. `pnpm install --frozen-lockfile && pnpm build && pnpm db:deploy && pnpm start`.
3. Put it on a **private network** reachable only from the Next.js server; set `HOST` to a private interface if you can.
4. Share `SERVICE_API_KEY` with the Next.js app (`AUTH_API_SERVICE_KEY`). Set `TRUST_PROXY` to the Next.js server's hop count or CIDR.
5. Probe `GET /health` (liveness) and `GET /health/ready` (database).
6. Run more than one instance if you like: all state (sessions, throttling) is in Postgres. The global per-IP route rate limiter is
   per-instance memory, so with N instances the effective limit is up to N x; the login lockout is exact.

## Operations

- **First admin / lost admin access:** `pnpm admin:create --email a@b.com --name "A"` prints a set-password link. If the user exists,
  add `--force` to make them an active ADMIN again (password untouched).
- **Investigating a login problem:** look up `audit_events` for the user (`LOGIN_FAILED`, `LOGIN_THROTTLED`, `LOGIN_SUCCESS`, ...) and the
  `requestId` from the error the user saw (it is in the server log too).
- **Cleanup** runs hourly inside the server (dead sessions/tokens after 7 days, old login attempts, audit events after the retention window).

## Layout

```
src/
  app.ts               Fastify assembly (security headers, CORS, rate limit, service key, error handling, routes)
  server.ts            entry point (config, DB, cleanup timer, graceful shutdown)
  config/env.ts        validated configuration
  lib/                 errors, response envelope, crypto, password hashing + policy, validation helpers
  modules/
    auth/              login, invite acceptance, reset/change password, throttling, one-time tokens
    sessions/          create / authenticate / revoke sessions
    users/             admin user management, serializers
    mail/              console / SMTP / in-memory mailers + templates
    audit/  maintenance/
  plugins/             auth guards, error handler
  scripts/create-admin.ts
prisma/                schema + migrations
test/                  vitest suites (real Postgres)
docs/                  FRONTEND_HANDOVER.md, api-types.ts
```
