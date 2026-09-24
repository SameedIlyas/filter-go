# Platform API: users directory, files, organization, notifications

Audience: the frontend developer wiring the admin/supervisor/field screens. TypeScript types for everything here:
`docs/types/platform.ts`. Every response sample below is real captured output from the running backend (long lists
are trimmed where marked). Authentication, envelopes and error basics are in
`FRONTEND_HANDOVER.md`; the rules that matter for this module are repeated here.

```
export API=http://localhost:4000       # the Next.js server calls this, never the browser
export TOKEN=<session token>           # from POST /v1/auth/login
# every call also sends:  -H "authorization: Bearer $TOKEN" -H "x-service-key: $SERVICE_API_KEY"
```

## Contents

1. [Conventions](#1-conventions)
2. [Users directory](#2-users-directory) (`GET /users`, `GET /users/:id`)
3. [Availability](#3-availability)
4. [Site access](#4-site-access)
5. [Documents](#5-documents)
6. [Compliance](#6-compliance)
7. [Files](#7-files)
8. [Organization](#8-organization)
9. [Audit events](#9-audit-events)
10. [Notifications](#10-notifications)
11. [Business rules, decisions and audit/notification events](#11-business-rules-decisions-and-auditnotification-events)

---

## 1. Conventions

- Envelope on every response: `{ success, data, error }`, lists add `meta: { page, limit, total, totalPages }`.
  Branch on `error.code`, never on `error.message`.
- Paging query on every list: `page` (default 1), `limit` (default 20, max 100).
- All request bodies and queries are **strict**: an unknown field is `400 VALIDATION_ERROR` (`details.issues[].code =
  "unrecognized_key"`). A malformed id in the path is `400 VALIDATION_ERROR`.
- Guard order: no/expired session `401`, wrong role `403`, resource outside your scope `404`.
  A user, document, file or notification that belongs to another organization, or that you are not allowed to see, is
  answered with exactly the same `404` as one that does not exist. Do not build UI that tries to tell them apart.
- **Who can see whom** (used by every `/users/:id...` route):

  | Caller | Can reach |
  |---|---|
  | ADMIN | every user of the organization |
  | SUPERVISOR | themselves, and users who share at least one site with them (both have a site-access row for the same site) |
  | FIELD_USER, CLIENT_USER | only themselves |

  Anyone outside that set is `404 USER_NOT_FOUND`.
- Common errors for every endpoint below (not repeated in each table unless they have special meaning):

  | Status | `code` | When | UI |
  |---|---|---|---|
  | 400 | `VALIDATION_ERROR` | bad/unknown field, bad id, business rule on a field | show `details.issues[]` next to the fields |
  | 401 | `UNAUTHENTICATED` / `SESSION_EXPIRED` | missing, unknown or expired session | go to login |
  | 403 | `FORBIDDEN` | your role may not call this endpoint | hide the action; show "no permission" |
  | 404 | `USER_NOT_FOUND` / `NOT_FOUND` | missing, other organization, or out of your scope | show "not found" |

---

## 2. Users directory

### GET /v1/users

The people directory. **Who:** ADMIN, SUPERVISOR (a supervisor only sees themselves and people who share a site with
them). FIELD_USER and CLIENT_USER get `403`.

| Query | Type | Required | Notes |
|---|---|---|---|
| `page`, `limit` | int | no | paging |
| `q` | string | no | case-insensitive match on name or email, max 100 |
| `role` | `ADMIN\|SUPERVISOR\|FIELD_USER\|CLIENT_USER` | no | |
| `status` | `INVITED\|ACTIVE\|DISABLED` | no | |
| `siteId` | uuid | no | people with access to that site. `404` if the site is not in your scope |

Sorted by name. `defaultPayRate` is included for ADMIN and SUPERVISOR viewers (this endpoint is only open to those two);
it is never included for anyone else.

Response (supervisor, `limit=2`):

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
        "orgId": "091427e8-5271-4fdf-80cf-bbc6ed23b15a",
        "name": "Fiona Field",
        "email": "user7@filter-go.test",
        "image": null,
        "phone": "+1 312 555 0100",
        "role": "FIELD_USER",
        "status": "ACTIVE",
        "employmentType": "EMPLOYEE",
        "hiredAt": null,
        "clientId": null,
        "defaultPayRate": "22.00",
        "createdAt": "2026-09-21T18:54:29.440Z",
        "lastLoginAt": "2026-09-21T18:54:29.564Z"
      },
      {
        "id": "18274ab5-8903-4663-98a7-d56ff10a19cb",
        "orgId": "091427e8-5271-4fdf-80cf-bbc6ed23b15a",
        "name": "Sam Supervisor",
        "email": "user6@filter-go.test",
        "image": null,
        "phone": null,
        "role": "SUPERVISOR",
        "status": "ACTIVE",
        "employmentType": "EMPLOYEE",
        "hiredAt": null,
        "clientId": null,
        "defaultPayRate": null,
        "createdAt": "2026-09-21T18:54:29.257Z",
        "lastLoginAt": "2026-09-21T18:54:29.361Z"
      }
    ]
  },
  "meta": { "page": 1, "limit": 2, "total": 2, "totalPages": 1 },
  "error": null
}
```

| Status | `code` | When | UI |
|---|---|---|---|
| 403 | `FORBIDDEN` | field or client user | hide the directory |
| 404 | `NOT_FOUND` | `siteId` is not a site you can access | "site not found" |

```
curl "$API/v1/users?role=FIELD_USER&siteId=$SITE&q=ali&limit=20" -H "authorization: Bearer $TOKEN"
```

### GET /v1/users/:id

One user. **Who:** ADMIN (anyone in the org), SUPERVISOR (self or shared site), any signed-in user for themselves.
`defaultPayRate` only for ADMIN and SUPERVISOR viewers, so a field user reading their own profile does not get it.

Response: `{ "success": true, "data": { "user": { ...same shape as one entry above... } }, "error": null }`

| Status | `code` | When | UI |
|---|---|---|---|
| 404 | `USER_NOT_FOUND` | not in your organization / not visible to you | "not found" |

```
curl $API/v1/users/$USER_ID -H "authorization: Bearer $TOKEN"
```

---

## 3. Availability

Weekly recurring windows in which a person can work. Times are **wall clock in the organization's timezone**
(the response carries it as `timezone`). Scheduling only warns about shifts outside the windows; it never blocks.

### GET /v1/users/:id/availability

**Who:** ADMIN, SUPERVISOR (shared site), the user themselves.

Response (sorted by weekday, then start time):

```json
{
  "success": true,
  "data": {
    "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
    "timezone": "America/Chicago",
    "windows": [
      { "id": "82af9c9e-cbfd-4ee3-ba0b-3f01e1af68e0", "weekday": 1, "startTime": "09:00", "endTime": "12:00" },
      { "id": "171a05da-d768-4d38-b314-95449e9b04fb", "weekday": 1, "startTime": "13:00", "endTime": "17:00" },
      { "id": "6c7bc647-ac3b-4063-9d48-46f533228b29", "weekday": 3, "startTime": "08:00", "endTime": "16:00" }
    ]
  },
  "error": null
}
```

Errors: only the common ones (`404 USER_NOT_FOUND` when out of scope).

```
curl $API/v1/users/$USER_ID/availability -H "authorization: Bearer $TOKEN"
```

### PUT /v1/users/:id/availability

**Replaces every window** with the ones you send (an empty list clears them). One transaction, audited
(`user.availability_replaced`). **Who:** ADMIN, SUPERVISOR (shared site), the user themselves.

| Field | Type | Required | Notes |
|---|---|---|---|
| `windows` | array, max 70 | yes | |
| `windows[].weekday` | int 1-7 | yes | 1 = Monday ... 7 = Sunday |
| `windows[].startTime` | `"HH:mm"` | yes | 24 hour |
| `windows[].endTime` | `"HH:mm"` | yes | must be after `startTime`. A window cannot cross midnight: use `"23:59"` for end of day and add a second window on the next weekday |

Two windows on the same weekday must not overlap (end `12:00` and start `12:00` is fine). The response is the same
shape as GET. Request used for the sample above:

```json
{ "windows": [
  { "weekday": 1, "startTime": "09:00", "endTime": "12:00" },
  { "weekday": 1, "startTime": "13:00", "endTime": "17:00" },
  { "weekday": 3, "startTime": "08:00", "endTime": "16:00" }
] }
```

Error sample (overlap), `400`:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "details": { "issues": [
      { "field": "windows.1.startTime", "code": "custom", "message": "This window overlaps another window on the same weekday." }
    ] },
    "requestId": "e1b409c7-0069-4074-9069-54caaab78795"
  }
}
```

| Status | `code` | When | UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | overlap, end not after start, weekday outside 1-7, bad time, more than 70 windows. `field` is `windows.<index>.<key>` | mark the row |
| 404 | `USER_NOT_FOUND` | out of scope | |

```
curl -X PUT $API/v1/users/$USER_ID/availability -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"windows":[{"weekday":1,"startTime":"09:00","endTime":"17:00"}]}'
```

---

## 4. Site access

Which sites a person may be scheduled at (field users) or manages (supervisors). Changing a supervisor's sites changes
their scope **immediately** (directory, schedules, timesheets...). CLIENT_USER accounts have no site rows: their sites
come from their client.

### GET /v1/users/:id/sites

**Who:** ADMIN, SUPERVISOR (shared site), the user themselves. ADMIN and the user see all of the person's sites. A
**supervisor only sees the overlap with the sites they manage** themselves (so they never learn about other sites).

Response (supervisor reading Fiona, who has two sites):

```json
{
  "success": true,
  "data": {
    "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
    "siteIds": ["b2ec2d33-99d4-4124-9496-a5f6d5d4bcc0"],
    "sites": [
      { "id": "b2ec2d33-99d4-4124-9496-a5f6d5d4bcc0", "name": "Riverside Plaza", "clientId": "8e0d9cfe-1e77-48f4-9450-7807d18beaf1", "active": true }
    ]
  },
  "error": null
}
```

```
curl $API/v1/users/$USER_ID/sites -H "authorization: Bearer $TOKEN"
```

### PUT /v1/users/:id/sites

**Replaces the whole set.** **Who:** ADMIN only (supervisors get `403`). One transaction, audited
(`user.sites_replaced`, diff `{ added, removed }`). Duplicate ids in the request are ignored.

| Field | Type | Required | Notes |
|---|---|---|---|
| `siteIds` | uuid[], max 500 | yes | every id must be a site of your organization. `[]` removes all access |

Request `{ "siteIds": ["b2ec2d33-99d4-4124-9496-a5f6d5d4bcc0", "b546def2-ced7-4545-9af8-73dc4c3ca0a7"] }`, response:

```json
{
  "success": true,
  "data": {
    "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
    "siteIds": ["b546def2-ced7-4545-9af8-73dc4c3ca0a7", "b2ec2d33-99d4-4124-9496-a5f6d5d4bcc0"],
    "sites": [
      { "id": "b546def2-ced7-4545-9af8-73dc4c3ca0a7", "name": "Harbor Tower", "clientId": "0aacd27a-aa80-439a-b4c3-508bd9e1ae7e", "active": true },
      { "id": "b2ec2d33-99d4-4124-9496-a5f6d5d4bcc0", "name": "Riverside Plaza", "clientId": "8e0d9cfe-1e77-48f4-9450-7807d18beaf1", "active": true }
    ]
  },
  "error": null
}
```

| Status | `code` | When | UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | a site id does not exist in your organization (`field: "siteIds"`, `code: "site_not_found"`), bad uuid | refresh the site list |
| 403 | `FORBIDDEN` | not an admin | hide the editor |
| 404 | `USER_NOT_FOUND` | user of another organization | |
| 422 | `UNPROCESSABLE` | the target is a CLIENT_USER | do not offer site assignment for client users |

```
curl -X PUT $API/v1/users/$USER_ID/sites -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"siteIds":["'$SITE'"]}'
```

---

## 5. Documents

Compliance paperwork per person (licences, insurance, training...). `type` is free text, trimmed and lower-cased by the
server (`"Forklift Licence"` is stored as `"forklift licence"`), so filter and group by the lower-case value.

Document object: `{ id, userId, type, fileId, expiresAt, notes, createdAt }`. `expiresAt` is `"YYYY-MM-DD"` or `null`
(never expires). `fileId` points to a file from `POST /v1/files`; download it with `GET /v1/files/:id` (see the
download rules in section 7: a field user can only download files they uploaded themselves).

### GET /v1/users/:id/documents

**Who:** ADMIN, SUPERVISOR (shared site), the user themselves. Sorted by expiry (soonest first, no-expiry last).

```json
{
  "success": true,
  "data": { "documents": [
    {
      "id": "5fea75ef-422e-41fb-8df6-b124f43f17c9",
      "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
      "type": "forklift licence",
      "fileId": "2a801f21-8b92-4fa1-8703-8b739ee0360d",
      "expiresAt": "2026-10-03",
      "notes": "Class II",
      "createdAt": "2026-09-21T18:54:31.451Z"
    }
  ] },
  "error": null
}
```

```
curl $API/v1/users/$USER_ID/documents -H "authorization: Bearer $TOKEN"
```

### POST /v1/users/:id/documents

Adds a document. **Who:** ADMIN, SUPERVISOR (shared site), the user themselves. Audited (`user_document.created`).
A person can have at most 200 documents.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string 1-60 | yes | trimmed, lower-cased |
| `fileId` | uuid or null | no | must be a file of your organization |
| `expiresAt` | `"YYYY-MM-DD"` or null | no | past dates are allowed (recording something already lapsed) |
| `notes` | string max 1000 or null | no | |

Request `{ "type": "Forklift Licence", "fileId": "2a801f21-...", "expiresAt": "2026-10-03", "notes": "Class II" }`, `201`:

```json
{
  "success": true,
  "data": { "document": {
    "id": "5fea75ef-422e-41fb-8df6-b124f43f17c9",
    "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
    "type": "forklift licence",
    "fileId": "2a801f21-8b92-4fa1-8703-8b739ee0360d",
    "expiresAt": "2026-10-03",
    "notes": "Class II",
    "createdAt": "2026-09-21T18:54:31.451Z"
  } },
  "error": null
}
```

| Status | `code` | When | UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | bad type/date, `fileId` not found in your organization (`code: "file_not_found"`) | upload the file first, then use its id |
| 404 | `USER_NOT_FOUND` | out of scope | |
| 422 | `UNPROCESSABLE` | 200 documents already on file | ask to delete old ones |

```
curl -X POST $API/v1/users/$USER_ID/documents -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"type":"insurance","expiresAt":"2027-01-31"}'
```

### PATCH /v1/users/:id/documents/:documentId

Edits a document. **Who:** ADMIN, SUPERVISOR (shared site). The user themselves gets `403` (they can add but not edit).
Send at least one field; only the fields you send change (`fileId`, `expiresAt`, `notes` accept `null` to clear).
Audited (`user_document.updated`, diff `{ before, after }`).

Request `{ "expiresAt": "2027-10-26" }`, response:

```json
{
  "success": true,
  "data": { "document": {
    "id": "5fea75ef-422e-41fb-8df6-b124f43f17c9",
    "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
    "type": "forklift licence",
    "fileId": "2a801f21-8b92-4fa1-8703-8b739ee0360d",
    "expiresAt": "2027-10-26",
    "notes": "Class II",
    "createdAt": "2026-09-21T18:54:31.451Z"
  } },
  "error": null
}
```

| Status | `code` | When | UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | empty body, bad value, unknown `fileId` | |
| 403 | `FORBIDDEN` | field/client user | |
| 404 | `USER_NOT_FOUND` / `NOT_FOUND` | user out of scope, or the document is not this user's | refresh the list |

```
curl -X PATCH $API/v1/users/$USER_ID/documents/$DOC_ID -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"expiresAt":"2027-10-26"}'
```

### DELETE /v1/users/:id/documents/:documentId

Removes a document. **Who:** ADMIN, SUPERVISOR (shared site). Audited (`user_document.deleted`, diff = what was removed).
The file itself is kept. A second delete of the same document is `404`.

```json
{ "success": true, "data": { "deleted": true }, "error": null }
```

Errors: `403` for field/client users, `404 USER_NOT_FOUND` / `NOT_FOUND` as above.

```
curl -X DELETE $API/v1/users/$USER_ID/documents/$DOC_ID -H "authorization: Bearer $TOKEN"
```

---

## 6. Compliance

Status of a document against **today in the organization's timezone**:

| Status | Meaning |
|---|---|
| `EXPIRED` | `expiresAt` is before today |
| `EXPIRING` | `expiresAt` is today or within the next 30 days (day 30 is still EXPIRING, day 31 is VALID) |
| `VALID` | later than that, or no expiry date |

### GET /v1/users/:id/compliance

**Who:** ADMIN, SUPERVISOR (shared site), the user themselves. Every document with its `status` and `daysUntilExpiry`
(negative once expired, `null` without an expiry), plus `overall` = the **worst** status (EXPIRED > EXPIRING > VALID).
A person with no documents is `VALID`. Sorted like the documents list.

```json
{
  "success": true,
  "data": {
    "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
    "today": "2026-09-21",
    "overall": "EXPIRED",
    "documents": [
      {
        "id": "6762d83a-6b70-4b9a-b533-076341580493",
        "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
        "type": "insurance",
        "fileId": null,
        "expiresAt": "2026-09-18",
        "notes": null,
        "createdAt": "2026-09-21T18:54:31.758Z",
        "status": "EXPIRED",
        "daysUntilExpiry": -3
      },
      {
        "id": "5fea75ef-422e-41fb-8df6-b124f43f17c9",
        "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
        "type": "forklift licence",
        "fileId": "2a801f21-8b92-4fa1-8703-8b739ee0360d",
        "expiresAt": "2027-10-26",
        "notes": "Class II",
        "createdAt": "2026-09-21T18:54:31.451Z",
        "status": "VALID",
        "daysUntilExpiry": 400
      },
      {
        "id": "dcc28356-7a58-4390-8f63-1db44bec93b6",
        "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
        "type": "training",
        "fileId": null,
        "expiresAt": null,
        "notes": null,
        "createdAt": "2026-09-21T18:54:31.875Z",
        "status": "VALID",
        "daysUntilExpiry": null
      }
    ]
  },
  "error": null
}
```

Because `overall` is the worst of all documents, a renewed licence should replace (PATCH) or delete the old, lapsed
record, otherwise the person stays EXPIRED.

```
curl $API/v1/users/$USER_ID/compliance -H "authorization: Bearer $TOKEN"
```

### GET /v1/compliance/expiring

The "who needs to renew" worklist. **Who:** ADMIN (whole organization), SUPERVISOR (themselves and shared-site people).
Documents that expire within `days` **or are already expired**, oldest expiry first, paged. People with status
`DISABLED` are left out. Documents without an expiry never appear.

| Query | Type | Required | Notes |
|---|---|---|---|
| `days` | int 0-3650 | no | default 30 |
| `page`, `limit` | int | no | |

```json
{
  "success": true,
  "data": {
    "today": "2026-09-21",
    "days": 30,
    "documents": [
      {
        "id": "6762d83a-6b70-4b9a-b533-076341580493",
        "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8",
        "type": "insurance",
        "fileId": null,
        "expiresAt": "2026-09-18",
        "notes": null,
        "createdAt": "2026-09-21T18:54:31.758Z",
        "status": "EXPIRED",
        "daysUntilExpiry": -3,
        "user": { "id": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8", "name": "Fiona Field", "role": "FIELD_USER" }
      }
    ]
  },
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "error": null
}
```

Errors: `400` for a bad `days`, `403` for field/client users.

```
curl "$API/v1/compliance/expiring?days=60" -H "authorization: Bearer $TOKEN"
```

---

## 7. Files

Every file (photo, PDF) goes through here first; other endpoints (documents, work logs, contracts, survey photos)
store only the returned **file id**.

### POST /v1/files

Uploads one file. **Who:** any signed-in user. Rate limited (60 per minute per IP).

`Content-Type: multipart/form-data` with:

| Part | Type | Required | Notes |
|---|---|---|---|
| `file` | file | yes | the field must be named `file`. Max size is `MAX_UPLOAD_BYTES` (10 MB by default). |
| `purpose` | text | no | letters, digits, `_`, `-`, max 40, lower-cased. Send it **before** the file part (parts after the file are not read). It is recorded in the audit trail only. |

Any other text field is `400`. Allowed types: **JPEG, PNG, WebP, HEIC/HEIF, PDF**. The type is decided from the
**first bytes of the file**; the browser's content-type and the extension are ignored (a `.jpg` that is really an
executable is refused, a real JPEG named `x.pdf` is stored as `image/jpeg`). The size limit is enforced while reading,
whatever `Content-Length` says. The stored name is sanitised (path parts, control characters and `<>:"|?*` removed).

`201`:

```json
{
  "success": true,
  "data": { "file": {
    "id": "2a801f21-8b92-4fa1-8703-8b739ee0360d",
    "originalName": "forklift licence.pdf",
    "contentType": "application/pdf",
    "size": 34,
    "createdAt": "2026-09-21T18:54:31.096Z"
  } },
  "error": null
}
```

Error sample (unsupported content), `415`:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UNSUPPORTED_FILE_TYPE",
    "message": "Only JPEG, PNG, WebP, HEIC and PDF files are accepted.",
    "requestId": "d5f07c51-423e-423c-8c95-34e42f23be95"
  }
}
```

| Status | `code` | When | UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | no `file` field, wrong field name, bad `purpose`, unknown text field, more than one file in the request (`field: "file"`, `code: "invalid_upload"`) | fix the form; upload files one request at a time |
| 413 | `FILE_TOO_LARGE` | the file is over the limit | tell the user the limit; offer to compress/resize the photo |
| 415 | `UNSUPPORTED_FILE_TYPE` | content is not one of the allowed types | "Use a JPEG, PNG, WebP, HEIC or PDF" |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | request was not `multipart/form-data` | developer error |

```
curl -X POST $API/v1/files -H "authorization: Bearer $TOKEN" -F purpose=licence -F "file=@licence.pdf"
```

### GET /v1/files/:id

Streams the bytes. **Who** may read a file (same organization is always required):

| Caller | Allowed |
|---|---|
| ADMIN, SUPERVISOR | any file of the organization |
| any user | files they uploaded themselves |
| CLIENT_USER | additionally: **photos** (work logs of kind `PHOTO`) of shifts at their client's sites |
| FIELD_USER | only their own uploads |

Everything else, including files of other organizations, is `404 NOT_FOUND`. Response headers: `Content-Type` (from the
stored, verified type), `Content-Length`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`,
`Content-Security-Policy: default-src 'none'; sandbox`, and `Content-Disposition`: **`inline` for images**,
**`attachment` for everything else** (PDFs download), e.g.
`attachment; filename="forklift licence.pdf"; filename*=UTF-8''forklift%20licence.pdf`.
Because the browser never talks to the API, proxy this through a Next.js route handler that forwards the headers and
the body stream, and keep the session cookie on the Next.js side.

| Status | `code` | When | UI |
|---|---|---|---|
| 404 | `NOT_FOUND` | unknown id, other organization, not allowed to read, or the bytes are missing | "file not available" |

Error body sample (`404`):

```json
{ "success": false, "data": null, "error": { "code": "NOT_FOUND", "message": "File not found.", "details": { "entity": "file" }, "requestId": "27287ba2-4fe0-4e82-a27c-6cc96d0e719a" } }
```

```
curl $API/v1/files/$FILE_ID -H "authorization: Bearer $TOKEN" -o downloaded.pdf
```

---

## 8. Organization

### GET /v1/org

**Who:** any signed-in user. Everyone gets `id`, `name`, `timezone`; **only ADMIN** also gets `leadIntakeKey` and
`defaultLeadOwnerId`.

Admin response:

```json
{
  "success": true,
  "data": { "org": {
    "id": "091427e8-5271-4fdf-80cf-bbc6ed23b15a",
    "name": "Acme Services",
    "timezone": "America/Chicago",
    "leadIntakeKey": "_aXyAhLH0V0BD1juyMeq6oiw",
    "defaultLeadOwnerId": null
  } },
  "error": null
}
```

Field user response (same call):

```json
{
  "success": true,
  "data": { "org": { "id": "091427e8-5271-4fdf-80cf-bbc6ed23b15a", "name": "Acme Services", "timezone": "America/Chicago" } },
  "error": null
}
```

```
curl $API/v1/org -H "authorization: Bearer $TOKEN"
```

### PATCH /v1/org

**Who:** ADMIN. Audited (`org.updated`, diff `{ before, after }` of the fields that actually changed; a request that changes
nothing writes no audit row). Send at least one field.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string 1-120 | no | trimmed |
| `timezone` | IANA name | no | e.g. `America/New_York`. Availability windows and "today" for compliance follow this zone |
| `defaultLeadOwnerId` | uuid or null | no | must be an **ACTIVE ADMIN or SUPERVISOR of this organization**; `null` = "first active admin" |

Request `{ "name": "Acme Field Services", "timezone": "America/New_York", "defaultLeadOwnerId": "18274ab5-8903-4663-98a7-d56ff10a19cb" }`:

```json
{
  "success": true,
  "data": { "org": {
    "id": "091427e8-5271-4fdf-80cf-bbc6ed23b15a",
    "name": "Acme Field Services",
    "timezone": "America/New_York",
    "leadIntakeKey": "_aXyAhLH0V0BD1juyMeq6oiw",
    "defaultLeadOwnerId": "18274ab5-8903-4663-98a7-d56ff10a19cb"
  } },
  "error": null
}
```

| Status | `code` | When | UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | empty body, unknown field (the key cannot be set here), unknown timezone, blank name, owner not eligible (`field: "defaultLeadOwnerId"`, `code: "invalid_owner"`) | show the issue |
| 403 | `FORBIDDEN` | not an admin | |

```
curl -X PATCH $API/v1/org -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"timezone":"America/New_York"}'
```

### POST /v1/org/rotate-lead-key

Issues a new `leadIntakeKey`. **The old key stops working immediately**, so update the key in the website form right
after. **Who:** ADMIN. No body. Audited (`org.lead_key_rotated`; the keys themselves are never written to the trail).

```json
{
  "success": true,
  "data": { "org": {
    "id": "091427e8-5271-4fdf-80cf-bbc6ed23b15a",
    "name": "Acme Field Services",
    "timezone": "America/New_York",
    "leadIntakeKey": "AOfIj1Q2eFjwf4tLU0HosyGw",
    "defaultLeadOwnerId": "18274ab5-8903-4663-98a7-d56ff10a19cb"
  } },
  "error": null
}
```

Errors: `403` for non-admins, `400` if a body is sent. UI: confirm first ("the current website form will stop working").

```
curl -X POST $API/v1/org/rotate-lead-key -H "authorization: Bearer $TOKEN"
```

---

## 9. Audit events

### GET /v1/audit-events

The change history of the organization. **Who:** ADMIN only. Newest first, paged. Only events of your organization are
returned; only the fields below are ever sent (never request metadata, user agents or anything token-like).

| Query | Type | Required | Notes |
|---|---|---|---|
| `entity` | string | no | `contract`, `shift`, `user`, `user_document`, `org`, `file`, ... |
| `entityId` | string | no | id of the thing |
| `actorId` | uuid | no | who did it |
| `action` | string | no | `created`, `updated`, `assign_override`, `sites_replaced`, ... |
| `from`, `to` | ISO-8601 instant with zone | no | inclusive, e.g. `2026-03-10T00:00:00Z` |
| `page`, `limit` | int | no | |

Response (`limit=4`, real events):

```json
{
  "success": true,
  "data": { "events": [
    {
      "id": "6b6b085b-125c-4df6-a681-1ba8d816b45d",
      "at": "2026-09-21T18:54:32.688Z",
      "actorId": "02f857b4-9590-4937-b8ba-d9d1ac494ae7",
      "entity": "org",
      "entityId": "091427e8-5271-4fdf-80cf-bbc6ed23b15a",
      "action": "lead_key_rotated",
      "diff": null,
      "type": "org.lead_key_rotated",
      "userId": null,
      "ip": "127.0.0.1"
    },
    {
      "id": "3f4f9f53-17f0-489a-b663-5d54dfde4e37",
      "at": "2026-09-21T18:54:32.609Z",
      "actorId": "02f857b4-9590-4937-b8ba-d9d1ac494ae7",
      "entity": "org",
      "entityId": "091427e8-5271-4fdf-80cf-bbc6ed23b15a",
      "action": "updated",
      "diff": {
        "after": { "name": "Acme Field Services", "timezone": "America/New_York", "defaultLeadOwnerId": "18274ab5-8903-4663-98a7-d56ff10a19cb" },
        "before": { "name": "Acme Services", "timezone": "America/Chicago", "defaultLeadOwnerId": null }
      },
      "type": "org.updated",
      "userId": null,
      "ip": "127.0.0.1"
    },
    {
      "id": "6e0a6962-8b0b-4b61-9c05-3cddaa3356d7",
      "at": "2026-09-21T18:54:32.377Z",
      "actorId": "02f857b4-9590-4937-b8ba-d9d1ac494ae7",
      "entity": "user_document",
      "entityId": "dcc28356-7a58-4390-8f63-1db44bec93b6",
      "action": "deleted",
      "diff": { "type": "training", "notes": null, "fileId": null, "userId": "894cf6c2-a9b0-43e9-9d25-b1b851480ec8", "expiresAt": null },
      "type": "user_document.deleted",
      "userId": null,
      "ip": "127.0.0.1"
    }
  ] },
  "meta": { "page": 1, "limit": 4, "total": 10, "totalPages": 3 },
  "error": null
}
```

(one more event trimmed). `diff` is free-form JSON that depends on the event; render it generically (key/value or JSON
viewer). Login and other authentication events are not part of this trail.

| Status | `code` | When | UI |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | unknown filter, `actorId` not a uuid, `from`/`to` without a timezone offset | |
| 403 | `FORBIDDEN` | not an admin | |

```
curl "$API/v1/audit-events?entity=contract&entityId=$ID&limit=50" -H "authorization: Bearer $TOKEN"
```

---

## 10. Notifications

In-app notifications of the signed-in user. Every role can read their own. There is no way to read anyone else's:
another person's notification id is a `404`. Other modules create them (`shift.assigned`, `lead.new`,
`timesheet.no_show`, ...); branch on `type` and use `data` for deep links.

Notification object: `{ id, type, title, body, data, readAt, createdAt }` (`readAt` is `null` while unread).

### GET /v1/notifications

Newest first, paged.

| Query | Type | Required | Notes |
|---|---|---|---|
| `unread` | `"true"\|"false"` | no | `true` lists only unread ones |
| `page`, `limit` | int | no | |

`unreadCount` is always the number of **all** unread notifications, whatever `unread` is (use it for the bell badge).

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "b922e585-6076-4d3a-aab6-118d699d0152",
        "type": "schedule.published",
        "title": "Schedule published",
        "body": "Week of 2 March is live.",
        "data": null,
        "readAt": "2026-09-21T18:54:32.921Z",
        "createdAt": "2026-09-21T18:54:32.925Z"
      },
      {
        "id": "b7b10666-fb9d-416a-b1ad-857e9bcb0aa6",
        "type": "shift.assigned",
        "title": "New shift assigned",
        "body": "You are on Riverside Plaza, Tue 18:00-02:00.",
        "data": { "shiftId": "3d2f5a0e-7e0b-4d6a-9c55-0d8f4a2b1c11" },
        "readAt": null,
        "createdAt": "2026-09-21T18:54:32.925Z"
      }
    ],
    "unreadCount": 1
  },
  "meta": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 },
  "error": null
}
```

Errors: `400` for an unknown query key or `unread` other than `true`/`false`.

```
curl "$API/v1/notifications?unread=true" -H "authorization: Bearer $TOKEN"
```

### POST /v1/notifications/:id/read

Marks one notification read. No body. Safe to repeat: an already-read notification keeps its original `readAt`.

```json
{
  "success": true,
  "data": {
    "notification": {
      "id": "b7b10666-fb9d-416a-b1ad-857e9bcb0aa6",
      "type": "shift.assigned",
      "title": "New shift assigned",
      "body": "You are on Riverside Plaza, Tue 18:00-02:00.",
      "data": { "shiftId": "3d2f5a0e-7e0b-4d6a-9c55-0d8f4a2b1c11" },
      "readAt": "2026-09-21T18:54:33.005Z",
      "createdAt": "2026-09-21T18:54:32.925Z"
    },
    "unreadCount": 0
  },
  "error": null
}
```

| Status | `code` | When | UI |
|---|---|---|---|
| 404 | `NOT_FOUND` | not yours, or does not exist | refresh the list |

```
curl -X POST $API/v1/notifications/$ID/read -H "authorization: Bearer $TOKEN"
```

### POST /v1/notifications/read-all

Marks all of your unread notifications read. No body. `updated` is how many changed.

```json
{ "success": true, "data": { "updated": 1, "unreadCount": 0 }, "error": null }
```

```
curl -X POST $API/v1/notifications/read-all -H "authorization: Bearer $TOKEN"
```

---

## 11. Business rules, decisions and audit/notification events

**Availability.** Replace-all, in one transaction, guarded by a row lock so two simultaneous saves cannot mix. Times are
in the organization's timezone, not the site's. A window cannot cross midnight (`endTime` must be after `startTime`).

**Site access.** Replace-all, ADMIN only, in one transaction with the same lock. Sites must belong to the organization;
CLIENT_USER targets are refused with 422. A supervisor reading someone's sites only sees the ones they manage.

**Documents and compliance.** Status is computed on read against the organization's calendar day (so it never goes
stale and needs no job). `EXPIRING` = today through today + 30 days inclusive. `overall` is the worst status of all
documents; nobody with no documents is `VALID`. The Scheduling module applies its own (different) rule when warning about
expiring documents at assignment time; this module's rule is the one shown above.

**Files.** Type by magic bytes only. Stored under a server-generated key `<orgId>/<year>/<uuid>` (the client's name is
never part of a path). The local-disk driver refuses any key that is not made of letters, digits, `_`, `-` separated by
`/`, never overwrites, and verifies the resolved path stays inside `STORAGE_DIR`. The storage interface (`put`, `open`,
`delete`) is ready for an S3 driver. If the database write fails after the bytes were stored, the bytes are removed.
There is no delete endpoint and no cleanup of unreferenced files yet.

**Decisions where the spec was silent**

- Reading another user's data as a FIELD_USER or CLIENT_USER (anything other than yourself) is `404`, not `403`.
- Availability is writable by the user themselves, by a supervisor sharing a site, and by admins; CLIENT_USER accounts may
  technically store windows (they are never used).
- `GET /users/:id/sites` shows a supervisor only the sites they manage themselves (overlap), to avoid leaking sites.
- `GET /compliance/expiring` leaves out DISABLED people, is paged, and includes long-expired documents.
- A person can hold at most 200 documents.
- `purpose` on upload is validated and written to the audit trail only (there is no column for it).
- A FIELD_USER cannot download a file an admin uploaded for them (for example a document scan attached by a supervisor);
  the rule is "own uploads only". Let the admin upload it from the user's account or extend the rule later.
- Uploads are buffered in memory up to `MAX_UPLOAD_BYTES` (default 10 MB) before being written.
- `PUT` is not in the API's CORS allow-list. This only matters if a browser ever calls the API directly (the design says
  it does not); the integrator should add `PUT` to `methods` in `src/app.ts` if that changes.

**Audit events written (all in the same transaction as the change)**

| `type` | When | `diff` |
|---|---|---|
| `user.availability_replaced` | PUT availability | `{ before: [...], after: [...] }` (windows) |
| `user.sites_replaced` | PUT sites | `{ added: [siteId], removed: [siteId] }` |
| `user_document.created` | POST document | `{ userId, type, fileId, expiresAt, notes }` |
| `user_document.updated` | PATCH document | `{ userId, before: {...}, after: {...} }` |
| `user_document.deleted` | DELETE document | `{ userId, type, fileId, expiresAt, notes }` |
| `org.updated` | PATCH org (only when something changed) | `{ before: {...}, after: {...} }` of the changed fields |
| `org.lead_key_rotated` | rotate key | none (keys are never recorded) |
| `file.uploaded` | POST file | `{ contentType, size, purpose }` |

**Notifications emitted by this module:** none. This module only reads, lists and marks notifications; the other modules
create them through `notify()`.
