# FilterGO Portal: Auth API, Frontend Handover

Audience: the developer wiring `filter-portal` (Next.js 16) to `filter-portal-be`.
Everything here was verified against the running backend. Sample responses are real captured output
(IDs and tokens shortened where noted). The reference frontend code in section 9 is **not** compiled
against your repo; treat it as a starting point and test it.

## Contents

1. [The 2-minute summary](#1-the-2-minute-summary)
2. [How authentication works](#2-how-authentication-works)
3. [Run the backend locally](#3-run-the-backend-locally)
4. [API conventions](#4-api-conventions)
5. [Endpoint reference](#5-endpoint-reference)
6. [Error codes and what the UI should do](#6-error-codes-and-what-the-ui-should-do)
7. [End-to-end flows](#7-end-to-end-flows)
8. [Audit of the current frontend (what must change)](#8-audit-of-the-current-frontend-what-must-change)
9. [Integration guide with reference code](#9-integration-guide-with-reference-code)
10. [Rules you must not break](#10-rules-you-must-not-break)
11. [QA checklist](#11-qa-checklist)
12. [FAQ and gotchas](#12-faq-and-gotchas)
13. [TypeScript contract](#13-typescript-contract-docsapi-typests)

---

## 1. The 2-minute summary

- **Invite-only.** There is no public sign-up. An admin invites a person by email; the person opens the
  emailed link and chooses their own password. The template's `/register` page must be removed.
- **The browser never talks to this API.** Only the Next.js server does (a "backend-for-frontend", BFF).
  The session token lives in an **httpOnly cookie** set by your Next.js route handlers. JavaScript in the
  browser can never read it.
- **One opaque token, no refresh dance.** Login returns one token. Send it as
  `Authorization: Bearer <token>`. There are no access/refresh tokens, no JWTs, nothing to refresh.
  The server keeps the session and can kill it instantly (logout, disable user, password reset).
- **Every response has the same envelope**: `{ success, data, error }`. Branch on `error.code`, never on
  `error.message`.
- **Two headers the Next.js server must send on every call:** `X-Service-Key` (shared secret) and
  `X-Forwarded-For` (the real browser IP, a single value). Without the second one, every user shares one
  IP and the rate limiter locks everybody out together.
- **401 means "this session is dead, go to /login".** Nothing else returns 401. A wrong password on the
  change-password form is a 400, on purpose.

What you need to build (details in section 9):

| Item | Where |
|---|---|
| Backend client + session helpers | `src/libs/backend.ts`, `src/libs/session.ts` (replace the HMAC cookie) |
| Next route handlers | `/api/login`, `/api/logout` (replace), `/api/accept-invite`, `/api/forgot-password`, `/api/reset-password`, `/api/verify-token`, `/api/backend/[...path]` (new) |
| Pages | wire `/forgot-password`; **new** `/reset-password`, `/accept-invite`; **delete** `/register` |
| Login form | remove prefilled creds, send `rememberMe`, fix open redirect |
| Admin "Users" screen | invite, list, disable, change role, force logout |
| "Security" screen | change password, list/revoke sessions |

---

## 2. How authentication works

```
 Browser                    Next.js server (BFF)                      Auth API (this repo)
 -------                    --------------------                      --------------------
   |  POST /api/login  --->        |                                          |
   |   {email,password}            |  POST /v1/auth/login                     |
   |                               |  X-Service-Key, X-Forwarded-For  ------> |  checks password (argon2id)
   |                               |  <------ {user, session:{token,...}}     |  creates session row
   |  <--- Set-Cookie: session=fps_... (httpOnly, Secure, SameSite=Lax)       |
   |        + {user}               |                                          |
   |                               |                                          |
   |  GET /dashboard  --->         |  (server component)                      |
   |   Cookie: session=fps_...     |  GET /v1/auth/me                         |
   |                               |  Authorization: Bearer fps_...   ------> |  looks up SHA-256(token)
   |                               |  <------ {user, session}                 |  slides idle timer
   |  <--- HTML for that user      |                                          |
```

Why this design (so you do not "improve" it):

| Decision | Reason |
|---|---|
| Opaque server-side sessions, not JWT | Instant revocation. Disabling a user, resetting a password or clicking "sign out everywhere" takes effect on the very next request. No token-refresh race conditions between tabs/SSR. |
| Token only in an httpOnly cookie on the Next.js origin | XSS cannot steal it. |
| API not callable from browsers | No CORS surface, no CSRF surface on the API. |
| Backend stores only SHA-256 of the token | A database leak does not leak usable sessions. |
| Two expiry clocks | **Idle** (dies if unused) and **absolute** (dies no matter what). Defaults: 8 h idle / 24 h absolute; with "Remember me": 30 d idle / 90 d absolute. Max 10 live sessions per user (oldest is dropped). |

Roles (from the system design): `ADMIN`, `SUPERVISOR`, `FIELD_USER`, `CLIENT_USER`. Every user belongs to one
**organization** (`user.orgId`); an admin only ever sees and manages users of their own organization. `CLIENT_USER`s are
linked to one client (`user.clientId`, required for that role, forbidden for the others). The auth endpoints in this
document are only accessible to `ADMIN` where marked; the role model for the operations modules (contracts, scheduling,
timesheets, invoices, leads) is defined in `docs/ARCHITECTURE.md` section 2. The template's "Roles / Permissions" pages
are not backed by anything.

---

## 3. Run the backend locally

Prerequisites: Node 22+, pnpm, Docker Desktop.

```bash
cd filter-portal-be
cp .env.example .env          # defaults work for local dev
pnpm install
pnpm db:up                    # starts Postgres on localhost:5433
pnpm db:deploy                # applies migrations
pnpm admin:create --org "Your Company" --email you@filter-go.com --name "Your Name"   # --org only needed the first time
#   prints:  http://localhost:3000/accept-invite?token=fpl_....
#   open that link (once your /accept-invite page exists) or call the API directly (see 5.3)
pnpm dev                      # API on http://localhost:4000
```

- **Emails in dev are printed in the backend terminal** (`MAIL_DRIVER=console`). Look there for invite and
  reset links.
- `GET http://localhost:4000/health` should return `{"success":true,"data":{"status":"ok"},"error":null}`.
- Tests: `pnpm test` (needs `pnpm db:up`).

Frontend `.env.local`:

```bash
AUTH_API_URL=http://localhost:4000        # server-only. NO "NEXT_PUBLIC_" prefix. Ever.
AUTH_API_SERVICE_KEY=                     # must equal SERVICE_API_KEY in the backend .env (blank is fine locally)
```

You can delete `AUTH_SECRET`; the new cookie holds an opaque token, so there is nothing to sign.

In every deployed environment the backend **requires** `SERVICE_API_KEY` (>= 32 chars) and `TRUST_PROXY` and
refuses to start without them. Ask whoever deploys it for the values.

---

## 4. API conventions

**Base URL** `http://localhost:4000`, all endpoints under `/v1`. (`/health` and `/health/ready` are unversioned.)

### 4.1 Headers

| Header | When | Notes |
|---|---|---|
| `Content-Type: application/json` | any request with a body | Anything else is `415 UNSUPPORTED_MEDIA_TYPE`. An **empty** body with this header is fine (treated as `{}`), so `POST /logout` with no body works. |
| `Authorization: Bearer <token>` | protected endpoints | Header only. Cookies and query-string tokens are ignored. |
| `X-Service-Key: <secret>` | **every** request except `/health*`, when the backend has `SERVICE_API_KEY` set | Missing/wrong => `403 INVALID_SERVICE_KEY`. That is a server misconfiguration, not a user error, and it is deliberately not a 401. |
| `X-Forwarded-For: <browser ip>` | every request the BFF makes on behalf of a browser | **One value only, overwrite, do not append.** Used for rate limiting and the sessions list. |
| `User-Agent: <browser UA>` | same | Shown in the "your devices" list. |
| `X-Request-Id: <8-64 chars [A-Za-z0-9._-]>` | optional | Echoed back. Anything else is replaced by a generated id. |

Every response carries `X-Request-Id` and `Cache-Control: no-store`.

### 4.2 The envelope

Success:
```json
{ "success": true, "data": { "...": "..." }, "error": null }
```
Paginated success adds `"meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }`.

Failure:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "details": { "issues": [ { "field": "password", "code": "too_common", "message": "This password is too common. Choose something less guessable." } ] },
    "requestId": "71f86899-814b-4190-8ffd-828f0ad72181"
  }
}
```
`details` only appears when there is something to say: `issues` (field errors) or `retryAfterSeconds`.

### 4.3 Field rules

- **Bodies are strict.** An unknown field is rejected (`unrecognized_key`), so a typo like `remember_me`
  fails loudly instead of being silently ignored.
- **email**: trimmed, lower-cased by the server, max 254 chars. `Ada@X.com ` and `ada@x.com` are the same account.
- **name**: trimmed, 1-100 chars, no control characters.
- **passwords being *set*** (accept-invite, reset, change): 10-128 chars, not a common password (also
  catches `Password!2024`, `W3lcome-x`), not repetitive (`aaaaaaaaaaaa`, `abababababab`), must not contain the
  email name (>= 4 chars) or any word of the user's name (>= 4 letters). Length beats complexity: do **not**
  add "needs a number and a symbol" rules; a long passphrase is better. Server issue codes:
  `too_short`, `too_long`, `too_common`, `too_simple`, `contains_email`, `contains_name`, `same_as_current`.
- **password on login**: only 1-128 chars. Never apply the set-password policy to the login form (old
  accounts must still be able to sign in).
- **image**: `https://` URL up to 2048 chars, or `null`.
- **ids**: UUID strings. **dates**: ISO-8601 UTC strings (`2026-09-21T16:46:23.502Z`).
- **Body limit**: 16 KB (`413 PAYLOAD_TOO_LARGE`).

### 4.4 Rate limits (per client IP, so forward the real one)

| Endpoint | Limit |
|---|---|
| everything (global) | 300 / minute |
| `POST /auth/login` | 30 / minute, plus the failed-attempt lockout below |
| `POST /auth/verify-token` | 30 / minute |
| `POST /auth/accept-invite`, `/reset-password`, `/change-password` | 10 / 15 minutes |
| `POST /auth/forgot-password` | 5 / 15 minutes |

Exceeding them returns `429 RATE_LIMITED` with `details.retryAfterSeconds` and a `Retry-After` header.

**Failed-login lockout** (separate from the above; sliding 15-minute window):

| Scope | Max failures | Then |
|---|---|---|
| same email from same IP | 5 | `429 TOO_MANY_ATTEMPTS` (even for the *correct* password) |
| same email from any IP | 25 | same |
| any email from same IP | 50 | same |

Unknown emails are throttled exactly like real ones, so this never reveals which accounts exist.
A user who is locked out can always recover through "Forgot password" (a completed reset clears the lockout).

---

## 5. Endpoint reference

Legend: **Auth** = `none` (public), `session` (any signed-in user), `admin` (ADMIN only).
All samples use `API=http://localhost:4000`; add `-H "X-Service-Key: $KEY"` if the backend has a key.
Tokens are shortened as `fps_...` / `fpl_...` in the docs; real ones are 47 characters.

### Quick index

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/auth/login` | none | Sign in |
| POST | `/v1/auth/verify-token` | none | Check an invite/reset link before showing its form |
| POST | `/v1/auth/accept-invite` | none | Invitee chooses a password (also signs them in) |
| POST | `/v1/auth/forgot-password` | none | Request a reset email |
| POST | `/v1/auth/reset-password` | none | Set a new password from the emailed link |
| GET | `/v1/auth/me` | session | Current user + session |
| PATCH | `/v1/auth/me` | session | Edit own name / image |
| POST | `/v1/auth/logout` | session | Sign out this device |
| POST | `/v1/auth/logout-all` | session | Sign out every device |
| POST | `/v1/auth/change-password` | session | Change own password |
| GET | `/v1/auth/sessions` | session | List own signed-in devices |
| DELETE | `/v1/auth/sessions/:id` | session | Sign out one device |
| POST | `/v1/admin/users/invite` | admin | Invite / re-invite a person |
| GET | `/v1/admin/users` | admin | List users (paged, filterable) |
| GET | `/v1/admin/users/:id` | admin | One user |
| PATCH | `/v1/admin/users/:id` | admin | Rename, change role, disable/enable |
| POST | `/v1/admin/users/:id/revoke-sessions` | admin | Force-sign-out a user |
| GET | `/health`, `/health/ready` | none | Liveness / DB readiness |

> **User object.** Everywhere a `user` appears it has: `id, orgId, name, email, image, phone, role, status, employmentType,
> hiredAt, clientId, createdAt, lastLoginAt`, plus `defaultPayRate` (money string) **only when the viewer is an ADMIN or
> SUPERVISOR**. The sample responses below predate `orgId/phone/employmentType/hiredAt/clientId`; the exact shape is the
> `User` type in section 13.

Errors that can happen on **every** endpoint (not repeated below): `400 INVALID_JSON`, `400 VALIDATION_ERROR`,
`400 BAD_REQUEST`, `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `429 RATE_LIMITED`,
`403 INVALID_SERVICE_KEY`, `500 INTERNAL_ERROR`. Every **session/admin** endpoint can also return
`401 UNAUTHENTICATED` and `401 SESSION_EXPIRED`, and every **admin** endpoint `403 FORBIDDEN`.

---

### 5.1 `POST /v1/auth/login`

Sign in with email + password. Rate limit 30/min/IP plus the lockout in 4.4.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | |
| `password` | string 1-128 | yes | no policy check |
| `rememberMe` | boolean | no (false) | true = 30 d idle / 90 d absolute session |

```bash
curl -X POST $API/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"demo.admin@filter-go.com","password":"Live-Smoke-Passphrase-7","rememberMe":true}'
```

**200**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "aaed1fe1-4465-4f27-ad58-17114e18d0f2",
      "name": "Demo Admin",
      "email": "demo.admin@filter-go.com",
      "image": null,
      "role": "ADMIN",
      "status": "ACTIVE",
      "createdAt": "2026-09-21T16:45:56.330Z",
      "lastLoginAt": "2026-09-21T16:46:23.518Z"
    },
    "session": {
      "token": "fps_k1IHR6Ibk4-nPF3t2XOWNsjBpvubh6wJParetc9gupo",
      "id": "5e6b4679-f352-4246-96cd-b685dc3ac7d1",
      "expiresAt": "2026-12-20T16:46:23.502Z",
      "idleExpiresAt": "2026-10-21T16:46:23.502Z",
      "remember": true
    }
  },
  "error": null
}
```
`session.token` is shown **once**. Put it in the httpOnly cookie with `expires = session.expiresAt`, and
send only `user` to the browser.

| Status | `code` | When | UI |
|---|---|---|---|
| 401 | `INVALID_CREDENTIALS` | wrong password, unknown email, or account never activated. **Deliberately indistinguishable.** | "Email or password is incorrect." |
| 403 | `ACCOUNT_DISABLED` | correct password but an admin disabled the account | "Your account is disabled. Contact your administrator." |
| 429 | `TOO_MANY_ATTEMPTS` | lockout, `details.retryAfterSeconds` | "Too many attempts. Try again in N minutes, or reset your password." |
| 400 | `VALIDATION_ERROR` | malformed email, missing field, unknown field | show `details.issues` per field |

```json
{ "success": false, "data": null,
  "error": { "code": "TOO_MANY_ATTEMPTS", "message": "Too many failed attempts. Try again later.",
             "details": { "retryAfterSeconds": 899 }, "requestId": "2014c0ab-7ead-4a57-9312-45ba9e553d1c" } }
```
(also sent as a `Retry-After: 899` header.)

---

### 5.2 `POST /v1/auth/verify-token`

Call when the user lands on `/accept-invite?token=...` or `/reset-password?token=...` **before** showing the
form, so a dead link shows "this link has expired" immediately instead of after they typed a password.
Read-only: it does not consume the token. 30/min/IP.

| Body field | Type | Notes |
|---|---|---|
| `token` | string | the value of `?token=` |
| `purpose` | `"invite"` \| `"password_reset"` | which kind of link this page expects |

```bash
curl -X POST $API/v1/auth/verify-token -H 'content-type: application/json' \
  -d '{"token":"fpl_QLqtLZnTI_Mg-ILLE07lZl-cTxBPtn5hl0b94ta8xqY","purpose":"invite"}'
```

**200**
```json
{ "success": true,
  "data": { "purpose": "INVITE", "email": "demo.admin@filter-go.com", "name": "Demo Admin", "expiresAt": "2026-09-24T16:45:58.891Z" },
  "error": null }
```
Use `email`/`name` for "Welcome, Demo Admin. Choose a password for demo.admin@filter-go.com".

| Status | `code` | When |
|---|---|---|
| 400 | `INVALID_TOKEN` | unknown, already used, expired, superseded by a newer link, wrong purpose, or the user was disabled. **All the same on purpose.** UI: "This link is invalid or has expired." + a link to request a new one. |
| 400 | `VALIDATION_ERROR` | not even token-shaped (`"token":"abc"` => issue `{field:"token", code:"invalid_format"}`). Treat like INVALID_TOKEN. |

---

### 5.3 `POST /v1/auth/accept-invite`

The invitee chooses a password. Consumes the invite token, activates the account **and signs them in**
(same response as login). 10/15 min/IP.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | yes | from the emailed link |
| `password` | string | yes | must pass the password policy (4.3) |
| `name` | string | no | lets the invitee correct their name |

```bash
curl -X POST $API/v1/auth/accept-invite -H 'content-type: application/json' \
  -d '{"token":"fpl_QLqtLZ...","password":"Live-Smoke-Passphrase-7"}'
```

**200**: identical shape to login (`data.user` + `data.session`). Set the cookie and redirect to the app.

| Status | `code` | When | UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | password fails policy. **The token is NOT consumed**, the user can just retry. | show issues under the password field |
| 400 | `INVALID_TOKEN` | see 5.2. Also returned to the loser if the link is clicked twice at once. | dead-link screen |

```json
{ "success": false, "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid.",
             "details": { "issues": [ { "field": "password", "code": "too_common", "message": "This password is too common. Choose something less guessable." } ] },
             "requestId": "71f86899-814b-4190-8ffd-828f0ad72181" } }
```

---

### 5.4 `POST /v1/auth/forgot-password`

Request a reset email. **Always answers 200 with the same body**, whether or not the email exists, whether the
account is disabled, or whether the mail could be sent; the work happens after the response so even the timing
does not leak. 5/15 min/IP. A user can receive at most 3 reset emails per hour (extra requests are silently
ignored).

| Body field | Type |
|---|---|
| `email` | string |

```bash
curl -X POST $API/v1/auth/forgot-password -H 'content-type: application/json' -d '{"email":"ghost@filter-go.com"}'
```
**200**
```json
{ "success": true, "data": { "message": "If an account exists for that email, a reset link is on its way." }, "error": null }
```
UI: always show "If an account exists for that email, we've sent a reset link" and never say "email not found".
Only `ACTIVE` users get an email. The link is `${FRONTEND_URL}/reset-password?token=fpl_...` and lasts **30 minutes**, single use.
Requesting a new link voids the previous one.

---

### 5.5 `POST /v1/auth/reset-password`

Set a new password from the emailed link. On success **every session of that user on every device is
revoked** and any lockout is cleared. It does **not** sign the user in: send them to `/login`. 10/15 min/IP.

| Body field | Type |
|---|---|
| `token` | string |
| `password` | string (policy 4.3) |

**200** `{ "success": true, "data": { "message": "Password updated. Sign in with your new password." }, "error": null }`

Errors: `400 VALIDATION_ERROR` (weak password, **token stays valid**, retry), `400 INVALID_TOKEN`
```json
{ "success": false, "data": null,
  "error": { "code": "INVALID_TOKEN", "message": "This link is invalid or has expired.", "requestId": "14d127ee-cfe4-4e07-927e-81a5ab781627" } }
```

---

### 5.6 `GET /v1/auth/me`

Auth: session. The "who am I" call. Use it in `getSession()` on every server render (cache it per request).
Also slides the idle timer.

```bash
curl $API/v1/auth/me -H "authorization: Bearer $TOKEN"
```
**200**
```json
{ "success": true,
  "data": {
    "user": { "id": "aaed1fe1-4465-4f27-ad58-17114e18d0f2", "name": "Demo Admin", "email": "demo.admin@filter-go.com",
              "image": null, "role": "ADMIN", "status": "ACTIVE",
              "createdAt": "2026-09-21T16:45:56.330Z", "lastLoginAt": "2026-09-21T16:46:23.518Z" },
    "session": { "id": "5e6b4679-f352-4246-96cd-b685dc3ac7d1", "createdAt": "2026-09-21T16:46:23.503Z",
                 "lastUsedAt": "2026-09-21T16:46:23.503Z", "expiresAt": "2026-12-20T16:46:23.502Z",
                 "idleExpiresAt": "2026-10-21T16:46:23.502Z", "remember": true,
                 "ip": "127.0.0.1", "userAgent": "curl/8.11.0", "current": true }
  },
  "error": null }
```
The response never contains the token itself.

| Status | `code` | Meaning |
|---|---|---|
| 401 | `UNAUTHENTICATED` | no/garbled header, unknown token, signed out, user disabled |
| 401 | `SESSION_EXPIRED` | idle or absolute limit passed. UI may say "Your session expired." |

```json
{ "success": false, "data": null, "error": { "code": "UNAUTHENTICATED", "message": "You are not signed in.", "requestId": "adf5f9a2-e50f-4ac1-9330-76f547868a15" } }
```

### 5.7 `PATCH /v1/auth/me`

Edit own profile. At least one field. Email, role and status can **not** be changed here (sending them is a 400).

| Body field | Type | Notes |
|---|---|---|
| `name` | string 1-100 | |
| `image` | https URL or `null` | `null` clears it |

**200** `{ "success": true, "data": { "user": { ...updated user... } }, "error": null }`.
Errors: `400 VALIDATION_ERROR` (non-https image, empty body, extra field).

### 5.8 `POST /v1/auth/logout`

Signs out **this** device. No body needed. **200** `{ "success": true, "data": { "message": "Signed out." }, "error": null }`.
Always clear your cookie even if this call fails (a dead session is already logged out).

### 5.9 `POST /v1/auth/logout-all`

Signs out **every** device including this one. **200** `{ "success": true, "data": { "revoked": 2 }, "error": null }`.
Then clear your cookie and redirect to `/login`.

### 5.10 `POST /v1/auth/change-password`

| Body field | Type | Notes |
|---|---|---|
| `currentPassword` | string | |
| `newPassword` | string | policy 4.3; must differ from current |

**200**
```json
{ "success": true, "data": { "message": "Password changed.", "otherSessionsRevoked": 1 }, "error": null }
```
This device stays signed in; every other device is signed out; any reset links already emailed are voided.
Limit 10 / 15 min, and wrong current-password guesses count toward the same lockout as login.

| Status | `code` | UI |
|---|---|---|
| **400** | `INVALID_CURRENT_PASSWORD` | error under "Current password". **Never 401**, so it can't be mistaken for "session dead" and bounce the user to /login. |
| 400 | `VALIDATION_ERROR` | issues with `field: "newPassword"` (`too_common`, ..., `same_as_current`) |
| 429 | `TOO_MANY_ATTEMPTS` | |

```json
{ "success": false, "data": null, "error": { "code": "INVALID_CURRENT_PASSWORD", "message": "Current password is incorrect.", "requestId": "67c1a9e1-96d0-460d-91dd-903d51cf2fac" } }
```

### 5.11 `GET /v1/auth/sessions`

Own live sessions, most recently used first. **200**
```json
{ "success": true,
  "data": { "sessions": [
    { "id": "5e6b4679-...", "createdAt": "...", "lastUsedAt": "...", "expiresAt": "...", "idleExpiresAt": "...",
      "remember": true, "ip": "127.0.0.1", "userAgent": "curl/8.11.0", "current": true },
    { "id": "0020f9ba-...", "createdAt": "...", "lastUsedAt": "...", "expiresAt": "...", "idleExpiresAt": "...",
      "remember": false, "ip": "127.0.0.1", "userAgent": "curl/8.11.0", "current": false } ] },
  "error": null }
```
`ip`/`userAgent` are whatever the BFF forwarded; if you don't forward them this list shows your server, not the user's browser.

### 5.12 `DELETE /v1/auth/sessions/:id`

Sign out one device. **200** `{ "success": true, "data": { "message": "Session revoked.", "wasCurrent": false }, "error": null }`.
If `wasCurrent` is `true` the user just signed themselves out: clear the cookie and go to `/login`.
Errors: `404 SESSION_NOT_FOUND` (missing, already revoked, **or belongs to someone else**, identical on purpose), `400 VALIDATION_ERROR` (id is not a UUID).

---

### 5.13 `POST /v1/admin/users/invite`  (admin)

Creates the user in status `INVITED` and emails the invite link (valid 72 h, single use).

| Body field | Type | Required |
|---|---|---|
| `email` | string | yes |
| `name` | string | yes |
| `role` | `ADMIN`, `SUPERVISOR`, `FIELD_USER` or `CLIENT_USER` | no (`FIELD_USER`) |
| `clientId` | uuid | **required for `CLIENT_USER`**, forbidden otherwise |
| `phone`, `employmentType` (`EMPLOYEE`/`CONTRACTOR`), `defaultPayRate` (money string), `hiredAt` (`YYYY-MM-DD`) | | optional |

```bash
curl -X POST $API/v1/admin/users/invite -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"email":"staff@filter-go.com","name":"Sam Staff","role":"FIELD_USER"}'
```
**201**
```json
{ "success": true,
  "data": { "user": { "id": "7dd1ebef-6706-4d26-a558-45ece85de6f5", "name": "Sam Staff", "email": "staff@filter-go.com",
                      "image": null, "role": "FIELD_USER", "status": "INVITED",
                      "createdAt": "2026-09-21T16:46:24.250Z", "lastLoginAt": null },
            "emailSent": true },
  "error": null }
```
- **`emailSent: false`** means the user was created but the mail server failed. Show a warning ("Invite created but the
  email could not be sent, try again") and let the admin press Invite again.
- **Inviting the same email again is safe and is how you "Resend"**: it updates name/role, voids the old link and
  sends a new one. That works for `INVITED` users and for cancelled invites (`DISABLED` and never activated).
- The link/token is never returned by the API.

Errors: `409 EMAIL_TAKEN` (that person already has a password)
```json
{ "success": false, "data": null, "error": { "code": "EMAIL_TAKEN", "message": "A user with this email already exists.", "requestId": "e3915f34-3427-4b7e-a665-0b6c07fa217c" } }
```

### 5.14 `GET /v1/admin/users`  (admin)

| Query | Type | Default | Notes |
|---|---|---|---|
| `page` | int >= 1 | 1 | a page past the end returns an empty list, not an error |
| `limit` | int 1-100 | 20 | |
| `q` | string <= 100 | | case-insensitive contains, on name or email |
| `role` | `ADMIN`/`SUPERVISOR`/`FIELD_USER`/`CLIENT_USER` | | |
| `status` | `INVITED`/`ACTIVE`/`DISABLED` | | |

Newest first. Unknown query params are rejected (400).
```bash
curl "$API/v1/admin/users?limit=5&status=ACTIVE&q=demo" -H "authorization: Bearer $TOKEN"
```
**200**
```json
{ "success": true,
  "data": { "users": [ { "id": "...", "name": "Sam Staff", "email": "staff@filter-go.com", "image": null,
                         "role": "FIELD_USER", "status": "INVITED", "createdAt": "...", "lastLoginAt": null } ] },
  "meta": { "page": 1, "limit": 5, "total": 2, "totalPages": 1 },
  "error": null }
```

### 5.15 `GET /v1/admin/users/:id`  (admin)

**200** `{ "success": true, "data": { "user": { ... } }, "error": null }`. Errors: `404 USER_NOT_FOUND`, `400 VALIDATION_ERROR` (id not a UUID).

### 5.16 `PATCH /v1/admin/users/:id`  (admin)

| Body field | Type | Notes |
|---|---|---|
| `name` | string | |
| `role` | `ADMIN`/`SUPERVISOR`/`FIELD_USER`/`CLIENT_USER` | takes effect on the target's very next request |
| `status` | `ACTIVE`/`DISABLED` | `DISABLED` immediately signs them out everywhere and voids their pending links |

At least one field; email/password/id are not editable (400).
**200** `{ "success": true, "data": { "user": { ...updated... } }, "error": null }`

| Status | `code` | When |
|---|---|---|
| 409 | `CANNOT_MODIFY_SELF` | an admin tried to change **their own** role or status (prevents locking yourself out). Renaming yourself is fine. |
| 409 | `USER_NOT_ACTIVATED` | tried to set `ACTIVE` on someone who never accepted their invite. Re-invite instead (5.13). |
| 404 | `USER_NOT_FOUND` | |

```json
{ "success": false, "data": null, "error": { "code": "CANNOT_MODIFY_SELF", "message": "You cannot change your own role or status. Ask another admin.", "requestId": "7c5a1c5d-4a6c-42b1-b05d-7200e0f16ffd" } }
```
UI tip: hide/disable the role and status controls on the row of the signed-in admin.

### 5.17 `POST /v1/admin/users/:id/revoke-sessions`  (admin)

Force sign-out of a user without disabling them. **200** `{ "success": true, "data": { "revoked": 3 }, "error": null }`. Errors: `404 USER_NOT_FOUND`.

### 5.18 Health

`GET /health` => `{"success":true,"data":{"status":"ok"},"error":null}`.
`GET /health/ready` checks the database => `200 {"status":"ready"}` or `503 SERVICE_UNAVAILABLE`.
Neither needs the service key or a session.

---

## 6. Error codes and what the UI should do

| HTTP | `code` | Meaning | UI / BFF action |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | body/query/params invalid; `details.issues[]` | map `issue.field` to form fields; show `issue.message` |
| 400 | `INVALID_JSON` | body is not JSON | bug in your client |
| 400 | `BAD_REQUEST` | malformed request the framework rejected (e.g. bad URL) | bug in your client |
| 400 | `INVALID_TOKEN` | invite/reset link dead | dead-link screen + "request a new link" |
| 400 | `INVALID_CURRENT_PASSWORD` | wrong current password | field error, **stay signed in** |
| 401 | `INVALID_CREDENTIALS` | bad email/password (login only) | generic login error |
| 401 | `UNAUTHENTICATED` | no valid session | clear cookie, redirect to `/login?redirectTo=...` |
| 401 | `SESSION_EXPIRED` | session timed out | same, optionally "Your session expired" |
| 403 | `FORBIDDEN` | signed in but not an admin | "You don't have access" page (not a redirect to login) |
| 403 | `ACCOUNT_DISABLED` | disabled account (login only) | message, no retry |
| 403 | `INVALID_SERVICE_KEY` | **your server's** `X-Service-Key` is wrong/missing | operator bug: log it, show a generic error. Never treat as "logged out". |
| 404 | `NOT_FOUND` / `USER_NOT_FOUND` / `SESSION_NOT_FOUND` | | 404 UI |
| 409 | `EMAIL_TAKEN` | invite for an existing user | inline error |
| 409 | `CANNOT_MODIFY_SELF` | admin edited themselves | inline error |
| 409 | `USER_NOT_ACTIVATED` | enable a never-activated user | suggest re-invite |
| 413 | `PAYLOAD_TOO_LARGE` | > 16 KB | bug in your client |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | not JSON | bug in your client |
| 429 | `TOO_MANY_ATTEMPTS` | login/change-password lockout | "Try again in `retryAfterSeconds`" + link to Forgot password |
| 429 | `RATE_LIMITED` | route rate limit | "Slow down", honour `retryAfterSeconds` |
| 500 | `INTERNAL_ERROR` | server bug | generic error, show `requestId` |
| 503 | `SERVICE_UNAVAILABLE` | database down (`/health/ready`) | |

**Global handling rule for the BFF:** on `401` from a *protected* call => drop the cookie and send the user to
`/login`. On network errors or `5xx` => **do not** log the user out; show an error page/toast (a backend outage must
not bounce everyone to the login screen).

---

## 7. End-to-end flows

**Login.** Login form -> `POST /api/login` (Next) -> `POST /v1/auth/login` -> Next sets the cookie, returns `{user}` ->
form does `router.replace(safeRedirect)` then `router.refresh()`.

**Every page load.** Server component/`AuthGuard` -> `getSession()` -> `GET /v1/auth/me` with the cookie's token ->
user or `null`. `null` => redirect to `/login?redirectTo=<path>`.

**Logout.** `POST /api/logout` (Next) -> `POST /v1/auth/logout` (best effort) -> Next clears the cookie -> `router.push('/login')`.

**Session dies while the user is working** (idle timeout, admin disabled them, password reset elsewhere). Their next
call gets 401. Your generic handler clears the cookie and redirects to `/login?redirectTo=...`.

**Invite.**
1. Admin submits Invite form -> `POST /v1/admin/users/invite` -> user row `INVITED`, email sent (in dev: printed in the backend terminal).
2. Invitee clicks `https://portal/accept-invite?token=fpl_...`.
3. Page calls `verify-token` (`purpose: invite`). Dead link => "expired, ask your admin to resend".
4. Page shows "Welcome {name}", password (+ optional name) form -> `POST /api/accept-invite` -> `POST /v1/auth/accept-invite`.
5. Weak password => 400 issues, token still valid, user retries. Success => Next sets the cookie, redirect to the app.

**Forgot / reset password.**
1. `/forgot-password` form -> `POST /v1/auth/forgot-password` -> always "check your email".
2. Email link `https://portal/reset-password?token=fpl_...` (valid 30 min).
3. Page calls `verify-token` (`purpose: password_reset`), then shows the new-password form -> `POST /v1/auth/reset-password`.
4. Success => "Password updated" -> `/login`. (All old sessions are gone.)

**Change password (signed in).** Form -> `POST /v1/auth/change-password`. Wrong current => field error (400). Success =>
toast "Password changed. Other devices were signed out."

**Cancel an invite / re-send.** Cancel: `PATCH /users/:id {status:"DISABLED"}`. Resend or re-issue: `POST /users/invite` with the same email.

**Recovering a locked-out admin (ops, not UI).** On the server: `pnpm admin:create --email x --name "X" --force`
makes an existing user an active ADMIN again without touching their password.

---

## 8. Audit of the current frontend (what must change)

Reviewed `filter-portal` (Next 16.1.1, React 19, MUI, react-hook-form + valibot). It is the "Breeze" admin template
with a small real auth layer bolted on. The auth layer was designed with a single swap point, which is the good news.

| # | Severity | Finding | Where | Action |
|---|---|---|---|---|
| 1 | High | Login form is **pre-filled with `admin@filter-go.com` / `admin`** and the mock user store accepts it. | `src/views/Login.tsx` (defaultValues), `src/app/api/login/users.ts` | Remove the defaults; delete `users.ts` and the mock lookup. |
| 2 | High | **Open redirect**: after login `router.replace(searchParams.get('redirectTo') ?? '/')` uses an unvalidated value (`?redirectTo=//evil.com` or `https://evil.com`). | `src/views/Login.tsx` | Use `safeRedirect()` (9.6). |
| 3 | High | Mock data endpoints and Server Actions are **unauthenticated**: `src/app/api/apps/*`, `src/app/api/pages/*` and every export of `src/app/server/actions.ts` (`'use server'` functions are public POST endpoints). Harmless with fake data, a data leak the day real data replaces it. | those files | When real data arrives, each must call `getSession()` and reject when null (and check `role` for admin data). Delete the unused mock routes now. |
| 4 | Medium | Auth is enforced only in the `(private)` **layout** (`AuthGuard`). Next.js layouts do not re-render on client-side navigation, so a layout-only check is not a security boundary. There is no `proxy.ts`/`middleware.ts`. | `src/app/(dashboard)/(private)/layout.tsx` | Keep `AuthGuard` for UX, and call `getSession()` again inside every server action / route handler / data function that returns protected data. Optionally add a `proxy.ts` that redirects requests with no session cookie to `/login` (optimistic check only). |
| 5 | Medium | The session cookie is a self-contained **stateless HMAC blob**: cannot be revoked, payload is readable, 7-day fixed life. | `src/libs/session.ts` | Replace with the opaque-token cookie (9.2). `AUTH_SECRET` is no longer needed. |
| 6 | Medium | `SessionUser.id` is `number`; ours is a UUID `string`, and `role`/`status` are missing. | `src/types/sessionTypes.ts` | Use `User` from `api-types.ts`. |
| 7 | Medium | **Register page is static and inert**, and `/login` links to it. Signup is invite-only. | `src/views/Register.tsx`, `register/page.tsx`, "Create an account" link in `Login.tsx` | Delete the page and the link. |
| 8 | Medium | **Forgot-password page is static** (`onSubmit={e => e.preventDefault()}`, no state, no request). | `src/views/ForgotPassword.tsx` | Wire it to `POST /api/forgot-password` (9.5). |
| 9 | Medium | Missing pages: `/accept-invite`, `/reset-password`. | | Build them under `(blank-layout-pages)/(guest-only)/`. |
| 10 | Low | "Remember me" checkbox is not connected to anything. | `Login.tsx` | Send `rememberMe`. |
| 11 | Low | Client validation demands password `min 5` on login. | `Login.tsx` valibot schema | Login needs only `min 1`. The 10-char policy belongs on set-password forms only. |
| 12 | Low | `AuthRedirect` builds `/login?redirectTo=${pathname}` without encoding. | `src/components/AuthRedirect.tsx` | `encodeURIComponent(pathname)`. |
| 13 | Low | Login error handling expects `{ message: string[] }`; the new shape is the envelope. | `Login.tsx` | Read `error.message` / `error.details.issues`, handle 429 (9.4). |
| 14 | Low | Logout only clears the Next cookie. | `UserDropdown.tsx` -> `/api/logout` | The new `/api/logout` also revokes the session server-side (9.3). No change needed in the dropdown. |
| 15 | Info | `(blank-layout-pages)/pages/auth/*` (login-v1/v2, register-*, two-steps-*, verify-email-*...) and `pages/misc` are static template demo pages, reachable without login. | | Delete the ones you don't use. No 2FA / email-verification exists in the API. |
| 16 | Info | `.env.example` has `AUTH_SECRET`, `API_URL`, `NEXT_PUBLIC_API_URL` (pointing at the template's own `/api`). | | Replace with `AUTH_API_URL`, `AUTH_API_SERVICE_KEY` (section 3). `NEXT_PUBLIC_*` variables are bundled into browser JS. Never put the service key or API URL in one. |
| 17 | Info | Roles/Permissions/User-list pages are template UIs on fake data. | `apps/roles`, `apps/permissions`, `apps/user/list` | Not connected. Build the real Users screen on `/v1/admin/users` (section 5.13-5.17). |

What is already good and should be kept: httpOnly + `SameSite=Lax` + `secure` in production cookie flags, the
`getSession()` -> `SessionProvider` server-seeded pattern (no client fetch, no flash), `GuestOnlyRoute`, and
`router.refresh()` after login.

---

## 9. Integration guide with reference code

All server-only code. Adapt paths/aliases to your repo. **Reference code, not compiled against your repo.**

### 9.1 `src/libs/backend.ts`: the one place that talks to the API

```ts
import 'server-only'

import { headers } from 'next/headers'

import type { ApiFailure, ApiSuccess, ErrorCode, ErrorDetails, PageMeta } from '@/types/api'

const BASE = process.env.AUTH_API_URL
const SERVICE_KEY = process.env.AUTH_API_SERVICE_KEY

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'BAD_GATEWAY',
    message: string,
    readonly details?: ErrorDetails,
    readonly requestId?: string
  ) {
    super(message)
  }
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** The session token from the cookie. Omit for public endpoints. */
  token?: string
}

export async function callApi<T>(path: string, { method = 'GET', body, token }: CallOptions = {}) {
  if (!BASE) throw new Error('AUTH_API_URL is not set')

  const incoming = await headers()
  // ONE value, overwrite (never append) : the backend trusts this header
  const clientIp = incoming.get('x-forwarded-for')?.split(',')[0]?.trim() ?? incoming.get('x-real-ip') ?? undefined
  const userAgent = incoming.get('user-agent') ?? undefined

  let res: Response

  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(SERVICE_KEY ? { 'x-service-key': SERVICE_KEY } : {}),
        ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
        ...(userAgent ? { 'user-agent': userAgent } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch {
    // Network error / timeout: NOT the user's fault and NOT a logout
    throw new ApiError(502, 'BAD_GATEWAY', 'The server could not be reached.')
  }

  const json = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null

  if (!json || typeof json.success !== 'boolean') {
    throw new ApiError(502, 'BAD_GATEWAY', 'Unexpected response from the server.')
  }

  if (!json.success) {
    const { code, message, details, requestId } = json.error

    throw new ApiError(res.status, code, message, details, requestId)
  }

  return { data: json.data, meta: (json as { meta?: PageMeta }).meta }
}
```

### 9.2 `src/libs/session.ts`: replaces the HMAC cookie

```ts
import 'server-only'

import { cache } from 'react'

import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'

import type { MeData, User } from '@/types/api'
import { ApiError, callApi } from '@/libs/backend'

export const SESSION_COOKIE = 'filtergo-session'

const base = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' }

/** Call on a NextResponse from a route handler. `expiresAt` is `session.expiresAt` from login/accept-invite. */
export const setSessionCookie = (response: NextResponse, token: string, expiresAt: string) =>
  response.cookies.set({ name: SESSION_COOKIE, value: token, expires: new Date(expiresAt), ...base })

export const clearSessionCookie = (response: NextResponse) =>
  response.cookies.set({ name: SESSION_COOKIE, value: '', maxAge: 0, ...base })

export const getSessionToken = async () => (await cookies()).get(SESSION_COOKIE)?.value

/**
 * The signed-in user, or null. Cached for the duration of one request, so calling it from
 * Providers, AuthGuard and GuestOnlyRoute costs ONE backend call.
 * 401 => null (signed out). Any other failure THROWS, so an API outage shows an error page instead of silently logging everybody out.
 */
export const getSession = cache(async (): Promise<User | null> => {
  const token = await getSessionToken()

  if (!token) return null

  try {
    const { data } = await callApi<MeData>('/v1/auth/me', { token })

    return data.user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null

    throw error
  }
})
```
`AuthGuard`, `GuestOnlyRoute`, `Providers` and `useSession()` keep working unchanged. `useSession()` now also has `role`.
A stale/dead cookie left in the browser is harmless (`getSession()` returns null; the next login overwrites it), because
Server Components cannot delete cookies.

### 9.3 Route handlers (`src/app/api/...`)

Shared helper `src/libs/apiResponse.ts`:
```ts
import { NextResponse } from 'next/server'

import { ApiError } from '@/libs/backend'

export const errorResponse = (error: unknown) => {
  if (error instanceof ApiError) {
    const retry = error.details?.retryAfterSeconds

    return NextResponse.json(
      { success: false, data: null, error: { code: error.code, message: error.message, details: error.details, requestId: error.requestId } },
      { status: error.status, headers: retry ? { 'retry-after': String(retry) } : undefined }
    )
  }

  console.error('BFF error', error)

  return NextResponse.json(
    { success: false, data: null, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
    { status: 500 }
  )
}
```
A 403 `INVALID_SERVICE_KEY` should be logged loudly server-side rather than shown; add `if (error.code === 'INVALID_SERVICE_KEY') console.error(...)`.

`src/app/api/login/route.ts` (replace):
```ts
import { NextResponse } from 'next/server'

import type { LoginData } from '@/types/api'
import { callApi } from '@/libs/backend'
import { errorResponse } from '@/libs/apiResponse'
import { setSessionCookie } from '@/libs/session'

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as { email?: string; password?: string; rememberMe?: boolean }

  try {
    const { data } = await callApi<LoginData>('/v1/auth/login', {
      method: 'POST',
      body: { email: input.email, password: input.password, rememberMe: input.rememberMe === true }
    })

    const response = NextResponse.json({ success: true, data: { user: data.user }, error: null })

    setSessionCookie(response, data.session.token, data.session.expiresAt)  // token goes in the cookie ONLY

    return response
  } catch (error) {
    return errorResponse(error)
  }
}
```
`src/app/api/accept-invite/route.ts` is identical with `/v1/auth/accept-invite` and body `{ token, password, name }`.

`src/app/api/logout/route.ts` (replace):
```ts
import { NextResponse } from 'next/server'

import { callApi } from '@/libs/backend'
import { clearSessionCookie, getSessionToken } from '@/libs/session'

export async function POST() {
  const token = await getSessionToken()

  // Best effort. The cookie is cleared no matter what: a dead session is already signed out.
  if (token) await callApi('/v1/auth/logout', { method: 'POST', token }).catch(() => undefined)

  const response = NextResponse.json({ success: true, data: { ok: true }, error: null })

  clearSessionCookie(response)

  return response
}
```
`/api/forgot-password`, `/api/reset-password`, `/api/verify-token` are 10-line passthroughs: read JSON, `callApi(..., { method:'POST', body })`,
return `NextResponse.json({ success: true, data, error: null })` or `errorResponse(e)`. No cookie involved.

**One generic authenticated proxy** for everything else the browser needs (profile, sessions, change-password, admin):
`src/app/api/backend/[...path]/route.ts`
```ts
import { NextResponse } from 'next/server'

import { callApi } from '@/libs/backend'
import { errorResponse } from '@/libs/apiResponse'
import { getSessionToken } from '@/libs/session'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
// Allow-list: the browser can only reach these. Login/logout/accept-invite have their own handlers because they touch the cookie.
const ALLOWED = new RegExp(
  `^(auth/(me|logout-all|change-password|sessions(/${UUID})?)|admin/users(/invite|/${UUID}(/revoke-sessions)?)?)$`
)

async function handle(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const route = (await params).path.join('/')

  if (!ALLOWED.test(route)) {
    return NextResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Not found.' } }, { status: 404 })
  }

  const token = await getSessionToken()

  if (!token) {
    return NextResponse.json({ success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'You are not signed in.' } }, { status: 401 })
  }

  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method)

  // Cheap CSRF hardening on top of SameSite=Lax: cross-site forms cannot send JSON
  if (hasBody && !req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ success: false, data: null, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Send JSON.' } }, { status: 415 })
  }

  try {
    const { data, meta } = await callApi(`/v1/${route}${new URL(req.url).search}`, {
      method: req.method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
      token,
      body: hasBody ? await req.json().catch(() => ({})) : undefined
    })

    return NextResponse.json({ success: true, data, meta, error: null })
  } catch (error) {
    return errorResponse(error)
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE }
```
Browser usage: `fetch('/api/backend/admin/users?limit=20')`, `fetch('/api/backend/auth/change-password', { method:'POST', headers:{'content-type':'application/json'}, body: ... })`.
Global client rule: if any of these returns 401, do `window.location.assign('/login?redirectTo=' + encodeURIComponent(location.pathname))`.

### 9.4 Login form changes (`src/views/Login.tsx`)

- Remove `defaultValues` email/password.
- Schema: `password: pipe(string(), nonEmpty('This field is required'))` (drop `minLength(5)`).
- Wire the checkbox: `const [remember, setRemember] = useState(false)` -> `<Checkbox checked={remember} onChange={e => setRemember(e.target.checked)} />`, and send `rememberMe: remember`.
- Handle the new error shape:

```ts
const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
                                        body: JSON.stringify({ email: data.email, password: data.password, rememberMe: remember }) })

if (res.ok) {
  router.replace(safeRedirect(searchParams.get('redirectTo')))
  router.refresh()

  return
}

const { error } = await res.json()

if (error.code === 'TOO_MANY_ATTEMPTS') {
  setErrorState(`Too many attempts. Try again in ${Math.ceil((error.details?.retryAfterSeconds ?? 60) / 60)} minute(s), or reset your password.`)
} else if (error.code === 'ACCOUNT_DISABLED') {
  setErrorState('Your account is disabled. Contact your administrator.')
} else {
  setErrorState(error.message)   // INVALID_CREDENTIALS and everything else
}
```
- Remove the "Create an account" link and delete the register page.

### 9.5 New / wired pages

- **`/forgot-password`**: react-hook-form with `email`; submit -> `POST /api/forgot-password`; on 200 show "If an account exists for that email, we've sent a reset link." (regardless). Handle 429.
- **`/reset-password`** (server component reads `searchParams.token`): call `verify-token` (`purpose: 'password_reset'`) server-side. If `INVALID_TOKEN` render the dead-link screen. Otherwise render the client form (new password + confirm) -> `POST /api/reset-password { token, password }`. Show `details.issues` under the password field. On 200 -> toast + `router.replace('/login')`.
- **`/accept-invite`**: same shape with `purpose: 'invite'`; greet with `name`/`email` from `verify-token`; optional "Your name" field; -> `POST /api/accept-invite`; on 200 the cookie is already set -> `router.replace('/')` + `router.refresh()`.
- Put all three under `(blank-layout-pages)/(guest-only)/` (they are for signed-out users).
- The link page must not leak the token: add `<meta name="referrer" content="no-referrer">` (or `referrerPolicy` in metadata) and don't load third-party scripts on it.
- Password field UX: show "At least 10 characters. Avoid common passwords or your name/email." and render server issues verbatim.

### 9.6 `safeRedirect` and `AuthRedirect`

```ts
// src/utils/safeRedirect.ts
/** Only same-site relative paths are allowed. Blocks //evil.com, https://evil.com, /\evil.com, javascript: */
export const safeRedirect = (target: string | null, fallback = '/'): string =>
  target && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\') ? target : fallback
```
`AuthRedirect.tsx`: `const redirectUrl = \`/login?redirectTo=${encodeURIComponent(pathname)}\``.

### 9.7 Role-based UI

`const session = useSession()`; hide the "Users" menu unless `session?.role === 'ADMIN'`. This is **cosmetic only**: the API
enforces roles (`403 FORBIDDEN`), and your own server actions/pages must check `role` from `getSession()` themselves.

### 9.8 What to delete

`src/app/api/login/users.ts`, the HMAC code in `libs/session.ts`, `AUTH_SECRET`, `Register.tsx` + route,
unused `pages/auth/*` demo routes, and the mock `src/app/api/apps|pages` routes once nothing imports them.

---

## 10. Rules you must not break

1. **Never** put the token, the API URL, or the service key in `NEXT_PUBLIC_*`, `localStorage`, `sessionStorage`, a non-httpOnly cookie, a redux store, or a log line.
2. **Never** call the API from browser code. Always go through your Next.js route handlers.
3. **Never** send the token to the browser (strip `session` before returning login/accept-invite JSON).
4. Cookie flags stay `httpOnly`, `secure` (in prod), `SameSite=Lax`, `path=/`. Do not use `SameSite=None`.
5. **Branch on `error.code`**, never on `message` or HTTP status alone.
6. Treat **401 as "session is dead"** and nothing else. Treat network errors / 5xx as an outage, not a logout.
7. Forward **one** `X-Forwarded-For` (overwrite) and the browser `User-Agent`.
8. Don't build a "does this email exist?" feature. The API hides that on purpose.
9. Don't pre-validate passwords more strictly or loosely than the server: show the server's `issues`.
10. Role checks in the UI are cosmetic; re-check `role` server-side wherever data is returned.
11. Don't put invite/reset tokens in analytics, error reporters or URLs you log.

---

## 11. QA checklist

Signed out
- [ ] Visiting any `(private)` page redirects to `/login?redirectTo=<encoded path>`; after login you land there.
- [ ] `?redirectTo=//evil.com` and `?redirectTo=https://evil.com` land on `/`, not off-site.
- [ ] Wrong password shows the generic error; 6th wrong attempt shows the lockout message with minutes; the Forgot-password link works from there.
- [ ] No pre-filled credentials on the login form; there is no "Create an account" link and `/register` is 404.
- [ ] "Remember me" gives a cookie that survives a browser restart (check `expires` ~90 days); unticked lasts <= 24 h.

Invite / reset
- [ ] Admin invites -> link appears in the backend log (dev) -> `/accept-invite` greets by name -> weak password shows issues and keeps the form -> strong password signs in and lands in the app.
- [ ] Opening the same invite link again shows the dead-link screen.
- [ ] Re-inviting the same email invalidates the older link.
- [ ] Forgot password with a real and a fake email shows the **identical** message; only the real one produces an email.
- [ ] Reset link works once; afterwards every other open browser gets bounced to `/login` on its next request.
- [ ] A reset link older than 30 minutes shows the dead-link screen.

Signed in
- [ ] Refreshing the page keeps you signed in with no flash of the login page.
- [ ] Logout in tab A; the next click in tab B goes to `/login`.
- [ ] Admin disables a user; that user's next click goes to `/login` and they cannot sign back in (ACCOUNT_DISABLED message).
- [ ] Change password with a wrong current password shows a field error and does **not** log you out.
- [ ] Changing password on device A signs out device B but not A.
- [ ] "Sessions" screen lists devices with the right browser/IP (proves you forward `User-Agent`/`X-Forwarded-For`), marks the current one, and revoking another works; revoking the current one logs you out.
- [ ] A FIELD_USER opening an admin screen sees the "no access" state (403), not the login page.
- [ ] An admin cannot change their own role/status (error shown; controls disabled for own row).

Resilience
- [ ] Stop the backend: pages show an error state, users are **not** redirected to login, and the session works again when the backend is back.
- [ ] Wrong `AUTH_API_SERVICE_KEY` logs a clear server-side error (403 `INVALID_SERVICE_KEY`) rather than showing a login screen.

---

## 12. FAQ and gotchas

**Why not JWT + refresh tokens?** They add token-refresh races between tabs and SSR, and can't be revoked instantly. Server-side sessions fix both, and the extra DB lookup is negligible for this app.

**Do I ever refresh the token?** No. The idle timer slides automatically on each request (at most once a minute). The cookie carries the absolute expiry.

**Why does `getSession()` call the API on every page?** It is one small indexed lookup, cached per request. It is what makes "disabled users are out immediately" true.

**Cookie expiry vs session expiry.** The cookie lives until the *absolute* expiry. The server may end the session earlier (idle timeout, revocation). The next request returns 401 and you redirect. Don't try to predict it in the browser.

**Do I need CORS?** No. The API sends no CORS headers by default and you never call it from a browser.

**Where do emails go locally?** Printed in the backend terminal (`MAIL_DRIVER=console`). In production the backend uses SMTP.

**A user says "I never got the invite/reset email."** Check spam; for resets remember only `ACTIVE` users get one and there's a 3/hour cap. An admin can re-invite. Support can find the event by `requestId` / the user in `audit_events`.

**Why is a wrong current password a 400 and not a 401?** Because a global "401 => log out" handler would kick users out for a typo.

**Why does login say "Email or password is incorrect" for a disabled account with the wrong password?** So the API never confirms an account exists. `ACCOUNT_DISABLED` is only revealed after the correct password.

**Can I get the invite link from the API to show it to the admin?** No, by design. The admin can only re-send. (For the very first admin, `pnpm admin:create` prints it.)

**Two admins edit the same user at once?** Last write wins; there are no version fields.

**Behind a load balancer / on Vercel:** the backend must have `TRUST_PROXY` set to the hop count/CIDR of your Next.js server, and your BFF must send a single client IP in `X-Forwarded-For`. If rate limits start hitting everyone at once, this is the cause.

**What is not built:** 2FA / TOTP, email verification (not needed: invite-only), social login, per-permission roles, admin "unlock user" (a locked-out user uses Forgot password), user deletion (disable instead).

---

## 13. TypeScript contract (`docs/api-types.ts`)

Copy into `src/types/api.ts`. It is compile-checked against the backend's error codes, roles and statuses.

```ts
/**
 * FilterGO portal: TypeScript contract for the auth API.
 *
 * Copy this file into the frontend (e.g. src/types/api.ts). It has no imports and no runtime code.
 * It is type-checked together with the backend, so it cannot silently drift from the real responses.
 */

// ---------------------------------------------------------------------------
// Envelope: EVERY response, success or failure, has this shape
// ---------------------------------------------------------------------------

export interface PageMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ApiSuccess<T> {
  success: true
  data: T
  /** Only present on paginated lists. */
  meta?: PageMeta
  error: null
}

export interface ApiFailure {
  success: false
  data: null
  error: ApiErrorBody
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export interface ApiErrorBody {
  /** Branch on this. Never on `message`, which may be reworded. */
  code: ErrorCode
  /** Safe to show to a human. */
  message: string
  details?: ErrorDetails
  /** Quote this when reporting a problem. Same value as the X-Request-Id response header. */
  requestId: string
}

export interface FieldIssue {
  /** Body field the problem belongs to (e.g. "email", "password", "newPassword"). Empty string = whole body. */
  field: string
  /** Machine code: "required", "too_short", "too_common", "unrecognized_key", ... */
  code: string
  message: string
}

/** A non-blocking problem the caller may override (see ASSIGNMENT_WARNINGS). */
export interface Warning {
  code: string
  message: string
  data?: Record<string, unknown>
}

export interface ErrorDetails {
  /** VALIDATION_ERROR: one entry per invalid field. */
  issues?: FieldIssue[]
  /** TOO_MANY_ATTEMPTS / RATE_LIMITED: seconds until it is worth retrying. */
  retryAfterSeconds?: number
  /** NOT_FOUND / INVALID_STATE / DUPLICATE: the kind of thing this is about ("contract", "shift", ...). */
  entity?: string
  /** INVALID_STATE: the current state, the requested state, and the states that are allowed from here. */
  from?: string
  to?: string
  allowed?: string[]
  /** ASSIGNMENT_WARNINGS: problems the caller may override by resending with overrideWarnings. */
  warnings?: Warning[]
  /** Anything else useful to a human, e.g. the id of the conflicting shift. */
  context?: Record<string, unknown>
}

export type ErrorCode =
  // generic / transport
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'BAD_REQUEST'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'INVALID_STATE'
  | 'DUPLICATE'
  | 'RATE_LIMITED'
  | 'INVALID_SERVICE_KEY'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  // auth
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'TOO_MANY_ATTEMPTS'
  | 'FORBIDDEN'
  | 'USER_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'INVALID_TOKEN'
  | 'INVALID_CURRENT_PASSWORD'
  | 'CANNOT_MODIFY_SELF'
  | 'USER_NOT_ACTIVATED'
  // files
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  // contracts
  | 'CONTRACT_NOT_EDITABLE'
  | 'CONTRACT_NOT_ACTIVE'
  // scheduling
  | 'SCHEDULE_LOCKED'
  | 'SCHEDULE_OVERLAP'
  | 'SHIFT_OVERLAP'
  | 'ASSIGNMENT_WARNINGS'
  // timesheets
  | 'CLOCK_STATE'
  | 'CLOCK_WINDOW'
  // invoices
  | 'INVOICE_NOT_EDITABLE'
  | 'NOTHING_TO_INVOICE'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'INTEGRATION_ERROR'
  // leads
  | 'LEAD_ALREADY_CONVERTED'

// ---------------------------------------------------------------------------
// Domain objects
// ---------------------------------------------------------------------------

/**
 * ADMIN       everything in the organization, including contracts, rates and invoices
 * SUPERVISOR  the sites they manage: schedules, assignment, timesheet approval (sees pay rates, never bill rates)
 * FIELD_USER  own shifts, clock in/out, work logs, extra shifts (sees no rates)
 * CLIENT_USER read-only portal for their own client's sites, completed work and invoices
 */
export type Role = 'ADMIN' | 'SUPERVISOR' | 'FIELD_USER' | 'CLIENT_USER'
export type EmploymentType = 'EMPLOYEE' | 'CONTRACTOR'

/**
 * INVITED  = admin invited them, they have not chosen a password yet (cannot log in)
 * ACTIVE   = normal
 * DISABLED = blocked by an admin (cannot log in, all sessions were revoked)
 */
export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED'

export interface User {
  /** UUID string. NOT a number: the template's SessionUser.id (number) must change to string. */
  id: string
  /** The organization (tenant) the user belongs to. */
  orgId: string
  name: string
  email: string
  /** https URL or null. Fall back to an initials avatar when null. */
  image: string | null
  phone: string | null
  role: Role
  status: UserStatus
  employmentType: EmploymentType
  /** "YYYY-MM-DD" or null. */
  hiredAt: string | null
  /** Set for CLIENT_USER only: the client whose data they may read. */
  clientId: string | null
  /** Money string like "22.00". ONLY present when the viewer is an ADMIN or SUPERVISOR. */
  defaultPayRate?: string | null
  /** ISO-8601 UTC timestamp. */
  createdAt: string
  /** ISO-8601 UTC timestamp, or null if they never signed in. */
  lastLoginAt: string | null
}

/** One signed-in device / browser. */
export interface SessionInfo {
  id: string
  createdAt: string
  lastUsedAt: string
  /** Hard limit. Use this as the cookie expiry. */
  expiresAt: string
  /** Session also ends if unused past this moment. Moves forward while the user is active. */
  idleExpiresAt: string
  remember: boolean
  ip: string | null
  userAgent: string | null
  /** True for the session that made this request. */
  current: boolean
}

/** Returned once, by login / accept-invite. `token` is a secret: store it only in an httpOnly cookie. */
export interface IssuedSession {
  token: string
  id: string
  expiresAt: string
  idleExpiresAt: string
  remember: boolean
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string
  /** 1-128 characters. Do NOT apply the "new password" policy here. */
  password: string
  /** Default false. true = long-lived session ("Remember me"). */
  rememberMe?: boolean
}

export interface VerifyTokenRequest {
  token: string
  purpose: 'invite' | 'password_reset'
}

export interface AcceptInviteRequest {
  token: string
  password: string
  /** Optional: lets the invitee correct their name. */
  name?: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  password: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface UpdateProfileRequest {
  name?: string
  phone?: string | null
  /** https URL, or null to clear. */
  image?: string | null
}

export interface InviteUserRequest {
  email: string
  name: string
  /** Default FIELD_USER. */
  role?: Role
  /** REQUIRED for CLIENT_USER, forbidden for every other role. */
  clientId?: string
  phone?: string
  employmentType?: EmploymentType
  /** Money string, e.g. "22.00". */
  defaultPayRate?: string
  /** "YYYY-MM-DD" */
  hiredAt?: string
}

export interface UpdateUserRequest {
  name?: string
  role?: Role
  clientId?: string | null
  phone?: string | null
  employmentType?: EmploymentType
  defaultPayRate?: string | null
  hiredAt?: string | null
  /** Only ACTIVE <-> DISABLED. INVITED can't be set. */
  status?: 'ACTIVE' | 'DISABLED'
}

export interface ListUsersQuery {
  /** Default 1. */
  page?: number
  /** Default 20, max 100. */
  limit?: number
  /** Case-insensitive match on name or email. */
  q?: string
  role?: Role
  status?: UserStatus
  clientId?: string
}

// ---------------------------------------------------------------------------
// Response `data` payloads
// ---------------------------------------------------------------------------

/** POST /v1/auth/login and POST /v1/auth/accept-invite */
export interface LoginData {
  user: User
  session: IssuedSession
}

/** GET /v1/auth/me */
export interface MeData {
  user: User
  session: SessionInfo
}

/** PATCH /v1/auth/me */
export interface UserData {
  user: User
}

export interface MessageData {
  message: string
}

/** POST /v1/auth/verify-token */
export interface VerifyTokenData {
  purpose: 'INVITE' | 'PASSWORD_RESET'
  email: string
  name: string
  expiresAt: string
}

/** POST /v1/auth/logout-all and POST /v1/admin/users/:id/revoke-sessions */
export interface RevokedData {
  revoked: number
}

/** POST /v1/auth/change-password */
export interface ChangePasswordData extends MessageData {
  otherSessionsRevoked: number
}

/** GET /v1/auth/sessions */
export interface SessionsData {
  sessions: SessionInfo[]
}

/** DELETE /v1/auth/sessions/:id */
export interface RevokeSessionData extends MessageData {
  /** True if the revoked session was the caller's own (so they are now signed out). */
  wasCurrent: boolean
}

/** POST /v1/admin/users/invite */
export interface InviteData {
  user: User
  /** false = user was created but the mail server failed. Ask the admin to try again. */
  emailSent: boolean
}

/** GET /v1/admin/users  (ApiSuccess also carries `meta: PageMeta`) */
export interface UsersData {
  users: User[]
}
```
