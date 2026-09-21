# FilterGO Field Service Platform: Backend Architecture

Source of truth for how the backend is built. It turns `Field Service Platform System Design.docx` into
concrete rules. Where this file and the design doc differ, this file wins (deviations are listed in section 10
with the reason). Read sections 1-3 before touching any module.

```
Lead -> Contract -> Schedule -> Shift -> Timesheet -> Invoice
(commercial)        (operations)                     (commercial)
```

Stack: Node 22+, TypeScript (strict), Fastify 5, PostgreSQL, Prisma 7, Zod, argon2id, Luxon.
Auth (login, sessions, invites, password reset) is documented in `FRONTEND_HANDOVER.md` and is already built.

---

## 1. The one design rule: schedule is an image of contract

When a schedule is generated, the contract's terms for that site are copied into `schedule.termsSnapshot`
(shape and helpers: `src/lib/terms-snapshot.ts`). Shifts, timesheets and invoice lines price **only** from the
snapshot, never from the live contract. A renegotiated rate creates contract version N+1 and affects only
schedules generated after it is active. This prevents retroactive money changes.

Consequences that must hold in code:

- Nothing below the schedule ever joins to `contract_lines` to find a rate. It reads `parseTermsSnapshot(schedule.termsSnapshot)`.
- Approving a timesheet stamps `payRateSnapshot` / `billRateSnapshot` onto the entry. Invoices use those stamps.
- Invoice lines keep `sourceType` + `sourceId` so every line traces back: line -> timesheet -> shift -> schedule -> contract (version) -> lead.

---

## 2. Conventions (all modules)

### 2.1 Tenancy: every row belongs to an organization
- Every table that can be reached from the API has `orgId` (or is reached through a parent that does).
- Every query includes `orgId: actor.orgId`. No exceptions. A resource of another organization is **indistinguishable from a missing one**: respond `404 NOT_FOUND` via `Errors.notFound('<entity>')`, never 403.
- Each module's tests must include a **cross-organization isolation test** for every endpoint that takes an id: create the resource in org A, call as an admin of org B, expect 404.

### 2.2 Roles and scope
Roles: `ADMIN`, `SUPERVISOR`, `FIELD_USER`, `CLIENT_USER` (enum `Role`).

| Role | Scope | Site scope (`accessibleSiteIds`) |
|---|---|---|
| ADMIN | Everything in their organization, including contracts, rates, invoices | all sites |
| SUPERVISOR | Schedules, assignment, timesheet approval for the sites they manage. Read-only on contracts. No invoices. | rows in `user_site_access` for them |
| FIELD_USER | Own shifts, clock in/out, work logs, own timesheets, extra shifts | rows in `user_site_access` (where they may be scheduled) |
| CLIENT_USER | Read-only portal: schedules and completed work at their client's sites, their invoices | every site of `user.clientId` |

Use `src/lib/access.ts`: `actorOf`, `accessibleSiteIds`, `siteScope`, `siteIdFilter`, `assertSiteAccess`. Route guards: `requireAuth`, `requireAdmin`, `requireRoles(...)`, and `actorFromReq(req)` in `src/plugins/auth.ts`.
Guard order: unauthenticated => 401, wrong role => 403, out-of-scope resource => 404.

### 2.3 Rate visibility (a real permission boundary)
- `bill_rate` (client price): **ADMIN only** (`canSeeBillRate`).
- `pay_rate` (worker pay): **ADMIN and SUPERVISOR** (`canSeePayRate`).
- FIELD_USER and CLIENT_USER never see either. Money on invoices (subtotal/tax/total/line amounts) is visible to ADMIN and to the CLIENT_USER of that client.
- Enforce in **serializers** (omit the key, do not send null). The terms snapshot is serialised only via `redactSnapshot`. Each module tests the redaction for all four roles.

### 2.4 Request / response
- Envelope, error codes, strict bodies: unchanged from the auth API (`FRONTEND_HANDOVER.md` sections 4 and 6). Every request body/query/params is a `z.strictObject` parsed with `parse()` from `src/lib/validation.ts`. Unknown fields are a 400.
- Lists: query `page` (default 1), `limit` (default 20, max 100), spread `pageQueryShape` from `src/lib/pagination.ts`; respond `ok({ items }, pageMeta(...))` with a plural key (`{ contracts: [...] }`, `meta`).
- **Money** on the wire is a string with two decimals (`"145.00"`). Quantities may have four (`"7.6667"`). In code use `Decimal` (`src/lib/money.ts`: `D`, `round2`, `money`, `moneyField`). Never do arithmetic on JS numbers for money. Round half up to cents; round each invoice line, then sum the rounded lines.
- **Dates**: instants are ISO-8601 UTC strings; calendar dates are `"YYYY-MM-DD"` strings (`dateOnlyField`, `toDateOnly`, `fromDateOnly`); recurring times are `"HH:mm"` strings in the **site's** timezone. All conversions go through `src/lib/time.ts` (Luxon, DST-safe). Site timezone = `site.timezone ?? organization.timezone`.
- Ids are UUID strings. Enums are the UPPER_CASE Prisma enum values.
- Serializers are explicit whitelists (one `serializeX` per entity, next to the service). Never return a Prisma row directly.
- Files >800 lines or functions >50 lines: split. No `any`. No `console.log` (use `ctx.log`).

### 2.5 Errors
Use `Errors.*` and the closed `ErrorCode` list in `src/lib/errors.ts`:
`NOT_FOUND` (with `details.entity`), `INVALID_STATE` (state machine: `details.from/to/allowed`), `CONFLICT`, `DUPLICATE`, `UNPROCESSABLE`, `VALIDATION_ERROR` (`Errors.invalidField`), plus domain codes `CONTRACT_NOT_EDITABLE`, `CONTRACT_NOT_ACTIVE`, `SCHEDULE_LOCKED`, `SCHEDULE_OVERLAP`, `SHIFT_OVERLAP`, `ASSIGNMENT_WARNINGS`, `CLOCK_STATE`, `CLOCK_WINDOW`, `INVOICE_NOT_EDITABLE`, `NOTHING_TO_INVOICE`, `WEBHOOK_SIGNATURE_INVALID`, `INTEGRATION_ERROR`, `LEAD_ALREADY_CONVERTED`, `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`. Construct domain errors as `new AppError(status, code, message, { details })`.
Need a new code? Do not edit `errors.ts`; report it and use `CONFLICT`/`UNPROCESSABLE` meanwhile.

### 2.6 State machines
Every status field has an explicit transition table in code (a `const TRANSITIONS: Record<Status, Status[]>`) and a single `assertTransition(entity, from, to)` that throws `Errors.invalidState`. Tests cover every valid edge and at least one invalid edge per state. A transition and its side effects (snapshots, notifications enqueued, audit) happen in **one transaction**.

### 2.7 Audit
Every state change and every override writes an audit row via `recordAudit(tx, actor, { entity, entityId, action, diff, meta })` (`src/modules/audit/record.ts`) **using the same transaction client** as the change. Overriding a validation warning (section 5) is always audited with the warnings and the caller's reason. Never put secrets or bank data in `diff`.

### 2.8 Background work
- Scheduled jobs: export `jobs: JobDefinition[]` from `src/modules/<m>/<m>.jobs.ts` (`name`, `everySeconds`, `run(ctx)`). A lease in the database guarantees one runner per interval across instances. Jobs must be idempotent (safe to run twice) and must not throw for one bad row (log and continue).
- External calls (accounting, payments) and anything that must survive a crash go through the **outbox**: `enqueue(tx, { type, payload, dedupeKey })` inside the business transaction, handler exported as `outboxHandlers[type]`. Handlers throw to retry (exponential backoff, max 8 attempts, then DEAD).
- Tests call `runJobNow(ctx, job)` and `processOutbox(ctx, handlers)` directly. `JOBS_ENABLED=false` in tests.

### 2.9 Notifications
`notify(ctx, { orgId, userIds, type, title, body, data, email? }, tx?)` (`src/modules/notifications/notify.ts`) writes in-app notifications and optionally emails. Only active users of the organization are notified. Event types are listed per module. `email: true` only for things that cannot wait (new lead, shift assigned after publish, no-show).

### 2.10 Files
File bytes are handled by the Files module (`POST /v1/files` -> `FileObject`). Other modules store only file **ids** and must call `assertFilesInOrg(tx, orgId, ids, field)` before saving one.

### 2.11 Concurrency
Anything that can be double-submitted (approve, publish, assign, clock-in, invoice run, convert lead) must be safe: use conditional updates (`updateMany({ where: { id, status: <expected> } })` and check `count`), unique constraints, or `SELECT ... FOR UPDATE`. Each module tests its two most dangerous races with `Promise.all`.

---

## 3. Users, organization, files, notifications (module: users)

Already built: login/session/invite/reset, `/v1/admin/users/*` (admin invite/list/edit/disable/revoke), roles, `orgId`, phone, employment type, `defaultPayRate` (ADMIN+SUPERVISOR visible), `hiredAt`, `clientId` (CLIENT_USER only).

To build (paths under `/v1`):

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/users` | ADMIN, SUPERVISOR | Directory. Supervisor sees only users who share at least one site with them (and themselves). Filters: `q`, `role`, `status`, `siteId`, paging. |
| GET | `/users/:id` | ADMIN; SUPERVISOR (shared site); self | |
| GET, PUT | `/users/:id/availability` | read: ADMIN, SUPERVISOR (shared site), self; write: same | PUT replaces all windows: `{ windows: [{ weekday 1-7, startTime, endTime }] }`; start < end; no overlap per weekday. Times are org-timezone wall clock. |
| GET, PUT | `/users/:id/sites` | read: as above; write: ADMIN only | PUT replaces `{ siteIds }`; sites must be in the org. Not allowed for CLIENT_USER (422). Changing a supervisor's sites changes their scope immediately. |
| GET, POST | `/users/:id/documents` | read: ADMIN, SUPERVISOR (shared site), self; create: ADMIN, SUPERVISOR (shared site), self | `{ type, fileId?, expiresAt?, notes? }`, `type` free text, lower-cased/trimmed. |
| PATCH, DELETE | `/users/:id/documents/:documentId` | ADMIN, SUPERVISOR (shared site) | |
| GET | `/users/:id/compliance` | as documents read | Each document with `status`: `EXPIRED` (expiresAt < today), `EXPIRING` (within 30 days), `VALID` (later or no expiry); plus `overall` = worst status. |
| GET | `/compliance/expiring?days=30` | ADMIN, SUPERVISOR (scoped) | Documents expiring within `days` or already expired, oldest first. |
| POST | `/files` | any signed-in user | `multipart/form-data`, field `file` (+ optional text field `purpose`). Allowed: jpeg, png, webp, heic, pdf, **verified by magic bytes, not the client's content-type**. Max `MAX_UPLOAD_BYTES`. Stored via a `StorageDriver` (local disk driver now; interface ready for S3). Returns `{ file: { id, originalName, contentType, size, createdAt } }`. |
| GET | `/files/:id` | see rule | Streams bytes. `Content-Disposition: attachment` for non-images, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`. Rule: same org AND (ADMIN, SUPERVISOR, uploader; CLIENT_USER only for photos of work logs at their client's sites). |
| GET | `/org` | any signed-in | `{ org: { id, name, timezone } }`; `leadIntakeKey`, `defaultLeadOwnerId` only for ADMIN. |
| PATCH | `/org` | ADMIN | `name`, `timezone` (valid IANA), `defaultLeadOwnerId` (active ADMIN/SUPERVISOR of the org, or null). |
| POST | `/org/rotate-lead-key` | ADMIN | New `leadIntakeKey`; old one stops working immediately. |
| GET | `/audit-events` | ADMIN | Filters `entity`, `entityId`, `actorId`, `action`, `from`, `to`; newest first; paged. Never returns `metadata` of auth events that could contain tokens (there are none, but whitelist fields). |
| GET | `/notifications` | own | `?unread=true`, paged; response also carries `unreadCount`. |
| POST | `/notifications/:id/read`, `/notifications/read-all` | own | |

---

## 4. Contracts module

Owns: `services`, `tax_rates`, `clients`, `sites`, `contracts`, `contract_lines`, `contract_coverage`.
Shared helper already written: `createContractDraftRecord` (`src/modules/contracts/draft-record.ts`), used by lead conversion. The module's own create endpoint must build on it.

### 4.1 Endpoints (under `/v1`)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET, POST | `/services` | read: ADMIN, SUPERVISOR; write: ADMIN | `{ name, description?, active? }`, `(org, name)` unique -> `DUPLICATE`. |
| PATCH | `/services/:id` | ADMIN | |
| GET | `/tax-rates` | ADMIN | |
| PUT, DELETE | `/tax-rates/:code` | ADMIN | Upsert `{ ratePercent }` ("8.250", 0-100, 3 decimals). Delete refused (409 `CONFLICT`) while a draft/active contract line uses the code. |
| GET | `/clients` | ADMIN all; SUPERVISOR: clients of their sites; CLIENT_USER: only their own | `q`, `active`, paging. |
| POST | `/clients` | ADMIN | `{ legalName, billingEmail, billingAddress?, paymentTerms? }`. |
| GET, PATCH | `/clients/:id` | read: as list; write: ADMIN | `accountingRef`, `stripeCustomerId` are integration-owned: shown to ADMIN only, never writable here. |
| GET | `/sites` | site scope (`siteScope`) | `clientId`, `q`, `active`. |
| POST | `/clients/:clientId/sites` | ADMIN | `{ name, address, lat?, lng?, timezone?, accessNotes?, contactName?, contactPhone? }`. `lat` and `lng` both or neither; `timezone` valid IANA. |
| GET, PATCH | `/sites/:id` | read: site scope; write: ADMIN | |
| GET | `/contracts` | ADMIN all; SUPERVISOR: contracts with a line or coverage at one of their sites; CLIENT_USER: 403 | `status`, `clientId`, `q` (number), `latestOnly=true` (highest version per number), paging. |
| POST | `/contracts` | ADMIN | Creates a DRAFT v1 with lines and coverage. |
| GET | `/contracts/:id` | as list | Detail + `lines`, `coverage`, and `versions: [{ id, version, status }]` (whole chain). Rates redacted per 2.3. |
| PATCH | `/contracts/:id` | ADMIN | Header fields (`startDate`, `endDate`, `autoRenew`, `billingType`, `billingCycle`). **DRAFT only**, else `409 CONTRACT_NOT_EDITABLE`. |
| PUT | `/contracts/:id/lines`, `/contracts/:id/coverage` | ADMIN | Replace-all, DRAFT only. |
| POST | `/contracts/:id/submit` | ADMIN | DRAFT -> PENDING_SIGNATURE after completeness validation (4.3). |
| POST | `/contracts/:id/sign` | ADMIN | `{ signedBy, signedAt?, documentFileId? }`. PENDING_SIGNATURE -> ACTIVE. If it supersedes a version, that predecessor becomes EXPIRED **in the same transaction**. |
| POST | `/contracts/:id/suspend`, `/resume` | ADMIN | ACTIVE <-> SUSPENDED. |
| POST | `/contracts/:id/cancel` | ADMIN | `{ reason }`. From DRAFT, PENDING_SIGNATURE, ACTIVE, SUSPENDED. |
| POST | `/contracts/:id/new-version` | ADMIN | Source must be the latest version and ACTIVE or SUSPENDED. Creates DRAFT version N+1 copying header, lines, coverage; `supersedesContractId` = source. Only one open (DRAFT/PENDING_SIGNATURE) successor at a time -> `409 CONFLICT`. |

### 4.2 Lifecycle
`DRAFT -> PENDING_SIGNATURE -> ACTIVE -> SUSPENDED | EXPIRED | CANCELLED` (SUSPENDED -> ACTIVE; PENDING_SIGNATURE -> DRAFT is **not** allowed, cancel and copy instead). **Only ACTIVE contracts can generate schedules** (enforced in Scheduling, but the status semantics are defined here). An active contract is never edited in place: any change to rates, coverage or lines is a new version. Editing endpoints on non-DRAFT return `CONTRACT_NOT_EDITABLE`.

### 4.3 Completeness validation (on submit; `VALIDATION_ERROR` with one issue per problem)
- at least one line; every line's `siteId` belongs to the contract's client; `billRate > 0`; `qty > 0`
- `HOURLY`: exactly **one** line per site (a shift needs one unambiguous rate)
- `MONTHLY_FIXED`: `billingCycle` must not be `PER_VISIT`; `PER_VISIT` billing type may use any cycle
- every site that has lines has coverage, unless the site's coverage is `AD_HOC`
- `WEEKLY` coverage: `weekdays` unique, each 1-7, non-empty; `timeStart` and `timeEnd` set and different (`timeEnd <= timeStart` means the shift ends the next day)
- `INTERVAL`: `intervalDays >= 1`; `AD_HOC`: `visitsPerPeriod >= 1`
- `endDate` (if any) is on or after `startDate`
- `taxCode` on a line, if set, exists in `tax_rates`

### 4.4 Jobs
`contracts.expire` (hourly): ACTIVE contracts whose `endDate` is before today: if `autoRenew`, extend `endDate` by one year (audit `auto_renewed`), else set EXPIRED (audit `expired`). Idempotent.

### 4.5 Audit actions
`contract.created|updated|lines_replaced|coverage_replaced|submitted|signed|suspended|resumed|cancelled|expired|auto_renewed|version_created`, `client.created|updated`, `site.created|updated`.

---

## 5. Scheduling module

Owns `schedules`, `shifts`, `shift_offers`. Reads (never writes) contracts, users, availability, site access, documents.

### 5.1 Supervisor flow
1. **Generate**: pick contract + site + period -> DRAFT schedule with a frozen snapshot and OPEN shifts.
2. **Assign** (drag users onto open shifts) with validation.
3. **Publish**: status PUBLISHED; assigned users are notified; shifts become visible to field users and clients. Before publish **nothing is visible to field users or clients**.
4. **Lock** after the period ends: no further edits, so timesheets are approved against a stable plan.
5. **Close** when every shift is terminal (COMPLETED, NO_SHOW, CANCELLED).

`ScheduleStatus`: `DRAFT -> PUBLISHED -> LOCKED -> CLOSED`, plus `PUBLISHED -> DRAFT` (unpublish) allowed only while no shift has a timesheet entry.

### 5.2 Endpoints (under `/v1`; ADMIN, or SUPERVISOR with access to the schedule's site, unless stated)

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/schedules/generate` | ADMIN, SUPERVISOR | `{ contractId, siteId, periodStart, periodEnd, supervisorId? }` -> 201 `{ schedule, shiftCount }`. |
| GET | `/schedules` | ADMIN, SUPERVISOR (scope), CLIENT_USER (their sites, PUBLISHED+ only) | `status`, `contractId`, `siteId`, `from`/`to` (period overlap), paging. |
| GET | `/schedules/:id` | as list | Detail: `coverage` summary `{ total, open, assigned, confirmed, inProgress, completed, noShow, cancelled }` and the snapshot **redacted** per 2.3. |
| POST | `/schedules/:id/publish`, `/unpublish`, `/lock`, `/close`, `/regenerate` | ADMIN, SUPERVISOR | `regenerate`: DRAFT only; re-snapshots from the **latest ACTIVE version of that contract number** and rebuilds all shifts. |
| DELETE | `/schedules/:id` | ADMIN, SUPERVISOR | DRAFT only. |
| POST | `/schedules/:id/shifts` | ADMIN, SUPERVISOR | Add a shift `{ start, end, notes?, assignedUserId?, isExtra?, billableQty? }`. Not on LOCKED/CLOSED (`SCHEDULE_LOCKED`). |
| POST | `/shifts/extra` | FIELD_USER | `{ scheduleId, start, end, notes? }`: unplanned work. Schedule must be PUBLISHED and at a site the user has access to; creates an `isExtra` shift assigned to the caller (status ASSIGNED); notifies the schedule's supervisor / site supervisors. Flagged for review. |
| GET | `/shifts` | ADMIN, SUPERVISOR (scope), FIELD_USER (own, schedule PUBLISHED+), CLIENT_USER (their sites, PUBLISHED+) | `scheduleId`, `siteId`, `userId`, `status`, `from`, `to`, `isExtra`, `unassigned=true`, paging. |
| GET | `/shifts/:id` | as list | |
| PATCH | `/shifts/:id` | ADMIN, SUPERVISOR | `start`, `end`, `notes`, `billableQty`. Not once IN_PROGRESS or later; not on LOCKED/CLOSED. |
| POST | `/shifts/:id/validate-assignment` | ADMIN, SUPERVISOR | `{ userId }` -> `{ blocking: [...], warnings: [...] }` dry run (nothing saved). |
| POST | `/shifts/:id/assign` | ADMIN, SUPERVISOR | `{ userId, overrideWarnings?: boolean, reason?: string }`. See 5.4. |
| POST | `/shifts/:id/unassign`, `/cancel` | ADMIN, SUPERVISOR | `cancel` takes `{ reason }`. |
| POST | `/shifts/:id/confirm` | the assigned FIELD_USER | ASSIGNED -> CONFIRMED. |
| POST | `/shifts/:id/offers` | ADMIN, SUPERVISOR | `{ userIds }`: offer an OPEN shift to several people. |
| GET | `/me/shifts` | FIELD_USER | Own shifts (PUBLISHED+ schedules), `from`, `to`, `status`. |
| GET | `/me/offers` | FIELD_USER | Own OFFERED offers with their shift. |
| POST | `/shift-offers/:id/accept`, `/decline` | the offered FIELD_USER | Accept runs the same assignment validation (blocking rules apply; warnings are recorded but do not block a self-accept). First accept wins; other offers become WITHDRAWN. |
| GET | `/coverage` | ADMIN, SUPERVISOR (scope) | `?from&to&siteId`: the morning check: per site and day, `{ total, filled, open }` for shifts in PUBLISHED schedules; `unfilled` list of OPEN shifts starting soonest. |

### 5.3 Generation (deterministic, DST-safe)
- Contract must be ACTIVE (`CONTRACT_NOT_ACTIVE`), the site must have lines/coverage on it, the period must intersect `[startDate, endDate]` and is clamped to it. Period length <= 93 days. `siteId` must be in the actor's scope.
- Refuse if a non-CLOSED schedule already covers any day of the period for the same **contract number + site** (`SCHEDULE_OVERLAP`, `details.context.scheduleId`).
- Snapshot = `buildTermsSnapshot(contract, lines, coverage, siteId, siteTimezone)`.
- **WEEKLY**: for each calendar day in the period whose ISO weekday is in `weekdays`, one shift from `zonedInstant(day, timeStart, tz)` to `zonedInstant(day (+1 if timeEnd <= timeStart), timeEnd, tz)`.
- **INTERVAL**: visits every `intervalDays` days. Anchor = the local date of the latest non-cancelled shift for this contract number + site before the period, else `contract.startDate`. Emit occurrences that fall inside the period. The visit time is `timeStart`..`timeEnd` if set, else 09:00-17:00 local.
- **AD_HOC**: generates **no** shifts (the supervisor adds them with `POST /schedules/:id/shifts`). `visitsPerPeriod` is shown on the schedule as the expected count.
- Each shift: status OPEN, `siteId`, `serviceRef` = the snapshot item's `lineId` when the site has exactly one line (else null), `billableQty` = that item's `qty` for PER_VISIT contracts (else null), `orgId`.
- All-or-nothing in one transaction; `audit schedule.generated` with counts.

### 5.4 Assignment validation: warnings, not walls
`validate-assignment` and `assign` evaluate, in this order:

**Blocking (always refused, `409 SHIFT_OVERLAP`)**: the user already has a non-cancelled shift that overlaps `[start, end)` (any schedule). `details.context.shiftId` names it. Also always refused: user not ACTIVE / not FIELD_USER or SUPERVISOR in the org (`422 UNPROCESSABLE`), schedule LOCKED/CLOSED (`SCHEDULE_LOCKED`), shift not OPEN/ASSIGNED/CONFIRMED-editable.

**Warnings (overridable)**, each `{ code, message, data }`:
- `NO_SITE_ACCESS`: no `user_site_access` row for the shift's site
- `OUTSIDE_AVAILABILITY`: the shift is not fully inside one of the user's availability windows for that weekday (in the org timezone). A user with **no** windows recorded gets no warning (unknown is not unavailable)
- `DOCUMENT_EXPIRED` (a document with `expiresAt` before the shift's local date) and `DOCUMENT_EXPIRING` (valid on the day, expires within 14 days after it); `data` has `type`, `expiresAt`
- `OVERTIME`: the user's total scheduled minutes in the Monday-start week (site timezone) including this shift would exceed `WEEKLY_OVERTIME_MINUTES` (default 2400)
- `SUPERVISOR_SELF_ASSIGN` is **not** a thing: supervisors may be assigned like anyone else

`assign` with warnings present and `overrideWarnings !== true` -> **`422 ASSIGNMENT_WARNINGS`** with `details.warnings`, nothing saved. With `overrideWarnings: true` it saves and writes `recordAudit(shift, action: 'assign_override', diff: { warnings, reason, userId })` in the same transaction. No warnings -> saves with a normal `assigned` audit. The UI flow is therefore: try, show the warnings, confirm, retry with the override.
Assignment sets `assignedUserId`, status ASSIGNED (OPEN -> ASSIGNED). If the schedule is already PUBLISHED the assignee gets a notification `shift.assigned` (`email: true`). Unassign returns to OPEN and notifies the previous assignee `shift.unassigned` (PUBLISHED only).

### 5.5 Notifications (event types)
`schedule.published` (each assignee, one per schedule), `shift.assigned`, `shift.unassigned`, `shift.cancelled`, `shift.offered`, `shift.extra_added` (to the supervisors of the site).

### 5.6 Shift status ownership
Scheduling owns OPEN, ASSIGNED, CONFIRMED and CANCELLED. **Timesheets owns** IN_PROGRESS, COMPLETED and NO_SHOW (it updates `shifts.status` inside its own transactions). Scheduling must refuse to edit/cancel/unassign a shift that has left ASSIGNED/CONFIRMED (`INVALID_STATE`).

### 5.7 Audit actions
`schedule.generated|published|unpublished|locked|closed|regenerated|deleted`, `shift.created|updated|assigned|assign_override|unassigned|cancelled|confirmed|offered|extra_added`.

---

## 6. Timesheets module

Owns `timesheet_entries`, `timesheet_exceptions`, `work_logs`. This is where money is determined.

### 6.1 State machine
```
open -> submitted -> approved -> invoiced      (invoiced is set by the Invoices module)
            |-> rejected -> corrected -> submitted
            |-> adjusted -> approved
```
Enum `TimesheetStatus`: OPEN, SUBMITTED, APPROVED, REJECTED, ADJUSTED, CORRECTED, INVOICED. APPROVED/INVOICED entries are immutable.
- **open**: clocked in, not out.
- Clock-out **submits** the entry automatically (`OPEN -> SUBMITTED`).
- **adjusted**: a supervisor edited times/flags (reason required); still needs approval.
- **rejected** (reason required) -> the field user fixes it (**corrected**) and **resubmits**.

### 6.2 Endpoints (under `/v1`)

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/shifts/:shiftId/clock-in` | the assigned FIELD_USER | `{ lat, lng }`. Creates the entry with the server time, shift -> IN_PROGRESS. |
| POST | `/timesheets/:id/clock-out` | the entry's FIELD_USER | `{ lat, lng, breakMinutes? }`. Computes minutes, raises exceptions, entry -> SUBMITTED, shift -> COMPLETED. |
| GET | `/me/timesheets` | FIELD_USER | Own entries, `status`, `from`, `to`, paging. No rate fields. |
| GET | `/timesheets` | ADMIN, SUPERVISOR (scope), CLIENT_USER (their sites; only APPROVED/INVOICED; no GPS, no exceptions, no rates) | `status`, `siteId`, `userId`, `hasOpenExceptions`, `from`, `to`, paging. |
| GET | `/timesheets/exceptions` | ADMIN, SUPERVISOR (scope) | **The queue**: unresolved exceptions with their entry summary, oldest first; filters `type`, `siteId`, `userId`. |
| GET | `/timesheets/:id` | as list + the entry's own FIELD_USER | Detail: entry, shift + site summary, exceptions, work logs, clock GPS points and distance from the site. Pay rate to ADMIN/SUPERVISOR, bill rate to ADMIN. |
| POST | `/timesheets/:id/approve` | ADMIN, SUPERVISOR | SUBMITTED or ADJUSTED -> APPROVED. Stamps `payRateSnapshot` and `billRateSnapshot`, sets `approvedById/At`, resolves all exceptions. |
| POST | `/timesheets/approve-batch` | ADMIN, SUPERVISOR | `{ ids }` (max 100): approves each entry that is SUBMITTED with **no unresolved exceptions**; returns `{ approved: [...], skipped: [{ id, reason }] }`. |
| POST | `/timesheets/:id/reject` | ADMIN, SUPERVISOR | `{ reason }`. SUBMITTED or ADJUSTED -> REJECTED; notifies the worker `timesheet.rejected`. |
| POST | `/timesheets/:id/adjust` | ADMIN, SUPERVISOR | `{ clockInAt?, clockOutAt?, breakMinutes?, billable?, payable?, reason }` (reason required, at least one change). SUBMITTED or ADJUSTED -> ADJUSTED; minutes and exceptions are recomputed; audit stores before/after. |
| PATCH | `/timesheets/:id/correct` | the entry's FIELD_USER | Only REJECTED: `{ clockInAt?, clockOutAt?, breakMinutes?, note? }` -> CORRECTED. Times must stay within `[scheduledStart - 12h, scheduledEnd + 12h]`. |
| POST | `/timesheets/:id/resubmit` | the entry's FIELD_USER | CORRECTED -> SUBMITTED (exceptions recomputed). |
| POST | `/timesheet-exceptions/:id/resolve` | ADMIN, SUPERVISOR | `{ note? }` marks one exception resolved without approving. |
| POST, GET | `/shifts/:shiftId/work-logs` | create: the assigned FIELD_USER (shift IN_PROGRESS, or COMPLETED within 24h), ADMIN, SUPERVISOR; read: ADMIN, SUPERVISOR (scope), the FIELD_USER, CLIENT_USER (their sites; PHOTO and NOTE only) | `{ kind: PHOTO\|NOTE\|ISSUE\|CHECKLIST, fileId?, body?, data? }`. PHOTO requires `fileId`; NOTE/ISSUE require `body`; CHECKLIST requires `data.items: [{ label, done }]`. An ISSUE notifies the site's supervisors (`work_log.issue`). |

### 6.3 Clocking rules
- Only the assigned user may clock in, and only on a shift whose schedule is PUBLISHED and whose status is ASSIGNED or CONFIRMED. One entry per shift (`CLOCK_STATE` if already clocked in).
- Clock-in window: from `scheduledStart - CLOCK_IN_EARLY_MINUTES` until `scheduledEnd` (`CLOCK_WINDOW` outside it).
- Clock-out requires an open entry (`CLOCK_STATE` otherwise) and `clockOut > clockIn`.
- `actualMinutes = max(0, minutes(clockOut - clockIn) - breakMinutes)`; `scheduledMinutes` from the shift.
- Clock timestamps always come from the server clock. Corrections to times only happen through the supervisor `adjust` or the worker's `correct` (rejected entries), never through the clock endpoints, so the clock-in body has no `at` field.

### 6.4 Exceptions (computed on clock-in, clock-out, adjust, correct; one row per type per entry, idempotent upsert)
| Type | Rule (configurable via env in `config.work`) |
|---|---|
| LATE_IN | `clockIn > scheduledStart + LATE_IN_MINUTES` |
| EARLY_OUT | `clockOut < scheduledEnd - EARLY_OUT_MINUTES` |
| OVERTIME | `actualMinutes > scheduledMinutes + OVERTIME_THRESHOLD_MINUTES`, or the worker's Monday-start-week total of `actualMinutes` (all their non-rejected entries incl. this) `> WEEKLY_OVERTIME_MINUTES` |
| GEOFENCE_MISS | a clock point is more than `GEOFENCE_METERS` (haversine) from the site's `lat/lng`; skipped if the site has no coordinates; a missing GPS point on a site with coordinates also raises it |
| MISSING_CLOCK_OUT | see job below |
| NO_SHOW | see job below |
`detail` holds the numbers (`{ minutesLate }`, `{ distanceMeters }`, ...). When an adjust/correct removes the cause, the exception is deleted (unresolved) — resolved ones stay as history.

### 6.5 Jobs
- `timesheets.sweep` (every 60 s), idempotent:
  - **missing_clock_out**: OPEN entries whose shift ended more than `MISSING_CLOCK_OUT_HOURS` ago: set `clockOutAt = scheduledEnd`, `autoClosed = true`, compute minutes, status SUBMITTED, shift COMPLETED, exception MISSING_CLOCK_OUT, notify site supervisors `timesheet.auto_closed`.
  - **no_show**: shifts that are ASSIGNED or CONFIRMED (extra shifts included), whose schedule is PUBLISHED, that have **no entry**, once `now > scheduledStart + NO_SHOW_MINUTES`: shift -> NO_SHOW; create an entry (`clockInAt` null, `actualMinutes` 0, `billable=false`, `payable=false`, status SUBMITTED) with exception NO_SHOW; notify site supervisors `timesheet.no_show` (`email: true`).
- Both write audit rows with `actor` null (system).

### 6.6 Approval stamps (the money)
On approve: `billRateSnapshot` and `payRateSnapshot` come from the **schedule snapshot's** item for the shift's site (`serviceRef` line if set, else the site's first item): `billRate`; `payRate ?? user.defaultPayRate ?? 0`. `billable`/`payable` are independent flags (a redo is `billable=false, payable=true`). Later contract or user rate changes never touch an approved entry.

### 6.7 Audit actions
`timesheet.clocked_in|clocked_out|approved|rejected|adjusted|corrected|resubmitted|auto_closed|no_show|exception_resolved`, `work_log.created`.

---

## 7. Invoices module

Owns `invoices`, `invoice_lines`, `payments`, the accounting/payment integrations, the Stripe webhook.

### 7.1 Invoice run (a job you trigger, not a manual process)
`POST /v1/invoices/runs { contractId, periodStart, periodEnd }` (ADMIN). One transaction:
1. Contract exists in the org (any status except DRAFT/PENDING_SIGNATURE). Refuse if a non-VOID invoice for the same contract overlaps the period (`409 DUPLICATE`; prevents double-billing monthly-fixed).
2. Gather timesheet entries for shifts of that contract's schedules with `scheduledStart` (site-local date) in `[periodStart, periodEnd]` and status **APPROVED**, `billable = true`, not already on a non-void invoice.
3. Build lines **from each shift's schedule snapshot**, by `billingType` of the snapshot:
   - `PER_VISIT`: per completed billable entry, one line **per snapshot service item of that site**: `qty = item.qty`, `unitRate = entry.billRateSnapshot` for the primary item / `item.billRate` for additional items, `amount = round2(qty * unitRate)`. `sourceType = TIMESHEET`, `sourceId = entry.id`.
   - `HOURLY`: per entry one line: `qty = actualMinutes / 60` (4 decimals), `unitRate = entry.billRateSnapshot`, `amount = round2(qty * unitRate)`.
   - `MONTHLY_FIXED`: one line per contract line (from the **latest snapshot of a schedule in the period**, else the live ACTIVE contract lines) per run: `qty * billRate` once, `sourceType = CONTRACT_LINE`, `sourceId = line id`, regardless of visits. Timesheets still get marked invoiced (for traceability) but produce no lines.
4. Group lines by site (order by site name, then shift start). Line `description`: `"<service description> - <site name> - <local date>"`.
5. Tax per line: `taxCode` from the snapshot item -> `tax_rates.ratePercent`; `taxAmount = round2(amount * rate / 100)`; `tax = sum(taxAmount)`; `subtotal = sum(amount)`; `total = subtotal + tax`.
6. `invoiceNumber = "INV-<year>-<6 digit sequence>"` per org per year (`nextSequence`). `issueDate` today, `dueDate` from `client.paymentTerms` (NET15/NET30/DUE_ON_RECEIPT).
7. Status DRAFT. **Flags**: `{ unapprovedTimesheets: n }` for entries in the window that are OPEN/SUBMITTED/ADJUSTED/REJECTED/CORRECTED; also `{ noShows: n }`. Included entries move to `TimesheetStatus.INVOICED` in the same transaction (this is the lock that prevents double invoicing).
8. Nothing billable and no fixed lines -> `422 NOTHING_TO_INVOICE`.

### 7.2 Endpoints (under `/v1`)

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/invoices/runs` | ADMIN | 201 `{ invoice }` (see 7.1). |
| GET | `/invoices` | ADMIN all; CLIENT_USER: their client's invoices in status APPROVED..PAID (never DRAFT/VOID) | `status`, `clientId`, `contractId`, `from`/`to` (issue date), `q` (number), paging. |
| GET | `/invoices/:id` | as list | Detail: header, `lines` grouped by site (`sites: [{ siteId, siteName, subtotal, lines }]`), `payments`, `flags`, `sync: { accounting: state, payment: state }`. |
| PATCH | `/invoices/:id` | ADMIN | DRAFT only: `dueDate`, `notes`. |
| POST | `/invoices/:id/lines` | ADMIN | DRAFT only: manual line `{ description, qty, unitRate, siteId?, taxCode? }` (`sourceType MANUAL`); totals recomputed. |
| DELETE | `/invoices/:id/lines/:lineId` | ADMIN | DRAFT only. Removing a timesheet-sourced line returns that entry to APPROVED. Totals recomputed. |
| DELETE | `/invoices/:id` | ADMIN | DRAFT only: deletes and returns all its timesheet entries to APPROVED. |
| POST | `/invoices/:id/approve` | ADMIN | DRAFT -> APPROVED; **enqueues** `accounting.sync_invoice` (dedupeKey `invoice:<id>:sync`). |
| POST | `/invoices/:id/void` | ADMIN | `{ reason }`. From DRAFT, APPROVED, SYNCED, SENT with no payments. Returns timesheet entries to APPROVED; if already synced enqueues `accounting.void_invoice`. |
| POST | `/invoices/:id/send` | ADMIN | Requires SYNCED (`INVALID_STATE` otherwise). Enqueues `payments.create_invoice`; the handler stores `stripeInvoiceId` + `paymentUrl`, emails the client's `billingEmail` the invoice with the pay link, sets `sentAt`, status SENT. |
| POST | `/invoices/:id/payments` | ADMIN | Manual payment `{ amount, method, receivedAt?, externalRef? }` for SENT/PARTIALLY_PAID (also SYNCED for offline payments). Overpayment refused (`422`). Updates `amountPaid` and status (PARTIALLY_PAID / PAID + `paidAt`); enqueues `accounting.post_payment`. |
| POST | `/invoices/:id/retry-sync` | ADMIN | Re-arms a DEAD outbox job for this invoice (attempts reset). |
| GET | `/invoices/:id/trace` | ADMIN | Every line's chain: `{ lineId, timesheet, shift, schedule, contract: { number, version }, lead }` with clock stamps, GPS points and work-log photos (file ids) so a disputed charge can be answered in one call. |
| POST | `/webhooks/stripe` | Stripe (signature) | See 7.4. |

### 7.3 Integrations behind ports (`src/modules/invoices/integrations/`)
```ts
interface AccountingProvider {
  upsertCustomer(client): Promise<{ accountingRef: string }>
  createInvoice(invoice, lines, client): Promise<{ accountingRef: string }>
  voidInvoice(accountingRef): Promise<void>
  recordPayment(accountingRef, payment): Promise<{ externalRef: string }>
}
interface PaymentProvider {
  upsertCustomer(client): Promise<{ stripeCustomerId: string }>
  createHostedInvoice(invoice, lines, client): Promise<{ stripeInvoiceId: string; paymentUrl: string }>
}
```
Direction of truth: **the platform creates the invoice** and pushes it to accounting; the payment provider collects payment; its webhook marks the invoice paid, and that payment is then posted to accounting. Only `fake` providers exist (deterministic, in-memory ids, optional injected failures for tests); real QuickBooks Online / Stripe adapters plug in behind the same interfaces once credentials exist. Selecting a provider is `ACCOUNTING_PROVIDER` / `PAYMENT_PROVIDER`.

Outbox jobs (all idempotent on their external ref, retried with backoff, DEAD after 8 attempts, visible on the invoice `sync` state):
- `accounting.sync_invoice`: upsert customer (store `client.accountingRef`), create invoice, store `accountingRef`, `accountingSyncedAt`, status APPROVED -> SYNCED. A failed sync **never loses the invoice** and never rolls back the approval.
- `accounting.void_invoice`, `accounting.post_payment`, `payments.create_invoice`.

### 7.4 Stripe webhook (`POST /webhooks/stripe`, public, no session, no service key)
- Verify the `Stripe-Signature` header: `t=<ts>,v1=<hmac_sha256(secret, ts + "." + rawBody)>`, constant-time compare, reject if `|now - ts| > 5 min`, over `req.rawBody`. Missing secret or bad signature -> `400 WEBHOOK_SIGNATURE_INVALID`. Never reveal which check failed.
- Idempotent: insert `webhook_events(provider='stripe', eventId)` first; a duplicate returns 200 immediately.
- Handles `invoice.paid` (and `invoice.payment_succeeded`): find the invoice by `stripeInvoiceId`, create a `Payment` (`externalRef` = event's payment id, `method = 'stripe'`), update `amountPaid`/status (PAID when fully paid), enqueue `accounting.post_payment`. Unknown invoice -> 200 (log). Other event types -> 200 ignored.

### 7.5 Status machine
`DRAFT -> APPROVED -> SYNCED -> SENT -> PARTIALLY_PAID -> PAID`; `VOID` from DRAFT/APPROVED/SYNCED/SENT (no payments). `SENT -> PAID` directly on full payment. Money fields are immutable after APPROVED.

### 7.6 Audit actions
`invoice.run_created|updated|line_added|line_removed|deleted|approved|synced|voided|sent|payment_recorded|paid|sync_failed`.

---

## 8. Leads module

### 8.1 Public intake: `POST /public/leads` (no session, no service key)
Body (camelCase like the rest of the API): `{ orgKey, companyName, contactName, email, phone?, address?, serviceInterest?, message?, sourceUrl?, utm?, website? }`. `orgKey` = `organization.leadIntakeKey` (identifies the org; not a secret). `website` is the **honeypot**: real forms leave it empty.
The endpoint needs, on day one:
- **Honeypot**: if `website` is non-empty, respond `202` with the normal success body and store nothing.
- **Rate limiting**: 5 requests per hour per IP on this route (on top of the global limit), plus per-`orgKey` 100/hour. Unknown `orgKey` -> the same generic success response (do not reveal valid keys) but nothing stored.
- **Dedupe**: normalise email (lower-case) and phone (`phoneNorm` = digits only). If an open lead (`status` not WON/LOST) in the org has the same email **or** the same phone, do not create a new lead: add a `NOTE` activity "Duplicate website submission" with the new message/utm to the existing lead, notify the owner, respond with the same success body.
- **Instant notification**: new lead -> owner gets `lead.new` with `email: true`. Owner = `organization.defaultLeadOwnerId` if active, else the first active ADMIN (oldest).
- Tag `source = WEBSITE`, `sourceUrl`, `utm` (object of string values, max 20 keys, value length <= 200) so campaigns can be told apart.
- Response (always the same shape): `202 { success: true, data: { received: true }, error: null }`.
- Browser CORS for this route: origins from `PUBLIC_LEAD_ORIGINS` only (a separate encapsulated CORS registration for `/public`). Validation errors are ordinary `400 VALIDATION_ERROR` (spam bots get feedback; the honeypot path does not).

### 8.2 Authenticated pipeline (under `/v1`)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/leads` | ADMIN all; SUPERVISOR: leads they own | `status`, `source`, `ownerId`, `q` (company/contact/email), `from`/`to` (created), paging. |
| POST | `/leads` | ADMIN, SUPERVISOR | Manual lead (`source` PHONE/REFERRAL/FIELD/MANUAL). Same dedupe rules but returns `409 DUPLICATE` with `details.context.leadId` instead of merging. |
| GET | `/leads/:id` | as list | Lead + latest activities + surveys + conversion links. |
| PATCH | `/leads/:id` | ADMIN, owner | `companyName`, `contactName`, `email`, `phone`, `address`, `serviceInterest`, `ownerId` (active ADMIN/SUPERVISOR; ADMIN only may reassign; new owner notified `lead.assigned`). |
| POST | `/leads/:id/status` | ADMIN, owner | `{ status, lostReason? }`. Transitions: NEW -> CONTACTED -> QUALIFIED -> PROPOSAL -> WON; any open state -> LOST (`lostReason` required); LOST -> NEW (reopen, clears reason). **WON only through convert** (manual WON refused: `INVALID_STATE`). Skipping forward is allowed (NEW -> QUALIFIED); moving backwards is not (except reopen). |
| GET, POST | `/leads/:id/activities` | ADMIN, owner | `{ type: CALL\|EMAIL\|SITE_VISIT\|NOTE, body }`; first CALL/EMAIL/SITE_VISIT on a NEW lead moves it to CONTACTED. |
| POST, PUT, DELETE | `/leads/:id/surveys`, `/leads/:id/surveys/:surveyId` | ADMIN, owner | `{ address, units: [{ name, serviceId?, qty, estMinutes?, notes? }], accessNotes?, photoFileIds? }` (files verified in org, max 20 photos, max 200 units). Many surveys per lead (one per site). |
| POST | `/leads/:id/convert` | ADMIN | See 8.3. |

### 8.3 Convert to contract
`POST /leads/:id/convert { clientLegalName?, billingEmail?, paymentTerms?, billingType, billingCycle, startDate, endDate? }` in **one transaction**, idempotent:
- Requires status QUALIFIED or PROPOSAL (`INVALID_STATE` otherwise). Already converted -> `409 LEAD_ALREADY_CONVERTED` with `details.context = { clientId, contractId }`.
- Creates the **client** (legal name defaults to the lead's company, billing email to the lead's email), one **site** per survey (name from the address, address from the survey, `accessNotes` copied), and a **draft contract** through `createContractDraftRecord` with one line per survey unit (`description = unit.name`, `qty`, `estMinutes`, `serviceId`, `billRate = 0`, `payRate = null`; admin fills rates before submit) and `leadId` set.
- With no surveys but an address: one site from the lead address and a single placeholder line from `serviceInterest`.
- Sets `lead.status = WON`, `convertedClientId`, `convertedContractId`; the lead stays linked to the contract forever (`contract.leadId`). Audit `lead.converted`. Returns `{ lead, clientId, siteIds, contractId }`.

### 8.4 Audit / notification events
Audit: `lead.created|updated|status_changed|activity_added|survey_saved|survey_deleted|converted|assigned|duplicate_merged`. Notifications: `lead.new`, `lead.assigned`, `lead.duplicate`.

---

## 9. Testing, docs and definition of done (every module)

**Tests** (vitest, real Postgres, use `test/helpers.ts` factories; do not edit that file; put module-local helpers in your own test file):
- Endpoint role matrix: 401 anonymous, 403 wrong role, happy path for each allowed role.
- Cross-organization isolation (2.1) and **site-scope isolation** (a supervisor without access to the site gets 404).
- Rate redaction for all four roles wherever rates appear (2.3).
- State machine: every valid edge, one invalid edge per state (`INVALID_STATE` with `allowed`).
- Business rules from your section, including boundary cases (exactly at a threshold, DST day, midnight-crossing shift, cent rounding).
- Concurrency: the two most dangerous double-submits (2.11).
- Audit rows exist for state changes and overrides; no secrets in responses.
- Validation: strict bodies (unknown field -> 400), bad ids, bad enums, oversized values.
Coverage target for your module: statements >= 90%.

**Docs**: `docs/modules/<module>.md` with, for **every endpoint**: purpose, who may call it, request table, real captured success response, error table (code + when + what the UI should do), curl example; plus the module's state machine(s) and business rules in plain language. Types in `docs/types/<module>.ts` (imports allowed only from `../api-types`), compile-checked by `tsc`.

**Definition of done**: `pnpm exec tsc --noEmit` clean for your files, your tests green, docs written, only files inside your module (and your tests/docs) changed.

---

## 10. Deviations from the design doc (and why)

| Design doc | Here | Reason |
|---|---|---|
| user.role `admin, supervisor, field_user, client_user`; status `active, inactive` | same roles; status `INVITED, ACTIVE, DISABLED` | invite-only accounts need INVITED; inactive = DISABLED |
| no `service`, `tax_rate`, `organization` tables | added | `service_id` and `tax_code` and `org_id` need something to point at |
| `site` without timezone | `site.timezone` (default: org) | coverage times like 18:00 are meaningless without a zone; DST |
| `timesheet.status` lacks `corrected`, `invoiced` (state diagram has them) | included | the diagram is the intent |
| `contract.document_key`, file keys | `FileObject` ids | uploaded files are first-class and org-checked |
| `invoice` had no review-flags or amount paid | `flags`, `amountPaid` | the invoice run must flag unapproved timesheets; partial payment needs a running total |
| `shift_offer` statuses offered/accepted/declined | + `WITHDRAWN` | closing other offers when one is accepted |
| supervisor scope "their contracts and sites" undefined | `user_site_access` rows for supervisors | reuses the table, no extra concept |
| QuickBooks + Stripe integration | ports + fake providers + outbox + real webhook verification | real adapters need vendor credentials and sandboxes; everything around them is production-grade |
| audit_event only | existing auth `audit_events` table extended with `orgId, entity, entityId, action, diff` | one trail |
