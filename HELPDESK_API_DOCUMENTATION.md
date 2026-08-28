# Helpdesk API — Frontend Integration Documentation

> Generated from the actual implementation in `src/module/helpdesk/`.
> Nothing in this document is invented. Where a capability does not exist, it says
> **Not identified in the current implementation.**
>
> Source of truth order used: route file → validator (zod) → controller → service →
> repository → migration/seed → existing docs. Where the existing docs
> (`src/module/helpdesk/docs/API.md`, `docs/ADMIN_API.md`) disagree with the code, the
> code is documented and the discrepancy is listed in
> [Backend API Notes / Known Issues](#backend-api-notes--known-issues).

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Base URL & Mounting](#2-base-url--mounting)
3. [Response Envelope](#3-response-envelope)
4. [Authentication](#4-authentication)
5. [Authorization — Roles, Permissions, Department Scope](#5-authorization--roles-permissions-department-scope)
6. [Validation, Pagination, Sorting, Filtering, Search](#6-validation-pagination-sorting-filtering-search)
7. [Concurrency — `expectedVersion` and `If-Match`/ETag](#7-concurrency--expectedversion-and-if-matchetag)
8. [Rate Limits](#8-rate-limits)
9. [CORS & Headers](#9-cors--headers)
10. [Enums and Constants](#10-enums-and-constants)
11. [Endpoint Reference](#11-endpoint-reference)
    - [11.1 System](#111-system)
    - [11.2 Identity](#112-identity)
    - [11.3 Admin — Meta](#113-admin--meta)
    - [11.4 Admin — Departments](#114-admin--departments)
    - [11.5 Admin — Department Settings](#115-admin--department-settings)
    - [11.6 Admin — Department Features](#116-admin--department-features)
    - [11.7 Tickets — Reads](#117-tickets--reads)
    - [11.8 Tickets — Writes](#118-tickets--writes)
    - [11.9 Collaboration](#119-collaboration)
    - [11.10 Replies](#1110-replies)
    - [11.11 Out of Office](#1111-out-of-office)
12. [Error Handling](#12-error-handling)
13. [File Uploads / Attachments](#13-file-uploads--attachments)
14. [Webhooks & Real-time](#14-webhooks--real-time)
15. [Frontend Integration Guide](#15-frontend-integration-guide)
16. [API Quick Reference](#16-api-quick-reference)
17. [Typical Frontend Flows](#17-typical-frontend-flows)
18. [Backend API Notes / Known Issues](#backend-api-notes--known-issues)
19. [Final Audit](#final-audit)

---

## 1. Platform Overview

| Item | Value |
| ---- | ----- |
| Language / runtime | Node.js, **CommonJS** (`require`, no ESM) |
| Framework | Express (router mounted into the existing CRM app) |
| API style | REST + **business-verb** endpoints (JSON) |
| Database | PostgreSQL, own schema `helpdesk` (pinned via `search_path`) |
| Validation | `zod` schemas in `src/module/helpdesk/validators/` |
| Auth | Interim email header **or** JWT (`HELPDESK_AUTH_MODE`) |
| OpenAPI / Swagger | **Not identified in the current implementation.** No spec file exists. |
| Real-time / WebSocket | **Not identified in the current implementation.** |
| File upload endpoints | **Not identified in the current implementation.** |

### Architectural rules that shape the API

These are enforced in code and directly affect how the frontend must be built:

1. **The frontend asks for outcomes, never for column writes.** There is no
   `PATCH /tickets/:id { "state": "RESOLVED" }`. A state change is
   `POST /tickets/:id/transitions`, validated against `workflow_transitions` rows.
2. **A workflow state is identified by its `code`, never by its uuid.** `workflow_definitions`
   is versioned; the same business state has a different uuid per version. Use
   `?state=IN_PROGRESS`, not `?stateId=<uuid>`.
3. **Microsoft Graph owns the email conversation.** Reply / Reply All / Forward are Graph
   calls the frontend makes with the *user's own* token. The backend records that mail
   happened; it does not mirror the thread.
4. **Two conversations per ticket, never merged.** `GET /tickets/:id/timeline` (requester-facing)
   and `GET /tickets/:id/collaborations` (internal) are separate endpoints on purpose.
5. **Department isolation.** Every request is pinned to one department, derived from the
   acting user's own record — never from a body field.

---

## 2. Base URL & Mounting

```
API_PREFIX = /api/helpdesk
```

Defined in [constant/index.js](src/module/helpdesk/constant/index.js#L38) and mounted once in
[src/app.js:120](src/app.js#L120):

```js
app.use(helpdesk.API_PREFIX, helpdesk.routes);
```

Every path in this document is relative to that prefix. Full example:

```
GET https://<host>/api/helpdesk/tickets?state=NEW&limit=25
```

The frontend should read the host from its own environment configuration; the backend does
not publish a base-URL discovery endpoint.

---

## 3. Response Envelope

One envelope for the whole module
([shared/response.utils.js](src/module/helpdesk/shared/response.utils.js)).

**Success (non-paginated)** — HTTP 200 or 201:

```json
{
  "success": true,
  "message": "Success",
  "data": { }
}
```

**Success (paginated)** — HTTP 200. `data` is an array, `meta` carries the page:

```json
{
  "success": true,
  "message": "Success",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 137,
    "totalPages": 6
  }
}
```

**Error** — any 4xx/5xx:

```json
{
  "success": false,
  "message": "Ticket not found",
  "code": "NOT_FOUND",
  "details": { }
}
```

`code` is a stable machine-readable string (see [Error Handling](#12-error-handling)).
`details` is present only when the thrower supplied it — for validation failures it is a
field-name → messages map.

> **Note on casing.** Ticket, department, settings and feature payloads are returned as
> **raw database rows in `snake_case`** (`ticket_number`, `assigned_to_user_id`,
> `is_enabled`). Request bodies are **`camelCase`** (`categoryId`, `isEnabled`). This is
> the module's convention, not an oversight — do not rename fields.
> Exceptions that return camelCase: `GET /auth/me` (`user`, `authMode`, `workflowStates`),
> the `participants` array inside collaborations, `availableTransitions` (raw rows, snake_case),
> and the `transition` object on a transition response.

---

## 4. Authentication

Implemented in [middleware/auth.middleware.js](src/module/helpdesk/middleware/auth.middleware.js).

### 4.1 There is no login endpoint

**Not identified in the current implementation.** The helpdesk module issues no tokens and
exposes no `POST /auth/login`, `POST /auth/refresh` or `POST /auth/logout`. Identity is
established per-request from a header. The mechanism is selected by the
`HELPDESK_AUTH_MODE` environment variable.

### 4.2 Mode `header` (interim — default outside production)

The caller sends their email address in a header. The header name comes from
`HELPDESK_AUTH_EMAIL_HEADER` and defaults to **`x-user-email`**.

```http
GET /api/helpdesk/auth/me HTTP/1.1
x-user-email: manish.pandey@gera.in
```

Rules enforced:

| Rule | Result if violated |
| ---- | ------------------ |
| Header present | `401` `UNAUTHORIZED` — "Missing x-user-email header — the helpdesk is in interim header auth mode" |
| Header sent once (not repeated) | `401` — "x-user-email was sent more than once" |
| Exactly one address, contains `@`, no whitespace/`,`/`;` | `401` — "x-user-email is not a single email address" |
| `NODE_ENV !== "production"` | `500` `INTERNAL_ERROR` — "HELPDESK_AUTH_MODE=header is not permitted in production — set HELPDESK_AUTH_MODE=jwt" |

The address is **trimmed but not lowercased** — `users.email` is `citext`, so the database
folds case.

### 4.3 Mode `jwt`

A `Bearer` token in the standard `Authorization` header:

```http
GET /api/helpdesk/tickets HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Verification parameters (all mandatory, all enforced):

| Parameter | Value |
| --------- | ----- |
| Algorithm | `HS256` only (a token asking for `none` is rejected) |
| Secret | `HELPDESK_JWT_SECRET`, falling back to `JWT_ACCESS_SECRET`, then `JWT_SECRET` |
| Issuer | `HELPDESK_JWT_ISSUER`, default `helpdesk` |
| Audience | `HELPDESK_JWT_AUDIENCE`, default `helpdesk-api` |
| Clock tolerance | 5 seconds |
| Identity claim | `payload.email`, falling back to `payload.sub` |
| TTL (informational) | `HELPDESK_JWT_TTL`, default `1h` |

Failures:

| Condition | Response |
| --------- | -------- |
| Secret not configured | `500` `INTERNAL_ERROR` — "Helpdesk JWT secret is not configured" |
| Expired | `401` `UNAUTHORIZED` — "Token expired" |
| Bad signature / issuer / audience / algorithm | `401` `UNAUTHORIZED` — "Invalid token" |
| No `email` and no `sub` | `401` `UNAUTHORIZED` — "Token carries no email" |

**Nothing in this repository issues these tokens.** The JWT path is written and pinned so
switching modes is a configuration change; the token must come from the host application.

> A `Bearer` header is **always** treated as an attempt at the JWT path, even when
> `HELPDESK_AUTH_MODE=header`. Sending both a `Bearer` header and `x-user-email` means the
> Bearer token is verified and the email header is ignored.

### 4.4 What happens after the identity is resolved

1. The email is looked up in `users` (index `uq_users_email`, `deleted_at IS NULL`).
2. **Auto-provisioning.** If no row exists and `HELPDESK_AUTOPROVISION` is on (default
   `true`), a user row is created: role from `HELPDESK_AUTOPROVISION_ROLE`
   (default `EMPLOYEE`), department from `HELPDESK_AUTOPROVISION_DEPARTMENT` (a department
   **code**), `is_assignable = false`, `status = ACTIVE`. So "anyone can raise a ticket".
   If auto-provisioning is off, the response is `401` "User not found".
3. `status` must be `ACTIVE`, otherwise `403` `FORBIDDEN` — e.g. `"Account is offboarded"`.
4. `req.user` is hydrated and is exactly what `GET /auth/me` returns as `user`.

### 4.5 Token storage, expiry, refresh, logout

| Question | Answer from the implementation |
| -------- | ----------------------------- |
| Where to store the token | The API authenticates on a **header**, never a cookie (`credentials: false` in CORS). Storage is the host application's choice; the helpdesk imposes none. |
| How to send it | `Authorization: Bearer <token>` (jwt mode) or `x-user-email: <email>` (header mode). |
| Expiration behaviour | Expired token → `401` with message `"Token expired"`. There is **no deny-list**, so the TTL *is* the revocation latency. |
| Refresh token | **Not identified in the current implementation.** No refresh endpoint, no refresh grant. |
| Logout | **Not identified in the current implementation.** Discard the token client-side. |
| Unauthorized (`401`) handling | Re-authenticate **once** with the host app, replay the request, then surface the error. |
| Forbidden (`403`) handling | **Never retry.** `403` means a non-`ACTIVE` account, a role refusal, a disabled feature, or a cross-department attempt. Re-authenticating fixes none of them. |

---

## 5. Authorization — Roles, Permissions, Department Scope

### 5.1 Roles

`roles.code`, mirrored in [config/enums.js](src/module/helpdesk/config/enums.js#L38):

| Code | Meaning in the API |
| ---- | ------------------ |
| `EMPLOYEE` | Requester. Sees only their own tickets; requester-facing timeline only; holds no admin permission. |
| `SPOC` | Agent. |
| `MANAGER` | Agent. |
| `DEPT_ADMIN` | Agent + full department configuration. |
| `DEPT_HEAD` | Agent + department reads. |
| `SUPER_ADMIN` | Cross-department; may name any `departmentId`. |

**A role says *what*; `users.department_id` says *where*.** There is no `HR_SPOC` role.

### 5.2 `AGENT_ROLES` — the role gate on ticket write verbs

Defined in [routes/ticket.routes.js:22](src/module/helpdesk/routes/ticket.routes.js#L22):

```
SPOC, MANAGER, DEPT_ADMIN, DEPT_HEAD, SUPER_ADMIN
```

Applied to: `PATCH /tickets/:id/assignment`, `PATCH /tickets/:id/classification`,
`PATCH /tickets/:id/priority`, `POST /tickets/:id/notes`, and all four collaboration routes.
Failure → `403` `FORBIDDEN`, `details.required` lists the accepted roles.

`ON_BEHALF_ROLES` (same five) additionally gates naming a `requesterUserId` other than
yourself on `POST /tickets`.

### 5.3 Permissions (admin surface only)

`permissions.code` values from
[db/seeds/0003_admin_permissions.sql](src/module/helpdesk/db/seeds/0003_admin_permissions.sql).
`req.user.permissions` on `GET /auth/me` is the authoritative list for the signed-in user —
**the frontend should drive its admin menu from that array**, not from the role code.

Permissions used by endpoints that exist today:

| Code | Used by |
| ---- | ------- |
| `helpdesk.department.read` | `GET /admin/meta/enums`, `GET /admin/departments`, `GET /admin/departments/:id`, `GET .../readiness` |
| `helpdesk.department.create` | `POST /admin/departments` |
| `helpdesk.department.write` | `PATCH /admin/departments/:id` |
| `helpdesk.department.activate` | `POST /admin/departments/:id/activate` |
| `helpdesk.department.deactivate` | `POST /admin/departments/:id/deactivate` |
| `helpdesk.settings.read` | `GET .../settings` |
| `helpdesk.settings.write` | `POST .../settings`, `PATCH .../settings` |
| `helpdesk.feature.read` | `GET .../features` |
| `helpdesk.feature.write` | `POST .../features`, `PATCH .../features/:code`, `DELETE .../features/:code` |
| `helpdesk.ooo.read` | every `GET /admin/departments/:departmentId/out-of-office…`; **also accepted** on the self-service `GET /out-of-office…` |
| `helpdesk.ooo.write` | every out-of-office write, on **both** surfaces — and it is the *only* accepted gate on the self-service reads besides `helpdesk.ooo.read` |

Also seeded but **not yet used by any endpoint** (their routers are not built):
`helpdesk.taxonomy.*`, `helpdesk.priority.*`, `helpdesk.calendar.*`, `helpdesk.workflow.*`,
`helpdesk.routing.*`, `helpdesk.ola.*`, `helpdesk.user.*`, `helpdesk.role.*`,
`helpdesk.corpus.*`, `helpdesk.audit.read`.

`requirePermission(a, b)` is **any-of**, not all-of.

Seeded role → permission grants:

| Role | Grant |
| ---- | ----- |
| `SUPER_ADMIN` | every `helpdesk.*` permission |
| `DEPT_ADMIN` | every `helpdesk.*` **except** `helpdesk.department.create` and `helpdesk.role.write` |
| `DEPT_HEAD` | every `helpdesk.*.read` + `helpdesk.ooo.write` + `helpdesk.user.write` |
| `MANAGER` | every `helpdesk.*.read` + `helpdesk.ooo.write` |
| `SPOC` | every `helpdesk.*.read` + `helpdesk.ooo.write` + `helpdesk.corpus.write` |
| `EMPLOYEE` | nothing (zero rows) |

### 5.4 Department scoping

`scopeToDepartment` resolves the department a request operates on:

| Caller | Behaviour |
| ------ | --------- |
| `SUPER_ADMIN` | May name a department via path `:departmentId`, `?departmentId=`, or a `departmentId` body field. Falls back to their own. If neither resolves → `400` "departmentId is required for a super admin". |
| Anyone else | Pinned to `users.department_id`. Naming a **different** department → `403` `CROSS_DEPARTMENT`. |
| Anyone else with no department | `403` `FORBIDDEN` — "Your account is not attached to a department". |

Applied to: **all `/tickets` routes** and **all `/admin/departments/:departmentId/*` routes**.
Deliberately *not* applied to `/auth/me` (so a user with no department can discover that) nor
to `/admin/meta`, `GET /admin/departments`, `POST /admin/departments` (cross-department by
nature — visibility there is enforced in SQL instead).

### 5.5 Row-level visibility on tickets

`assertSameDepartment` in
[controllers/ticket.controller.js:405](src/module/helpdesk/controllers/ticket.controller.js#L405):

- `SUPER_ADMIN` — no restriction.
- Ticket in another department → **`404` Ticket not found** (not 403 — a 403 would confirm
  the ticket exists).
- `EMPLOYEE` reading someone else's ticket → **`404` Ticket not found**.
- `GET /tickets` forces `requesterUserId = req.user.id` for `EMPLOYEE`, overriding whatever
  the query string asked for.

Applied by: `GET /tickets/:id`, `/timeline`, `/transitions` (GET), `POST /:id/read`,
`POST /:id/transitions`, `POST /:id/notes`, and all collaboration routes.
**Not** applied by `PATCH /:id/assignment`, `/classification`, `/priority` — see
[Known Issues](#backend-api-notes--known-issues) #4.

### 5.6 Feature gating

`requireFeature(CODE)` reads `department_features` for `req.departmentId`.
**A missing row means NOT ENABLED.** Failure → `403` with `code: "FEATURE_DISABLED"` and
`details.featureCode`.

| Endpoint | Required feature |
| -------- | ---------------- |
| `POST /tickets/:id/snooze` | `SNOOZE` |
| `POST /tickets/:id/collaborations` | `COLLABORATION` |
| `PATCH /tickets/:id/collaborations/:collaborationId` | `COLLABORATION` |
| `POST /tickets/:id/collaborations/:collaborationId/notes` | `COLLABORATION` |
| `POST /out-of-office` | `OOO_DELEGATION` |
| `POST /out-of-office/:id/replace` | `OOO_DELEGATION` |
| `POST /admin/departments/:departmentId/out-of-office` | `OOO_DELEGATION` |
| `POST /admin/departments/:departmentId/out-of-office/:id/replace` | `OOO_DELEGATION` |

`GET /tickets/:id/collaborations` is **deliberately ungated** — disabling a feature is
forward-only, so records created while it was on stay readable.

**The same rule shapes out-of-office, and more sharply.** Only the two verbs that *create* a
record are gated. `activate`, `cancel` and every read are not — a department that switches
`OOO_DELEGATION` off must still be able to see, activate, cancel and hand over the windows it
already has. The routing engine and the scheduler carry no feature check either, so an open
delegation is never stranded mid-leave by a settings change.

---

## 6. Validation, Pagination, Sorting, Filtering, Search

### 6.1 Validation

`validate({ body, query, params })`
([middleware/validation.middleware.js](src/module/helpdesk/middleware/validation.middleware.js))
runs a zod schema and **replaces** the parsed target. A field absent from the schema cannot
reach a service.

Failure → **`422`**:

```json
{
  "success": false,
  "message": "Validation failed for request body",
  "code": "VALIDATION_ERROR",
  "details": {
    "subject": ["String must contain at least 1 character(s)"],
    "priorityId": ["Invalid uuid"]
  }
}
```

`message` names which target failed: `request body`, `request query`, or `request params`.

Repeated query parameters (`?state=NEW&state=IN_PROGRESS`) arrive as arrays and are accepted
wherever the table below says *string or string[]*.

**Query-string booleans** accept `true`, `false`, `1`, `0`, `""` or a real boolean. Only
`true` and `1` mean true — `?openOnly=false` genuinely means false.

### 6.2 Pagination

Constants ([constant/index.js](src/module/helpdesk/constant/index.js#L68)):

| Item | Value |
| ---- | ----- |
| `page` parameter | `page`, integer ≥ 1, default **1** |
| Page-size parameter | `limit`, integer ≥ 1, default **25**, maximum **200** |
| Over-max `limit` | `422` `VALIDATION_ERROR` (zod `.max(200)` rejects it) |
| Response metadata | `meta.page`, `meta.limit`, `meta.total`, `meta.totalPages` |

`total` is computed in the same round trip as the page (`count(*) OVER ()`), so it reflects
the same filters.

Paginated endpoints: `GET /tickets`, `GET /admin/departments`.

### 6.3 Sorting

`?sort=<column>:<asc|desc>` — direction defaults to `asc`; anything that is not `desc`
(case-insensitive) is treated as `asc`.

| Endpoint | Sortable columns | Default |
| -------- | ---------------- | ------- |
| `GET /tickets` | `created_at`, `updated_at`, `last_activity_at`, `ticket_number`, `resolved_at`, `closed_at` | `created_at DESC` |
| `GET /admin/departments` | `code`, `name`, `status`, `created_at`, `updated_at` | `code ASC` |

An unlisted column → **`400`** `BAD_REQUEST`, `"Cannot sort by 'foo'"`, with
`details.allowed` naming the legal set.

On `GET /tickets`, **unread tickets rank above `sort`** unless `?unreadFirst=false`.

### 6.4 Searching

Only `?search=` on the two list endpoints:

| Endpoint | Behaviour |
| -------- | --------- |
| `GET /tickets` | `subject ILIKE %term%` **OR** `ticket_number ILIKE %term%`. 1–200 chars. |
| `GET /admin/departments` | `code ILIKE %term%` **OR** `name ILIKE %term%`. Max 150 chars. |

There is no full-text search, no description search, and no global search endpoint.

---

## 7. Concurrency — `expectedVersion` and `If-Match`/ETag

Two different mechanisms. Do not mix them up.

### 7.1 Tickets — `expectedVersion` in the body

`tickets.version` is an integer bumped on every write. Send the `version` you read:

```json
{ "priorityId": "…", "expectedVersion": 4 }
```

- Mismatch → **`409`** `CONCURRENT_MODIFICATION` — *"This ticket was modified by someone
  else — reload and try again"*.
- **Omitting it skips the check.** Acceptable for a single-user tool; wrong for a shared queue.

Accepted on: `POST /tickets/:id/transitions`, `PATCH /tickets/:id/assignment`,
`PATCH /tickets/:id/classification`, `PATCH /tickets/:id/priority`.

### 7.2 Admin configuration — `ETag` + `If-Match` (mandatory)

Configuration tables have no `version` column, so `updated_at` is the token, exposed as an
ETag ([shared/etag.utils.js](src/module/helpdesk/shared/etag.utils.js)).

The token is `extract(epoch FROM updated_at)` — a decimal string with microsecond precision,
e.g. `1756123456.789012`.

```http
GET /api/helpdesk/admin/departments/0198…/settings
→ 200
   ETag: "1756123456.789012"

PATCH /api/helpdesk/admin/departments/0198…/settings
   If-Match: "1756123456.789012"
```

| Situation | Response |
| --------- | -------- |
| `If-Match` absent, or `*`, or sent more than once | **`428`** `PRECONDITION_REQUIRED` — *"An If-Match header is required to modify this …"* |
| `If-Match` not a number (`^\d+(\.\d+)?$` after stripping `W/` and quotes) | **`400`** `BAD_REQUEST` — *"If-Match is not a valid ETag for this …"* |
| Token does not match the stored row | **`409`** `CONCURRENT_MODIFICATION` |
| Row does not exist in this department | **`404`** |

A missing header is **refused, never treated as "overwrite"**. Weak tags (`W/"…"`) and
surrounding quotes are tolerated.

`If-Match` is required by: `PATCH /admin/departments/:id`, `POST …/activate`,
`POST …/deactivate`, `PATCH …/settings`, `PATCH …/features/:code`, `DELETE …/features/:code`.

Endpoints that **return** an `ETag` header: `POST /admin/departments`,
`GET /admin/departments/:id`, `PATCH /admin/departments/:id`, `POST …/activate`,
`POST …/deactivate`, all three `…/settings` verbs, and `POST`/`PATCH`/`DELETE` on
`…/features`. `GET …/features` does **not** set one (it is a collection — use each row's own
`etag` field). `GET /admin/departments` (list) does not set one either; each row carries `etag`.

> Every ETag-bearing row also carries the token as a **`etag` field in the JSON body**, so a
> client that cannot read the header can still use the body value.

**Out-of-office is the one admin-side resource with no token at all** — no `ETag` header, no
`etag` field, and `If-Match` is neither required nor accepted on any of its twelve routes.
`user_out_of_office` carries `created_at` only, so the token this section is built on does not
exist for it. That is also *why* there is no `PATCH` on it: the table is insert/cancel, and a
delegate change is `POST /:id/replace` — `cancel(HANDOVER)` + `create` in one transaction, which
needs no token. See [§11.11](#1111-out-of-office).

---

## 8. Rate Limits

[middleware/rate-limit.middleware.js](src/module/helpdesk/middleware/rate-limit.middleware.js).
Keyed by `req.user.id` when authenticated, otherwise by IP (IPv6 normalised to a /64).
Standard `RateLimit-*` headers are returned (`standardHeaders: true`, legacy headers off).

| Limiter | Window | Max | Applies to |
| ------- | ------ | --- | ---------- |
| Global | `HELPDESK_RATE_LIMIT_WINDOW_MS`, default **60 s** | `HELPDESK_RATE_LIMIT_MAX`, default **300** | every `/api/helpdesk/*` request, including `/health` |
| Write | 60 s | **60** | all `/tickets` write verbs (everything below `router.use(writeRateLimiter)`) **and every `/admin/*` route including its GETs** |
| External call | 60 s | **20** | `POST /tickets/:id/replies` only |

Exceeded → **`429`**:

```json
{ "success": false, "message": "Too many write requests, please slow down", "code": "TOO_MANY_REQUESTS" }
```

Messages differ per limiter: `"Too many requests, please try again later"` (global),
`"Too many write requests, please slow down"` (write),
`"Request limit exceeded for this operation"` (external).

---

## 9. CORS & Headers

Configured inside the helpdesk router
([routes/index.js:41](src/module/helpdesk/routes/index.js#L41)):

| Setting | Value |
| ------- | ----- |
| `origin` | `HELPDESK_CORS_ORIGINS` (comma-separated). Empty → reflect any origin. |
| `methods` | `GET, POST, PUT, PATCH, DELETE, OPTIONS` |
| `allowedHeaders` | `Authorization`, `Content-Type`, `If-Match`, and the identity header (`x-user-email`) |
| `exposedHeaders` | **`ETag`**, **`x-request-id`** |
| `credentials` | `false` — this API never uses cookies |
| `maxAge` | 600 |

> The CRM app mounts a bare `cors()` **before** this router, so the OPTIONS preflight is
> answered by the permissive one. The actual request is still restricted.

### Request headers

| Header | Required | Description |
| ------ | -------- | ----------- |
| `x-user-email` | Yes in `header` mode | The caller's email address. Exactly one value. |
| `Authorization` | Yes in `jwt` mode | `Bearer <token>`. |
| `Content-Type` | Yes on any request with a body | `application/json`. Body limit **10 MB**. |
| `If-Match` | Yes on admin mutations | The ETag from the last read. |
| `x-request-id` | No | Honoured if sent (first 64 chars), otherwise generated. |

### Response headers

| Header | Always | Description |
| ------ | ------ | ----------- |
| `x-request-id` | Yes | Correlates every `audit_logs` row written by the call. **Log it and show it on 5xx.** |
| `ETag` | On the admin endpoints listed in §7.2 | The concurrency token. |
| `RateLimit-*` | Yes | Standard rate-limit headers. |

---

## 10. Enums and Constants

Served live by **`GET /admin/meta/enums`** — prefer that over hardcoding. Values below are
from [config/enums.js](src/module/helpdesk/config/enums.js), which mirrors the database CHECK
constraints.

### Role codes — `roleCode`

| Value | Meaning |
| ----- | ------- |
| `EMPLOYEE` | Requester |
| `SPOC` | Single point of contact / agent |
| `MANAGER` | Manager |
| `DEPT_ADMIN` | Department administrator |
| `DEPT_HEAD` | Department head |
| `SUPER_ADMIN` | Cross-department administrator |

### User status — `USER_STATUS`

| Value | Meaning |
| ----- | ------- |
| `ACTIVE` | May use the API |
| `INACTIVE` | Refused with `403` |
| `SUSPENDED` | Refused with `403` |
| `OFFBOARDED` | Refused with `403` |

### User type — `USER_TYPE`

| Value | Meaning |
| ----- | ------- |
| `EMPLOYEE` | A person |
| `SERVICE` | A service principal |
| `SYSTEM` | A system principal |

### Feature codes — `featureCode`

| Value | Gates |
| ----- | ----- |
| `SNOOZE` | `POST /tickets/:id/snooze` |
| `COLLABORATION` | the three collaboration write verbs |
| `AI_CLASSIFICATION` | email-intake classification (no HTTP endpoint) |
| `EXTERNAL_INTAKE` | declared; **read by nothing today** |
| `EX_EMPLOYEE_INTAKE` | declared; **read by nothing today** |
| `OOO_DELEGATION` | `POST /out-of-office` and `POST /out-of-office/:id/replace`, plus their two admin twins — **the create verbs only**, see [§11.11](#1111-out-of-office) |

### Department status — `departmentStatus`

| Value | Meaning |
| ----- | ------- |
| `DRAFT` | Being assembled. Not live: no intake, no tickets, no auto-provisioning. |
| `READY` | Readiness checks pass. Still not live. |
| `ACTIVE` | Operational. The only status where `departments.is_active = true`. |
| `INACTIVE` | Out of service. Existing tickets stay workable; nothing new arrives. |

### State category — `stateCategory`

| Value | Meaning |
| ----- | ------- |
| `OPEN` | Being worked |
| `PENDING` | Waiting on someone |
| `RESOLVED` | Answered, in the review window |
| `CLOSED` | Finished |

### Ticket source — `sourceCode`

| Value | Meaning |
| ----- | ------- |
| `EMAIL` | Arrived at the support mailbox |
| `PORTAL` | Raised in the web portal (**default for `POST /tickets`**) |
| `MANUAL` | Entered by an agent |
| `API` | Raised by an integration |
| `OTHER` | Anything else |

### Classification status — `classificationStatus`

| Value | Meaning | `category_id` | `ai_suggested_category_id` |
| ----- | ------- | ------------- | -------------------------- |
| `AI_SUGGESTED` | Model was confident | set | set |
| `AI_LOW_CONFIDENCE` | Model guessed below the threshold | **NULL** | set |
| `CONFIRMED` | A human agreed | set | — |
| `CORRECTED` | A human changed it | set | — |
| `UNCLASSIFIED` | Nobody and nothing labelled it | NULL | NULL |

### Collaboration status — `collaborationStatus`

| Value | Meaning | Accepted by `PATCH …/collaborations/:id`? |
| ----- | ------- | ----------------------------------------- |
| `OPEN` | Awaiting an answer | **No** — set only by `POST` |
| `ANSWERED` | Somebody replied; still unresolved | Yes |
| `CLOSED` | Settled | Yes |
| `EXPIRED` | Timed out | Yes |

`OPEN` and `ANSWERED` together are the **unresolved** set — the OLA stays paused while any
unresolved collaboration that pauses it remains.

### Participant role — `participantRole`

| Value | Meaning |
| ----- | ------- |
| `CONTRIBUTOR` | Default |
| `REVIEWER` | Asked to review |

### Body format — `bodyFormat`

| Value | Meaning |
| ----- | ------- |
| `HTML` | Default for `POST /tickets/:id/replies` |
| `TEXT` | Plain text |

### Activity type — `activityType` (values that appear on a timeline)

`TICKET_CREATED`, `ASSIGNED`, `REASSIGNED`, `RECLASSIFIED`, `DELEGATED`,
`OOO_DELEGATION_BLOCKED`, `OOO_REVERT_BLOCKED`, `STATE_CHANGED`,
`CATEGORY_CHANGED`, `PRIORITY_CHANGED`, `CLASSIFICATION_CONFIRMED`,
`CLASSIFICATION_CORRECTED`, `EMAIL_RECEIVED`, `EMAIL_SENT`, `INTERNAL_NOTE`,
`COLLABORATION_REQUESTED`, `COLLABORATION_NOTE`, `COLLABORATION_CLOSED`, `SNOOZED`,
`SNOOZE_ENDED`, `OLA_ESCALATED`, `OLA_RETARGETED`, `OLA_BREACHED`, `RESOLVED`, `CLOSED`,
`REOPENED`, `ATTACHMENT_ADDED`.

**The two `*_BLOCKED` rows are the ones a queue screen has to explain**, because both mean work
did *not* move where a cover arrangement said it should. Both are `INTERNAL`:

| Value | What happened | Where the ticket ended up |
| ----- | ------------- | ------------------------- |
| `OOO_DELEGATION_BLOCKED` | Routing found the owner out and the cover chain dead-ended, while the window said new work may not land on them. | **Unassigned** — a queue somebody looks at, rather than the inbox of somebody on leave. |
| `OOO_REVERT_BLOCKED` | A window ended under `RETURN_TO_OWNER`, but the owner is no longer an ACTIVE, assignable member of the department. | **Stays with the delegate.** The department's administrators are notified. |

### Visibility — `visibility`

| Value | Who sees it |
| ----- | ----------- |
| `EMPLOYEE` | Requester-facing. The only rows an `EMPLOYEE` role gets on `/timeline`. |
| `INTERNAL` | Agents only. Forced for `INTERNAL_NOTE` and `COLLABORATION_NOTE` by CHECK constraint. |
| `SYSTEM` | Bookkeeping. |

`EMAIL_SENT` and `EMAIL_RECEIVED` are pinned to `EMPLOYEE` by CHECK constraint.

### Actor type — `actorType`

`USER`, `SYSTEM`, `SCHEDULER`, `EMAIL`. An API request is always `USER`.

### Assignment type — `assignmentType`

`RULE`, `LEAST_LOADED`, `BACKUP`, `MANUAL`, `RECLASSIFICATION`, `OOO_DELEGATION`,
`OOO_REVERT`, `ESCALATION`. `PATCH /tickets/:id/assignment` always writes `MANUAL`.

### Notification event codes (`notifications.event_code`)

`OLA_WARNING`, `OLA_ESCALATED`, `OLA_BREACHED`, `OLA_EVALUATION_FAILED`,
`AUTO_CLOSE_WARNING`, `TICKET_AUTO_CLOSED`, `TICKET_ASSIGNED`, `OOO_DELEGATED`,
`OOO_REVERTED`, `OOO_REVERT_BLOCKED`, `SNOOZE_ENDED`, `EMAIL_RECEIVED`, `COLLABORATION_REPLY`,
`COLLABORATION_REQUESTED`, `COLLABORATION_CLOSED`.

`OOO_REVERT_BLOCKED` and `OLA_EVALUATION_FAILED` are the module's **two operational alerts**:
their audience is the department's administrators (`DEPT_ADMIN`, `DEPT_HEAD`, and
`departments.head_user_id`), not the people on the ticket, because both describe a
configuration fault nobody on the ticket can fix.

`EMAIL_RECEIVED` is **the unread badge** — the only code the unread counters on
`GET /tickets` and `GET /tickets/counts` consider.

### Department settings vocabularies

| Enum | Values |
| ---- | ------ |
| `ticketNumberReset` | `NEVER`, `YEARLY`, `MONTHLY` |
| `assignmentStrategy` | `RULE_BASED`, `MANUAL` |
| `olaStartTrigger` | `ON_CREATE`, `ON_ASSIGN` |
| `reopenAction` | `REOPEN_SAME_TICKET`, `NEW_LINKED_TICKET` |
| `oooActivationPolicy` | `NEW_TICKETS_ONLY`, `ALL_ACTIVE_TICKETS`, `MANUAL` |
| `oooExpiryPolicy` | `KEEP_DELEGATE`, `RETURN_TO_OWNER` |
| `oooReason` | `LEAVE`, `TRAVEL`, `TRAINING`, `OTHER` |
| `oooCancelMode` | `RETURNED`, `HANDOVER` |

The first two are **department defaults** (`department_settings`) *and* per-record fields — a
create that omits them inherits the department's value. `oooCancelMode` is a request field on
`POST …/out-of-office/:id/cancel` only. See [§11.11](#1111-out-of-office).

There is also a **derived** `status` on out-of-office list rows — `ACTIVE`, `SCHEDULED`,
`AWAITING_ACTIVATION`, `EXPIRING`, `ENDED`, `CANCELLED`. It is computed in SQL from the
record's five timestamps, is **not** a column, and is **not** in `/admin/meta/enums`.

### OLA vocabularies

| Enum | Values |
| ---- | ------ |
| `olaTargetType` | `RESPONSE`, `RESOLUTION` |
| `escalateToType` | `USER`, `ROLE`, `ASSIGNEE_MANAGER`, `DEPT_HEAD`, `BACKUP`, `ROUTING_ESCALATION` |
| `olaEventType` | `START`, `PAUSE`, `RESUME`, `WARNING`, `ESCALATION`, `BREACH`, `EXTENSION`, `RETARGET`, `STOP`, `INTERVENTION_REQUIRED` |
| `olaPauseReason` | `PENDING`, `COLLABORATION`, `SNOOZE`, `MANUAL` |

### Email intake vocabularies

| Enum | Values |
| ---- | ------ |
| `inboundStatus` | `UNPROCESSED`, `TICKET_CREATED`, `REPLY_ATTACHED`, `COLLABORATION_ATTACHED`, `REVIEW_REQUIRED`, `CLASSIFIED`, `UNCLASSIFIED`, `IGNORED` |
| `senderClassification` | `INTERNAL`, `EXTERNAL`, `EX_EMPLOYEE`, `UNKNOWN` |
| `reviewDecision` | `CLASSIFY`, `UNCLASSIFY`, `IGNORE` |

### Other vocabularies exposed by `/admin/meta/enums`

| Enum | Values |
| ---- | ------ |
| `routingStrategy` | `DIRECT`, `LEAST_LOADED` |
| `labelSource` | `SEED`, `REVIEWER_CLASSIFICATION`, `SPOC_CORRECTION`, `SPOC_CONFIRMED`, `IMPLICIT_CONFIRMED` |
| `snoozeEndTrigger` | `EXPIRED`, `MANUAL`, `REPLY_RECEIVED` |
| `notificationChannel` | `EMAIL`, `PUSH`, `IN_APP` |
| `notificationStatus` | `PENDING`, `SENT`, `FAILED` |
| `auditAction` | `CREATE`, `UPDATE`, `DELETE`, `EXECUTE` |

### Priority — a **table**, not an enum

`priorities` rows are per-department (or platform-wide with `department_id IS NULL`). They
are **not** in `config/enums.js` and there is **no endpoint to list them** today — see
[Known Issues](#backend-api-notes--known-issues) #1.

**`severity_rank` ascends with urgency in this project**: `LOW(1) < NORMAL(2) < HIGH(3)`.
For "most urgent first", sort **descending**. `GET /admin/meta/enums` returns this as
`conventions.severityRank` so the UI need not guess:

```json
{
  "severityRank": {
    "order": "HIGHER_IS_MORE_SEVERE",
    "sortForMostUrgentFirst": "DESC",
    "note": "priorities.severity_rank ascends with urgency in this project: LOW(1) < NORMAL(2) < HIGH(3)."
  }
}
```

### Workflow states — configuration, fetched once

Not an enum: per-department, versioned rows. Fetch them **once** from `GET /auth/me` as
`workflowStates` and cache in the frontend store. There is deliberately **no
`/workflow-states` endpoint** and the state **uuid is never published**.

---

---

## 11. Endpoint Reference

Every path below is relative to **`/api/helpdesk`**.

---

### 11.1 System

#### `GET /health`

**Purpose** — Liveness plus a schema check. Tells a deployment (or a frontend boot screen)
whether the helpdesk database is reachable and migrated, without waiting for a real request
to fail.

**Authentication** — Required: **No**. Deliberately anonymous. Still subject to the global
rate limiter.

**Path Parameters** — `None`

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| — | — | None required |

**Request Body** — `None`

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Helpdesk is up",
  "data": {
    "database": "helpdesk_dev",
    "schema": "helpdesk",
    "table_count": 37,
    "latencyMs": 4
  }
}
```

The exact keys inside `data` come from `db.healthCheck()`; `database`, `schema`,
`table_count` and `latencyMs` are the ones the module logs and reads.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `503` | `SERVICE_UNAVAILABLE` | Database unreachable or misconfigured. |
| `429` | `TOO_MANY_REQUESTS` | Global limiter exceeded. |

```json
{
  "success": false,
  "message": "password authentication failed for user \"postgres\"",
  "code": "SERVICE_UNAVAILABLE",
  "data": { "database": "unreachable" }
}
```

> Note the unusual shape: this is the **only** endpoint that returns `data` on an error
> envelope, and it never routes through the error handler — a health check that 500s tells an
> operator nothing.

**Frontend Usage** — Optional boot probe, or a status widget. Do not poll it aggressively;
it counts against the global limit.

**Dependencies / Related APIs** — None.

---

### 11.2 Identity

#### `GET /auth/me`

**Purpose** — *Who am I, according to the helpdesk?* **Call this once on mount.** It confirms
the identity handoff works and returns everything the UI needs to decide what to render: the
role, the department, the permission list, and the department's **workflow state vocabulary**.

This is the **only** source of workflow states. Cache `workflowStates` in the frontend store
and reuse it for every state filter and every dropdown.

**Authentication** — Required: **Yes**. Type: header or JWT (see §4).
Required role: none. Required permission: none.

> This route runs `authenticate` **without** `scopeToDepartment`, on purpose: a user whose
> account has no department must be able to call `/me` and discover exactly that, instead of
> receiving an opaque `403` from the one endpoint that could explain it.

**Path Parameters** — `None`

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `x-user-email` | Yes (header mode) | Caller's email |
| `Authorization` | Yes (jwt mode) | `Bearer <token>` |

**Request Body** — `None`

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "user": {
      "id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "email": "manish.pandey@gera.in",
      "fullName": "Manish Pandey",
      "departmentId": "0198f5a0-1111-7000-9aaa-0c1d2e3f4a5b",
      "roleId": "0198f5a0-2222-7000-9aaa-0c1d2e3f4a5b",
      "roleCode": "SPOC",
      "managerUserId": null,
      "isAssignable": true,
      "permissions": [
        "helpdesk.department.read",
        "helpdesk.settings.read",
        "helpdesk.feature.read",
        "helpdesk.ooo.write",
        "helpdesk.corpus.write"
      ]
    },
    "authMode": "header",
    "workflowStates": [
      {
        "code": "NEW",
        "name": "New",
        "category": "OPEN",
        "isInitial": true,
        "isResolved": false,
        "isClosed": false,
        "isTerminal": false,
        "countsAsActiveWorkload": true,
        "displayOrder": 1
      },
      {
        "code": "IN_PROGRESS",
        "name": "In Progress",
        "category": "OPEN",
        "isInitial": false,
        "isResolved": false,
        "isClosed": false,
        "isTerminal": false,
        "countsAsActiveWorkload": true,
        "displayOrder": 2
      }
    ]
  }
}
```

**Response fields**

| Field | Type | Description |
| ----- | ---- | ----------- |
| `user.id` | uuid | The caller's `users.id`. Use it to detect "my tickets". |
| `user.departmentId` | uuid \| null | **`null` means the account has no department** — every `/tickets` and `/admin/departments/:id` call will then return `403`. Render an onboarding message. |
| `user.roleCode` | enum | Drives the agent-vs-requester UI. See [Role codes](#role-codes--rolecode). |
| `user.isAssignable` | boolean | Whether this user can receive tickets. Auto-provisioned users are `false`. |
| `user.permissions` | string[] | **Drive the admin menu from this array.** Empty for `EMPLOYEE`. |
| `authMode` | `"header"` \| `"jwt"` | Which identity path the backend is running. Useful in dev. |
| `workflowStates` | array | The department's state vocabulary. **Empty array when `departmentId` is null.** |
| `workflowStates[].code` | string | **The API identifier for a state.** Send this as `?state=`. |
| `workflowStates[].name` | string | Display label. For an `EMPLOYEE` this is `requester_facing_label` when one is configured, otherwise `name`. |
| `workflowStates[].category` | enum | `OPEN` / `PENDING` / `RESOLVED` / `CLOSED`. |
| `workflowStates[].isInitial` / `isResolved` / `isClosed` / `isTerminal` | boolean | Lifecycle flags for badges and grouping. |
| `workflowStates[].countsAsActiveWorkload` | boolean | Whether a ticket in this state counts toward an agent's load. |
| `workflowStates[].displayOrder` | number | Render order. The array is already sorted by it. |

> **There is deliberately no `id` on a workflow state.** A state's uuid belongs to one
> workflow *version*, and each ticket is pinned to the version it was created under.
> Publishing version 2 would silently break any filter holding a single uuid.

> **An `EMPLOYEE` sees a filtered vocabulary**: states with `requester_visible = false` are
> omitted entirely, and labels come from `requester_facing_label`. An agent and a requester
> looking at the same department get different arrays. Do not cache one for the other.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `401` | `UNAUTHORIZED` | Missing/invalid identity, expired token, or unknown user with auto-provisioning off. |
| `403` | `FORBIDDEN` | Account is not `ACTIVE` — `"Account is offboarded"`. |
| `500` | `INTERNAL_ERROR` | `HELPDESK_AUTH_MODE=header` in production; or JWT secret unset. |
| `503` | `SERVICE_UNAVAILABLE` | Database unreachable. |

**Frontend Usage** — First call after the host app authenticates. Store the result; branch
the entire UI off `roleCode`, `departmentId` and `permissions`.

**Dependencies / Related APIs** — Everything. `workflowStates` feeds `GET /tickets?state=`
and `GET /tickets/counts`. `permissions` decides whether to show `/admin/*` at all.

---

### 11.3 Admin — Meta

#### `GET /admin/meta/enums`

**Purpose** — Every controlled vocabulary the admin UI needs, served from the same
`config/enums.js` that mirrors the database CHECK constraints. **Use this instead of
hardcoding enum lists** — a widened CHECK then reaches the UI without a frontend deploy.

Also returns `conventions`, which carries facts a CHECK constraint cannot express — today,
the `severity_rank` sort direction.

**Authentication** — Required: **Yes**.
Required permission: **`helpdesk.department.read`**.
Required role: none directly — but `EMPLOYEE` holds no permissions, so an `EMPLOYEE` gets
`403`, which is the correct answer for a requester with no admin UI to render.

Cross-department: this route does **not** run `scopeToDepartment` (a CHECK constraint is
identical in every department).

**Path Parameters** — `None`

**Query Parameters** — `None`

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "vocabularies": {
      "userType": { "EMPLOYEE": "EMPLOYEE", "SERVICE": "SERVICE", "SYSTEM": "SYSTEM" },
      "userStatus": { "ACTIVE": "ACTIVE", "INACTIVE": "INACTIVE", "SUSPENDED": "SUSPENDED", "OFFBOARDED": "OFFBOARDED" },
      "roleCode": { "EMPLOYEE": "EMPLOYEE", "SPOC": "SPOC", "MANAGER": "MANAGER", "DEPT_ADMIN": "DEPT_ADMIN", "DEPT_HEAD": "DEPT_HEAD", "SUPER_ADMIN": "SUPER_ADMIN" },
      "featureCode": { "EXTERNAL_INTAKE": "EXTERNAL_INTAKE", "EX_EMPLOYEE_INTAKE": "EX_EMPLOYEE_INTAKE", "OOO_DELEGATION": "OOO_DELEGATION", "SNOOZE": "SNOOZE", "COLLABORATION": "COLLABORATION", "AI_CLASSIFICATION": "AI_CLASSIFICATION" },
      "departmentStatus": { "DRAFT": "DRAFT", "READY": "READY", "ACTIVE": "ACTIVE", "INACTIVE": "INACTIVE" },
      "ticketNumberReset": { "NEVER": "NEVER", "YEARLY": "YEARLY", "MONTHLY": "MONTHLY" },
      "assignmentStrategy": { "RULE_BASED": "RULE_BASED", "MANUAL": "MANUAL" },
      "olaStartTrigger": { "ON_CREATE": "ON_CREATE", "ON_ASSIGN": "ON_ASSIGN" },
      "reopenAction": { "REOPEN_SAME_TICKET": "REOPEN_SAME_TICKET", "NEW_LINKED_TICKET": "NEW_LINKED_TICKET" },
      "oooActivationPolicy": { "NEW_TICKETS_ONLY": "NEW_TICKETS_ONLY", "ALL_ACTIVE_TICKETS": "ALL_ACTIVE_TICKETS", "MANUAL": "MANUAL" },
      "oooExpiryPolicy": { "KEEP_DELEGATE": "KEEP_DELEGATE", "RETURN_TO_OWNER": "RETURN_TO_OWNER" },
      "oooReason": { "LEAVE": "LEAVE", "TRAVEL": "TRAVEL", "TRAINING": "TRAINING", "OTHER": "OTHER" },
      "oooCancelMode": { "RETURNED": "RETURNED", "HANDOVER": "HANDOVER" },
      "stateCategory": { "OPEN": "OPEN", "PENDING": "PENDING", "RESOLVED": "RESOLVED", "CLOSED": "CLOSED" },
      "actorType": { "USER": "USER", "SYSTEM": "SYSTEM", "SCHEDULER": "SCHEDULER", "EMAIL": "EMAIL" },
      "routingStrategy": { "DIRECT": "DIRECT", "LEAST_LOADED": "LEAST_LOADED" },
      "olaTargetType": { "RESPONSE": "RESPONSE", "RESOLUTION": "RESOLUTION" },
      "escalateToType": { "USER": "USER", "ROLE": "ROLE", "ASSIGNEE_MANAGER": "ASSIGNEE_MANAGER", "DEPT_HEAD": "DEPT_HEAD", "BACKUP": "BACKUP", "ROUTING_ESCALATION": "ROUTING_ESCALATION" },
      "olaEventType": { "START": "START", "PAUSE": "PAUSE", "RESUME": "RESUME", "WARNING": "WARNING", "ESCALATION": "ESCALATION", "BREACH": "BREACH", "EXTENSION": "EXTENSION", "RETARGET": "RETARGET", "STOP": "STOP", "INTERVENTION_REQUIRED": "INTERVENTION_REQUIRED" },
      "olaPauseReason": { "PENDING": "PENDING", "COLLABORATION": "COLLABORATION", "SNOOZE": "SNOOZE", "MANUAL": "MANUAL" },
      "inboundStatus": { "UNPROCESSED": "UNPROCESSED", "TICKET_CREATED": "TICKET_CREATED", "REPLY_ATTACHED": "REPLY_ATTACHED", "COLLABORATION_ATTACHED": "COLLABORATION_ATTACHED", "REVIEW_REQUIRED": "REVIEW_REQUIRED", "CLASSIFIED": "CLASSIFIED", "UNCLASSIFIED": "UNCLASSIFIED", "IGNORED": "IGNORED" },
      "senderClassification": { "INTERNAL": "INTERNAL", "EXTERNAL": "EXTERNAL", "EX_EMPLOYEE": "EX_EMPLOYEE", "UNKNOWN": "UNKNOWN" },
      "bodyFormat": { "HTML": "HTML", "TEXT": "TEXT" },
      "reviewDecision": { "CLASSIFY": "CLASSIFY", "UNCLASSIFY": "UNCLASSIFY", "IGNORE": "IGNORE" },
      "ticketSource": { "EMAIL": "EMAIL", "PORTAL": "PORTAL", "MANUAL": "MANUAL", "API": "API", "OTHER": "OTHER" },
      "classificationStatus": { "AI_SUGGESTED": "AI_SUGGESTED", "AI_LOW_CONFIDENCE": "AI_LOW_CONFIDENCE", "CONFIRMED": "CONFIRMED", "CORRECTED": "CORRECTED", "UNCLASSIFIED": "UNCLASSIFIED" },
      "labelSource": { "SEED": "SEED", "REVIEWER_CLASSIFICATION": "REVIEWER_CLASSIFICATION", "SPOC_CORRECTION": "SPOC_CORRECTION", "SPOC_CONFIRMED": "SPOC_CONFIRMED", "IMPLICIT_CONFIRMED": "IMPLICIT_CONFIRMED" },
      "assignmentType": { "RULE": "RULE", "LEAST_LOADED": "LEAST_LOADED", "BACKUP": "BACKUP", "MANUAL": "MANUAL", "RECLASSIFICATION": "RECLASSIFICATION", "OOO_DELEGATION": "OOO_DELEGATION", "OOO_REVERT": "OOO_REVERT", "ESCALATION": "ESCALATION" },
      "activityType": { "TICKET_CREATED": "TICKET_CREATED", "ASSIGNED": "ASSIGNED", "REASSIGNED": "REASSIGNED", "RECLASSIFIED": "RECLASSIFIED", "DELEGATED": "DELEGATED", "OOO_DELEGATION_BLOCKED": "OOO_DELEGATION_BLOCKED", "OOO_REVERT_BLOCKED": "OOO_REVERT_BLOCKED", "STATE_CHANGED": "STATE_CHANGED", "CATEGORY_CHANGED": "CATEGORY_CHANGED", "PRIORITY_CHANGED": "PRIORITY_CHANGED", "CLASSIFICATION_CONFIRMED": "CLASSIFICATION_CONFIRMED", "CLASSIFICATION_CORRECTED": "CLASSIFICATION_CORRECTED", "EMAIL_RECEIVED": "EMAIL_RECEIVED", "EMAIL_SENT": "EMAIL_SENT", "INTERNAL_NOTE": "INTERNAL_NOTE", "COLLABORATION_REQUESTED": "COLLABORATION_REQUESTED", "COLLABORATION_NOTE": "COLLABORATION_NOTE", "COLLABORATION_CLOSED": "COLLABORATION_CLOSED", "SNOOZED": "SNOOZED", "SNOOZE_ENDED": "SNOOZE_ENDED", "OLA_ESCALATED": "OLA_ESCALATED", "OLA_RETARGETED": "OLA_RETARGETED", "OLA_BREACHED": "OLA_BREACHED", "RESOLVED": "RESOLVED", "CLOSED": "CLOSED", "REOPENED": "REOPENED", "ATTACHMENT_ADDED": "ATTACHMENT_ADDED" },
      "visibility": { "EMPLOYEE": "EMPLOYEE", "INTERNAL": "INTERNAL", "SYSTEM": "SYSTEM" },
      "collaborationStatus": { "OPEN": "OPEN", "ANSWERED": "ANSWERED", "CLOSED": "CLOSED", "EXPIRED": "EXPIRED" },
      "participantRole": { "CONTRIBUTOR": "CONTRIBUTOR", "REVIEWER": "REVIEWER" },
      "snoozeEndTrigger": { "EXPIRED": "EXPIRED", "MANUAL": "MANUAL", "REPLY_RECEIVED": "REPLY_RECEIVED" },
      "notificationChannel": { "EMAIL": "EMAIL", "PUSH": "PUSH", "IN_APP": "IN_APP" },
      "notificationStatus": { "PENDING": "PENDING", "SENT": "SENT", "FAILED": "FAILED" },
      "auditAction": { "CREATE": "CREATE", "UPDATE": "UPDATE", "DELETE": "DELETE", "EXECUTE": "EXECUTE" }
    },
    "conventions": {
      "severityRank": {
        "order": "HIGHER_IS_MORE_SEVERE",
        "sortForMostUrgentFirst": "DESC",
        "note": "priorities.severity_rank ascends with urgency in this project: LOW(1) < NORMAL(2) < HIGH(3)."
      }
    }
  }
}
```

Each vocabulary is an object whose keys and values are identical — iterate
`Object.values(...)` to build a dropdown.

> This is an **explicit whitelist**, not a dump of the enums module: helpers (`values`) and
> tuning constants (`LABEL_SOURCE_WEIGHT`) are deliberately excluded, so the payload is a
> stable contract.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `403` | `FORBIDDEN` | Caller lacks `helpdesk.department.read`. `details.required` lists it. |
| `429` | `TOO_MANY_REQUESTS` | Admin write limiter (60/min) — it covers admin GETs too. |
| `503` | `SERVICE_UNAVAILABLE` | Admin surface failed its startup authorization check (see §12.3), or the database is down. |

**Frontend Usage** — Fetch once when the admin area mounts; cache for the session.

**Dependencies / Related APIs** — Feeds every admin form. Pair with
`GET /admin/departments/:id/settings` and `…/features`.

---

### 11.4 Admin — Departments

> **Two zones.** `GET`/`POST /admin/departments` are **cross-department** and do **not** run
> `scopeToDepartment` — visibility is enforced in SQL instead (a non-`SUPER_ADMIN` sees only
> their own department, and `meta.total` counts only what they can see).
> Everything under `/admin/departments/:departmentId/…` **is** scoped: a non-`SUPER_ADMIN`
> naming a department other than their own gets `403` `CROSS_DEPARTMENT`.

---

#### `GET /admin/departments`

**Purpose** — List departments for the administration screen. **DRAFT, READY, ACTIVE and
INACTIVE are all returned** — lifecycle decides whether a department is *operational*, not
whether an administrator may *see* it.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.department.read`**.
A `SUPER_ADMIN` sees every department; anyone else sees exactly their own.

**Path Parameters** — `None`

**Query Parameters**

| Parameter | Type | Required | Default | Description |
| --------- | ---- | -------- | ------- | ----------- |
| `status` | enum \| enum[] | No | — | `DRAFT` \| `READY` \| `ACTIVE` \| `INACTIVE`. Repeatable: `?status=DRAFT&status=READY`. |
| `search` | string (≤150) | No | — | `code ILIKE %term%` OR `name ILIKE %term%`. Trimmed. |
| `includeDeleted` | boolean | No | `false` | Include soft-deleted departments. Soft-delete is **not** a lifecycle state; opt in explicitly. |
| `page` | integer ≥1 | No | `1` | |
| `limit` | integer 1–200 | No | `25` | |
| `sort` | string | No | `code ASC` | `code` \| `name` \| `status` \| `created_at` \| `updated_at`, with `:asc`/`:desc`. |

There is deliberately **no `isActive` filter**.

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "0198f5a0-1111-7000-9aaa-0c1d2e3f4a5b",
      "code": "HR",
      "name": "Human Resources",
      "status": "ACTIVE",
      "is_active": true,
      "parent_department_id": null,
      "head_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "support_email": "hr.support@gera.in",
      "business_calendar_id": "0198f59f-aaaa-7000-8000-000000000001",
      "default_priority_id": "01a018f5-6776-7081-b5cb-f574403a003e",
      "default_workflow_id": "0198f5a0-3333-7000-9aaa-0c1d2e3f4a5b",
      "created_at": "2026-02-09T06:11:02.114Z",
      "created_by": null,
      "updated_at": "2026-08-20T09:41:07.301Z",
      "updated_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "etag": "1787304067.301882"
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 2, "totalPages": 1 }
}
```

**Response fields**

| Field | Type | Description |
| ----- | ---- | ----------- |
| `code` | string | Upper-case identity, **immutable** after creation. Rendered into ticket numbers via `{DEPT}`. |
| `status` | enum | Lifecycle. See [Department status](#department-status--departmentstatus). |
| `is_active` | boolean | **Derived from `status`** and held to it by a CHECK constraint — `true` only when `ACTIVE`. Never send it. |
| `etag` | string | Concurrency token. Echo as `If-Match` when mutating **this** row. |

No `ETag` **header** is set on the list response — use each row's `etag` field.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `400` | `BAD_REQUEST` | `sort` names an unlisted column (`details.allowed`). |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `403` | `FORBIDDEN` | Missing `helpdesk.department.read`; **or** the caller is not `SUPER_ADMIN` and has no department — *"Your account is not attached to a department"*. |
| `422` | `VALIDATION_ERROR` | Bad `status` value, `limit` > 200, non-integer `page`. |

**Frontend Usage** — The department switcher for a `SUPER_ADMIN`, and the department
administration list. For a single-department admin it returns one row — use it to render the
header rather than a chooser.

**Dependencies / Related APIs** — `GET /admin/departments/:departmentId` for detail;
`GET …/readiness` to render the onboarding checklist.

---

#### `POST /admin/departments`

**Purpose** — Create a department. **Always lands in `DRAFT`** with `is_active = false`, and
creates its `department_settings` row from schema defaults in the same transaction — which is
what lets every later `PATCH` assume a row and therefore always have an ETag.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.department.create`**.
Seeded to `SUPER_ADMIN` only (`DEPT_ADMIN` is explicitly excluded).

**Path Parameters** — `None`

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `Content-Type` | Yes | `application/json` |
| `If-Match` | **No** | Not applicable — nothing exists yet. |

**Request Body**

```json
{
  "code": "FINANCE",
  "name": "Finance",
  "supportEmail": "finance.support@gera.in",
  "parentDepartmentId": null
}
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `code` | string | **Yes** | Immutable identity. Rendered into ticket numbers as `{DEPT}`. | Trimmed, 2–30 chars, `^[A-Z][A-Z0-9_]*$` — upper-case letters, digits and underscores, starting with a letter |
| `name` | string | **Yes** | Display name. Renameable later. | Trimmed, 1–150 |
| `supportEmail` | string \| null | No | The department's mailbox address. | Trimmed, valid email, ≤255. May be `null` |
| `parentDepartmentId` | uuid \| null | No | Hierarchy parent. Must exist. | uuid |

The schema is **`.strict()`**: any other key — including `status` — is a `422`, not a
silently ignored field.

**Success Response** — `201`, with an `ETag` header.

```json
{
  "success": true,
  "message": "Department created",
  "data": {
    "id": "0198f6b2-7777-7000-9aaa-0c1d2e3f4a5b",
    "code": "FINANCE",
    "name": "Finance",
    "status": "DRAFT",
    "is_active": false,
    "parent_department_id": null,
    "head_user_id": null,
    "support_email": "finance.support@gera.in",
    "business_calendar_id": null,
    "default_priority_id": null,
    "default_workflow_id": null,
    "created_at": "2026-08-26T10:02:11.907Z",
    "created_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
    "updated_at": "2026-08-26T10:02:11.907Z",
    "updated_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
    "etag": "1787738531.907441"
  }
}
```

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `400` | `BAD_REQUEST` | `parentDepartmentId` does not exist. |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `403` | `FORBIDDEN` | Missing `helpdesk.department.create`. |
| `409` | `CONFLICT` | Code already taken — *"A department with code FINANCE already exists"*, `details: { code, departmentId }`. |
| `422` | `VALIDATION_ERROR` | Bad `code` pattern, missing `name`, unknown key. |

**Frontend Usage** — Step 1 of the department onboarding wizard. Immediately afterwards call
`GET …/readiness` to render the remaining checklist.

**Dependencies / Related APIs** — `GET …/readiness`, `PATCH /admin/departments/:id`
(calendar, priority, workflow), `POST …/activate`.

---

#### `GET /admin/departments/:departmentId`

**Purpose** — One department's configuration row, with the ETag needed to modify it.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.department.read`**.
Scoped: a non-`SUPER_ADMIN` may only name their own department.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `departmentId` | uuid | **Yes** | Must be a valid uuid, else `422`. |

**Query Parameters** — `None`

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`, plus an `ETag` header. Same row shape as the list entry above.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `403` | `FORBIDDEN` | Missing permission; account has no department. |
| `403` | `CROSS_DEPARTMENT` | Non-`SUPER_ADMIN` naming a different department — *"That department belongs to a different department"*. |
| `404` | `NOT_FOUND` | *"That department does not exist here"*. |
| `422` | `VALIDATION_ERROR` | `departmentId` is not a uuid. |

**Frontend Usage** — Load the department settings header; **keep the `ETag`** for the next
`PATCH`, `activate` or `deactivate`.

**Dependencies / Related APIs** — `PATCH /admin/departments/:departmentId`,
`GET …/readiness`, `GET …/settings`, `GET …/features`.

---

#### `PATCH /admin/departments/:departmentId`

**Purpose** — Change a department's name, support email, head, parent, or its three defaults
(calendar, priority, workflow). Every foreign key is verified to belong to **this**
department before it is written.

Side effect: after the write, readiness is re-evaluated and a `DRAFT` ⇄ `READY` promotion or
demotion may occur automatically (an `ACTIVE`/`INACTIVE` department is never moved by a
configuration write). **Re-read `GET …/readiness` after any configuration change.**

**Authentication** — Required: **Yes**. Permission: **`helpdesk.department.write`**. Scoped.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `departmentId` | uuid | **Yes** | |

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `If-Match` | **Yes** | The ETag from the last read. Missing → `428`. |
| `Content-Type` | Yes | `application/json` |

**Request Body** — at least one field; **`.strict()`**.

```json
{
  "name": "Human Resources",
  "supportEmail": "hr.support@gera.in",
  "headUserId": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
  "parentDepartmentId": null,
  "businessCalendarId": "0198f59f-aaaa-7000-8000-000000000001",
  "defaultPriorityId": "01a018f5-6776-7081-b5cb-f574403a003e",
  "defaultWorkflowId": "0198f5a0-3333-7000-9aaa-0c1d2e3f4a5b"
}
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `name` | string | No | Display name | Trimmed, 1–150 |
| `supportEmail` | string \| null | No | Department mailbox | Valid email, ≤255, nullable |
| `headUserId` | uuid \| null | No | Department head | Must be a user **in this department** |
| `parentDepartmentId` | uuid \| null | No | Hierarchy parent | Must exist; must not create a cycle |
| `businessCalendarId` | uuid \| null | No | Working-hours calendar | Must exist, be active and not deleted. **Calendars are shared platform resources — existence is checked, not ownership.** |
| `defaultPriorityId` | uuid \| null | No | Default ticket priority | Must be a priority with `department_id = this` **or** `NULL` (platform-wide), not deleted |
| `defaultWorkflowId` | uuid \| null | No | Default workflow | Must be a workflow **in this department** |

**Rejected on purpose** — `code` (immutable identity) and `status` (lifecycle moves only
through `/activate` and `/deactivate`). Sending either is a **`422` naming the field**, not a
silent no-op, so a caller never believes they activated a department.

**Success Response** — `200`, with a **new** `ETag` header.

```json
{ "success": true, "message": "Department updated", "data": { "…": "the full department row, with a fresh etag" } }
```

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `400` | `BAD_REQUEST` | `parentDepartmentId` does not exist; calendar missing or inactive; `If-Match` is not a numeric ETag. |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `403` | `FORBIDDEN` / `CROSS_DEPARTMENT` | Missing `helpdesk.department.write`; or a different department. |
| `404` | `NOT_FOUND` | Department not found here; **or** *"That user does not exist here"* / *"That workflow does not exist here"* / *"That priority does not exist here"* for a reference outside the department. |
| `409` | `CONFLICT` | Parent would create a cycle. |
| `409` | `CONCURRENT_MODIFICATION` | The ETag no longer matches. |
| `422` | `VALIDATION_ERROR` | Empty body (*"No fields to update"*), unknown key, `code`/`status` sent, bad uuid or email. |
| `428` | `PRECONDITION_REQUIRED` | `If-Match` missing. |

**Frontend Usage** — The department configuration form. Read → edit → `PATCH` with `If-Match`
→ store the new ETag from the response.

**Dependencies / Related APIs** — `GET /admin/meta/enums` for dropdowns;
`GET …/readiness` afterwards; `POST …/activate` once ready.

---

#### `GET /admin/departments/:departmentId/readiness`

**Purpose** — *Is this department safe to take live?* Returns **every** check, passed and
failed, so the UI renders a checklist rather than a list of complaints. This is the onboarding
wizard's progress view.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.department.read`**. Scoped.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `departmentId` | uuid | **Yes** | |

**Query Parameters** — `None`

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — **always `200`.** *Not ready* is the answer, not an error — a 4xx here
would make a polling wizard look broken.

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "ready": false,
    "status": "DRAFT",
    "blocking": 2,
    "warnings": 3,
    "checks": [
      { "code": "SETTINGS_MISSING", "severity": "BLOCKING", "passed": true },
      {
        "code": "CALENDAR_UNSET",
        "severity": "BLOCKING",
        "passed": false,
        "message": "No business calendar is assigned",
        "hint": "PATCH /admin/departments/{id} with businessCalendarId"
      },
      {
        "code": "NO_CATCHALL_ROUTING_RULE",
        "severity": "BLOCKING",
        "passed": false,
        "message": "No catch-all routing rule — tickets nothing else matches would be silently unassigned",
        "hint": "POST /admin/departments/{id}/routing-rules with all scopes null"
      },
      {
        "code": "MAIL_NOT_POLLED",
        "severity": "WARNING",
        "passed": false,
        "message": "support_email is set to hr.support@gera.in, but no mailbox is polled for this department",
        "hint": "Email intake is configured per deployment — see docs/ADMIN_API_PLAN.md §12"
      }
    ]
  }
}
```

**Response fields**

| Field | Type | Description |
| ----- | ---- | ----------- |
| `ready` | boolean | `true` when **no BLOCKING check has failed**. Warnings never block. |
| `status` | enum | The department's current lifecycle status. |
| `blocking` | number | Count of failed blocking checks. |
| `warnings` | number | Count of failed warnings. |
| `checks[].code` | enum | Stable check identifier (table below). |
| `checks[].severity` | `BLOCKING` \| `WARNING` | |
| `checks[].passed` | boolean | |
| `checks[].message` | string | **Present only when `passed: false`.** Human-readable. |
| `checks[].hint` | string | **Present only when `passed: false`**, and only when the check defines one. The endpoint that fixes it. |

**Blocking checks**

| `code` | Fails when |
| ------ | ---------- |
| `SETTINGS_MISSING` | No `department_settings` row |
| `CALENDAR_UNSET` | No `business_calendar_id` |
| `CALENDAR_NO_WORKING_DAYS` | The assigned calendar has no working days and is not 24×7 |
| `NO_ACTIVE_PRIORITY` | No active priority for this department (or platform-wide) |
| `NO_DEFAULT_PRIORITY` | No priority flagged default, or `default_priority_id` unset |
| `NO_ACTIVE_WORKFLOW` | No active, effective-now workflow |
| `WORKFLOW_NO_INITIAL_STATE` | The active workflow has no initial state |
| `WORKFLOW_NO_CLOSED_STATE` | The active workflow has no closed state |
| `WORKFLOW_NO_CREATION_TRANSITION` | No transition with `from_state_id IS NULL` |
| `NO_CATCHALL_ROUTING_RULE` | No active routing rule with category, subcategory and priority all null |
| `NO_CATEGORY` | `requireCategory` is on but no active category exists |

**Warning checks**

| `code` | Fails when |
| ------ | ---------- |
| `MAIL_NOT_POLLED` | **Always fails today** — mailbox configuration is per-deployment, not per-department |
| `NO_OLA_POLICY` | No OLA policy resolves; tickets get no clock |
| `AI_CORPUS_THIN` | `AI_CLASSIFICATION` is on and some category has fewer than 3 classification examples |
| `TAXONOMY_ROUTING_GAPS` | Categories with no routing rule of their own |
| `NO_ASSIGNABLE_USER` | No assignable, active user — every ticket lands unassigned |

> `MAIL_NOT_POLLED` failing is expected. Render warnings as advisory; do not block the
> Activate button on them.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `403` | `FORBIDDEN` / `CROSS_DEPARTMENT` | Missing permission, or another department. |
| `404` | `NOT_FOUND` | *"That department does not exist here"*. |
| `422` | `VALIDATION_ERROR` | `departmentId` is not a uuid. |

**Frontend Usage** — The onboarding checklist. Re-fetch after every configuration write —
`status` may have moved `DRAFT` ⇄ `READY` on its own.

**Dependencies / Related APIs** — `POST …/activate` (which re-runs this internally and
returns the failing codes in its `409`).

---

#### `POST /admin/departments/:departmentId/activate`

**Purpose** — Take a department live: `status` → `ACTIVE`, `is_active` → `true`. Readiness is
re-evaluated **inside the transaction** rather than trusting the stored status.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.department.activate`**
(a "dangerous" permission — seeded to `SUPER_ADMIN` and `DEPT_ADMIN`). Scoped.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `departmentId` | uuid | **Yes** | |

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `If-Match` | **Yes** | ETag from the last read. Missing → `428`. |
| `Content-Type` | Yes | `application/json` |

**Request Body** — an **empty object**. `.strict()`, so any key is a `422`.

```json
{}
```

**Legal source statuses** — `READY` and `INACTIVE` (reactivation).
`DRAFT` → `ACTIVE` is refused, and the refusal costs nothing: satisfying readiness promotes a
`DRAFT` to `READY` automatically, so the Activate button lights up without a second call.

**Success Response** — `200`, with a new `ETag`.

```json
{ "success": true, "message": "Department is live", "data": { "…": "the department row, status ACTIVE, is_active true, fresh etag" } }
```

**Error Responses**

| Status | `code` | When | `details` |
| ------ | ------ | ---- | --------- |
| `409` | `CONFLICT` | Not ready — *"This department is not ready to go live"* | `{ status, blocking: ["CALENDAR_UNSET", …] }` |
| `409` | `CONFLICT` | Ready but wrong status — *"This department is not ready to go live yet — resolve the blocking checks first"* (from `DRAFT`) or *"A department that is already ACTIVE cannot be activated"* | `{ status, allowedFrom: ["READY","INACTIVE"] }` |
| `409` | `CONCURRENT_MODIFICATION` | ETag stale | — |
| `400` | `BAD_REQUEST` | `If-Match` not a numeric ETag | — |
| `401` | `UNAUTHORIZED` | No usable identity | — |
| `403` | `FORBIDDEN` / `CROSS_DEPARTMENT` | Missing `helpdesk.department.activate`, or another department | `{ required: [...] }` |
| `404` | `NOT_FOUND` | Department not found here | — |
| `422` | `VALIDATION_ERROR` | Body carries any key | — |
| `428` | `PRECONDITION_REQUIRED` | `If-Match` missing | — |

> The `409` for *not ready* carries **`details.blocking`** — render that list directly; it is
> the answer to the question the user is actually asking.

**Frontend Usage** — The Activate button on the onboarding wizard. Enable it when
`readiness.ready === true` and `status` is `READY` or `INACTIVE`.

**Dependencies / Related APIs** — `GET …/readiness` before; `GET /admin/departments/:id` after
(or use the returned row).

---

#### `POST /admin/departments/:departmentId/deactivate`

**Purpose** — Take a department out of service: `status` → `INACTIVE`, `is_active` → `false`.
Intake, auto-provisioning and new tickets stop.

**What it does *not* do: touch a single ticket.** Existing work stays fully workable, OLA
clocks keep running, and the background jobs keep processing them.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.department.deactivate`**
(dangerous). Scoped.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `departmentId` | uuid | **Yes** | |

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `If-Match` | **Yes** | Missing → `428`. |
| `Content-Type` | Yes | `application/json` |

**Request Body** — `.strict()`

```json
{ "acknowledgeOpenTickets": 12, "reason": "merging into Shared Services" }
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `acknowledgeOpenTickets` | integer | **Yes** | **Must equal the live count of open tickets** (`closed_at IS NULL`). There is no default — the number must be on screen before the button is pressed. | ≥ 0, coerced from string |
| `reason` | string | No | Free text, echoed back as `deactivation_reason`. **Not persisted to a column.** | Trimmed, ≤500 |

**Legal source status** — `ACTIVE` only.

**Success Response** — `200`, with a new `ETag`.

```json
{
  "success": true,
  "message": "Department is out of service — existing tickets remain workable",
  "data": {
    "id": "0198f5a0-1111-7000-9aaa-0c1d2e3f4a5b",
    "code": "HR",
    "status": "INACTIVE",
    "is_active": false,
    "deactivation_reason": "merging into Shared Services",
    "etag": "1787738999.114203"
  }
}
```

`deactivation_reason` is **added to the response by the service**, not read from the database.

**Error Responses**

| Status | `code` | When | `details` |
| ------ | ------ | ---- | --------- |
| `409` | `CONFLICT` | Count mismatch — *"This department has 12 open ticket(s); the request acknowledged 9. They stay workable, but confirm the number."* | `{ openTickets, acknowledged }` |
| `409` | `CONFLICT` | Wrong status — *"This department is already out of service"* / *"Only an ACTIVE department can be deactivated — this one is DRAFT"* | `{ status, allowedFrom: ["ACTIVE"] }` |
| `409` | `CONCURRENT_MODIFICATION` | ETag stale | — |
| `401`/`403`/`404`/`422`/`428` | as above | | |

> The mismatch `409` returns the **real** count in `details.openTickets` — show it and let the
> administrator confirm again. This is a two-step confirmation by design.

**Frontend Usage** — A confirmation dialog: read the open-ticket count (from
`details.openTickets` on the first refused attempt, or your own count query), display it, then
resend with that exact number.

**Dependencies / Related APIs** — `POST …/activate` to bring it back.

---

### 11.5 Admin — Department Settings

`department_settings` is a **1:1 satellite** of `departments` — the department in the path *is*
the key, so there is no `/:id`. These are the behavioural switches that **always exist** for
every department (as opposed to `department_features`, which are capabilities that may not
exist at all).

---

#### `GET /admin/departments/:departmentId/settings`

**Purpose** — Read the department's behavioural configuration, with the ETag needed to change it.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.settings.read`**. Scoped.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `departmentId` | uuid | **Yes** | |

**Query Parameters** — `None`

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`, with an `ETag` header. Raw row, `snake_case`:

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "department_id": "0198f5a0-1111-7000-9aaa-0c1d2e3f4a5b",
    "ticket_number_format": "{DEPT}-{YYYY}-{SEQ}",
    "ticket_number_reset": "YEARLY",
    "require_category": true,
    "require_subcategory": false,
    "assignment_strategy": "RULE_BASED",
    "auto_assign_on_create": true,
    "max_open_tickets_per_user": null,
    "ola_start_trigger": "ON_CREATE",
    "auto_close_days": 3,
    "auto_close_warning_days": 1,
    "reopen_window_days": 7,
    "reopen_within_window_action": "REOPEN_SAME_TICKET",
    "ex_employee_window_days": 30,
    "ooo_activation_policy": "NEW_TICKETS_ONLY",
    "ooo_expiry_policy": "KEEP_DELEGATE",
    "max_delegation_depth": 3,
    "snooze_max_working_minutes": 1440,
    "snooze_max_count": 3,
    "attachment_max_mb": 25,
    "created_at": "2026-02-09T06:11:02.114Z",
    "created_by": null,
    "updated_at": "2026-08-20T09:41:07.301Z",
    "updated_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
    "etag": "1787304067.301882"
  }
}
```

The values shown are the **schema defaults** from migration 0002.

**Field reference** — response column ↔ request field, with the rule each one enforces:

| Response column | Request field | Type | Default | Description / validation |
| --------------- | ------------- | ---- | ------- | ------------------------ |
| `ticket_number_format` | `ticketNumberFormat` | string | `{DEPT}-{YYYY}-{SEQ}` | 1–60 chars. **Must contain `{SEQ}`**, or every ticket in a period gets the same number. Only `{DEPT}` `{YYYY}` `{YY}` `{MM}` `{SEQ}` are substituted — any other `{token}` is rejected. |
| `ticket_number_reset` | `ticketNumberReset` | enum | `YEARLY` | `NEVER` \| `YEARLY` \| `MONTHLY` |
| `require_category` | `requireCategory` | boolean | `true` | When on, `POST /tickets` **without** `categoryId` is a `400`. Does **not** apply to email intake. |
| `require_subcategory` | `requireSubcategory` | boolean | `false` | Same, for `subcategoryId`. |
| `assignment_strategy` | `assignmentStrategy` | enum | `RULE_BASED` | `RULE_BASED` \| `MANUAL`. Auto-routing on create runs only under `RULE_BASED`. |
| `auto_assign_on_create` | `autoAssignOnCreate` | boolean | `true` | Route the ticket at creation. |
| `max_open_tickets_per_user` | `maxOpenTicketsPerUser` | integer \| null | `null` | **`null` means uncapped — a real setting, not an absent one.** Must be > 0 when set. |
| `ola_start_trigger` | `olaStartTrigger` | enum | `ON_CREATE` | `ON_CREATE` \| `ON_ASSIGN` |
| `auto_close_days` | `autoCloseDays` | integer | `3` | > 0. **Working** days from resolution. |
| `auto_close_warning_days` | `autoCloseWarningDays` | integer | `1` | ≥ 0. **Must be strictly less than `autoCloseDays`.** |
| `reopen_window_days` | `reopenWindowDays` | integer | `7` | ≥ 0 |
| `reopen_within_window_action` | `reopenWithinWindowAction` | enum | `REOPEN_SAME_TICKET` | `REOPEN_SAME_TICKET` \| `NEW_LINKED_TICKET` |
| `ex_employee_window_days` | `exEmployeeWindowDays` | integer | `30` | ≥ 0 |
| `ooo_activation_policy` | `oooActivationPolicy` | enum | `NEW_TICKETS_ONLY` | `NEW_TICKETS_ONLY` \| `ALL_ACTIVE_TICKETS` \| `MANUAL` |
| `ooo_expiry_policy` | `oooExpiryPolicy` | enum | `KEEP_DELEGATE` | `KEEP_DELEGATE` \| `RETURN_TO_OWNER` |
| `max_delegation_depth` | `maxDelegationDepth` | integer | `3` | > 0 |
| `snooze_max_working_minutes` | `snoozeMaxWorkingMinutes` | integer | `1440` | > 0. Enforced by `POST /tickets/:id/snooze` on the department calendar. |
| `snooze_max_count` | `snoozeMaxCount` | integer | `3` | > 0. Cap on snoozes over a ticket's whole life. |
| `attachment_max_mb` | `attachmentMaxMb` | integer | `25` | > 0. **No attachment endpoint reads this today.** |

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `403` | `FORBIDDEN` / `CROSS_DEPARTMENT` | Missing `helpdesk.settings.read`, or another department. |
| `404` | `NOT_FOUND` | *"This department has no settings row — create it with POST /settings"*. Only possible for a department created before this API existed (the seeded `IT` department is exactly that case). |
| `422` | `VALIDATION_ERROR` | `departmentId` is not a uuid. |

**Frontend Usage** — The department settings form. On `404`, offer a "create defaults" button
that calls `POST …/settings`.

**Dependencies / Related APIs** — `GET /admin/meta/enums` for the dropdown vocabularies.

---

#### `POST /admin/departments/:departmentId/settings`

**Purpose** — Create the settings row **from schema defaults**. Only reachable for a
department created before this API existed — `POST /admin/departments` creates the row
alongside the department.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.settings.write`**. Scoped.

**Path Parameters** — `departmentId` (uuid, required).

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `Content-Type` | Yes | `application/json` |
| `If-Match` | **No** | Nothing exists yet to match. |

**Request Body** — an **empty object**. `.strict()` — this endpoint **takes no fields**; every
value comes from the schema defaults.

```json
{}
```

**Success Response** — `201`, with an `ETag` header. Body is the new settings row (defaults as
listed above).

```json
{ "success": true, "message": "Settings created with defaults", "data": { "…": "the settings row" } }
```

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `409` | `CONFLICT` | *"This department already has settings — use PATCH to change them"*, or *"This department already has settings"* when a concurrent POST won the race. |
| `401`/`403` | as above | |
| `404` | `NOT_FOUND` | Department not found here. |
| `422` | `VALIDATION_ERROR` | Body carries any key. |

**Frontend Usage** — Recovery path only. Then `PATCH` to change anything.

**Dependencies / Related APIs** — `PATCH …/settings`, `GET …/readiness` (this clears
`SETTINGS_MISSING`).

---

#### `PATCH /admin/departments/:departmentId/settings`

**Purpose** — Change one or more settings. All fields optional; at least one required.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.settings.write`**. Scoped.

**Path Parameters** — `departmentId` (uuid, required).

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `If-Match` | **Yes** | Missing → `428`. |
| `Content-Type` | Yes | `application/json` |

**Request Body** — camelCase, `.strict()`, any subset of the 19 fields in the table above:

```json
{
  "requireCategory": false,
  "autoCloseDays": 5,
  "autoCloseWarningDays": 2,
  "snoozeMaxCount": 5,
  "maxOpenTicketsPerUser": null
}
```

**The coherence rule runs against the merged row, not the body.** Sending only
`{"autoCloseWarningDays": 5}` against a stored `autoCloseDays: 3` is invalid and returns a
`422` naming both fields — a body-only rule would have seen nothing wrong.

**Success Response** — `200`, with a new `ETag`.

```json
{ "success": true, "message": "Settings updated", "data": { "…": "the full settings row, fresh etag" } }
```

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `400` | `BAD_REQUEST` | `If-Match` is not a numeric ETag. |
| `401`/`403` | as above | |
| `404` | `NOT_FOUND` | *"This department has no settings row — create it with POST /settings"*. |
| `409` | `CONCURRENT_MODIFICATION` | ETag stale. |
| `422` | `VALIDATION_ERROR` | Empty body (*"No fields to update"*); unknown key; bad enum; `{SEQ}` missing from `ticketNumberFormat`; unknown `{token}`; **`autoCloseWarningDays >= autoCloseDays`** — *"autoCloseWarningDays (5) must be less than autoCloseDays (3) — a warning after the close is not a warning"*. |
| `428` | `PRECONDITION_REQUIRED` | `If-Match` missing. |

**Side effect** — readiness is re-evaluated afterwards, so `requireCategory` can move the
department `DRAFT` ⇄ `READY`. Re-fetch `GET …/readiness`.

**Frontend Usage** — Validate the `autoCloseWarningDays < autoCloseDays` pair client-side too;
the server will enforce it, but a local check saves a round trip. Send **only changed fields**.

**Dependencies / Related APIs** — `GET …/settings` (for the ETag), `GET …/readiness` after.

---

### 11.6 Admin — Department Features

`department_features` is keyed by **`feature_code`**, not a uuid — the code *is* the identity
(`requireFeature(SNOOZE)` names it in source).

**`POST` + `PATCH` rather than an idempotent `PUT`**, deliberately: an upsert cannot carry a
coherent `If-Match` — there is no ETag for a row that does not exist yet, and treating an
absent header as "create" would leave two clients both creating, the second silently
overwriting the first.

---

#### `GET /admin/departments/:departmentId/features`

**Purpose** — Every feature row, **plus the codes that have none**, so the UI can render all
six toggles regardless of how many rows exist.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.feature.read`**. Scoped.

**Path Parameters** — `departmentId` (uuid, required).

**Query Parameters** — `None`

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`. **No `ETag` header** — this is a collection and the rows have
different tokens; use each row's own `etag`.

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "department_id": "0198f5a0-1111-7000-9aaa-0c1d2e3f4a5b",
      "feature_code": "AI_CLASSIFICATION",
      "is_enabled": true,
      "config": { "confidenceThreshold": 0.75, "model": "gpt-4o-mini" },
      "enabled_at": "2026-06-01T08:00:00.000Z",
      "disabled_at": null,
      "created_at": "2026-06-01T08:00:00.000Z",
      "created_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "updated_at": "2026-08-20T09:41:07.301Z",
      "updated_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "etag": "1787304067.301882",
      "exists": true
    },
    {
      "department_id": "0198f5a0-1111-7000-9aaa-0c1d2e3f4a5b",
      "feature_code": "OOO_DELEGATION",
      "is_enabled": false,
      "config": {},
      "enabled_at": null,
      "disabled_at": null,
      "exists": false
    }
  ]
}
```

**Response fields**

| Field | Type | Description |
| ----- | ---- | ----------- |
| `feature_code` | enum | See [Feature codes](#feature-codes--featurecode). All six always appear. |
| `is_enabled` | boolean | **A missing row means `false`.** |
| `config` | object | Per-feature knobs (JSONB). `{}` when none. |
| `enabled_at` | timestamp \| null | Stamped only on a genuine `false → true` transition; re-sending `isEnabled: true` does **not** reset it. |
| `disabled_at` | timestamp \| null | Same, for `true → false`. |
| `exists` | boolean | **Synthesised by the API, not a column.** `false` means no row — **use `POST`, not `PATCH`**. Rows with `exists: false` carry **no `etag`**. |

**Error Responses** — `401`, `403` (`FORBIDDEN` / `CROSS_DEPARTMENT`), `422` (bad uuid).

**Frontend Usage** — Render six toggles. Branch the save action on `exists`:
`exists === false` → `POST /features`; `exists === true` → `PATCH /features/:code` with that
row's `etag`.

**Dependencies / Related APIs** — `GET /admin/meta/enums` (`featureCode`); the feature gates
on `POST /tickets/:id/snooze` and the collaboration verbs.

---

#### `POST /admin/departments/:departmentId/features`

**Purpose** — Create the feature row for a code that has none.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.feature.write`**. Scoped.

**Path Parameters** — `departmentId` (uuid, required).

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `Content-Type` | Yes | `application/json` |
| `If-Match` | **No** | Nothing exists yet. |

**Request Body** — `.strict()`

```json
{
  "featureCode": "AI_CLASSIFICATION",
  "isEnabled": true,
  "config": { "confidenceThreshold": 0.75, "model": "gpt-4o-mini" }
}
```

| Field | Type | Required | Default | Description | Validation |
| ----- | ---- | -------- | ------- | ----------- | ---------- |
| `featureCode` | enum | **Yes** | — | Which capability | One of the six `FEATURE_CODE` values |
| `isEnabled` | boolean | No | `false` | Switch it on immediately | boolean |
| `config` | object | No | `{}` | Per-code knobs | Validated **per `featureCode`** — see below |

**Per-code `config` schemas** — every one is `.strict()`, so **an unknown key is rejected, not
stripped**. (An administrator who typed `confidenceThresh` and got a `201` would believe they
changed the threshold; nothing would ever tell them otherwise.)

| `featureCode` | Allowed `config` keys |
| ------------- | --------------------- |
| `AI_CLASSIFICATION` | `confidenceThreshold` (number, 0–1, optional), `model` (string, 1–60 chars, trimmed, optional) |
| `EXTERNAL_INTAKE` | `allowedDomains` (array of strings, each trimmed + lower-cased, 3–255 chars, max 100 entries, optional) |
| `SNOOZE` | none — `{}` only |
| `COLLABORATION` | none — `{}` only |
| `EX_EMPLOYEE_INTAKE` | none — `{}` only |
| `OOO_DELEGATION` | none — `{}` only |

> `AI_CLASSIFICATION.config` **narrows** the deployment-level `HELPDESK_AI_*` values; both the
> deployment switch and this row must be on for classification to run.

**Success Response** — `201`, with an `ETag` header.

```json
{
  "success": true,
  "message": "AI_CLASSIFICATION configured",
  "data": {
    "department_id": "0198f5a0-1111-7000-9aaa-0c1d2e3f4a5b",
    "feature_code": "AI_CLASSIFICATION",
    "is_enabled": true,
    "config": { "confidenceThreshold": 0.75, "model": "gpt-4o-mini" },
    "enabled_at": "2026-08-26T10:14:33.201Z",
    "disabled_at": null,
    "etag": "1787739273.201884"
  }
}
```

The `message` names the code: `"<FEATURE_CODE> configured"`.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `409` | `CONFLICT` | Already configured — *"AI_CLASSIFICATION is already configured for this department — use PATCH"*, `details: { featureCode }`. |
| `409` | `CONFLICT` | **Enabling `AI_CLASSIFICATION` with no catch-all routing rule** — *"AI_CLASSIFICATION cannot be enabled without a catch-all routing rule — every message the model cannot confidently label would be silently unassigned"*, `details: { requires: "a routing rule with category, subcategory and priority all null" }`. |
| `401`/`403` | as above | |
| `404` | `NOT_FOUND` | Department not found here. |
| `422` | `VALIDATION_ERROR` | Unknown `featureCode`; unknown top-level key; **unknown or malformed `config` key** — *"Invalid config for AI_CLASSIFICATION"* with `details` naming the offending keys. |

**Frontend Usage** — Called when a toggle whose row has `exists: false` is switched.

**Dependencies / Related APIs** — Enabling `AI_CLASSIFICATION` requires a catch-all routing
rule, and **there is no endpoint to create one** — see
[Known Issues](#backend-api-notes--known-issues) #2.

---

#### `PATCH /admin/departments/:departmentId/features/:code`

**Purpose** — Change `isEnabled`, `config`, or both, on an existing feature row.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.feature.write`**. Scoped.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `departmentId` | uuid | **Yes** | |
| `code` | enum | **Yes** | One of the six `FEATURE_CODE` values. An unrecognised code is a **`422`**, not a `404`. |

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `If-Match` | **Yes** | The row's `etag`. Missing → `428`. |
| `Content-Type` | Yes | `application/json` |

**Request Body** — `.strict()`, at least one field:

```json
{ "isEnabled": true, "config": { "confidenceThreshold": 0.8 } }
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `isEnabled` | boolean | No | Switch on/off | boolean |
| `config` | object | No | **Replaces** the whole `config` object — it is not merged. | Validated against the schema for `:code` |

**Success Response** — `200`, new `ETag`. `message` is `"<FEATURE_CODE> updated"`.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `400` | `BAD_REQUEST` | `If-Match` not a numeric ETag. |
| `401`/`403` | as above | |
| `404` | `NOT_FOUND` | *"SNOOZE is not configured for this department — POST /features to create it"*. |
| `409` | `CONFLICT` | Enabling `AI_CLASSIFICATION` with no catch-all rule (same message as `POST`). Also raised when `config` alone is patched while the row is already enabled. |
| `409` | `CONCURRENT_MODIFICATION` | ETag stale. |
| `422` | `VALIDATION_ERROR` | Unknown `:code`; empty body (*"No fields to update"*); unknown key; invalid `config`. |
| `428` | `PRECONDITION_REQUIRED` | `If-Match` missing. |

**Frontend Usage** — The toggle and the per-feature config form. **Send the complete `config`
object**, since it replaces rather than merges.

---

#### `DELETE /admin/departments/:departmentId/features/:code`

**Purpose** — **Disables. Never deletes.** Sets `is_enabled = false` and stamps `disabled_at`;
the row stays. Disabling is **forward-only**: it blocks new writes and never removes what
earlier ones created, so a collaboration recorded while `COLLABORATION` was on stays readable
after it is switched off.

**Authentication** — Required: **Yes**. Permission: **`helpdesk.feature.write`**. Scoped.

**Path Parameters** — `departmentId` (uuid), `code` (feature enum). Both required.

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `If-Match` | **Yes** | Missing → `428`. |

**Request Body** — `None`

**Success Response** — **`200`, not `204`**, with a new `ETag`. It returns the row, because
what happened is a disable, not a removal:

```json
{
  "success": true,
  "message": "COLLABORATION disabled — existing records are unaffected",
  "data": {
    "feature_code": "COLLABORATION",
    "is_enabled": false,
    "disabled_at": "2026-08-26T10:20:00.481Z",
    "enabled_at": "2026-06-01T08:00:00.000Z",
    "config": {},
    "etag": "1787739600.481277"
  }
}
```

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `400` | `BAD_REQUEST` | `If-Match` not a numeric ETag. |
| `401`/`403` | as above | |
| `404` | `NOT_FOUND` | *"COLLABORATION is not configured for this department"*. |
| `409` | `CONCURRENT_MODIFICATION` | ETag stale. |
| `422` | `VALIDATION_ERROR` | Unknown `:code`; bad uuid. |
| `428` | `PRECONDITION_REQUIRED` | `If-Match` missing. |

**Frontend Usage** — Equivalent to `PATCH { "isEnabled": false }`. Use whichever fits the UI;
both are audited as an UPDATE (the row is still there, so auditing it as a deletion would make
the trail claim something the database contradicts).

**Dependencies / Related APIs** — After disabling `SNOOZE` or `COLLABORATION`, the matching
ticket write verbs return `403` `FEATURE_DISABLED`; the collaboration **read** endpoint keeps
working.

---

### 11.7 Tickets — Reads

All `/tickets` routes run `authenticate` **and** `scopeToDepartment`, applied once for the
whole module. Every one therefore has a `req.user` and a `req.departmentId`.

#### The ticket object

Returned by `GET /tickets/:id` (as `data.ticket`), inside `GET /tickets` rows, and as `data`
on `POST /tickets`. Raw `tickets` row, `snake_case`:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | uuid | |
| `ticket_number` | string(30) | Human-quotable, e.g. `HR-2026-00001`. Format from `department_settings.ticket_number_format`. |
| `department_id` | uuid | |
| `subject` | string(500) | |
| `description` | text \| null | |
| `requester_user_id` | uuid \| null | Null for an external requester with no account. |
| `requester_email_snapshot` | string \| null | Requester details **as at creation** — these are why point-in-time questions about a ticket are answerable. |
| `requester_name_snapshot` | string \| null | |
| `requester_emp_code_snapshot` | string \| null | |
| `requester_dept_snapshot` | string \| null | |
| `category_id` | uuid \| null | Null while unclassified. |
| `subcategory_id` | uuid \| null | Requires `category_id` to be set (CHECK). |
| `priority_id` | uuid \| null | |
| `classification_status` | enum \| null | See [Classification status](#classification-status--classificationstatus). |
| `ai_suggested_category_id` | uuid \| null | What the model thought, kept separate from what the ticket *is*. |
| `ai_suggested_subcategory_id` | uuid \| null | |
| `ai_confidence` | numeric(4,3) \| null | |
| `ai_model` | string \| null | Required by CHECK for any `AI_*` status. |
| `ai_prompt_version` | string \| null | |
| `classified_by_user_id` | uuid \| null | Required by CHECK for `CONFIRMED`/`CORRECTED`. |
| `classified_at` | timestamp \| null | |
| `workflow_id` | uuid | **Pinned at creation.** The ticket keeps this workflow version for life. |
| `state_id` | uuid | Current state. **Do not use this as a filter value** — use `state_code`/`?state=`. |
| `assigned_to_user_id` | uuid \| null | **Null is a real outcome** — the unassigned queue. |
| `routing_rule_id` | uuid \| null | Which rule chose the owner. |
| `source_code` | enum | See [Ticket source](#ticket-source--sourcecode). |
| `inbound_message_id` | uuid \| null | The mail that created it, if any. |
| `conversation_id` | string(500) \| null | The **customer** Graph thread. Collaboration threads live elsewhere. |
| `parent_ticket_id` | uuid \| null | Immediate predecessor in a reopen chain. |
| `root_ticket_id` | uuid | First ticket in the chain. A root ticket points at **itself**. |
| `reopen_sequence_no` | smallint | `0` for an original ticket. |
| `first_assigned_at` | timestamp \| null | **START DATE.** Write-once, by trigger. |
| `first_response_at` | timestamp \| null | |
| `resolved_at` | timestamp \| null | |
| `closed_at` | timestamp \| null | **END DATE.** Never derive it from an OLA `due_at`. |
| `auto_close_due_at` | timestamp \| null | End of the review window. Stamped at resolution, in **working** days. |
| `last_activity_at` | timestamp | |
| `reassignment_count` | smallint | |
| `is_ola_breached` | boolean | |
| `version` | integer | **Send this back as `expectedVersion`.** |
| `created_at` / `updated_at` | timestamp | |

> There are **no** `planned_start_date` / `planned_end_date` columns, and there must not be.

---

#### `GET /tickets`

**Purpose** — The department queue, or "my tickets". One paginated, filterable, sortable list
with per-user unread decoration.

**Authentication** — Required: **Yes**. Role: any.
**An `EMPLOYEE` is forced to their own tickets** — `requesterUserId` is overridden with the
caller's id whatever the query string asked for.

**Path Parameters** — `None`

**Query Parameters**

| Parameter | Type | Required | Default | Description |
| --------- | ---- | -------- | ------- | ----------- |
| `page` | integer ≥1 | No | `1` | |
| `limit` | integer 1–200 | No | `25` | |
| `sort` | string | No | `created_at DESC` | `created_at` \| `updated_at` \| `last_activity_at` \| `ticket_number` \| `resolved_at` \| `closed_at`, with `:asc`/`:desc`. |
| `departmentId` | uuid | No | caller's own | **`SUPER_ADMIN` only.** Anyone else naming another department gets `403` `CROSS_DEPARTMENT`. |
| `state` | string \| string[] | No | — | **THE state filter.** A workflow state **`code`**, e.g. `IN_PROGRESS`. Repeatable. Resolved server-side to every id that code means in the department, across all live workflow versions. Pattern `^[A-Za-z0-9_-]{1,40}$`. |
| `stateCategory` | enum \| enum[] | No | — | `OPEN` \| `PENDING` \| `RESOLVED` \| `CLOSED`. Repeatable. **ANDs with `state`** when both are sent. |
| `stateId` | uuid | No | — | Exact-row escape hatch. **Prefer `state`** — a uuid belongs to one workflow version. |
| `categoryId` | uuid | No | — | |
| `priorityId` | uuid | No | — | |
| `assignedToUserId` | uuid | No | — | |
| `requesterUserId` | uuid | No | — | **Ignored (overridden) for an `EMPLOYEE`.** |
| `unassigned` | boolean | No | — | `assigned_to_user_id IS NULL` **and** not closed. |
| `openOnly` | boolean | No | — | `closed_at IS NULL`. |
| `isBreached` | boolean | No | — | `is_ola_breached` **and** not closed. |
| `classificationStatus` | enum \| enum[] | No | — | See [Classification status](#classification-status--classificationstatus). Repeatable. |
| `unreadOnly` | boolean | No | — | Only tickets carrying an `EMAIL_RECEIVED` notification **this caller** has not read. Per-user by construction. |
| `unreadFirst` | boolean | No | **`true`** | Unread tickets sort above read ones, **ahead of `sort`**. Send `unreadFirst=false` for strict `sort` order. |
| `createdFrom` | date | No | — | `created_at >= `. ISO 8601. |
| `createdTo` | date | No | — | `created_at <= `. ISO 8601. |
| `search` | string 1–200 | No | — | `subject ILIKE %term%` OR `ticket_number ILIKE %term%`. |

> **`unassigned`, `openOnly`, `isBreached`, `unreadOnly`, `unreadFirst` accept `false`
> properly.** A frontend holding one filter object can send the false ones.

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`, paginated.

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
      "ticket_number": "HR-2026-00042",
      "department_id": "0198f5a0-1111-7000-9aaa-0c1d2e3f4a5b",
      "subject": "Replacement ID card needed",
      "description": "I lost my ID card yesterday.",
      "requester_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "requester_email_snapshot": "manish.pandey@gera.in",
      "requester_name_snapshot": "Manish Pandey",
      "category_id": "01a018f5-67e0-78c0-a1cb-5166a1e2aa88",
      "priority_id": "01a018f5-6776-7081-b5cb-f574403a003e",
      "classification_status": "CONFIRMED",
      "state_id": "0198f5a0-4444-7000-9aaa-0c1d2e3f4a5b",
      "assigned_to_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "first_assigned_at": "2026-08-25T09:12:00.000Z",
      "resolved_at": null,
      "closed_at": null,
      "last_activity_at": "2026-08-26T07:40:11.221Z",
      "is_ola_breached": false,
      "version": 3,
      "created_at": "2026-08-25T09:11:58.004Z",
      "updated_at": "2026-08-26T07:40:11.221Z",

      "state_code": "IN_PROGRESS",
      "state_name": "In Progress",
      "state_category": "OPEN",
      "priority_code": "NORMAL",
      "priority_name": "Normal",
      "severity_rank": 2,
      "category_name": "Admin",
      "assigned_to_name": "Manish Pandey",

      "unread_count": 2,
      "has_unread": true
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 137, "totalPages": 6 }
}
```

**Row fields beyond the ticket object**

| Field | Type | Source | Description |
| ----- | ---- | ------ | ----------- |
| `state_code` | string | join | **Use this to render the state**, and as the `?state=` value. |
| `state_name` | string | join | Display label from the newest workflow version. |
| `state_category` | enum | join | `OPEN`/`PENDING`/`RESOLVED`/`CLOSED`. |
| `priority_code` / `priority_name` | string \| null | join | Null when the ticket has no priority. |
| `severity_rank` | number \| null | join | **Higher = more severe.** Sort `DESC` for most urgent first. |
| `category_name` | string \| null | join | Null while unclassified. |
| `assigned_to_name` | string \| null | join | Null on the unassigned queue. |
| `unread_count` | integer | computed per caller | Unread `EMAIL_RECEIVED` notifications for **this** user on this ticket. `0` when none. |
| `has_unread` | boolean | computed per caller | Render the badge from this. |

> `unread_count` / `has_unread` are **per user**. Two people looking at the same queue see
> different values — that is the whole point. Do not cache a row across users.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `400` | `BAD_REQUEST` | **Unknown state code** — *"Unknown workflow state: FOO"*, `details: { unknown: ["FOO"], available: ["NEW","IN_PROGRESS",…] }`. |
| `400` | `BAD_REQUEST` | `sort` names an unlisted column, `details.allowed`. |
| `400` | `BAD_REQUEST` | `SUPER_ADMIN` with no resolvable department. |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `403` | `FORBIDDEN` | Account not `ACTIVE`, or account has no department. |
| `403` | `CROSS_DEPARTMENT` | `?departmentId=` naming another department as a non-`SUPER_ADMIN`. |
| `422` | `VALIDATION_ERROR` | Bad uuid, `limit` > 200, unparsable date, bad `stateCategory`, `search` too long. |
| `429` | `TOO_MANY_REQUESTS` | Global limiter. |

> **An unknown state code is a `400`, never an empty page.** *"No tickets are in that state"*
> and *"that state does not exist here"* are different answers, and the `details.available`
> array names the department's real vocabulary — surface it in a dev console.

**Frontend Usage** — The main grid. Build the state filter from `GET /auth/me`'s
`workflowStates[].code`. Hold one filter object and spread it into both this call and
`GET /tickets/counts`.

**Dependencies / Related APIs** — `GET /auth/me` (state vocabulary),
`GET /tickets/counts` (the dropdown's numbers), `POST /tickets/:id/read` (clear the badge).

---

#### `GET /tickets/counts`

**Purpose** — The numbers beside the options in the state dropdown: how many tickets sit in
each state under **the same filters** as `GET /tickets`. One `GROUP BY`, so five dropdown
options cost one query instead of five full counts per keystroke.

**Authentication** — Required: **Yes**. Role: any. `EMPLOYEE` is forced to their own tickets,
exactly as on the list.

**Path Parameters** — `None`

**Query Parameters** — **identical to `GET /tickets`, minus `page`, `limit` and `sort`**
(meaningless for an aggregate; sending them is a `422`).

**`state`, `stateCategory` and `stateId` are accepted and then IGNORED.** The frontend holds
one filter object and spreads it into both calls; a facet that honoured its own facet would
report every other state as zero — the one thing a dropdown must not say. Every other filter
(`search`, `categoryId`, `priorityId`, dates, `unreadOnly`, the `EMPLOYEE` override) **is**
applied, so each number is a page the user can actually reach.

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "total": 137,
    "unread": 4,
    "byState": {
      "NEW": 12,
      "IN_PROGRESS": 31,
      "PENDING_EMPLOYEE": 5,
      "RESOLVED": 8,
      "CLOSED": 81
    },
    "byCategory": {
      "OPEN": 43,
      "PENDING": 5,
      "RESOLVED": 8,
      "CLOSED": 81
    },
    "unreadByState": {
      "NEW": 1,
      "IN_PROGRESS": 3,
      "PENDING_EMPLOYEE": 0,
      "RESOLVED": 0,
      "CLOSED": 0
    }
  }
}
```

**Response fields**

| Field | Type | Description |
| ----- | ---- | ----------- |
| `total` | integer | Sum of `byState`. Equals `meta.total` of the same query **with no state filter**, so "All states (137)" and the grid's total agree. |
| `unread` | integer | Tickets in scope carrying an `EMAIL_RECEIVED` reply this user has not read. Counted in the same aggregate as `total`, so the two cannot disagree. |
| `byState` | object | **Every state the department defines**, keyed by `code` — including states with **0** tickets. A missing key would render as a missing option instead of `Resolved (0)`. |
| `byCategory` | object | Totals rolled up to `OPEN`/`PENDING`/`RESOLVED`/`CLOSED`. All four keys always present, zero-initialised. |
| `unreadByState` | object | Per-state unread counts, same keys as `byState`. |

**Error Responses** — same as `GET /tickets`, except that an unknown `state` code **cannot**
produce a `400` here (state filters are dropped before resolution). Sending `page`, `limit` or
`sort` is a `422`.

**Frontend Usage** — Fetch alongside `GET /tickets` on every filter change. Render
`Open (43)`, `New (12)`, and the attention badge from `unread`.

**Dependencies / Related APIs** — `GET /auth/me` for the state list and display order;
`GET /tickets` for the page itself.

---

#### `GET /tickets/:id`

**Purpose** — Ticket detail, with the legal next moves and the OLA clocks — everything the
detail pane needs in one call.

**Authentication** — Required: **Yes**. Role: any, subject to `assertSameDepartment`:
another department's ticket → `404`; an `EMPLOYEE` reading someone else's ticket → `404`.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | uuid | **Yes** | Must be a valid uuid, else `422`. |

**Query Parameters** — `None`

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "ticket": { "…": "the full ticket object (see above)" },
    "availableTransitions": [
      {
        "id": "0198f5a0-9001-7000-9aaa-0c1d2e3f4a5b",
        "workflow_id": "0198f5a0-3333-7000-9aaa-0c1d2e3f4a5b",
        "from_state_id": "0198f5a0-4444-7000-9aaa-0c1d2e3f4a5b",
        "to_state_id": "0198f5a0-5555-7000-9aaa-0c1d2e3f4a5b",
        "code": "RESOLVE",
        "label": "Resolve",
        "requires_reason": false,
        "requires_assignment": true,
        "allowed_role_codes": ["SPOC", "MANAGER"],
        "allowed_actor_types": ["USER"],
        "is_ola_paused": false,
        "is_active": true,
        "display_order": 1,
        "to_state_code": "RESOLVED",
        "to_state_name": "Resolved",
        "state_category": "RESOLVED",
        "is_resolved": true,
        "is_closed": false,
        "is_terminal": false
      }
    ],
    "ola": {
      "instances": [
        {
          "id": "0198f7c2-0001-7000-9000-bbbbbbbbbbbb",
          "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
          "target_type": "RESPONSE",
          "due_at": "2026-08-26T12:00:00.000Z",
          "consumed_working_minutes": 95,
          "remaining_working_minutes": 145,
          "total_paused_working_minutes": 0,
          "current_stage_no": 1,
          "is_paused": false,
          "pause_reason": null,
          "is_stopped": false,
          "is_breached": false,
          "extension_minutes": 0,
          "requires_intervention": false,
          "started_at": "2026-08-25T09:11:58.004Z"
        }
      ],
      "events": [
        {
          "id": "0198f7c3-0001-7000-9000-cccccccccccc",
          "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
          "event_type": "START",
          "occurred_at": "2026-08-25T09:11:58.004Z"
        }
      ]
    }
  }
}
```

**Response fields**

| Field | Type | Description |
| ----- | ---- | ----------- |
| `ticket` | object | The full ticket row. |
| `availableTransitions` | array | **Render your action buttons from this.** Raw `workflow_transitions` rows joined to the target state, already filtered by the caller's `roleCode` and actor type `USER`, ordered by `display_order`. The engine re-checks everything at execution, so the interface cannot offer a move it will reject. |
| `availableTransitions[].code` | string | **Send this as `transitionCode`.** |
| `availableTransitions[].label` | string | Button text. |
| `availableTransitions[].requires_reason` | boolean | When `true`, prompt for `reason` — omitting it is a `400`. |
| `availableTransitions[].requires_assignment` | boolean | When `true`, the ticket must be assigned first, else `400`. |
| `availableTransitions[].to_state_code` / `to_state_name` | string | Where the button leads. |
| `availableTransitions[].is_resolved` / `is_closed` / `is_terminal` | boolean | For confirmation dialogs. |
| `ola.instances` | array | The clocks: one per `target_type` (`RESPONSE`, `RESOLUTION`), ordered by `target_type`. Raw `ticket_ola_instances` rows. |
| `ola.instances[].requires_intervention` | boolean | `true` means the scheduler gave up after repeated failures; a human must clear it. Surface it to administrators. |
| `ola.events` | array | Raw `ticket_ola_events`, ordered by `occurred_at` — the clock's own history (`START`, `PAUSE`, `RESUME`, `WARNING`, `ESCALATION`, `BREACH`, `EXTENSION`, `RETARGET`, `STOP`, `INTERVENTION_REQUIRED`). |

`ola.instances` is an **empty array** when no OLA policy resolved for the ticket — a real
outcome, not an error.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `403` | `FORBIDDEN` | Account not `ACTIVE`, or no department. |
| `404` | `NOT_FOUND` | *"Ticket not found"* — genuinely absent, **or** in another department, **or** an `EMPLOYEE` reading a colleague's ticket. **Do not distinguish these** — that is the point. |
| `422` | `VALIDATION_ERROR` | `id` is not a uuid. |

**Frontend Usage** — The detail pane. **Reading this does not clear the unread badge** — call
`POST /tickets/:id/read` explicitly when the user actually looks at it.

**Dependencies / Related APIs** — `GET /tickets/:id/timeline`,
`GET /tickets/:id/collaborations` (agents), `POST /tickets/:id/read`,
`POST /tickets/:id/transitions`.

---

#### `GET /tickets/:id/timeline`

**Purpose** — The ticket's history. **A requester sees only `visibility = 'EMPLOYEE'` rows**,
read through a partial index that does not contain internal rows at all — so a forgotten WHERE
clause cannot leak an internal note.

**Authentication** — Required: **Yes**. Role: any, subject to `assertSameDepartment`.

**How much you get is decided by ROLE alone**:

| Caller role | `activity` | `statusHistory` | `assignmentHistory` | `fieldChanges` |
| ----------- | ---------- | --------------- | ------------------- | -------------- |
| `EMPLOYEE` | `EMPLOYEE`-visibility rows only | **`[]`** | **`[]`** | **`[]`** |
| Any other role | all rows | full | full | full |

Whether you are the requester decides **if** you may read the ticket; your **role** decides
**how much**.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | uuid | **Yes** | |

**Query Parameters** — `None`. (The activity limit is fixed at **200** rows server-side, newest
first. There is no pagination on this endpoint.)

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "activity": [
      {
        "id": "0198f7c4-0001-7000-9000-dddddddddddd",
        "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
        "activity_type": "EMAIL_RECEIVED",
        "visibility": "EMPLOYEE",
        "description": "Reply from manish.pandey@gera.in: Re: Replacement ID card needed",
        "collaboration_id": null,
        "graph_message_id": null,
        "inbound_message_id": "0198f7c5-0001-7000-9000-eeeeeeeeeeee",
        "performed_by": null,
        "actor_type": "EMAIL",
        "occurred_at": "2026-08-26T07:40:11.221Z",
        "performed_by_name": null
      },
      {
        "id": "0198f7c4-0002-7000-9000-dddddddddddd",
        "activity_type": "INTERNAL_NOTE",
        "visibility": "INTERNAL",
        "description": "checked the register, card was handed back",
        "performed_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
        "actor_type": "USER",
        "occurred_at": "2026-08-25T11:02:00.000Z",
        "performed_by_name": "Manish Pandey"
      }
    ],
    "statusHistory": [
      {
        "id": "0198f7c6-0001-7000-9000-ffffffffffff",
        "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
        "state_id": "0198f5a0-4444-7000-9aaa-0c1d2e3f4a5b",
        "previous_state_id": null,
        "transition_id": null,
        "started_at": "2026-08-25T09:11:58.004Z",
        "ended_at": null,
        "duration_wall_minutes": null,
        "duration_working_minutes": null,
        "is_ola_paused": false,
        "changed_by_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
        "actor_type": "USER",
        "reason": null,
        "state_code": "IN_PROGRESS",
        "state_name": "In Progress",
        "previous_state_code": null,
        "changed_by_name": "Manish Pandey"
      }
    ],
    "assignmentHistory": [
      {
        "id": "0198f7c7-0001-7000-9000-000000000001",
        "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
        "sequence_no": 1,
        "assigned_to_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
        "assigned_from_user_id": null,
        "assigned_by_user_id": null,
        "assignment_type": "RULE",
        "routing_rule_id": "0198f5a0-8888-7000-9aaa-0c1d2e3f4a5b",
        "ooo_id": null,
        "delegation_depth": 0,
        "escalation_stage_no": null,
        "assigned_at": "2026-08-25T09:12:00.000Z",
        "released_at": null,
        "working_minutes": null,
        "reason": null,
        "assigned_to_name": "Manish Pandey",
        "assigned_from_name": null
      }
    ],
    "fieldChanges": [
      {
        "id": "0198f7c8-0001-7000-9000-000000000002",
        "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
        "field_name": "category_id",
        "old_value": "01a018f5-67e6-73d0-a282-9b8f73597b16",
        "new_value": "01a018f5-67e0-78c0-a1cb-5166a1e2aa88",
        "old_label": "Finance",
        "new_label": "Admin",
        "changed_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
        "actor_type": "USER",
        "changed_at": "2026-08-25T10:30:00.000Z",
        "changed_by_name": "Manish Pandey"
      }
    ]
  }
}
```

**Response fields**

| Block | Ordering | Notes |
| ----- | -------- | ----- |
| `activity` | `occurred_at` **DESC**, max 200 | The human-readable timeline. `activity_type` and `visibility` from the enums. `performed_by` is `null` for `SYSTEM`/`SCHEDULER`/`EMAIL` actors. |
| `statusHistory` | `started_at` **ASC** | Intervals; **exactly one row has `ended_at: null`** (the current state). `duration_working_minutes` is computed on the department calendar when the interval closes. |
| `assignmentHistory` | `sequence_no` **ASC** | Intervals; one open row (`released_at: null`) when assigned. `assigned_from_user_id` on an `OOO_DELEGATION` row is the **original owner**. |
| `fieldChanges` | `changed_at` **DESC** | `old_label`/`new_label` are stored alongside the raw uuids, because a category may be renamed later and a bare uuid renders as nothing useful. |

> **`INTERNAL_NOTE` and `COLLABORATION_NOTE` are `INTERNAL` by CHECK constraint.** Collaboration
> notes appear in `activity` for an agent, but the collaboration thread itself is
> `GET /tickets/:id/collaborations` — the two endpoints are separate on purpose, and there is
> deliberately no merged payload.

**Error Responses** — `401`, `403`, `404` (*"Ticket not found"*, including another
department's or a colleague's), `422` (bad uuid).

**Frontend Usage** — The activity feed. For a requester, render `activity` only — the other
three arrays are empty by design, not by failure.

**Dependencies / Related APIs** — `GET /tickets/:id`, `GET /tickets/:id/collaborations`,
`POST /tickets/:id/notes`.

---

#### `GET /tickets/:id/transitions`

**Purpose** — *What can I do from here?* The legal next moves, as data. **The same rows
`POST /tickets/:id/transitions` validates against**, so the UI's buttons and the engine's rules
cannot drift.

**Authentication** — Required: **Yes**. Role: any, subject to `assertSameDepartment`.
The list is filtered by the caller's `roleCode` and actor type `USER`.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | uuid | **Yes** | |

**Query Parameters** — `None`

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`. `data` is the **array itself** (not wrapped in an object):

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "0198f5a0-9001-7000-9aaa-0c1d2e3f4a5b",
      "code": "RESOLVE",
      "label": "Resolve",
      "from_state_id": "0198f5a0-4444-7000-9aaa-0c1d2e3f4a5b",
      "to_state_id": "0198f5a0-5555-7000-9aaa-0c1d2e3f4a5b",
      "requires_reason": false,
      "requires_assignment": true,
      "allowed_role_codes": ["SPOC", "MANAGER"],
      "allowed_actor_types": ["USER"],
      "display_order": 1,
      "to_state_code": "RESOLVED",
      "to_state_name": "Resolved",
      "state_category": "RESOLVED",
      "is_resolved": true,
      "is_closed": false,
      "is_terminal": false
    }
  ]
}
```

Same row shape as `availableTransitions` on `GET /tickets/:id` — that field is this endpoint's
result, inlined.

> A transition with an **empty** `allowed_role_codes` array is open to every role. An empty
> `allowed_actor_types` is open to every actor type.

**Error Responses** — `401`, `403`, `404` (*"Ticket not found"*), `422` (bad uuid).

**Frontend Usage** — Use `GET /tickets/:id` when you need the ticket anyway (the transitions
ride along). Use this endpoint to refresh the buttons alone after a transition, without
re-fetching the whole ticket.

**Dependencies / Related APIs** — `POST /tickets/:id/transitions`.

---

### 11.8 Tickets — Writes

> Everything in this section is additionally subject to the **write rate limiter: 60 requests
> per minute** per user.
>
> **The frontend asks for outcomes.** It never writes a history table and never sets a status
> column. There is deliberately no `PATCH /tickets/:id`.

---

#### `POST /tickets`

**Purpose** — Raise a ticket from the portal or by an agent on someone's behalf.

Writes atomically: `ticket_number_sequences`, `tickets`, `ticket_status_history`,
`ticket_assignment_history`, `ticket_activity`, `ticket_ola_instances`, `ticket_ola_events`.
A failure anywhere rolls back all of it — the number returns to the sequence and nothing
half-exists.

**Authentication** — Required: **Yes**. Role: **any** (an `EMPLOYEE` may raise their own).
Naming a `requesterUserId` other than yourself requires one of
`SPOC`, `MANAGER`, `DEPT_ADMIN`, `DEPT_HEAD`, `SUPER_ADMIN`.

**Path Parameters** — `None`

**Query Parameters** — `None`

**Headers**

| Header | Required | Description |
| ------ | -------- | ----------- |
| `Content-Type` | Yes | `application/json` |

**Request Body**

```json
{
  "subject": "Replacement ID card needed",
  "description": "I lost my ID card yesterday. Please issue a replacement.",
  "categoryId": "01a018f5-67e0-78c0-a1cb-5166a1e2aa88",
  "subcategoryId": "01a018f5-6810-7d8e-af72-f4966ea8c31b",
  "priorityId": "01a018f5-6776-7081-b5cb-f574403a003e",
  "sourceCode": "PORTAL"
}
```

| Field | Type | Required | Default | Description | Validation |
| ----- | ---- | -------- | ------- | ----------- | ---------- |
| `subject` | string | **Yes** | — | Ticket title | 1–500 chars |
| `description` | string | No | `null` | Body text | ≤ 50 000 chars |
| `requesterUserId` | uuid \| null | No | the caller | Raise **on behalf of** someone. Agent roles only. | uuid |
| `requesterEmail` | string | No | — | Snapshot email for a requester with **no account**. **Only honoured for agent roles**; ignored otherwise, because for everyone else the snapshot is loaded from `users` once the id is pinned. | valid email |
| `categoryId` | uuid \| null | No | `null` | Category. **Required when `department_settings.require_category` is `true`** (default). | uuid |
| `subcategoryId` | uuid \| null | No | `null` | Requires `categoryId` (CHECK). Required when `require_subcategory` is on. | uuid |
| `priorityId` | uuid \| null | No | the department default | Falls back to the department's default priority, then to a platform-wide default. | uuid |
| `sourceCode` | enum | No | **`PORTAL`** | `EMAIL` \| `PORTAL` \| `MANUAL` \| `API` \| `OTHER` | enum |

**Deliberately NOT accepted** — `stateId`, `assignedToUserId`, `ticketNumber`,
`firstAssignedAt`, `departmentId`. Those are outcomes the engine produces, not inputs a caller
may assert. (`departmentId` comes from `scopeToDepartment`.)

**Server-side effects**

| Effect | Rule |
| ------ | ---- |
| `ticket_number` | Generated from `ticket_number_format`. |
| `state_id` | The workflow's initial state. |
| `classification_status` | **`CONFIRMED`** when a human supplied `categoryId` (and `classified_by_user_id` / `classified_at` are stamped); otherwise **`UNCLASSIFIED`**. |
| `assigned_to_user_id` | Routed automatically **only when** `auto_assign_on_create` is on **and** `assignment_strategy = RULE_BASED`. If nothing matches, the ticket is created **unassigned** — a real outcome, not a failure. |
| OLA clocks | Started when `ola_start_trigger = ON_CREATE`, **or** as soon as the ticket has an assignee. |
| `root_ticket_id` | Points at the ticket itself. |

**Success Response** — `201`. `data` is the **ticket row itself** (no wrapper):

```json
{
  "success": true,
  "message": "Ticket created",
  "data": {
    "id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
    "ticket_number": "HR-2026-00042",
    "subject": "Replacement ID card needed",
    "state_id": "0198f5a0-4444-7000-9aaa-0c1d2e3f4a5b",
    "classification_status": "CONFIRMED",
    "assigned_to_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
    "priority_id": "01a018f5-6776-7081-b5cb-f574403a003e",
    "version": 2,
    "created_at": "2026-08-26T10:41:22.004Z"
  }
}
```

> The response carries `state_id` but **no `state_code`** — this is the raw row, not the
> enriched list shape. Resolve the label from your cached `workflowStates`, or re-fetch
> `GET /tickets/:id`.

**Error Responses**

| Status | `code` | Message / when |
| ------ | ------ | -------------- |
| `400` | `BAD_REQUEST` | *"This department requires a category"* — `require_category` is on and `categoryId` was omitted. |
| `400` | `BAD_REQUEST` | *"This department requires a subcategory"*. |
| `403` | `FORBIDDEN` | *"You cannot raise a ticket on behalf of another user"* — a non-agent sent a `requesterUserId` that is not their own. **A 403, not a silent override**, so a frontend bug surfaces instead of quietly filing tickets under the wrong name. |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `403` | `FORBIDDEN` / `CROSS_DEPARTMENT` | Account not `ACTIVE`; no department; cross-department attempt. |
| `409` | `CONFLICT` | A PostgreSQL constraint violation translated to a friendly conflict (e.g. a cross-department `categoryId` caught by the composite FK). |
| `422` | `VALIDATION_ERROR` | Missing `subject`, `subject` > 500, bad uuid, unknown `sourceCode`, invalid `requesterEmail`. |
| `429` | `TOO_MANY_REQUESTS` | Write limiter (60/min). |
| `500` | `INTERNAL_ERROR` | *"This department has no settings row — it is not onboarded"*, *"This department has no active workflow configured"*, *"This department's workflow has no initial state"* — all configuration faults; check `GET …/readiness`. |

**Frontend Usage** — The "raise a ticket" form. **A `categoryId` is required for a department
with `require_category` on**, and there is **no endpoint to list categories** — see
[Known Issues](#backend-api-notes--known-issues) #1.

**Dependencies / Related APIs** — After creating, `GET /tickets/:id` for the enriched view and
the transition buttons.

---

#### `POST /tickets/:id/read`

**Purpose** — *"I have seen this ticket."* Clears **only this user's** unread markers — the
assignee reading a reply must not clear the requester's badge.

A **verb, not a side effect of `GET /tickets/:id`**: a GET that writes means a prefetch, a link
preview or a background refresh of the detail pane marks a ticket read on the user's behalf.
Reading is something the person did, so their client says when.

**Authentication** — Required: **Yes**. Role: any, subject to `assertSameDepartment`.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | uuid | **Yes** | |

**Query Parameters** — `None`

**Request Body** — **`None`.** What it clears is derived from `req.user` and the ticket.

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Marked as read",
  "data": { "ticketId": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa", "marked": 2 }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `ticketId` | uuid | Echo. |
| `marked` | integer | How many notification rows were flipped. **Idempotent — a second call reports `0`** and preserves the original read time. |

Only `EMAIL_RECEIVED` notifications are cleared — that is the unread badge.
`COLLABORATION_REPLY` and the OLA codes are untouched.

**Error Responses** — `401`, `403`, `404` (*"Ticket not found"*), `422` (bad uuid),
`429` (write limiter).

**Frontend Usage** — Call when the user genuinely opens the ticket (not on prefetch). Then
decrement your local badge, or re-fetch `GET /tickets/counts`.

**Dependencies / Related APIs** — `GET /tickets` (`has_unread`, `unread_count`),
`GET /tickets/counts` (`unread`, `unreadByState`).

---

#### `POST /tickets/:id/transitions`

**Purpose** — **The only way a ticket changes state.** The move must exist as a row in
`workflow_transitions`, be permitted for the caller's role and actor type, and carry whatever
the edge declares mandatory.

Writes in one transaction: `tickets.state_id`, `ticket_status_history` (close the open
interval, open a new one), `ticket_activity`, and the OLA clock (pause / resume / stop).

**Authentication** — Required: **Yes**. Role: **whatever the transition's
`allowed_role_codes` says** — there is no blanket role gate on this route.
Subject to `assertSameDepartment`.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | uuid | **Yes** | |

**Query Parameters** — `None`

**Headers** — `Content-Type: application/json`

**Request Body** — **either `transitionCode` or `toStateId` is required.**

```json
{ "transitionCode": "RESOLVE", "reason": "card reissued and collected", "expectedVersion": 3 }
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `transitionCode` | string | Conditional | **Preferred** — it is what the button carries. From `availableTransitions[].code`. | 1–40 chars |
| `toStateId` | uuid \| null | Conditional | Alternative target. Prefer `transitionCode`: a state uuid belongs to one workflow version. | uuid |
| `reason` | string | Conditional | **Required when the transition's `requires_reason` is `true`.** | ≤ 5 000 chars |
| `expectedVersion` | integer | No | Optimistic concurrency. Send `ticket.version`. Omitting skips the check. | positive integer |

Sending neither `transitionCode` nor `toStateId` → `422`,
*"Either transitionCode or toStateId is required"*.

**Success Response** — `200`. `message` names the destination.

```json
{
  "success": true,
  "message": "Ticket moved to RESOLVED",
  "data": {
    "ticket": { "…": "the updated ticket row, version bumped, resolved_at and auto_close_due_at stamped" },
    "transition": {
      "code": "RESOLVE",
      "label": "Resolve",
      "fromStateCode": "IN_PROGRESS",
      "toStateCode": "RESOLVED"
    }
  }
}
```

**Lifecycle side effects on `data.ticket`**

| Transition flag | Effect |
| --------------- | ------ |
| `is_resolved` | `resolved_at` stamped (if not already), `auto_close_due_at` computed as `auto_close_days` **working** days out on the department calendar. OLA clocks **stopped**. |
| `is_closed` | `closed_at` stamped (**END DATE**), `auto_close_due_at` cleared. OLA clocks **stopped**. |
| Neither, from a resolved state (reopen) | `resolved_at`, `closed_at`, `auto_close_due_at` all cleared. OLA **resumed**. |
| `is_ola_paused` on the target state | OLA **paused** with reason `PENDING`. |
| otherwise | OLA **resumed**. |

**Error Responses**

| Status | `code` | Message / when | `details` |
| ------ | ------ | -------------- | --------- |
| `409` | `ILLEGAL_TRANSITION` | *"Transition IN_PROGRESS -> CLOSE is not permitted by this workflow"* | `{ fromStateCode, toStateCode, allowed: [{ code, label, toStateCode }] }` |
| `409` | `CONCURRENT_MODIFICATION` | `expectedVersion` mismatch — *"This ticket was modified by someone else — reload and try again"* | — |
| `400` | `BAD_REQUEST` | *"'Resolve' requires a reason"* (`requires_reason`) | — |
| `400` | `BAD_REQUEST` | *"'Resolve' requires the ticket to be assigned first"* (`requires_assignment`) | — |
| `403` | `FORBIDDEN` | *"Your role cannot perform this transition"* | `{ allowedRoleCodes: [...] }` |
| `403` | `FORBIDDEN` | *"A USER actor cannot perform this transition"* — the edge is scheduler-only | `{ allowedActorTypes: [...] }` |
| `401` | `UNAUTHORIZED` | No usable identity | — |
| `404` | `NOT_FOUND` | *"Ticket not found"* | — |
| `422` | `VALIDATION_ERROR` | Neither code nor state id; bad uuid; `reason` too long | — |
| `429` | `TOO_MANY_REQUESTS` | Write limiter | — |

> **The `409 ILLEGAL_TRANSITION` returns `details.allowed`** — the legal set, so the client can
> correct itself. If you see this, your buttons are stale: re-fetch
> `GET /tickets/:id/transitions`.

**Frontend Usage** — Render one button per `availableTransitions` entry, labelled `label`,
posting `{ transitionCode: code }`. Prompt for `reason` when `requires_reason`. Always send
`expectedVersion` in a shared queue.

**Dependencies / Related APIs** — `GET /tickets/:id` or `GET /tickets/:id/transitions` before;
re-fetch either afterwards to refresh the buttons.

---

#### `PATCH /tickets/:id/assignment`

**Purpose** — A human moving the ticket to a new owner, or taking it off the queue
(`assignedToUserId: null`).

A `MANUAL` assignment row closes whatever interval was open, **including an out-of-office
delegation** — which is why the OOO expiry job correctly finds nothing to revert afterwards.

**Authentication** — Required: **Yes**. Role: **`SPOC`, `MANAGER`, `DEPT_ADMIN`, `DEPT_HEAD`,
`SUPER_ADMIN`** (`requireRole`). An `EMPLOYEE` gets `403`.

> ⚠️ This route does **not** call `assertSameDepartment` on the ticket — the role gate is the
> only ticket-level check. See [Known Issues](#backend-api-notes--known-issues) #4.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | uuid | **Yes** | |

**Query Parameters** — `None`

**Headers** — `Content-Type: application/json`

**Request Body**

```json
{ "assignedToUserId": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10", "reason": "taking over from Priya", "expectedVersion": 3 }
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `assignedToUserId` | uuid \| **null** | **Yes** | The new owner. **`null` un-assigns**, closing the open assignment interval — the field is required but nullable, so `null` must be sent explicitly. | uuid or null |
| `reason` | string | No | Recorded on the assignment row and the activity entry. | ≤ 5 000 chars |
| `expectedVersion` | integer | No | Optimistic concurrency. | positive integer |

**Target user rules** (checked in order):

| Condition | Response |
| --------- | -------- |
| User does not exist | `404` *"User not found"* |
| User is in a different department from the ticket | `403` `CROSS_DEPARTMENT` *"That user belongs to a different department"* |
| User is not `ACTIVE`, or `is_assignable = false` | `400` *"That user cannot receive tickets"* |
| Already assigned to that user | `200`, no-op (`assignment: null`, `unassigned: false`) |

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Assignment updated",
  "data": {
    "ticket": { "…": "the updated ticket row" },
    "assignment": {
      "id": "0198f7c7-0002-7000-9000-000000000001",
      "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
      "sequence_no": 2,
      "assigned_to_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "assigned_from_user_id": "0198f5a2-9999-7a01-8f2b-6d1c9e77aa11",
      "assigned_by_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "assignment_type": "MANUAL",
      "delegation_depth": 0,
      "assigned_at": "2026-08-26T10:52:00.000Z",
      "released_at": null,
      "reason": "taking over from Priya"
    },
    "unassigned": false
  }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `ticket` | object | Updated row. `first_assigned_at` is set on the **first** assignment only and never moved again (**START DATE**); `reassignment_count` increments on later ones. |
| `assignment` | object \| null | The new `ticket_assignment_history` row. **`null`** when un-assigning, or when the ticket was already assigned to that user. |
| `unassigned` | boolean | Present when the service took the unassigned/no-op path. **Absent from the un-assign response**, which returns only `{ ticket, assignment: null }`. |

**Reassignment never touches the OLA table.** The clock belongs to the ticket, not the
assignee — a ticket reassigned four times has one `started_at` and four assignment rows.

**Error Responses** — `400` (target cannot receive tickets), `401`, `403` (`FORBIDDEN` role
refusal with `details.required`; `CROSS_DEPARTMENT` for the target user), `404` (*"Ticket not
found"* / *"User not found"*), `409` (`CONCURRENT_MODIFICATION`), `422` (missing
`assignedToUserId`, bad uuid), `429`.

Also `400` *"Ticket is already assigned to that user"* can surface from the history layer when
the same user is written as both from and to.

**Frontend Usage** — The assignee picker. **There is no endpoint to list assignable users** —
see [Known Issues](#backend-api-notes--known-issues) #1.

---

#### `PATCH /tickets/:id/classification`

**Purpose** — Correct or confirm the category. **One verb, three effects, deliberately
inseparable:**

1. the ticket's category changes → `ticket_field_changes`
2. routing is **re-resolved** → `ticket_assignment_history`
3. the classification corpus learns → `classification_examples` (**upsert**, never insert)

Step 2 is why "corrected but still on the wrong queue" cannot happen. Step 3 is an upsert on
`origin_ticket_id`: one ticket, one current label, always the latest human judgement.

**Authentication** — Required: **Yes**. Role: **agent roles** (`requireRole`).
⚠️ No `assertSameDepartment` — see [Known Issues](#backend-api-notes--known-issues) #4.

**Path Parameters** — `id` (uuid, required).

**Query Parameters** — `None`

**Headers** — `Content-Type: application/json`

**Request Body**

```json
{
  "categoryId": "01a018f5-67e0-78c0-a1cb-5166a1e2aa88",
  "subcategoryId": "01a018f5-6810-7d8e-af72-f4966ea8c31b",
  "confirmOnly": false,
  "reason": "this is an admin request, not finance",
  "expectedVersion": 3
}
```

| Field | Type | Required | Default | Description | Validation |
| ----- | ---- | -------- | ------- | ----------- | ---------- |
| `categoryId` | uuid | **Yes** | — | The correct category. | uuid |
| `subcategoryId` | uuid \| null | No | `null` | | uuid |
| `confirmOnly` | boolean | No | `false` | The weaker signal: *a human agreed* rather than changed anything. **When `true`, re-routing and OLA retargeting are skipped** even if the category did change. | boolean |
| `reason` | string | No | — | Echoed back on the response; not persisted to a column. | ≤ 5 000 chars |
| `expectedVersion` | integer | No | — | Optimistic concurrency. | positive integer |

**Behaviour**

| Outcome | `classification_status` written | `labelSource` in the corpus | Re-routes? |
| ------- | ------------------------------ | --------------------------- | ---------- |
| Category (or subcategory) **changed** | `CORRECTED` | `SPOC_CORRECTION` | **Yes**, unless `confirmOnly: true` |
| Nothing changed | `CONFIRMED` | `SPOC_CONFIRMED` | No |

`classified_by_user_id` and `classified_at` are stamped with the caller either way.
The OLA may be **retargeted at most once**, and only while no human had previously confirmed
the classification — past that point the commitment stands.

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Classification updated",
  "data": {
    "ticket": { "…": "the updated ticket row" },
    "corrected": true,
    "reason": "this is an admin request, not finance"
  }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `ticket` | object | Updated row — note the new `category_id`, `classification_status`, and possibly a new `assigned_to_user_id` and `routing_rule_id` from the re-route. |
| `corrected` | boolean | `true` when something actually changed (status `CORRECTED`), `false` when it was a confirmation. |
| `reason` | string \| undefined | Echo of the request field. |

**Error Responses** — `401`, `403` (role refusal; `CROSS_DEPARTMENT` from a composite FK),
`404` (*"Ticket not found"*), `409` (`CONCURRENT_MODIFICATION`, or a translated constraint
conflict for a cross-department `categoryId`), `422` (missing `categoryId`, bad uuid), `429`.

**Frontend Usage** — The "wrong category?" correction control. Show the AI's guess from
`ai_suggested_category_id` / `ai_confidence`; a `Confirm` button sends the same
`categoryId` (yielding `corrected: false`), a `Correct` button sends a different one. **Re-fetch
the ticket afterwards** — the assignee may have changed.

---

#### `PATCH /tickets/:id/priority`

**Purpose** — Change the priority. May change which OLA policy applies.

**Authentication** — Required: **Yes**. Role: **agent roles**.
⚠️ No `assertSameDepartment` — see [Known Issues](#backend-api-notes--known-issues) #4.

**Path Parameters** — `id` (uuid, required).

**Query Parameters** — `None`

**Headers** — `Content-Type: application/json`

**Request Body**

```json
{ "priorityId": "01a018f5-6776-71e3-82a2-996187ee2dc0", "reason": "employee is travelling on Monday", "expectedVersion": 3 }
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `priorityId` | uuid | **Yes** | The new priority. Must belong to the ticket's department **or** be platform-wide (`department_id IS NULL`). | uuid |
| `reason` | string | No | Appended to the activity description. | ≤ 5 000 chars |
| `expectedVersion` | integer | No | Optimistic concurrency. | positive integer |

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Priority updated",
  "data": { "ticket": { "…": "the updated ticket row" }, "changed": true }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `ticket` | object | Updated row. |
| `changed` | boolean | **`false` when the ticket already had that priority** — a no-op, and `ticket` is the row as it was (version not bumped). |

Writes `ticket_field_changes` (with `old_label` / `new_label` priority names) and a
`PRIORITY_CHANGED` activity row, both `INTERNAL`.

**Error Responses** — `401`, `403` (role refusal; `CROSS_DEPARTMENT` — *"That priority belongs
to a different department"*), `404` (*"Ticket not found"* / *"Priority not found"*),
`409` (`CONCURRENT_MODIFICATION`), `422` (missing `priorityId`, bad uuid), `429`.

**Frontend Usage** — The priority dropdown. **There is no endpoint to list priorities** — see
[Known Issues](#backend-api-notes--known-issues) #1. Sort options by `severity_rank`
**descending** for most-urgent-first.

---

#### `POST /tickets/:id/notes`

**Purpose** — Write an **internal note**. `INTERNAL_NOTE` visibility is fixed to `INTERNAL` by
CHECK constraint, so it can never reach a requester's timeline.

**Authentication** — Required: **Yes**. Role: **agent roles** (`requireRole`), *and*
`assertSameDepartment` is applied. A requester has no business writing a note their own
timeline is filtered to exclude.

**Path Parameters** — `id` (uuid, required).

**Query Parameters** — `None`

**Headers** — `Content-Type: application/json`

**Request Body**

```json
{ "note": "checked the register, card was handed back on the 24th", "collaborationId": null }
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `note` | string | **Yes** | The note text. Stored as `ticket_activity.description`. | 1–50 000 chars |
| `collaborationId` | uuid \| null | No | Attach the note to a collaboration thread. | uuid |

**Success Response** — `201`. `data` is the created `ticket_activity` row:

```json
{
  "success": true,
  "message": "Note added",
  "data": {
    "id": "0198f7c4-0003-7000-9000-dddddddddddd",
    "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
    "activity_type": "INTERNAL_NOTE",
    "visibility": "INTERNAL",
    "description": "checked the register, card was handed back on the 24th",
    "collaboration_id": null,
    "graph_message_id": null,
    "inbound_message_id": null,
    "performed_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
    "actor_type": "USER",
    "occurred_at": "2026-08-26T11:03:44.812Z"
  }
}
```

`visibility` is **always `INTERNAL`** — it is forced, not taken from the request.

**Error Responses** — `401`, `403` (role refusal, `details.required`), `404` (*"Ticket not
found"*), `422` (empty or over-long `note`, bad uuid), `429`.

**Frontend Usage** — The internal-notes composer in the agent view. Optimistically append the
returned row to your `activity` list.

**Dependencies / Related APIs** — `GET /tickets/:id/timeline` (the note appears in `activity`
for agents only). For a note on a **collaboration** thread, prefer
`POST /tickets/:id/collaborations/:collaborationId/notes`, which also advances the
collaboration status.

---

#### `POST /tickets/:id/snooze`

> ✅ **Working.** This previously returned `500` on every call (the route called
> `snoozeService.snooze`, which does not exist). It is now a controller function and verified
> returning `201`. It has also gained `requireRole(...AGENT_ROLES)` and an
> `assertSameDepartment` check, so an EMPLOYEE gets `403` and a cross-department agent `404`.
>
> Two companions now exist — `DELETE /tickets/:id/snooze` to cancel, and
> `GET /tickets/:id/snooze` to read the open snooze plus `snoozeCountUsed` / `snoozeMaxCount`.
> Neither is feature-gated; only the POST is. Snooze state is deliberately **not** on
> `GET /tickets/:id`, which serves requesters.

**Purpose** — *"Stop showing me this until Tuesday."* Every snooze is an **event row**, never a
`tickets.is_snoozed` boolean, so the count and the durations stay reportable.

**Authentication** — Required: **Yes**. Role: **any** (no `requireRole` on this route).
Feature: **`SNOOZE`** must be enabled for the department.

**Path Parameters** — `id` (uuid, required).

**Query Parameters** — `None`

**Headers** — `Content-Type: application/json`

**Request Body**

```json
{ "snoozeUntil": "2026-09-01T10:00:00Z", "reason": "waiting on the vendor" }
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `snoozeUntil` | ISO 8601 datetime | **Yes** | When the ticket should resurface. | Coerced to a date; **must be in the future** |
| `reason` | string | No | | ≤ 5 000 chars |

**Limits enforced at write time**, from `department_settings`:

| Limit | Setting | Failure |
| ----- | ------- | ------- |
| How many times this ticket may ever be snoozed | `snooze_max_count` (default 3) | `400` — *"This ticket has already been snoozed 3 times (limit 3)"* |
| How long, in **working** minutes on the department calendar | `snooze_max_working_minutes` (default 1440) | `400` — *"That is 2400 working minutes; this department allows 1440"* |
| Ticket must not be closed | — | `400` — *"A closed ticket cannot be snoozed"* |

A snooze over a weekend costs almost nothing against an 8h/day calendar, which is why the limit
is in working minutes rather than wall-clock time.

**Success Response** — `201`. `data` is the created `ticket_snoozes` row:

```json
{
  "success": true,
  "message": "Ticket snoozed",
  "data": {
    "id": "0198f7c9-0001-7000-9000-000000000003",
    "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
    "sequence_no": 1,
    "snoozed_by_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
    "reason": "waiting on the vendor",
    "snoozed_at": "2026-08-26T11:10:00.000Z",
    "snooze_until": "2026-09-01T10:00:00.000Z",
    "ended_at": null,
    "end_trigger": null,
    "working_minutes": null
  }
}
```

The OLA is **paused with reason `SNOOZE`** only when the resolved OLA policy has
`pause_on_snooze`. A snooze ends three ways, and `end_trigger` is what records which:

| `end_trigger` | Closed by |
| ------------- | --------- |
| `EXPIRED` | The `snooze-wakeup` job, when `snooze_until` passes. Also sends the one IN_APP notification snooze produces — to `snoozed_by_user_id`, not the assignee. Off unless `HELPDESK_JOBS_ENABLED=true`. |
| `MANUAL` | `DELETE /tickets/:id/snooze`. |
| `REPLY_RECEIVED` | An inbound customer reply (`intake.service.attachReply`). **Not reachable today** — the `email-intake` cron entry is commented out in `jobs/index.js`, so nothing calls the intake worker. A *collaboration* reply deliberately does not cancel a snooze: the customer did not answer, so the wait is not over. |

Nothing else ends a snooze — not an agent note, not a workflow transition, not reassignment, and
not closure (see Known Issues #5 for the closure consequence).

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `500` | `INTERNAL_ERROR` | **Today, always** — see the warning above. |
| `403` | `FEATURE_DISABLED` | `SNOOZE` not enabled — `details: { featureCode: "SNOOZE" }`. |
| `400` | `BAD_REQUEST` | Closed ticket; count limit; working-minutes limit; `snoozeUntil` in the past. |
| `401` | `UNAUTHORIZED` | No usable identity. |
| `404` | `NOT_FOUND` | *"Ticket not found"*. |
| `422` | `VALIDATION_ERROR` | Missing/unparsable `snoozeUntil`, or *"snoozeUntil must be in the future"*. |
| `429` | `TOO_MANY_REQUESTS` | Write limiter. |

---

### 11.9 Collaboration

**A second set of eyes, without transferring ownership.** A collaborator never appears in
`ticket_assignment_history`, because they never owned the ticket.

**A ticket has two kinds of thread and they never mix:**

```
tickets.conversation_id                  customer  <-> helpdesk
collaboration_requests.conversation_id   helpdesk  <-> collaborator   (N per ticket)
```

**All four routes are agent-only.** Collaboration notes are `INTERNAL` by CHECK constraint and
a requester's timeline is filtered to exclude them, so letting a requester read the thread
through a different endpoint would undo that by the back door.

**The backend sends no collaboration mail.** The frontend creates the thread by calling
Microsoft Graph with the acting user's own token, then reports the thread here so inbound
replies route back to this collaboration instead of becoming a new junk ticket.

#### Two thread keys, and the second one is the trustworthy one

| Key | Property |
| --- | -------- |
| `conversationId` | An Exchange construct computed **per mailbox**. The id your agent's mailbox shows need not be the one the support mailbox computes. Convenient, not guaranteed. |
| `seedInternetMessageId` | The **RFC 5322 message id** of the outbound mail. Identical in every mailbox that receives it. |

**So: CC the support mailbox on the collaboration mail, and report
`seedInternetMessageId`.** When that CC'd copy arrives, intake matches the seed exactly and
writes the support mailbox's own `conversation_id` itself. The thread repairs itself and no
reply can be stranded. Send `conversationId` too if you have it — it is used directly when it
matches and harmlessly superseded when it does not.

**Several collaborations may be open on one ticket at once** — one per thread, so Finance and
Legal can be asked separately. A thread belongs to **exactly one** collaboration. If any
collaboration on the ticket pauses the OLA, the clock resumes only when the **last** unresolved
one is closed.

---

#### `GET /tickets/:id/collaborations`

**Purpose** — Every collaboration on the ticket, each with its participants and its notes — the
internal conversation panel.

**Authentication** — Required: **Yes**. Role: **agent roles**
(`SPOC`, `MANAGER`, `DEPT_ADMIN`, `DEPT_HEAD`, `SUPER_ADMIN`). `assertSameDepartment` applies.

**Feature gate: none, deliberately.** Disabling `COLLABORATION` is forward-only — it blocks new
writes and never hides what they created, so collaborations recorded while the feature was on
stay readable after it is switched off.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | uuid | **Yes** | The ticket. |

**Query Parameters** — `None`

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "collaborations": [
      {
        "id": "0198f7d1-0001-7000-9000-111111111111",
        "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
        "requested_by_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
        "purpose": "need finance to confirm the invoice",
        "status": "ANSWERED",
        "pauses_ola": true,
        "extension_minutes": 0,
        "conversation_id": "AAQkADk3ZjM2...",
        "seed_internet_message_id": "<a1b2c3@gera.in>",
        "started_at": "2026-08-25T14:00:00.000Z",
        "completed_at": null,
        "last_reply_at": "2026-08-26T08:15:00.000Z",
        "replies_after_close": 0,
        "requested_by_name": "Manish Pandey",
        "requested_by_email": "manish.pandey@gera.in",
        "participants": [
          {
            "userId": "0198f5a3-1111-7a01-8f2b-6d1c9e77aa12",
            "name": "A Patel",
            "email": "a.patel@gera.in",
            "departmentId": "0198f5a0-2222-7000-9aaa-0c1d2e3f4a5c",
            "departmentName": "Finance",
            "role": "CONTRIBUTOR",
            "invitedAt": "2026-08-25T14:00:00.000Z",
            "respondedAt": "2026-08-26T08:15:00.000Z",
            "removedAt": null
          }
        ],
        "notes": [
          {
            "id": "0198f7d2-0001-7000-9000-222222222222",
            "activity_type": "COLLABORATION_NOTE",
            "description": "Reply from a.patel@gera.in: Re: invoice confirmation",
            "collaboration_id": "0198f7d1-0001-7000-9000-111111111111",
            "inbound_message_id": "0198f7d3-0001-7000-9000-333333333333",
            "occurred_at": "2026-08-26T08:15:00.000Z",
            "actor_type": "EMAIL",
            "performed_by": null,
            "performed_by_name": null,
            "performed_by_email": null,
            "sender_email": "a.patel@gera.in"
          }
        ]
      }
    ]
  }
}
```

**Response fields**

| Field | Type | Description |
| ----- | ---- | ----------- |
| `status` | enum | `OPEN` \| `ANSWERED` \| `CLOSED` \| `EXPIRED`. |
| `pauses_ola` | boolean | **Copied from the OLA policy at creation**, not read live — changing the policy mid-collaboration must not retroactively change whether the clock was running. |
| `extension_minutes` | integer | The alternative to pausing: the clock kept running and is extended by this much on close. **Mutually exclusive with `pauses_ola` by CHECK** — pausing *and* extending would double-count the delay. |
| `conversation_id` | string \| null | The collaboration's own Graph thread. Null until bound. |
| `seed_internet_message_id` | string \| null | RFC 5322 id of the outbound seed mail. |
| `last_reply_at` | timestamp \| null | Stamped on **every** reply, including the second and third on a thread, and including replies after close. |
| `replies_after_close` | integer | Replies that arrived after the collaboration settled. **They attach without reopening it** — so a stray "thanks!" three weeks later cannot re-pause a clock that has properly resumed. |
| `completed_at` | timestamp \| null | Set when closed or expired. |
| `requested_by_name` / `requested_by_email` | string | Who asked. |
| `participants` | array | **camelCase**, ordered by `invitedAt`. Always present (`[]` when empty). |
| `participants[].departmentId` / `departmentName` | uuid / string \| null | **The snapshot from invite time**, not the user's current team — people move and that must not rewrite history. |
| `participants[].respondedAt` | timestamp \| null | Where "who has replied" lives, so the UI can show *Finance ✓ / Legal ⏳*. **Only set for a current participant.** |
| `participants[].removedAt` | timestamp \| null | Invitation withdrawn, or the collaboration was closed (closing stamps `removed_at` on everyone). |
| `notes` | array | The collaboration thread's own timeline, `occurred_at` **ASC**, max 200. `snake_case`, with `sender_email` joined from the inbound message. |

Collaborations are ordered `started_at` **DESC** (newest first).

**Error Responses** — `401`, `403` (role refusal, `details.required`), `404` (*"Ticket not
found"*), `422` (bad uuid).

**Frontend Usage** — The internal collaboration panel, next to but **separate from** the
timeline. Ask twice; the backend will never merge them.

---

#### `POST /tickets/:id/collaborations`

**Purpose** — Record a collaboration. The frontend has already sent (or is about to send) the
mail with the acting user's own Graph token; this registers the collaboration and, if the thread
is known, registers it for inbound routing.

**Authentication** — Required: **Yes**. Role: **agent roles**.
Feature: **`COLLABORATION`**. `assertSameDepartment` applies.

**Path Parameters** — `id` (uuid, required).

**Query Parameters** — `None`

**Headers** — `Content-Type: application/json`

**Request Body**

```json
{
  "purpose": "need finance to confirm the invoice",
  "participants": [
    { "userId": "0198f5a3-1111-7a01-8f2b-6d1c9e77aa12", "participantRole": "CONTRIBUTOR" }
  ],
  "conversationId": "AAQkADk3ZjM2...",
  "seedInternetMessageId": "<a1b2c3@gera.in>"
}
```

| Field | Type | Required | Default | Description | Validation |
| ----- | ---- | -------- | ------- | ----------- | ---------- |
| `purpose` | string | **Yes** | — | What you are asking for. Becomes the `COLLABORATION_REQUESTED` activity description and the notification body. | 1–5 000 chars |
| `participants` | array | **Yes** | — | Who to ask. **At least one entry.** | min length 1 |
| `participants[].userId` | uuid | **Yes** | — | Must be an `ACTIVE`, not-deleted user. **Cross-department is deliberately allowed** — reaching someone the department does not employ is the entire point. | uuid |
| `participants[].participantRole` | enum | No | `CONTRIBUTOR` | `CONTRIBUTOR` \| `REVIEWER` | enum |
| `conversationId` | string | No | — | The Graph thread, if you sent the mail first. | 1–500 chars |
| `seedInternetMessageId` | string | No | — | RFC 5322 id of the outbound mail. **Strongly preferred** — see above. | 1–500 chars |

Both thread keys are optional: **open first and bind later with `PATCH`, or send the mail first
and open with the thread already known.** Both orders are supported; neither is required. A
collaboration with no thread simply has no inbound route until it is bound.

**Success Response** — `201`

```json
{
  "success": true,
  "message": "Collaboration opened",
  "data": {
    "collaboration": {
      "id": "0198f7d1-0001-7000-9000-111111111111",
      "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
      "requested_by_user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "purpose": "need finance to confirm the invoice",
      "status": "OPEN",
      "pauses_ola": true,
      "extension_minutes": 0,
      "conversation_id": "AAQkADk3ZjM2...",
      "seed_internet_message_id": "<a1b2c3@gera.in>",
      "started_at": "2026-08-25T14:00:00.000Z",
      "completed_at": null,
      "replies_after_close": 0
    },
    "participants": [
      {
        "collaboration_id": "0198f7d1-0001-7000-9000-111111111111",
        "user_id": "0198f5a3-1111-7a01-8f2b-6d1c9e77aa12",
        "department_id": "0198f5a0-2222-7000-9aaa-0c1d2e3f4a5c",
        "participant_role": "CONTRIBUTOR",
        "invited_at": "2026-08-25T14:00:00.000Z",
        "responded_at": null,
        "removed_at": null
      }
    ]
  }
}
```

Note the shape difference from the `GET`: `participants` here are **raw rows (`snake_case`)**,
because these are the rows just inserted. Only the users who were actually invited appear —
inactive or deleted users are silently skipped.

**Side effects** — OLA paused with reason `COLLABORATION` when the policy says so (a no-op if
another collaboration already paused it); a `COLLABORATION_REQUESTED` `INTERNAL` activity row;
an in-app `COLLABORATION_REQUESTED` notification to each invited participant.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `400` | `BAD_REQUEST` | *"A closed ticket cannot be collaborated on"*. |
| `400` | `BAD_REQUEST` | *"None of the requested participants are active users"* — every `userId` was inactive, deleted, or already an un-removed participant. |
| `403` | `FEATURE_DISABLED` | `COLLABORATION` not enabled — `details: { featureCode }`. |
| `403` | `FORBIDDEN` | Role refusal, `details.required`. |
| `404` | `NOT_FOUND` | *"Ticket not found"*. |
| `409` | `COLLABORATION_THREAD_TAKEN` | *"That email thread already belongs to another collaboration"*. |
| `422` | `VALIDATION_ERROR` | Missing `purpose`; empty `participants`; bad uuid; unknown `participantRole`. |
| `429` | `TOO_MANY_REQUESTS` | Write limiter. |

**Frontend Usage** —

1. Send the collaboration mail via Graph with the user's own token, **CC'ing the support
   mailbox**.
2. `POST` here with `purpose`, `participants` and `seedInternetMessageId` (plus
   `conversationId` if you have it).

**Dependencies / Related APIs** — `PATCH …/:collaborationId` to bind or close;
`GET …/collaborations` to render the panel.

---

#### `PATCH /tickets/:id/collaborations/:collaborationId`

**Purpose** — **Bind the email thread, change the status, or both in one call.** The two are
accepted together because the frontend's natural flow — send the mail, then report what it
created — often carries both.

**Binding happens BEFORE the status change**, deliberately: if a caller closes a collaboration
and registers its thread in the same request, the thread is still registered, so a late reply
has a route home instead of falling through to creating a junk ticket.

**Authentication** — Required: **Yes**. Role: **agent roles**. Feature: **`COLLABORATION`**.
`assertSameDepartment` applies, and the collaboration must belong to the ticket in the path.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | uuid | **Yes** | The ticket. |
| `collaborationId` | uuid | **Yes** | Must belong to that ticket, else `404`. |

**Query Parameters** — `None`

**Headers** — `Content-Type: application/json`. **No `If-Match`** — ticket-side resources do not
use ETags.

**Request Body** — **at least one of the three fields.**

```json
{ "conversationId": "AAQkADk3ZjM2...", "seedInternetMessageId": "<a1b2c3@gera.in>", "status": "CLOSED" }
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `conversationId` | string | Conditional | Bind the Graph thread. Idempotent — re-sending the same value is fine. | 1–500 chars |
| `seedInternetMessageId` | string | Conditional | Bind the RFC 5322 seed id. | 1–500 chars |
| `status` | enum | Conditional | **`ANSWERED` \| `CLOSED` \| `EXPIRED` only.** | enum |

**`OPEN` is deliberately not accepted.** A collaboration is opened by `POST` and never
re-opened by `PATCH` — a late reply attaches without resurrecting a settled collaboration,
which is what `replies_after_close` records.

Sending none of the three → `422`, *"Provide at least one of conversationId,
seedInternetMessageId or status"*.

**Status semantics**

| `status` | Effect |
| -------- | ------ |
| `ANSWERED` | A marker only; **settles nothing**. Requires the collaboration to currently be `OPEN`, else `400`. |
| `CLOSED` / `EXPIRED` | **Terminal.** Stamps `completed_at`, stamps `removed_at` on every participant, and settles the clock. Requires the collaboration to be unresolved (`OPEN` or `ANSWERED`), else `404`. |

**On close, exactly one of two paths applies** (they were made exclusive at creation):

- `pauses_ola` was true → the clock **resumes**, but **only if no other unresolved
  collaboration on the ticket still wants it paused** (last one out turns the lights off).
- `extension_minutes > 0` → every running clock's `due_at` is pushed out by that much, and an
  `EXTENSION` OLA event records the granted minutes.

**Success Response** — `200`. `data` is the updated `collaboration_requests` row:

```json
{
  "success": true,
  "message": "Collaboration updated",
  "data": {
    "id": "0198f7d1-0001-7000-9000-111111111111",
    "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
    "purpose": "need finance to confirm the invoice",
    "status": "CLOSED",
    "pauses_ola": true,
    "extension_minutes": 0,
    "conversation_id": "AAQkADk3ZjM2...",
    "seed_internet_message_id": "<a1b2c3@gera.in>",
    "started_at": "2026-08-25T14:00:00.000Z",
    "completed_at": "2026-08-26T09:00:00.000Z",
    "last_reply_at": "2026-08-26T08:15:00.000Z",
    "replies_after_close": 0
  }
}
```

When both a bind and a status change are sent, the returned row reflects **both**.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `400` | `BAD_REQUEST` | *"Cannot move this collaboration to ANSWERED; it is not OPEN"*. |
| `403` | `FEATURE_DISABLED` | `COLLABORATION` not enabled. |
| `403` | `FORBIDDEN` | Role refusal. |
| `404` | `NOT_FOUND` | *"Ticket not found"*; *"Collaboration not found on this ticket"* (including a collaboration that exists on a **different** ticket — a `403` would confirm that); *"Collaboration not found"*; *"No unresolved collaboration with that id"* when closing something already settled. |
| `409` | `COLLABORATION_THREAD_BOUND` | *"This collaboration is already bound to a different email thread"* — rebinding never silently re-points a thread. |
| `409` | `COLLABORATION_THREAD_TAKEN` | *"That email thread already belongs to another collaboration"*. |
| `422` | `VALIDATION_ERROR` | No fields; `status: "OPEN"`; bad uuid; over-long ids. |
| `429` | `TOO_MANY_REQUESTS` | Write limiter. |

**Frontend Usage** — Two uses: (a) report the thread after sending the mail, when you opened the
collaboration first; (b) the "mark answered" / "close" controls.

---

#### `POST /tickets/:id/collaborations/:collaborationId/notes`

**Purpose** — A note on the collaboration thread written **through the API** rather than
arriving by mail. `COLLABORATION_NOTE` is `INTERNAL` and carries a `collaboration_id`, both
required by CHECK constraint — so it cannot reach the requester's timeline.

**Authentication** — Required: **Yes**. Role: **agent roles**. Feature: **`COLLABORATION`**.
`assertSameDepartment` applies, and the collaboration must belong to the ticket.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | uuid | **Yes** | The ticket. |
| `collaborationId` | uuid | **Yes** | Must belong to that ticket. |

**Query Parameters** — `None`

**Headers** — `Content-Type: application/json`

**Request Body**

```json
{ "note": "finance confirmed the invoice is correct" }
```

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `note` | string | **Yes** | The note text. | 1–50 000 chars |

**Side effect** — if the collaboration is currently `OPEN`, it moves to **`ANSWERED`**,
`last_reply_at` is stamped, and the **caller's** `responded_at` is set (if they are a
participant). Answering marks it answered without closing it: the requester decides when the
question is actually settled.

**Success Response** — `201`. `data` is the created `ticket_activity` row:

```json
{
  "success": true,
  "message": "Note added",
  "data": {
    "id": "0198f7d2-0002-7000-9000-222222222222",
    "ticket_id": "0198f7c1-0001-7000-9000-aaaaaaaaaaaa",
    "activity_type": "COLLABORATION_NOTE",
    "visibility": "INTERNAL",
    "description": "finance confirmed the invoice is correct",
    "collaboration_id": "0198f7d1-0001-7000-9000-111111111111",
    "inbound_message_id": null,
    "graph_message_id": null,
    "performed_by": "0198f5a3-1111-7a01-8f2b-6d1c9e77aa12",
    "actor_type": "USER",
    "occurred_at": "2026-08-26T09:30:00.000Z"
  }
}
```

**Error Responses** — `403` (`FEATURE_DISABLED`; role refusal), `404` (*"Ticket not found"*,
*"Collaboration not found on this ticket"*, *"Collaboration not found"*), `422` (empty or
over-long `note`, bad uuid), `429`.

**Frontend Usage** — The composer inside the collaboration panel. Note that the collaboration's
`status` may change to `ANSWERED` as a side effect — re-fetch
`GET /tickets/:id/collaborations`, or update it locally.

---

#### What a collaborator's **emailed** reply does (no endpoint — background intake)

Routed by `conversation_id` (or matched on the seed id), written as `COLLABORATION_NOTE` /
`INTERNAL`, and it deliberately does **not**:

- create a ticket (once a mail is identified as collaboration traffic it returns immediately
  and can never reach ticket creation),
- appear on `/timeline` for a requester,
- cancel a snooze (the *customer* did not answer; the wait is not over),
- resume the OLA (that happens when the collaboration is settled, not when a mail lands),
- close the collaboration,
- reopen the ticket (ticket workflow state and collaboration status are independent
  lifecycles),
- notify the requester (the requester is the customer and has no business knowing Finance
  replied).

What it **does**: moves `OPEN → ANSWERED`, stamps `last_reply_at`, stamps `responded_at` for
that participant, bumps `tickets.last_activity_at`, and raises a `COLLABORATION_REPLY`
notification to the person who asked and the ticket's assignee.

A reply from someone **never invited** — a forwarded thread — attaches with
`[not an invited participant]` in the description and does **not** stamp `responded_at`.
A reply **after close** attaches with `[after close]`, increments `replies_after_close`, and
does not reopen anything.

---

### 11.10 Replies

#### `POST /tickets/:id/replies`

> ### ⚠️ **This endpoint returns `500` on every call.**
>
> The route requires `../services/reply.service`, and **that file does not exist** — the
> handler throws `MODULE_NOT_FOUND`. **Do not wire a reply UI to it.**
> `services/graph.client.js` holds the `sendMail` / `replyToMessage` primitives it would need
> and currently has no callers. See [Known Issues](#backend-api-notes--known-issues) #3.

**Intended purpose** — Call Microsoft Graph, then record **that it happened**. The mail itself
stays in Graph; this schema does not mirror the conversation.

**Authentication** — Required: **Yes**. Role: **any** (no `requireRole`).
Rate limit: **the external-call limiter — 20 requests per minute**, on top of the global limit.

> ⚠️ This route does **not** call `assertSameDepartment` either.

**Path Parameters** — `id` (uuid, required).

**Query Parameters** — `None`

**Headers** — `Content-Type: application/json`

**Request Body** — as the validator defines it:

```json
{
  "body": "<p>Your replacement card is ready for collection.</p>",
  "bodyFormat": "HTML",
  "cc": ["hr.support@gera.in"],
  "attachmentIds": []
}
```

| Field | Type | Required | Default | Description | Validation |
| ----- | ---- | -------- | ------- | ----------- | ---------- |
| `body` | string | **Yes** | — | Message body. | 1–200 000 chars |
| `bodyFormat` | enum | No | `HTML` | `HTML` \| `TEXT` | enum |
| `cc` | string[] | No | — | CC addresses. | each a valid email, **max 50** |
| `attachmentIds` | uuid[] | No | — | Existing attachment ids. **No attachment upload endpoint exists**, so there is no way to obtain one. | each a uuid, **max 20** |

**Success Response** — the route is written to return `201`
`{ "success": true, "message": "Reply sent", "data": … }`. **Unreachable today.**

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `500` | `INTERNAL_ERROR` | **Always** — the service module is missing. In a non-production environment `details` carries the `MODULE_NOT_FOUND` message. |
| `422` | `VALIDATION_ERROR` | Body fails the schema (this **is** reached — validation runs before the handler). |
| `429` | `TOO_MANY_REQUESTS` | External-call limiter (20/min) or the write limiter (60/min). |

**What to do instead** — **Reply / Reply All / Forward are Graph operations, not API calls.**
The frontend calls Microsoft Graph with the user's own token. There is no
`POST /tickets/:id/reply-all`, no `forwards` table, and no column holding a copy of an outbound
message.

**Critical constraint:** the backend learns about a message **only when that message reaches
the support mailbox.** A reply the frontend sends directly between two people is invisible
here. So an outbound reply that should show on the ticket **must put the support mailbox on the
thread** — send from it, or CC it. Intake then picks that copy up like any other mail, dedupes
it on `internet_message_id`, and attaches it to the ticket by `conversation_id`.

---

### 11.11 Out of Office

**"I am away next week, Priya is covering."** A cover arrangement decides who owns work while
someone is out — so it is *configuration*, not a ticket action, and every write is audited.

#### Two surfaces, one service

| Surface | Base path | Whose leave | Gate |
| ------- | --------- | ----------- | ---- |
| **Self-service** | `/out-of-office` | Always the caller. `userId` is **not a request field** anywhere on this surface. | `helpdesk.ooo.write` (reads also accept `helpdesk.ooo.read`) |
| **Admin** | `/admin/departments/:departmentId/out-of-office` | Anyone in the department — `userId` is a body field. | `helpdesk.ooo.read` for reads, `helpdesk.ooo.write` for writes |

Both call the same service, so no rule below holds on one path and not the other.

**Who can reach it at all.** `DEPT_HEAD`, `MANAGER` and `SPOC` hold `helpdesk.ooo.write` (and,
via the blanket `helpdesk.*.read` grant, `helpdesk.ooo.read`); `DEPT_ADMIN` and `SUPER_ADMIN`
hold both. **`EMPLOYEE` holds no helpdesk permissions at all**, so every out-of-office route
answers `403` for them — they have no assigned tickets to delegate. Do not render the feature
for an `EMPLOYEE`; branch on `permissions` from `GET /auth/me`, not on the role code.

#### There is no `PATCH`, and there must not be one

`user_out_of_office` carries `created_at` only — no `updated_at`, so this module's concurrency
token does not exist for it. It is the one scoped table registered `versioned: false`, and the
**one admin-side resource with no ETag**: never send `If-Match`, and never expect one back.

A delegate change is therefore **`POST /:id/replace`** — `cancel(HANDOVER)` + `create`, in one
transaction. That needs no token, keeps tickets the old delegate already picked up *with* them,
and leaves both arrangements on the record.

#### The record

`snake_case` throughout, as everywhere else on a raw row.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | uuid | |
| `user_id` | uuid | Whose leave. |
| `department_id` | uuid | **Stored, not derived** — moving the owner mid-leave cannot move the arrangement. |
| `starts_at` / `ends_at` | timestamp | `ends_at > starts_at`, by CHECK. |
| `default_delegate_id` | uuid | Who covers. Never the owner (`ck_ooo_not_self`). |
| `reason` | enum | `LEAVE` \| `TRAVEL` \| `TRAINING` \| `OTHER`. Defaults to `LEAVE`. |
| `message` | string \| null | Free text, ≤ 2000. |
| `activation_policy` | enum | `NEW_TICKETS_ONLY` \| `ALL_ACTIVE_TICKETS` \| `MANUAL`. |
| `expiry_policy` | enum | `KEEP_DELEGATE` \| `RETURN_TO_OWNER`. |
| `block_new_assignment` | boolean | **Defaults to `true`.** See *What happens to tickets* below. |
| `applied_at` | timestamp \| null | The window is live to routing. **This is the field that makes `MANUAL` real.** |
| `reverted_at` | timestamp \| null | The expiry policy has been applied — by the scheduler, or by a cancel. |
| `cancelled_at` | timestamp \| null | Ended early. |
| `cancel_mode` | enum \| null | `RETURNED` \| `HANDOVER`. Exists **exactly when** `cancelled_at` does, by CHECK. |
| `cancelled_reason` | string \| null | |
| `cancelled_by` | uuid \| null | |
| `replaced_by_ooo_id` | uuid \| null | The successor record. Set only on a `HANDOVER`, so **this is the handover chain** — follow it to show "cover was passed from X to Y". |
| `created_at` / `created_by` | timestamp / uuid \| null | |

**Joined display fields.** Both read shapes resolve the two people, but *they do not resolve the
same set*, and that asymmetry is real:

| Field | On `GET /` (list) | On `GET /:id` and every write response |
| ----- | ----------------- | -------------------------------------- |
| `user_name`, `user_email` | ✅ | ✅ |
| `delegate_name`, `delegate_email` | ✅ | ✅ |
| `user_status`, `user_is_assignable` | ❌ | ✅ |
| `delegate_status`, `delegate_is_assignable` | ❌ | ✅ |
| `status` (derived) | ✅ | ❌ |
| `total_count` | ✅ (same number as `meta.total`; ignore it) | ❌ |

**So the list is the only place `status` comes from, and the detail read is the only place the
eligibility flags come from.** If a screen needs both, derive `status` client-side from the
timestamps using the table below — it is a pure function of the row.

#### `status` is derived, never stored

There is no status column and there must not be one: five timestamps already say everything.
Resolved in this order — the first match wins:

| `status` | Condition | What the UI should say |
| -------- | --------- | ---------------------- |
| `CANCELLED` | `cancelled_at` is set | Ended early. Check `cancel_mode`. |
| `ENDED` | `reverted_at` is set | Ran its course; the expiry policy has been applied. |
| `EXPIRING` | `ends_at <= now()` | The window has passed but the scheduler has not settled it yet (≤ 10 min). |
| `SCHEDULED` | `starts_at > now()` | Filed for the future. |
| `AWAITING_ACTIVATION` | `activation_policy = 'MANUAL'` and `applied_at` is null | **Filed but inert.** Show an *Activate* button. |
| `ACTIVE` | otherwise | Live; routing is following it. |

#### The five decisions a UI has to render

| | |
| --- | --- |
| **`MANUAL` is inert until activated** | A `MANUAL` window is invisible to routing until someone calls `activate`. That is the *entire* difference between `MANUAL` and `NEW_TICKETS_ONLY` — the scheduler deliberately does not stamp `applied_at` for it. A `MANUAL` record showing `AWAITING_ACTIVATION` is doing **nothing**; say so. |
| **Cancel applies the expiry policy *now*** | Not at an `ends_at` the window no longer has. A `RETURN_TO_OWNER` window cancelled as `RETURNED` hands its open delegations back at the moment of cancellation. |
| **A delegate swap is `replace`, not an edit** | Tickets the **old** delegate already picked up stay with them — the handover moves nothing. Only new work goes to the successor. |
| **A ticket that cannot go home stays with the delegate** | `RETURN_TO_OWNER` checks the owner is still ACTIVE and assignable. If not, the ticket stays put, an `OOO_REVERT_BLOCKED` row appears on the timeline, and the department's administrators are notified. |
| **The department's settings are the fallback** | Omit `activationPolicy` / `expiryPolicy` and the department's `ooo_activation_policy` / `ooo_expiry_policy` apply. Sending them overrides that **for one absence**. There is no department default for `blockNewAssignment` — it defaults to `true`. |

#### What actually happens to tickets

**New tickets — resolved live at assignment time, so this works with
`HELPDESK_JOBS_ENABLED=false`.** Routing walks the cover chain (`max_delegation_depth` from
`department_settings`, default 3) and:

- finds someone not out → the ticket is assigned to them, `assignmentType: "OOO_DELEGATION"`;
- the chain dead-ends **and `block_new_assignment` is `true`** (the default) → the ticket is
  created **unassigned**, with an `OOO_DELEGATION_BLOCKED` timeline row. It is never silently
  parked in the inbox of someone on leave;
- the chain dead-ends and `block_new_assignment` is `false` → the named owner keeps it, and the
  attempt is still recorded on the assignment row.

**Existing tickets — only under `ALL_ACTIVE_TICKETS`,** and only those in a state the workflow
marks `counts_as_active_workload`. `NEW_TICKETS_ONLY` and `MANUAL` move nothing that is already
assigned. The sweep runs **inside the create/activate transaction** when the window is already
open, which is why those responses carry `delegated`.

**When the window ends** — `KEEP_DELEGATE` moves nothing; `RETURN_TO_OWNER` walks the open
delegation intervals and hands each ticket back, subject to the eligibility check above.

**Jobs are off by default.** `HELPDESK_JOBS_ENABLED` defaults to `false`. The `ooo-activation`
job runs every **10 minutes** and owns only two things: the `ALL_ACTIVE_TICKETS` sweep for a
window that opens later, and the expiry/revert at `ends_at`. With jobs off, delegation of **new**
tickets still works, but a window never sweeps and never reverts on its own — `cancel` is the
only thing that will settle it.

#### Errors common to every out-of-office endpoint

| Status | `code` | When |
| ------ | ------ | ---- |
| `403` | `FORBIDDEN` | Caller holds neither `helpdesk.ooo.read` nor `helpdesk.ooo.write`. Always the case for `EMPLOYEE`. |
| `403` | `FEATURE_DISABLED` | `OOO_DELEGATION` is off — **on the two create verbs only** (`POST /` and `POST /:id/replace`). |
| `403` | `CROSS_DEPARTMENT` | A non-super-admin named another department. |
| `404` | `NOT_FOUND` | The record is not in the caller's department — or, on the self-service surface, is not the caller's own. **Never `403`**: confirming an id exists is itself a leak. |
| `409` | `CONFLICT` | `This user already has an out-of-office record overlapping that period` — `excl_user_out_of_office_overlap`, enforced by the database. |
| `422` | `VALIDATION_ERROR` | Schema failure, or a business rule: self as own delegate, an ineligible delegate, `endsAt` not after `startsAt`. |
| `429` | `TOO_MANY_REQUESTS` | Write limiter, 60/min — see below. |

**Rate limits.** Self-service **writes** are under the write limiter (60/min); self-service
**reads** are under the global limiter only (300/min). On the admin surface **every** route,
including the GETs, is under the write limiter, because `routes/admin/index.js` applies it to the
whole admin tree.

**Two database guards surface as a *generic* 422.** `trg_ooo_delegation_loop` (A → B → A) and
`trg_ooo_departments` (cross-department owner or delegate) raise a CHECK violation without a
constraint name, so the response is
`422 VALIDATION_ERROR — "A value violates a business rule enforced by the database"` with no
usable `details`. Both are pre-checked by the service in the normal path, so reaching one means a
race or a genuinely cyclic arrangement; show the raw message and let the user pick a different
delegate.

---

#### `GET /out-of-office`

**Purpose** — My leave, or — with `?covering=true` — whose work I am covering. One flag rather
than two endpoints, because it is the same row shape.

**Authentication** — Required: **Yes**. Permission: `helpdesk.ooo.read` **or**
`helpdesk.ooo.write` (any-of).

**Feature gate** — None.

**Path Parameters** — `None`

**Query Parameters**

| Parameter | Type | Required | Default | Description |
| --------- | ---- | -------- | ------- | ----------- |
| `covering` | boolean | No | `false` | `true` → windows where **I am the delegate**. `false`/absent → **my own** leave. |
| `activeOnly` | boolean | No | `false` | Only windows covering `now()` (`starts_at <= now() < ends_at`, not yet reverted). |
| `includeCancelled` | boolean | No | `false` | Cancelled rows are **excluded by default**. Pass `true` for the history view. |
| `page` | integer | No | `1` | ≥ 1 |
| `limit` | integer | No | `25` | 1–200 |
| `sort` | string | No | `starts_at:desc` | One of `starts_at`, `ends_at`, `created_at`, optionally `:asc` / `:desc`. Anything else → `422`. |

Booleans accept `true` / `false` / `1` / `0`. **`"false"` really is false here** — the string is
parsed, not coerced with `Boolean()`.

**`userId` and `delegateId` are not part of this schema.** They are stripped rather than
refused, and cannot widen the result: the caller's own id is always applied last, so a
`?userId=` naming somebody else simply returns nothing. Use the admin surface to look at another
person's cover. `?departmentId=` is likewise ignored — the department comes from the caller.

**Headers** — identity header only.

**Request Body** — `None`

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "0198fa10-0001-7000-9000-aaaaaaaaaaaa",
      "user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "department_id": "0198f5a0-2222-7000-9aaa-0c1d2e3f4a5c",
      "starts_at": "2026-09-01T03:30:00.000Z",
      "ends_at": "2026-09-08T03:30:00.000Z",
      "default_delegate_id": "0198f5a3-1111-7a01-8f2b-6d1c9e77aa12",
      "reason": "LEAVE",
      "message": "Annual leave — Priya is covering.",
      "activation_policy": "NEW_TICKETS_ONLY",
      "expiry_policy": "KEEP_DELEGATE",
      "block_new_assignment": true,
      "applied_at": null,
      "reverted_at": null,
      "cancelled_at": null,
      "cancel_mode": null,
      "cancelled_reason": null,
      "cancelled_by": null,
      "replaced_by_ooo_id": null,
      "created_at": "2026-08-27T09:00:00.000Z",
      "created_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
      "status": "SCHEDULED",
      "user_name": "Manish Pandey",
      "user_email": "manish.pandey@gera.in",
      "delegate_name": "Priya Sharma",
      "delegate_email": "priya.sharma@gera.in",
      "total_count": "1"
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 1, "totalPages": 1 }
}
```

`total_count` is the window function behind `meta.total` and is present on every row. Read
`meta.total`; ignore the row field.

**Error Responses** — the common table above. `422` additionally for a bad `sort`, `page` or
`limit`.

---

#### `GET /out-of-office/:id`

**Purpose** — One of my own records, with both people's current eligibility resolved.

**Authentication** — Required: **Yes**. Permission: `helpdesk.ooo.read` **or**
`helpdesk.ooo.write`.

**Path Parameters**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | uuid | **Yes** | The record. |

**Query Parameters** — `None` · **Request Body** — `None`

**Ownership is checked here, and being the delegate is not enough.** A record belonging to a
colleague — including one where *you* are the delegate — answers `404`. Being asked to cover for
someone does not make their leave yours to cancel or hand on; that is the administrator's
surface.

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "0198fa10-0001-7000-9000-aaaaaaaaaaaa",
    "user_id": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
    "department_id": "0198f5a0-2222-7000-9aaa-0c1d2e3f4a5c",
    "starts_at": "2026-09-01T03:30:00.000Z",
    "ends_at": "2026-09-08T03:30:00.000Z",
    "default_delegate_id": "0198f5a3-1111-7a01-8f2b-6d1c9e77aa12",
    "reason": "LEAVE",
    "message": "Annual leave — Priya is covering.",
    "activation_policy": "NEW_TICKETS_ONLY",
    "expiry_policy": "KEEP_DELEGATE",
    "block_new_assignment": true,
    "applied_at": null,
    "reverted_at": null,
    "cancelled_at": null,
    "cancel_mode": null,
    "cancelled_reason": null,
    "cancelled_by": null,
    "replaced_by_ooo_id": null,
    "created_at": "2026-08-27T09:00:00.000Z",
    "created_by": "0198f5a1-4c33-7a01-8f2b-6d1c9e77aa10",
    "user_name": "Manish Pandey",
    "user_email": "manish.pandey@gera.in",
    "user_status": "ACTIVE",
    "user_is_assignable": true,
    "delegate_name": "Priya Sharma",
    "delegate_email": "priya.sharma@gera.in",
    "delegate_status": "ACTIVE",
    "delegate_is_assignable": true
  }
}
```

**No `status` field on this shape** — derive it from the timestamps (table above).
`delegate_status` / `delegate_is_assignable` are what a detail screen uses to warn that the
chosen cover can no longer receive tickets.

---

#### `POST /out-of-office`

**Purpose** — File my own leave.

**Authentication** — Required: **Yes**. Permission: `helpdesk.ooo.write`.
**Feature gate: `OOO_DELEGATION`** — this verb creates a record.

**Path / Query Parameters** — `None`

**Request Body** — **`.strict()`: an unknown field is a `422`, not an ignored one.**

```json
{
  "startsAt": "2026-09-01T09:00:00+05:30",
  "endsAt": "2026-09-08T09:00:00+05:30",
  "defaultDelegateId": "0198f5a3-1111-7a01-8f2b-6d1c9e77aa12",
  "reason": "LEAVE",
  "message": "Annual leave — Priya is covering.",
  "activationPolicy": "ALL_ACTIVE_TICKETS",
  "expiryPolicy": "RETURN_TO_OWNER",
  "blockNewAssignment": true
}
```

| Field | Type | Required | Default | Description | Validation |
| ----- | ---- | -------- | ------- | ----------- | ---------- |
| `startsAt` | timestamp | **Yes** | — | When the leave begins. **Backdating is allowed and intended** — it is how someone files leave they are already on. A window that is already open activates immediately, in this same transaction. | coercible to a date |
| `endsAt` | timestamp | **Yes** | — | When it ends. | must be **after** `startsAt` → else `422` on `endsAt` |
| `defaultDelegateId` | uuid | **Yes** | — | Who covers. | uuid; must be an **ACTIVE, assignable, non-deleted member of this department**, and not the caller |
| `reason` | enum | No | `LEAVE` | `LEAVE` \| `TRAVEL` \| `TRAINING` \| `OTHER` | enum |
| `message` | string | No | — | Shown as context. | ≤ 2000 chars |
| `activationPolicy` | enum | No | **the department's** `ooo_activation_policy`, else `NEW_TICKETS_ONLY` | `NEW_TICKETS_ONLY` \| `ALL_ACTIVE_TICKETS` \| `MANUAL` | enum |
| `expiryPolicy` | enum | No | **the department's** `ooo_expiry_policy`, else `KEEP_DELEGATE` | `KEEP_DELEGATE` \| `RETURN_TO_OWNER` | enum |
| `blockNewAssignment` | boolean | No | **`true`** | `true` → when the cover chain dead-ends, new tickets go **unassigned** rather than to the person who is away. | boolean |

**`userId` is not a field here.** Sending one is a `422` — this surface is always the caller.

**Success Response** — `201`

```json
{
  "success": true,
  "message": "Out-of-office period recorded",
  "data": {
    "record": { "…": "the full record shape from GET /:id" },
    "delegated": 4,
    "warning": null
  }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `record` | object | The created record, in the **`GET /:id` shape** — joined names and eligibility flags, **no `status`**. |
| `delegated` | integer | **How many existing tickets moved to the delegate, right now.** Non-zero only when the window is already open *and* `activationPolicy` is `ALL_ACTIVE_TICKETS`. `0` is the honest answer to the first question anyone asks after filing leave — show it. |
| `warning` | string \| null | Set when the chosen delegate **is themselves out of office** when this window opens. Not an error: cover-for-the-coverer is a real arrangement and routing walks the chain past them. Surface it as an advisory. |

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `403` | `FEATURE_DISABLED` | `OOO_DELEGATION` is off for the department. |
| `409` | `CONFLICT` | The user already has a non-cancelled window overlapping that period. **One person cannot have two overlapping arrangements** — it is a database exclusion constraint, not a check the service can be talked out of. |
| `422` | `VALIDATION_ERROR` | `endsAt` not after `startsAt`; `defaultDelegateId` is the caller (*"A person cannot be their own out-of-office delegate"*); the delegate is not an ACTIVE, assignable member of the department; an unknown body field. |
| `404` | `NOT_FOUND` | (Admin surface only) the named `userId` is not in this department. |

---

#### `POST /out-of-office/:id/activate`

**Purpose** — Turn a `MANUAL` window on. **The only way a `MANUAL` record becomes visible to
routing.**

**Authentication** — Required: **Yes**. Permission: `helpdesk.ooo.write`.
**Feature gate: none** — this commits a record that already exists, and disabling a feature is
forward-only.

**Path Parameters** — `id` (uuid, required).

**Request Body** — `{}`. **`.strict()`** — the id and the caller are the whole request, so any
field is a `422`.

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Out-of-office period activated",
  "data": {
    "record": { "…": "the full record, now with applied_at set" },
    "delegated": 4
  }
}
```

`delegated` is non-zero only when `activation_policy` is `ALL_ACTIVE_TICKETS` — activating by
hand still owes the sweep. `MANUAL` says *when* a window starts, not *what* it does when it does.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `409` | `CONFLICT` | `That out-of-office record has been cancelled` · `That out-of-office period has already ended` · `That out-of-office record is already active` (`applied_at` was already stamped — including by the scheduler a moment earlier). |
| `404` | `NOT_FOUND` | Not the caller's record, or not in the department. |

**Calling this on a non-`MANUAL` record is not an error** — a `NEW_TICKETS_ONLY` or
`ALL_ACTIVE_TICKETS` window that has not yet been stamped will be claimed by it. But those two
are stamped by the scheduler within 10 minutes anyway, and are already live to routing from
`starts_at` regardless. Only offer the button for `AWAITING_ACTIVATION`.

---

#### `POST /out-of-office/:id/cancel`

**Purpose** — End a window early. **`expiry_policy` is applied *now*,** not at an `ends_at` the
window no longer has.

**Authentication** — Required: **Yes**. Permission: `helpdesk.ooo.write`.
**Feature gate: none** — it finishes what an existing record started.

**Path Parameters** — `id` (uuid, required).

**Request Body** — `.strict()`, and every field is optional:

```json
{ "mode": "RETURNED", "reason": "Back early" }
```

| Field | Type | Required | Default | Description | Validation |
| ----- | ---- | -------- | ------- | ----------- | ---------- |
| `mode` | enum | No | **`RETURNED`** | See below. | `RETURNED` \| `HANDOVER` |
| `reason` | string | No | — | Recorded on the row as `cancelled_reason`. | ≤ 2000 chars |

**The mode is the whole decision, and it cannot be inferred from anything else on the row:**

| `mode` | Meaning | Open delegations |
| ------ | ------- | ---------------- |
| `RETURNED` (default) | The person is back early. | **`expiry_policy` is applied now.** Under `RETURN_TO_OWNER` the tickets come home in this request; under `KEEP_DELEGATE` nothing moves. |
| `HANDOVER` | Cover is ending without settling it — normally via `replace`, but reachable directly when there is no successor. | **Nothing moves.** The delegate keeps what they picked up. |

`RETURNED` is the default because it is both the common case and the safer one: it settles the
work rather than leaving it with a stand-in nobody has told.

**Success Response** — `200`

```json
{
  "success": true,
  "message": "Out-of-office period cancelled",
  "data": {
    "record": { "…": "the full record, now cancelled" },
    "reverted": 2,
    "mode": "RETURNED"
  }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `reverted` | integer | Tickets handed **back to the owner** by this call. Non-zero only for `RETURNED` + `RETURN_TO_OWNER`. |
| `mode` | enum | The mode actually applied — echo it rather than assuming the default. |

A ticket that was **manually reassigned** during the leave is correctly untouched: the `MANUAL`
assignment closed its delegation interval, so there is nothing left to revert. The human decision
beats the schedule, structurally.

A cancelled record is also excluded from the expiry scheduler, so it can never revert its tickets
later at the end date it no longer has.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `409` | `CONFLICT` | `That out-of-office record is already cancelled`. |
| `404` | `NOT_FOUND` | Not the caller's record, or not in the department. |

---

#### `POST /out-of-office/:id/replace`

**Purpose** — **Swap the delegate.** `cancel(HANDOVER)` + `create`, in one transaction. This is
the edit verb; there is no `PATCH`.

**Authentication** — Required: **Yes**. Permission: `helpdesk.ooo.write`.
**Feature gate: `OOO_DELEGATION`** — it creates a record.

**Path Parameters** — `id` (uuid, required) — the record being handed over.

**Request Body** — `.strict()`. **Only `defaultDelegateId` is required; everything else is
inherited from the record being replaced**, because a swap is "same leave, different cover".

```json
{
  "defaultDelegateId": "0198f5a4-2222-7a01-8f2b-6d1c9e77aa13",
  "handoverReason": "Priya is now out as well"
}
```

| Field | Type | Required | Default | Description | Validation |
| ----- | ---- | -------- | ------- | ----------- | ---------- |
| `defaultDelegateId` | uuid | **Yes** | — | The **new** delegate. | Must differ from the current one → else `422`; same eligibility rules as create |
| `handoverReason` | string | No | `"Delegate changed"` | Recorded as `cancelled_reason` on the record being handed over. | ≤ 2000 chars |
| `startsAt` / `endsAt` | timestamp | No | inherited | Only if the leave itself is also changing. | `endsAt` after `startsAt` |
| `reason`, `message`, `activationPolicy`, `expiryPolicy`, `blockNewAssignment` | — | No | inherited | Same types and rules as `POST /out-of-office`. **There is no way to *clear* `message` on a replace** — omitting it inherits the old one, and `null` fails validation. Send `""` if the successor should carry none. | as create |

**Success Response** — `201`

```json
{
  "success": true,
  "message": "Delegate changed",
  "data": {
    "record": { "…": "the NEW record" },
    "replaced": "0198fa10-0001-7000-9000-aaaaaaaaaaaa",
    "delegated": 1,
    "warning": null
  }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `record` | object | **The successor** — a new `id`. Repoint any local state at it. |
| `replaced` | uuid | The record that was handed over. It is now `CANCELLED` with `cancel_mode: "HANDOVER"` and `replaced_by_ooo_id` pointing at the successor. |
| `delegated` | integer | Existing tickets swept to the **new** delegate (`ALL_ACTIVE_TICKETS` and already open only). |
| `warning` | string \| null | The new delegate is themselves out of office. Advisory, as on create. |

**What moves and what does not.** Tickets the **old** delegate already holds stay with them —
they are not the owner's any more, so the sweep correctly leaves them alone. New tickets go to
the successor from the moment this commits. If the successor later expires under
`RETURN_TO_OWNER`, the old delegate's tickets still find their way home: their assignment rows
still name the original owner. **Nothing is orphaned by a swap.**

Two audit rows are written, on purpose — an `EXECUTE` on the record that ended and a `CREATE` for
the one that began.

**Error Responses**

| Status | `code` | When |
| ------ | ------ | ---- |
| `409` | `CONFLICT` | `That out-of-office record is cancelled — file a new one rather than replacing it` · `That out-of-office period has already ended`. |
| `422` | `VALIDATION_ERROR` | `That is already the delegate on this record`; the new delegate is ineligible or is the owner. |
| `403` | `FEATURE_DISABLED` | `OOO_DELEGATION` is off. |

---

#### Admin surface — `/admin/departments/:departmentId/out-of-office`

**Six endpoints, the same six verbs, one service.** Everything above applies unchanged except
the four deltas in this table.

| | Self-service `/out-of-office` | Admin `/admin/departments/:departmentId/out-of-office` |
| --- | --- | --- |
| **Whose leave** | Always the caller. | Anyone in the department — `userId` in the **create** body. |
| **Permission** | `helpdesk.ooo.read` **or** `helpdesk.ooo.write` on reads; `helpdesk.ooo.write` on writes. | `helpdesk.ooo.read` on reads; `helpdesk.ooo.write` on writes. |
| **Ownership check** | A record that is not yours → `404`, even if you are the delegate. | **None** — any record in the department is reachable. |
| **Rate limit** | Writes 60/min; reads global only. | **Every route, GETs included,** 60/min. |

`:departmentId` is a required uuid on all six, and is validated before it is read — a malformed
one is a `422`, not a database error. A non-super-admin naming a department other than their own
gets `403 CROSS_DEPARTMENT`.

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/` | Unfiltered, this is **every cover arrangement in the department** — the view that answers *"who is away next week"*. |
| `GET` | `/:id` | Same shape as the self-service detail read. No ownership check. |
| `POST` | `/` | Body as `POST /out-of-office` **plus a required `userId`**. Feature-gated. |
| `POST` | `/:id/activate` | Identical. |
| `POST` | `/:id/cancel` | Identical — this is how cover is cancelled for someone who has left. |
| `POST` | `/:id/replace` | Identical. Feature-gated. |

**`GET /` query parameters** — as the self-service list, minus `covering`, plus:

| Parameter | Type | Required | Default | Description |
| --------- | ---- | -------- | ------- | ----------- |
| `userId` | uuid | No | — | Whose leave. |
| `delegateId` | uuid | No | — | Who is covering. **The "who is Priya covering for" view.** |

`activeOnly`, `includeCancelled`, `page`, `limit` and `sort` behave exactly as they do on the
self-service list. Cancelled rows are excluded by default here too.

**`POST /` body** — as `POST /out-of-office`, with one field added:

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `userId` | uuid | **Yes** | Whose leave this is. | uuid; **must be a member of `:departmentId`** — else `404` *"That user does not exist here"*. The department is taken from the path, never from the body. |

**Response shapes are identical to the self-service surface** on all six.

---

## 12. Error Handling

### 12.1 The error envelope

```json
{
  "success": false,
  "message": "This department requires a category",
  "code": "BAD_REQUEST",
  "details": { }
}
```

| Field | Always | Description |
| ----- | ------ | ----------- |
| `success` | Yes | Always `false`. |
| `message` | Yes | **Written to be read by a user** for `400`-class business rules. For a `500` it is the generic `"Internal server error"`. |
| `code` | Yes on `AppError` | The machine-readable code. **Branch on this, never on `message`.** Absent only in exotic cases. |
| `details` | No | Present only when the thrower supplied it. For `422` it is a field → messages map. |

The one exception: **`GET /health`** returns `data` on its error envelope and no `details`.

### 12.2 Status codes actually used

| Status | `code` values | Meaning | What the frontend does |
| ------ | ------------- | ------- | ---------------------- |
| **400** | `BAD_REQUEST` | A **business rule** — *"This department requires a category"*, *"'Resolve' requires a reason"*, *"That user cannot receive tickets"*, snooze limits, unknown state code, bad `sort`, bad `If-Match` format | **Show `message` directly.** It is written for a human. Check `details` for `allowed` / `available` lists. |
| **401** | `UNAUTHORIZED` | No usable identity, expired or invalid token, unknown user with auto-provisioning off | Re-authenticate with the host app **once**, replay, then surface. |
| **403** | `FORBIDDEN` | Account not `ACTIVE`; role refusal (`details.required`); transition role/actor refusal (`details.allowedRoleCodes`); on-behalf refusal; missing permission (`details.required`); no department | **Never retry.** Re-authenticating fixes none of these. |
| **403** | `FEATURE_DISABLED` | The department has not enabled the capability. `details.featureCode` | Hide the control; show an admin hint. |
| **403** | `CROSS_DEPARTMENT` | A department, user or priority belongs elsewhere | Never retry. |
| **404** | `NOT_FOUND` | Genuinely absent, **or not yours** | **Do not distinguish** — that is the point. A `403` would confirm the row exists. |
| **409** | `CONFLICT` | Duplicate department code; parent cycle; readiness not met; open-ticket count mismatch; feature already configured; settings already exist; catch-all rule missing | Read `details` — it carries the actionable data (`blocking`, `openTickets`, …). |
| **409** | `CONCURRENT_MODIFICATION` | `expectedVersion` or `If-Match` is stale | **Refetch and ask the user to redo.** Never auto-retry with the new token — you would overwrite the other change. |
| **409** | `ILLEGAL_TRANSITION` | The move is not a row in `workflow_transitions`. `details.allowed` lists the legal set | Your buttons are stale — refresh `GET /tickets/:id/transitions`. |
| **409** | `COLLABORATION_THREAD_TAKEN` | That thread belongs to another collaboration | Surface it; do not retry with the same id. |
| **409** | `COLLABORATION_THREAD_BOUND` | This collaboration already has a *different* thread | Surface it. |
| **422** | `VALIDATION_ERROR` | A **schema** failure. `details` names the offending fields | Map `details` onto the form. |
| **428** | `PRECONDITION_REQUIRED` | An admin mutation arrived without `If-Match` | Re-read the resource and resend with its ETag. **Deliberately not a `400`** — the request is well-formed; the distinction tells the client which fix applies. |
| **429** | `TOO_MANY_REQUESTS` | A limiter tripped | Back off; honour the `RateLimit-*` headers. |
| **500** | `INTERNAL_ERROR` | A genuine fault, `header` auth mode in production, JWT secret unset, a department that is not onboarded, or one of the two broken endpoints | Surface `x-request-id`. In non-production, `details` carries the real message; **in production it is omitted**. |
| **503** | `SERVICE_UNAVAILABLE` | Database unreachable, or the admin surface failed its startup guard | Retry with backoff. |

Codes declared in `ERROR_CODE` but **not raised by any endpoint today**:
`UNASSIGNED_TICKET`, `SNOOZE_LIMIT_EXCEEDED`, `DELEGATION_DEPTH_EXCEEDED`.
The snooze limits return plain `BAD_REQUEST` despite the dedicated code existing.

### 12.3 Two behaviours worth planning for

**The 403 rule is the one that matters.** `authenticate` returns `403` for a non-`ACTIVE`
account and `requireRole` returns `403` for a role refusal. Treating `403` as "identity
expired" is how you build an unbounded refresh loop. **Only `401` triggers re-authentication.**

**The admin surface can refuse wholesale.** At startup, `routes/admin/assertGuarded.js` walks
the router Express actually built and verifies that every admin route has a
`requirePermission()` guard and — where the path carries `:departmentId` — ran
`scopeToDepartment`. If any route fails, **the entire `/admin/*` surface is replaced with one
that returns `503`** on every path:

```json
{
  "success": false,
  "message": "The helpdesk admin API is disabled: its routes failed the startup authorization check. See the server log.",
  "code": "SERVICE_UNAVAILABLE"
}
```

The rest of the helpdesk is unaffected. If every admin call returns this, it is a backend
deployment problem, not a client bug.

### 12.4 Unmatched routes

Any path under `/api/helpdesk` that no route matches:

```json
{
  "success": false,
  "message": "Route GET /api/helpdesk/categories not found",
  "code": "NOT_FOUND"
}
```

The `404` handler is scoped to this router only, so it never affects the CRM's other routers.

---

## 13. File Uploads / Attachments

**Not identified in the current implementation.**

There is no upload endpoint, no download endpoint, no delete endpoint, and no
`multipart/form-data` handling anywhere in the module. `express.json({ limit: "10mb" })` is the
only body parser mounted.

What *does* exist, and what it does not give you:

| Artefact | Status |
| -------- | ------ |
| `department_settings.attachment_max_mb` (default 25) | Readable and writable through the settings API, but **no code reads it** |
| `ACTIVITY_TYPE.ATTACHMENT_ADDED` | Declared in the enums; **never written** |
| `replyBody.attachmentIds` (≤20 uuids) | Accepted by the validator on `POST /tickets/:id/replies`, but **that endpoint is broken**, and there is no way to obtain an attachment id |
| `router.use(express.json({ limit: "10mb" }))` | JSON only — a multipart request would not parse |

An `attachment.routes` router is listed commented-out in
[routes/index.js:151](src/module/helpdesk/routes/index.js#L151), awaiting implementation.

**Practical consequence for the frontend:** files that must reach the helpdesk have to travel
by **email to the support mailbox**, where intake records the message. Do not build an
attachment UI against this API yet.

---

## 14. Webhooks & Real-time

**Not identified in the current implementation.**

| Capability | Status |
| ---------- | ------ |
| Outbound webhooks | None. No webhook registration table, endpoint or dispatcher. |
| Inbound webhooks | None. There is no `POST /tickets/from-email` — it is described in `CLAUDE.md` but was never built. Email arrives via a **polling worker** (`workers/emailIntake.worker.js`), not a webhook. |
| WebSocket / SSE | None. |
| Push notifications | `NOTIFICATION_CHANNEL.PUSH` is declared in the enums, but **nothing sends anything**. |

### How the frontend learns that something changed

**Polling.** `notifications` rows are written by the backend but **no dispatcher drains them**,
and there is no notifications API. The only way to see new activity is to re-fetch:

| To detect | Poll |
| --------- | ---- |
| New replies on my tickets | `GET /tickets/counts` → `unread`, `unreadByState` |
| Which tickets have them | `GET /tickets?unreadOnly=true` |
| Changes on an open ticket | `GET /tickets/:id` and `GET /tickets/:id/timeline` |

Keep the global rate limit (300/min per user) in mind when choosing an interval.

> There is deliberately **no notifications list endpoint** and no `tickets.has_unread` column.
> Unread is per-user and lives in `notifications.read_at`; the ticket list resolves it in one
> indexed query and decorates each row.

---

## 15. Frontend Integration Guide

### 15.1 API Base URL

The backend publishes no base-URL discovery endpoint. The path prefix is fixed at
**`/api/helpdesk`** ([constant/index.js](src/module/helpdesk/constant/index.js#L38)); the host
comes from your own frontend build configuration.

```
<your frontend env var, e.g. VITE_API_BASE_URL> + "/api/helpdesk"
```

The repository contains no frontend, so it prescribes no framework. What it *does* ship is a
**reference JavaScript client** under
[src/module/helpdesk/docs/client/](src/module/helpdesk/docs/client/) —
`request.js`, `identity.js`, `tickets.js` — worth reading before writing your own.

Backend environment variables that change how the frontend must behave:

| Variable | Effect on the frontend |
| -------- | ---------------------- |
| `HELPDESK_AUTH_MODE` | `header` → send `x-user-email`; `jwt` → send `Authorization: Bearer`. **Read it from `GET /auth/me` → `authMode`** rather than configuring it twice. |
| `HELPDESK_AUTH_EMAIL_HEADER` | The header name in `header` mode (default `x-user-email`). |
| `HELPDESK_CORS_ORIGINS` | Must name your frontend's origin in production, or the browser blocks the response. |

### 15.2 Suggested API client structure

Mirroring what actually exists — no folder for an endpoint group that has no endpoints:

```text
api/
├── client.(js|ts)          # fetch wrapper: base URL, auth header, envelope unwrap, error mapping
├── errors.(js|ts)          # ApiError class + the ERROR_CODE constants
├── auth.(js|ts)            # getMe()
├── tickets.(js|ts)         # list, counts, getById, timeline, transitions (GET),
│                           # create, markRead, transition (POST), reassign,
│                           # reclassify, changePriority, addNote
├── collaborations.(js|ts)  # list, open, patch, addNote
├── admin/
│   ├── meta.(js|ts)        # getEnums()
│   ├── departments.(js|ts) # list, create, getById, update, readiness, activate, deactivate
│   ├── settings.(js|ts)    # get, create, update
│   └── features.(js|ts)    # list, create, update, disable
└── health.(js|ts)          # check()
```

Deliberately absent — **there is nothing to call**: `categories`, `priorities`, `users`,
`workflows`, `routingRules`, `olaPolicies`, `calendars`, `attachments`, `notifications`,
`reports`, `search`.

### 15.3 Authentication interceptor

One place attaches identity to every request. Read `authMode` once from `/auth/me` (or from
your own build config) and branch:

```js
// api/client.js
const BASE = `${import.meta.env.VITE_API_BASE_URL}/api/helpdesk`;

export async function request(path, { method = "GET", body, ifMatch, signal } = {}) {
  const headers = { Accept: "application/json" };

  // --- authentication interceptor -------------------------------------
  const token = auth.getAccessToken();          // however your host app stores it
  if (token) {
    headers.Authorization = `Bearer ${token}`;  // jwt mode
  } else {
    headers["x-user-email"] = auth.getEmail();  // interim header mode
  }
  // -------------------------------------------------------------------

  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (ifMatch) headers["If-Match"] = ifMatch;   // required by every admin mutation

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    // The API authenticates on a header and never a cookie — CORS sets
    // credentials: false, so do NOT send credentials: "include".
  });

  return handle(res);
}
```

**Do not** send `credentials: "include"` — the API sets `credentials: false` in CORS and
authenticates on a header.

### 15.4 Error interceptor

One place turns the envelope into a typed error and applies the retry policy:

```js
// api/client.js (continued)
export class ApiError extends Error {
  constructor({ status, code, message, details, requestId, etag }) {
    super(message);
    Object.assign(this, { status, code, details, requestId, etag });
  }
}

async function handle(res) {
  const requestId = res.headers.get("x-request-id");
  const etag = res.headers.get("ETag");          // exposed by CORS — keep it for If-Match

  if (res.status === 204) return { data: null, etag, requestId };

  const payload = await res.json().catch(() => null);

  if (res.ok && payload?.success) {
    // Envelope unwrap: `data` plus `meta` for paginated endpoints.
    return { data: payload.data, meta: payload.meta, etag, requestId };
  }

  throw new ApiError({
    status: res.status,
    code: payload?.code,
    message: payload?.message || `HTTP ${res.status}`,
    details: payload?.details,
    requestId,
    etag,
  });
}
```

Recommended global policy, keyed on `code` (never on `message`):

| Condition | Action |
| --------- | ------ |
| `401` | Refresh identity with the host app **once**, replay the request once, then surface. |
| `403` (any code) | **Never retry.** For `FEATURE_DISABLED`, hide the control. |
| `404` | Treat as "not found" — do not probe to learn whether it is a permission issue. |
| `409` `CONCURRENT_MODIFICATION` | Refetch the resource, show a "changed elsewhere" prompt, let the user redo. **Never auto-retry.** |
| `409` `ILLEGAL_TRANSITION` | Refresh the transition list and re-render the buttons. |
| `422` | Map `details` onto form fields. |
| `428` | Refetch to get a fresh ETag, then resend. Fixable automatically **once**. |
| `429` | Exponential backoff; surface after a couple of attempts. |
| `500` | Show a generic message **plus `requestId`** so support can find the log line. |
| `503` | Backoff and retry; if the path was `/admin/*`, tell the user the admin API is disabled. |

### 15.5 API service layer

Using the real endpoints and their real field names:

```js
// api/auth.js
export const getMe = () => request("/auth/me");

// api/tickets.js
const qs = (params) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    // `?state=NEW&state=IN_PROGRESS` — repeat the key for a multi-select
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export const listTickets  = (filters) => request(`/tickets${qs(filters)}`);
// Spread the SAME filter object — counts accepts and ignores the state keys on purpose.
export const ticketCounts = (filters) => request(`/tickets/counts${qs({ ...filters, page: undefined, limit: undefined, sort: undefined })}`);
export const getTicket    = (id) => request(`/tickets/${id}`);
export const getTimeline  = (id) => request(`/tickets/${id}/timeline`);
export const getMoves     = (id) => request(`/tickets/${id}/transitions`);

export const createTicket = (b) => request("/tickets", { method: "POST", body: b });
export const markRead     = (id) => request(`/tickets/${id}/read`, { method: "POST" });

export const transition = (id, { transitionCode, reason, expectedVersion }) =>
  request(`/tickets/${id}/transitions`, {
    method: "POST",
    body: { transitionCode, reason, expectedVersion },
  });

export const reassign = (id, { assignedToUserId, reason, expectedVersion }) =>
  request(`/tickets/${id}/assignment`, {
    method: "PATCH",
    body: { assignedToUserId, reason, expectedVersion },   // null un-assigns
  });

export const reclassify = (id, { categoryId, subcategoryId, confirmOnly, reason, expectedVersion }) =>
  request(`/tickets/${id}/classification`, {
    method: "PATCH",
    body: { categoryId, subcategoryId, confirmOnly, reason, expectedVersion },
  });

export const changePriority = (id, { priorityId, reason, expectedVersion }) =>
  request(`/tickets/${id}/priority`, { method: "PATCH", body: { priorityId, reason, expectedVersion } });

export const addNote = (id, note) =>
  request(`/tickets/${id}/notes`, { method: "POST", body: { note } });

// api/collaborations.js
export const listCollaborations = (ticketId) => request(`/tickets/${ticketId}/collaborations`);

export const openCollaboration = (ticketId, { purpose, participants, conversationId, seedInternetMessageId }) =>
  request(`/tickets/${ticketId}/collaborations`, {
    method: "POST",
    body: { purpose, participants, conversationId, seedInternetMessageId },
  });

export const patchCollaboration = (ticketId, cid, patch) =>
  request(`/tickets/${ticketId}/collaborations/${cid}`, { method: "PATCH", body: patch });

export const addCollaborationNote = (ticketId, cid, note) =>
  request(`/tickets/${ticketId}/collaborations/${cid}/notes`, { method: "POST", body: { note } });

// api/admin/settings.js — note how the ETag round-trips
export const getSettings = (deptId) =>
  request(`/admin/departments/${deptId}/settings`);            // → { data, etag }

export const updateSettings = (deptId, patch, etag) =>
  request(`/admin/departments/${deptId}/settings`, { method: "PATCH", body: patch, ifMatch: etag });

// api/outOfOffice.js — NO ifMatch anywhere: this resource has no ETag (§7.2)
export const listMyOoo = (params) =>
  request(`/out-of-office?${new URLSearchParams(params)}`);          // → data[] + meta

export const listCovering = () =>
  request(`/out-of-office?covering=true`);                           // whose work I am covering

export const getOoo = (id) => request(`/out-of-office/${id}`);       // → the record; NO `status`

export const fileOoo = (body) =>
  request(`/out-of-office`, { method: "POST", body });                // → { record, delegated, warning }

export const activateOoo = (id) =>
  request(`/out-of-office/${id}/activate`, { method: "POST", body: {} });   // MANUAL windows

export const cancelOoo = (id, reason) =>
  request(`/out-of-office/${id}/cancel`, { method: "POST", body: { mode: "RETURNED", reason } });

// The edit verb. Returns a NEW record id — repoint local state at data.record.id.
export const replaceDelegate = (id, defaultDelegateId, handoverReason) =>
  request(`/out-of-office/${id}/replace`, {
    method: "POST",
    body: { defaultDelegateId, handoverReason },
  });
```

### 15.6 State management notes

| Data | Lifetime | Where from |
| ---- | -------- | ---------- |
| `user`, `roleCode`, `departmentId`, `permissions` | Session | `GET /auth/me`, once on mount |
| `workflowStates` | Session | `GET /auth/me`. **The only source.** Changes only when an administrator publishes a new workflow version. |
| Admin enum vocabularies | Session | `GET /admin/meta/enums`, once when the admin area mounts |
| Ticket list + counts | Per filter change | `GET /tickets` + `GET /tickets/counts`, from **one shared filter object** |
| Ticket detail + transitions + OLA | Per ticket open | `GET /tickets/:id` |
| ETags for admin resources | Until the next write | The `ETag` header, or each row's `etag` field |
| Out-of-office windows | Per view; refetch after any write | `GET /out-of-office`. **Do not cache an id across a `replace`** — that verb returns a *new* record id and cancels the old one. |

**Store the `version` from every ticket you render** and send it back as `expectedVersion`.
**Store the `etag` from every admin resource you read** and send it back as `If-Match`.
**Store neither for out-of-office** — it has no token, and sending `If-Match` there does nothing.

---

## 16. API Quick Reference

All paths are relative to **`/api/helpdesk`**. **47 endpoints.**

| # | Method | Endpoint | Purpose | Auth | Role | Permission | Feature | `If-Match` |
| - | ------ | -------- | ------- | ---- | ---- | ---------- | ------- | ---------- |
| 1 | GET | `/health` | Liveness + schema check | **No** | — | — | — | — |
| 2 | GET | `/auth/me` | Identity, role, permissions, workflow states | Yes | any | — | — | — |
| 3 | GET | `/admin/meta/enums` | All controlled vocabularies | Yes | any w/ perm | `helpdesk.department.read` | — | — |
| 4 | GET | `/admin/departments` | List departments | Yes | any w/ perm | `helpdesk.department.read` | — | — |
| 5 | POST | `/admin/departments` | Create a department (→ `DRAFT`) | Yes | any w/ perm | `helpdesk.department.create` | — | — |
| 6 | GET | `/admin/departments/:departmentId` | One department | Yes | any w/ perm | `helpdesk.department.read` | — | — |
| 7 | PATCH | `/admin/departments/:departmentId` | Edit a department | Yes | any w/ perm | `helpdesk.department.write` | — | **Yes** |
| 8 | GET | `/admin/departments/:departmentId/readiness` | Go-live checklist | Yes | any w/ perm | `helpdesk.department.read` | — | — |
| 9 | POST | `/admin/departments/:departmentId/activate` | Take a department live | Yes | any w/ perm | `helpdesk.department.activate` | — | **Yes** |
| 10 | POST | `/admin/departments/:departmentId/deactivate` | Take it out of service | Yes | any w/ perm | `helpdesk.department.deactivate` | — | **Yes** |
| 11 | GET | `/admin/departments/:departmentId/settings` | Read settings | Yes | any w/ perm | `helpdesk.settings.read` | — | — |
| 12 | POST | `/admin/departments/:departmentId/settings` | Create settings from defaults | Yes | any w/ perm | `helpdesk.settings.write` | — | — |
| 13 | PATCH | `/admin/departments/:departmentId/settings` | Edit settings | Yes | any w/ perm | `helpdesk.settings.write` | — | **Yes** |
| 14 | GET | `/admin/departments/:departmentId/features` | List all six capabilities | Yes | any w/ perm | `helpdesk.feature.read` | — | — |
| 15 | POST | `/admin/departments/:departmentId/features` | Configure a capability | Yes | any w/ perm | `helpdesk.feature.write` | — | — |
| 16 | PATCH | `/admin/departments/:departmentId/features/:code` | Enable / reconfigure | Yes | any w/ perm | `helpdesk.feature.write` | — | **Yes** |
| 17 | DELETE | `/admin/departments/:departmentId/features/:code` | **Disable** (never deletes) | Yes | any w/ perm | `helpdesk.feature.write` | — | **Yes** |
| 18 | GET | `/tickets` | Ticket list / queue | Yes | any · `EMPLOYEE` forced to own | — | — | — |
| 19 | GET | `/tickets/counts` | State dropdown numbers | Yes | any · `EMPLOYEE` forced to own | — | — | — |
| 20 | GET | `/tickets/:id` | Ticket + transitions + OLA | Yes | any · `EMPLOYEE` own only | — | — | — |
| 21 | GET | `/tickets/:id/timeline` | History · `EMPLOYEE` filtered | Yes | any · `EMPLOYEE` own only | — | — | — |
| 22 | GET | `/tickets/:id/transitions` | Legal next moves | Yes | any · `EMPLOYEE` own only | — | — | — |
| 23 | GET | `/tickets/:id/collaborations` | Internal thread(s) | Yes | **agent roles** | — | — | — |
| 24 | POST | `/tickets` | Raise a ticket | Yes | any · on-behalf = agent roles | — | — | — |
| 25 | POST | `/tickets/:id/read` | Clear **my** unread markers | Yes | any · own view only | — | — | — |
| 26 | POST | `/tickets/:id/transitions` | **The only** state change | Yes | per transition | — | — | — |
| 27 | PATCH | `/tickets/:id/assignment` | Reassign / un-assign | Yes | **agent roles** | — | — | — |
| 28 | PATCH | `/tickets/:id/classification` | Correct or confirm the category | Yes | **agent roles** | — | — | — |
| 29 | PATCH | `/tickets/:id/priority` | Change priority | Yes | **agent roles** | — | — | — |
| 30 | POST | `/tickets/:id/notes` | Internal note | Yes | **agent roles** | — | — | — |
| 31 | POST | `/tickets/:id/snooze` | Snooze ⚠️ **broken (500)** | Yes | any | — | `SNOOZE` | — |
| 32 | POST | `/tickets/:id/collaborations` | Open a collaboration | Yes | **agent roles** | — | `COLLABORATION` | — |
| 33 | PATCH | `/tickets/:id/collaborations/:collaborationId` | Bind thread / change status | Yes | **agent roles** | — | `COLLABORATION` | — |
| 34 | POST | `/tickets/:id/collaborations/:collaborationId/notes` | Note on the internal thread | Yes | **agent roles** | — | `COLLABORATION` | — |
| 35 | POST | `/tickets/:id/replies` | Send a reply ⚠️ **broken (500)** | Yes | any | — | — | — |
| 36 | GET | `/out-of-office` | **My** leave, or `?covering=true` | Yes | any w/ perm | `helpdesk.ooo.read` **or** `.write` | — | — |
| 37 | GET | `/out-of-office/:id` | One of my records | Yes | any w/ perm | `helpdesk.ooo.read` **or** `.write` | — | — |
| 38 | POST | `/out-of-office` | File my leave | Yes | any w/ perm | `helpdesk.ooo.write` | `OOO_DELEGATION` | — |
| 39 | POST | `/out-of-office/:id/activate` | Turn a `MANUAL` window on | Yes | any w/ perm | `helpdesk.ooo.write` | — | — |
| 40 | POST | `/out-of-office/:id/cancel` | End it early | Yes | any w/ perm | `helpdesk.ooo.write` | — | — |
| 41 | POST | `/out-of-office/:id/replace` | **Swap the delegate** (there is no PATCH) | Yes | any w/ perm | `helpdesk.ooo.write` | `OOO_DELEGATION` | — |
| 42 | GET | `/admin/departments/:departmentId/out-of-office` | Who is away in the department | Yes | any w/ perm | `helpdesk.ooo.read` | — | — |
| 43 | GET | `/admin/departments/:departmentId/out-of-office/:id` | One record | Yes | any w/ perm | `helpdesk.ooo.read` | — | — |
| 44 | POST | `/admin/departments/:departmentId/out-of-office` | File leave **for someone** | Yes | any w/ perm | `helpdesk.ooo.write` | `OOO_DELEGATION` | — |
| 45 | POST | `/admin/departments/:departmentId/out-of-office/:id/activate` | Turn a `MANUAL` window on | Yes | any w/ perm | `helpdesk.ooo.write` | — | — |
| 46 | POST | `/admin/departments/:departmentId/out-of-office/:id/cancel` | End it early | Yes | any w/ perm | `helpdesk.ooo.write` | — | — |
| 47 | POST | `/admin/departments/:departmentId/out-of-office/:id/replace` | Swap the delegate | Yes | any w/ perm | `helpdesk.ooo.write` | `OOO_DELEGATION` | — |

*agent roles = `SPOC`, `MANAGER`, `DEPT_ADMIN`, `DEPT_HEAD`, `SUPER_ADMIN`.*
*"any w/ perm" = no role check; the permission is the gate. `EMPLOYEE` holds none, so an
`EMPLOYEE` is refused from every `/admin/*` route **and from all twelve out-of-office routes**.*
*Out-of-office is the one resource with **no `If-Match` anywhere**, including on the admin
surface: the table has no `updated_at` and therefore no ETag. Rows 41 and 47 replace what a
`PATCH` would have done.*

---

## 17. Typical Frontend Flows

### Login / bootstrap flow

```text
Host application authenticates the user
  ↓
Obtain identity credential
  (jwt mode: a Bearer token from the host app — the helpdesk issues none)
  (header mode: the user's email address)
  ↓
GET /auth/me
  ↓
Store user.id, roleCode, departmentId, permissions, authMode
  ↓
Store workflowStates  ← the ONLY source of the state vocabulary; cache for the session
  ↓
departmentId === null ?  →  show "your account is not attached to a department"; stop
  ↓
Branch the UI:
  roleCode === EMPLOYEE            →  requester view (own tickets, filtered timeline)
  roleCode ∈ agent roles           →  agent view (queue, assignment, notes, collaboration)
  permissions.length > 0           →  show the admin area
  ↓
GET /tickets/counts  +  GET /tickets     (dashboard)
```

### Ticket list / queue flow

```text
Build ONE filter object from the UI controls
  (state[] from cached workflowStates[].code, stateCategory[], categoryId,
   priorityId, assignedToUserId, unassigned, openOnly, isBreached,
   unreadOnly, createdFrom, createdTo, search, sort, page, limit)
  ↓
Spread it into BOTH calls, in parallel:
  GET /tickets            → data[] + meta{page,limit,total,totalPages}
  GET /tickets/counts     → total, unread, byState, byCategory, unreadByState
  (counts accepts and ignores state / stateCategory / stateId on purpose,
   so one object serves both)
  ↓
Render the grid from data[]:
   state_code / state_name, priority_name (sort severity_rank DESC for urgent-first),
   category_name, assigned_to_name, has_unread / unread_count for the badge
  ↓
Render the state dropdown numbers from byState — every state appears, including zeros
```

### Ticket detail flow

```text
GET /tickets/:id
  ↓
  ├─ data.ticket                 → header, fields, and data.ticket.version → KEEP IT
  ├─ data.availableTransitions   → render one action button per entry
  └─ data.ola.instances          → due_at, breach state, requires_intervention
  ↓
GET /tickets/:id/timeline        → activity feed
  ↓
roleCode ∈ agent roles ?
  → GET /tickets/:id/collaborations   (a SECOND call; never merged with the timeline)
  ↓
User actually looks at it ?
  → POST /tickets/:id/read       (a verb, never a side effect of the GET above)
  → decrement the local badge, or refetch GET /tickets/counts
```

### Create ticket flow

```text
Read cached workflowStates (for context) and GET /auth/me's departmentId
  ↓
Load the category list        →  ⚠️ NO ENDPOINT EXISTS (Known Issue #1)
Load the priority list        →  ⚠️ NO ENDPOINT EXISTS (Known Issue #1)
  (require_category defaults to TRUE, so categoryId is effectively mandatory;
   omit priorityId to take the department default)
  ↓
User submits
  ↓
POST /tickets  { subject, description, categoryId, subcategoryId, priorityId?, sourceCode? }
  ↓
201 → data is the raw ticket row (state_id, no state_code)
  ↓
Attachments ?  →  ⚠️ NO UPLOAD ENDPOINT (§13). Files must arrive by email.
  ↓
GET /tickets/:id     → the enriched view, transitions and OLA
```

### State transition flow

```text
Buttons already rendered from availableTransitions
  ↓
User clicks a button carrying { code, label, requires_reason, requires_assignment }
  ↓
requires_reason      → prompt for a reason (omitting it is a 400)
requires_assignment  → ticket must be assigned first (else a 400)
  ↓
POST /tickets/:id/transitions
      { transitionCode: code, reason?, expectedVersion: ticket.version }
  ↓
200 → data.ticket (new version, resolved_at / closed_at / auto_close_due_at as applicable)
      data.transition { code, label, fromStateCode, toStateCode }
  ↓
Refresh the buttons: GET /tickets/:id/transitions (or the whole GET /tickets/:id)
  ↓
409 ILLEGAL_TRANSITION      → buttons were stale; details.allowed is the legal set
409 CONCURRENT_MODIFICATION → refetch, tell the user, let them redo
```

### Reassignment flow

```text
Load the assignable-user list  →  ⚠️ NO ENDPOINT EXISTS (Known Issue #1)
  ↓
PATCH /tickets/:id/assignment  { assignedToUserId, reason?, expectedVersion }
      (assignedToUserId: null  un-assigns and closes the open interval)
  ↓
200 → data.ticket, data.assignment (the new history row), data.unassigned
  ↓
404 "User not found" · 403 CROSS_DEPARTMENT · 400 "That user cannot receive tickets"
```

### Classification correction flow

```text
Ticket shows classification_status = AI_SUGGESTED / AI_LOW_CONFIDENCE
  with ai_suggested_category_id and ai_confidence
  ↓
Agent chooses:
  "Looks right"  → PATCH /classification { categoryId: <same>  }  → corrected: false, status CONFIRMED
  "Wrong"        → PATCH /classification { categoryId: <other> }  → corrected: true,  status CORRECTED
  ↓
One verb, three effects: field change recorded · routing RE-RESOLVED · corpus upserted
  ↓
⚠️ The assignee may have changed — refetch GET /tickets/:id
```

### Collaboration flow

```text
Feature COLLABORATION must be enabled (else 403 FEATURE_DISABLED)
  ↓
Frontend sends the collaboration mail via Microsoft Graph with the USER'S OWN token,
CC'ing the support mailbox            ← the backend sends no mail
  ↓
POST /tickets/:id/collaborations
      { purpose, participants:[{userId, participantRole}], seedInternetMessageId, conversationId? }
  ↓
201 → data.collaboration (status OPEN), data.participants
  ↓
   ── if you opened the collaboration BEFORE sending the mail ──
   PATCH /tickets/:id/collaborations/:cid { conversationId, seedInternetMessageId }
  ↓
Collaborator replies by mail (support mailbox was CC'd)
  → intake matches the seed id, writes conversation_id, records a COLLABORATION_NOTE,
    moves OPEN → ANSWERED, stamps responded_at        (INTERNAL — never on the requester's timeline)
  ↓
GET /tickets/:id/collaborations → participants[].respondedAt shows Finance ✓ / Legal ⏳
  ↓
Settle it:  PATCH /tickets/:id/collaborations/:cid { status: "CLOSED" }
  → OLA resumes ONLY when the LAST unresolved collaboration that paused it is closed
```

### Department onboarding flow (admin)

```text
GET /admin/meta/enums                    (once, for every dropdown)
  ↓
POST /admin/departments { code, name, supportEmail? }   → DRAFT, settings row created too
  ↓
GET /admin/departments/:id/readiness     → the checklist
  ↓
Fix blocking checks:
  CALENDAR_UNSET / NO_DEFAULT_PRIORITY / NO_ACTIVE_WORKFLOW
      → PATCH /admin/departments/:id { businessCalendarId, defaultPriorityId, defaultWorkflowId }
        (with If-Match)
  NO_CATEGORY
      → turn requireCategory off:  PATCH .../settings { requireCategory: false }   (with If-Match)
        …or create a category → ⚠️ NO ENDPOINT (Known Issue #2)
  NO_CATCHALL_ROUTING_RULE / calendar days / priorities / workflows
      → ⚠️ NO ENDPOINTS (Known Issue #2) — these need SQL or a later backend phase
  ↓
Every configuration write re-runs readiness automatically → DRAFT ⇄ READY
So: refetch GET .../readiness after each write, and read the fresh status
  ↓
readiness.ready === true  &&  status ∈ { READY, INACTIVE }
  ↓
POST /admin/departments/:id/activate  {}   (with If-Match)
  → 200 "Department is live", status ACTIVE
  → 409 with details.blocking if something regressed — render that list
```

### Feature toggle flow (admin)

```text
GET /admin/departments/:id/features    → all six codes, each with `exists` and `etag`
  ↓
exists === false  →  POST   /features            { featureCode, isEnabled, config }
exists === true   →  PATCH  /features/:code      { isEnabled, config }   + If-Match: row.etag
turn off          →  DELETE /features/:code                              + If-Match: row.etag
                     (disables; the row and its history stay)
  ↓
Enabling AI_CLASSIFICATION without a catch-all routing rule → 409 CONFLICT
  (and there is no endpoint to create that rule — Known Issue #2)
  ↓
Refetch GET /features to pick up the new etag values
```

### Admin write flow (the ETag round trip)

```text
GET  <admin resource>                → body.data + ETag header (and data.etag)
  ↓
User edits
  ↓
PATCH <admin resource>   If-Match: <the ETag>   body: only the CHANGED fields
  ↓
200 → store the NEW ETag from the response and replace the old one
  ↓
428 PRECONDITION_REQUIRED   → you forgot If-Match; refetch and resend
409 CONCURRENT_MODIFICATION → someone else wrote first; refetch, show a prompt, let the user redo
```

**Out-of-office is the exception to this whole flow.** No ETag, no `If-Match`, no `PATCH` —
see the next flow.

### Out-of-office flow (self-service)

```text
permissions includes helpdesk.ooo.write ?  (from /auth/me — NOT the role code)
  no  → do not render the feature at all; every route answers 403
  ↓
GET /out-of-office                          → my windows   (?includeCancelled=true for history)
GET /out-of-office?covering=true            → whose work I am covering
  ↓
Render each row from its DERIVED status:
   SCHEDULED            → "starts <date>"          [Cancel]
   AWAITING_ACTIVATION  → "filed but NOT active"   [Activate] [Cancel]   ← MANUAL only
   ACTIVE               → "away until <date>"      [Change delegate] [Cancel]
   EXPIRING             → "ending — settling"      (scheduler runs every 10 min)
   ENDED / CANCELLED    → history; no actions
  ↓
File leave:
  POST /out-of-office { startsAt, endsAt, defaultDelegateId, … }
    → 201 { record, delegated, warning }
    → delegated > 0 ?  "N open tickets moved to <delegate> now"   (ALL_ACTIVE_TICKETS)
    → warning != null ? show it — the delegate is themselves out; routing walks past them
    → 409 ?  an overlapping window already exists — offer Cancel or Change delegate on THAT one
  ↓
Change the delegate:  POST /out-of-office/:id/replace { defaultDelegateId }
    → 201 { record: <NEW id>, replaced: <old id>, … }   ← repoint local state at record.id
    → NOT a PATCH, and never a PATCH: tickets the old delegate already holds stay with them
  ↓
Back early:  POST /out-of-office/:id/cancel { mode: "RETURNED" }
    → 200 { reverted, mode } — reverted = tickets handed back (RETURN_TO_OWNER only)
```

**The delegate picker is the open problem.** There is no endpoint that lists the department's
assignable users, so the frontend has no way to populate `defaultDelegateId`. Same root cause as
the ticket dropdowns — see [Known Issues #1](#1-there-is-no-way-to-populate-the-ticket-creation-dropdowns).
Until `helpdesk.user.*` gets a router, the id has to come from wherever the host application
already knows the department's people. A wrong one is a clean `422` naming
`defaultDelegateId`, not a silent failure.

---

## Backend API Notes / Known Issues

Each item states **what is implemented**, **what the problem is**, and **what to do** — for the
frontend, and separately for the backend where a code change is required. This section
documents; it changes nothing.

---

### 1. There is no way to populate the ticket-creation dropdowns

**Implemented behaviour.** `POST /tickets` accepts `categoryId`, `subcategoryId` and
`priorityId`. `PATCH /tickets/:id/priority` requires a `priorityId`,
`PATCH /tickets/:id/classification` requires a `categoryId`, and
`PATCH /tickets/:id/assignment` requires an `assignedToUserId`.

**Potential issue.** **No endpoint returns categories, subcategories, priorities or assignable
users.** Twelve routers sit commented out in
[routes/index.js:142-152](src/module/helpdesk/routes/index.js#L142-L152). Meanwhile
`department_settings.require_category` defaults to **`true`**, so a `categoryId` is effectively
mandatory on every portal ticket — and unobtainable through the API. This blocks the ticket
form, the priority control, the category correction control and the assignee picker.

**Recommendation.**
*Frontend:* the blocked screens cannot be completed against the API as it stands. For a
development build, the seeded uuids are listed in
[docs/API.md](src/module/helpdesk/docs/API.md) under "Seeded values, for fixtures" (HR
priorities `LOW`/`NORMAL`/`HIGH`, HR categories `ADMIN`/`FINANCE`/`HR_OPS`, two subcategories).
Do not ship hardcoded uuids.
*Backend:* build `category.routes`, `priority.routes` and a user/assignee lookup. This is
already identified in `docs/API.md` as "the next backend ticket".

---

### 2. The admin surface cannot finish onboarding a department

**Implemented behaviour.** `GET …/readiness` names eleven blocking checks and gives each a
`hint` pointing at an endpoint — for example
`POST /admin/departments/{id}/routing-rules with all scopes null` and
`POST /admin/departments/{id}/calendars/{calendarId}/days`.

**Potential issue.** **Those endpoints do not exist.** Only `meta`, `departments`, `settings`
and `features` are mounted ([routes/admin/index.js:51-74](src/module/helpdesk/routes/admin/index.js#L51-L74)).
So `NO_CATCHALL_ROUTING_RULE`, `CALENDAR_NO_WORKING_DAYS`, `NO_ACTIVE_PRIORITY`,
`NO_DEFAULT_PRIORITY`, `NO_ACTIVE_WORKFLOW` and its three workflow-shape checks are
**unfixable through the API**. A brand-new department therefore cannot reach `READY`, and
`POST …/activate` will keep returning `409` with those codes in `details.blocking`.
Consequently `AI_CLASSIFICATION` also cannot be enabled — it requires a catch-all rule that no
endpoint can create.

**Recommendation.**
*Frontend:* build the wizard against `readiness`, but expect the `hint` for an unbuilt endpoint
to be aspirational. Render unfixable checks as "requires backend configuration" rather than as
a broken button. Departments will be onboarded by SQL (see the 10-step insert list in
[CLAUDE.md](src/module/helpdesk/CLAUDE.md)) until those routers land.
*Backend:* the `hint` strings promise endpoints that do not exist; either build them or mark
them as deferred in the payload.

---

### 3. ~~Two~~ One endpoint returns `500` on every call

**Implemented behaviour.**

| Endpoint | Fault |
| -------- | ----- |
| `POST /tickets/:id/replies` | The handler calls `require("../services/reply.service")`, and **`services/reply.service.js` does not exist** → `MODULE_NOT_FOUND` at request time. |
| ~~`POST /tickets/:id/snooze`~~ | **FIXED.** Called `snoozeService.snooze(...)` where the service exports `create`. Now a controller function (`ticket.controller.snoozeTicket`) and verified returning 201. |

The replies handler is still an inline handler in
[routes/ticket.routes.js](src/module/helpdesk/routes/ticket.routes.js), rather than a controller
function, which is how it slipped through: validation passes, the route matches, and the failure
only happens inside the handler. The snooze fix moved that route to a controller for the same
reason.

**Potential issue.** A UI wired to the reply composer gets a generic `500`.

**Recommendation.**
*Frontend:* do not build a reply composer yet. Replies are a **Graph call the frontend makes
itself** (§11.10) — that is the intended design, not a workaround. The snooze control is now
safe to build; see §snooze in `docs/API.md` for the three endpoints.
*Backend:* `reply.service.js` needs writing; `services/graph.client.js` already holds the
`sendMail` / `replyToMessage` primitives and has no callers.

---

### 4. Three ticket write verbs skip the department/ownership check

**Implemented behaviour.** `PATCH /tickets/:id/assignment`, `PATCH /tickets/:id/classification`
and `PATCH /tickets/:id/priority` go straight from the route to a service. They **never call
`assertSameDepartment`** — the route file states this explicitly at
[ticket.routes.js:15-21](src/module/helpdesk/routes/ticket.routes.js#L15-L21) and treats
`requireRole(...AGENT_ROLES)` as the mitigation. `POST /tickets/:id/replies` likewise has
neither check.

> **`requireRole` alone is not equivalent to the check.** It closes the EMPLOYEE hole; it does
> nothing about an agent in department A acting on a department B ticket id. And there is **no
> row-level security behind it** — despite `CLAUDE.md` claiming isolation is "enforced three
> ways", [auth.middleware.js:18-22](src/module/helpdesk/middleware/auth.middleware.js#L18-L22)
> is explicit that no `CREATE POLICY` exists yet. Believe the middleware.
>
> The three snooze endpoints do **not** belong to this list: all three call
> `assertSameDepartment` in the controller, verified returning 404 for a cross-department agent.

**Potential issue.** An agent in department A who knows a ticket id in department B can
reassign, reclassify or reprioritise it. The blast radius is bounded but real:

| Verb | What still protects it |
| ---- | ---------------------- |
| assignment | The target user must be in **the ticket's** department, so the owner cannot be moved out of it — but the reassignment itself succeeds. |
| classification | A cross-department `categoryId` is stopped by the composite FK (`409`) — but a category **in the ticket's own department** would be accepted. |
| priority | A cross-department `priorityId` is refused — but the ticket's own department's priorities are accepted. |

Every read path (`GET /tickets/:id`, `/timeline`, `/transitions`, `/collaborations`,
`POST /:id/read`, `POST /:id/transitions`, `POST /:id/notes`) **does** apply the check, so this
is an inconsistency between reads and three specific writes, not a general hole.

**Recommendation.**
*Frontend:* no action — you cannot reach another department's ticket ids through any list
endpoint, so this is not a client-side concern. Do not rely on the gap.
*Backend:* add `assertSameDepartment` to those handlers (the function is already exported from
`ticket.controller` precisely so it can be reused). Worth raising with the backend owner.

---

### 5. Asymmetric verbs — things you can start but not stop

**Implemented behaviour.**

| Can start | Cannot stop |
| --------- | ----------- |
| ~~`POST /tickets/:id/snooze`~~ | **FIXED.** `DELETE /tickets/:id/snooze` ends the open snooze with `end_trigger = MANUAL` and resumes the clock. Not feature-gated, so disabling `SNOOZE` cannot trap an open snooze. |
| `POST /admin/…/features` | Fine — `DELETE` disables. |
| `POST /admin/…/activate` | Fine — `deactivate` exists. |

Also: no ticket **delete** or archive verb of any kind, and no `DELETE` on a department
(deliberate — soft-deleting a department is a later phase, and `/deactivate` is a different act
with a different meaning).

**Potential issue.** None outstanding for snooze. Two behaviours worth knowing:

- **Cancelling does not refund the count.** `snooze_max_count` is enforced against
  `max(sequence_no)`, which counts every snooze the ticket has ever had, so three
  snooze/un-snooze cycles exhaust a `snooze_max_count = 3` department. If that is the wrong
  product reading, the cap has to move off `max(sequence_no)` — a separate change.
- **An open snooze survives ticket closure.** `workflow.service` sets `closed_at` and calls
  `olaService.stop` ([workflow.service.js:107-144](src/module/helpdesk/services/workflow.service.js#L107-L144))
  but never touches `ticket_snoozes`. The wake-up job later ends the interval and notifies
  `snoozed_by_user_id` about a ticket that is already closed. **No clock is resurrected** —
  `stop()` sets `is_stopped` and `end()`'s resume guard requires `is_paused AND NOT is_stopped`
  — so the only symptom is a confusing notification. `create` refuses to snooze an
  already-closed ticket; nothing ends an existing snooze when a ticket closes.

**Recommendation.**
*Frontend:* the un-snooze control is safe to build. Keep it reachable even when the department's
`SNOOZE` feature is off — only the POST is feature-gated.
*Backend:* decide the closure question above; either end the snooze on a closing transition or
suppress the wake-up notification for a closed ticket.

---

### 5b. `end()`'s OLA resume guard is per-ticket; `resume()` acts per-instance

**Implemented behaviour.** [snooze.service.js:143-149](src/module/helpdesk/services/snooze.service.js)
checks whether **any** OLA instance on the ticket is paused with `pause_reason = 'SNOOZE'`, then
calls `olaService.resume`, whose `WHERE` is `ticket_id = $1 AND is_paused AND NOT is_stopped`
with **no `pause_reason` filter**
([ola.service.js:164-170](src/module/helpdesk/services/ola.service.js#L164-L170)).

**Potential issue.** On a ticket carrying several OLA instances in mixed pause states, waking a
snooze also restarts a clock paused for `PENDING` — the exact outcome the guard's own comment
says it exists to prevent ("waking the snooze must not restart a clock the workflow still says
is stopped"). `collaboration.service.close` shares the asymmetry. Not reachable in the seeded HR
configuration, where all instances on a ticket pause together.

**Recommendation.** *Backend:* give `olaService.resume` an optional `pauseReason` filter and pass
it from both callers. Out of scope for the snooze API work; found while verifying it.

---

### 5c. The OLA block tells a requester the ticket is snoozed

**Implemented behaviour.** `GET /tickets/:id` is agent-and-requester (only
`assertSameDepartment` guards it), and its `ola` payload carries
`instances[].pause_reason = 'SNOOZE'` while paused, plus `events[].pause_reason` and
`events[].actor_user_id` on the PAUSE/RESUME rows.

**Potential issue.** A requester can infer that their ticket was deferred, and by whom. The
sensitive parts do **not** leak — `reason` (the agent's triage note) and the snooze row itself
are behind `GET /tickets/:id/snooze`, which is agent-only, and the `SNOOZED` activity row is
`INTERNAL` so `/timeline` filters it out. Verified both ways.

**Potential issue is pre-existing** and independent of the snooze endpoints: it follows from OLA
pause metadata being on a requester-readable payload, and would equally disclose `COLLABORATION`.

**Recommendation.** *Backend:* decide whether `ola.events` and `pause_reason` belong on a
requester-facing response at all. If not, filter them in `getById` by role, the way `timeline`
already filters activity.

---

### 6. Mixed casing between requests and responses

**Implemented behaviour.** Request bodies are **camelCase** (`categoryId`, `isEnabled`,
`acknowledgeOpenTickets`). Responses are mostly **raw `snake_case` database rows**
(`ticket_number`, `is_enabled`, `assigned_to_user_id`). Inside one response the two can mix:
`GET /tickets/:id/collaborations` returns snake_case collaboration rows whose `participants`
array is camelCase, and whose `notes` are snake_case again.

**Potential issue.** Every client needs a mapping layer, and the inconsistency is easy to get
wrong in exactly one place. `GET /auth/me` is fully camelCase, which makes the pattern look
like the rule when it is the exception.

**Recommendation.**
*Frontend:* write one explicit mapper per resource. **Do not** apply a blanket
`snakeToCamel()` transform — it would rewrite `participants` (already camelCase) and any
`config` object's user-supplied keys.
*Backend:* out of scope here. The module's own convention is "camelCase in, snake_case out",
documented in the validators — it is deliberate, not accidental.

---

### 7. Response-shape inconsistencies across similar endpoints

**Implemented behaviour** — all verified, all deliberate-looking but worth knowing:

| Endpoint | Shape | Contrast |
| -------- | ----- | -------- |
| `POST /tickets` | `data` is the ticket row **directly** | `GET /tickets/:id` wraps it as `data.ticket` |
| `GET /tickets/:id/transitions` | `data` is the **array** | `GET …/collaborations` wraps as `data.collaborations` |
| `POST /tickets/:id/collaborations` | `participants` are **snake_case raw rows** | `GET …/collaborations` returns **camelCase** participants |
| `PATCH /tickets/:id/assignment` (un-assign) | `{ ticket, assignment: null }` — **no `unassigned` key** | Every other path returns `{ ticket, assignment, unassigned }` |
| `GET /health` | error envelope carries **`data`** | Every other error carries `details` |
| `DELETE …/features/:code` | returns **`200` + the row** | A conventional REST delete would be `204` (deliberate: it is a disable, not a removal) |
| `GET /admin/departments` (list) | **no `ETag` header**; each row carries `etag` | `GET /admin/departments/:id` sets the header |
| `GET …/features` | **no `ETag` header**; each row carries `etag` | `GET …/settings` sets the header |
| `GET /out-of-office` (list) | rows carry a derived **`status`** and `total_count`, but **not** `user_status` / `is_assignable` | `GET /out-of-office/:id` carries the eligibility flags and **no `status`** — see [§11.11](#1111-out-of-office) |
| Every out-of-office **write** | `data` is a **wrapper** — `{record, delegated}` / `{record, reverted, mode}` / `{record, replaced, delegated, warning}` | `data` is never the record itself, unlike `POST /tickets` |
| Every out-of-office route | **no `ETag` anywhere**, on either surface | Every other admin resource sets one and requires `If-Match` on writes |

**Potential issue.** A generic client that assumes "`data` is always the resource" or "an
`ETag` header is always present" will break on specific endpoints.

**Recommendation.** *Frontend:* type each endpoint's response individually; do not infer from a
sibling. The tables in §11 are per-endpoint for this reason.

---

### 8. `docs/API.md` and `docs/ADMIN_API.md` differ from the implementation

The module ships two documents. Where they disagree with the code, **this document follows the
code**. Differences found:

| Existing doc | Says | Implementation |
| ------------ | ---- | -------------- |
| `docs/API.md` endpoint table | `POST /tickets/:id/snooze` — no warning | **Broken (`500`)**, see #3 |
| `docs/API.md` §Collaboration | `participants` carry `name`, `email`, `departmentName` on **`GET`** | Correct for `GET`; the **`POST`** response returns raw snake_case rows without them |
| `docs/API.md` §Collaboration | Response keys shown as `conversationId`, `pausesOla`, `lastReplyAt`, `repliesAfterClose` (camelCase) | The collaboration row is **snake_case**: `conversation_id`, `pauses_ola`, `last_reply_at`, `replies_after_close`. Only `participants` is camelCase. |
| `docs/API.md` §Collaboration | `notes[]` keys shown as `activityType`, `senderEmail`, `occurredAt` | Actually `activity_type`, `sender_email`, `occurred_at` |
| `docs/ADMIN_API.md` §4 | Lists a `→ DRAFT` lifecycle row for `POST /admin/departments` | Accurate |
| `CLAUDE.md` §"The frontend asks for outcomes" | Lists `POST /tickets/from-email` | **Never built.** Email arrives via the polling worker. |
| `CLAUDE.md` §"Department isolation is enforced three ways" | Claims row-level security as the third layer | [auth.middleware.js:20-22](src/module/helpdesk/middleware/auth.middleware.js#L20-L22) is explicit that **no `CREATE POLICY` exists** — there are two layers, not three. |
| [controllers/ooo.controller.js:15](src/module/helpdesk/controllers/ooo.controller.js#L15) | A `?userId=` on the self-service list "is a 422 — `listOwnQuery` … is `.strict()`" | **`listOwnQuery` is not `.strict()`.** Zod strips the unknown key and the request succeeds. It cannot widen the result — the caller's own id is applied last — but it is silently accepted, not refused. The **body** schemas *are* `.strict()`, so the same claim holds there. |

**Recommendation.** Treat this file as the frontend contract. Where it is silent, read the route
file, then the validator.

---

### 9. Declared-but-unused surface

Present in the code, reachable by no endpoint and driven by nothing. Do not build UI on these:

| Artefact | Status |
| -------- | ------ |
| `FEATURE_CODE.EXTERNAL_INTAKE`, `EX_EMPLOYEE_INTAKE` | Toggleable via the features API; **read by nothing** |
| `ERROR_CODE.DELEGATION_DEPTH_EXCEEDED` | Declared, **never thrown.** It used to be a `409` that propagated into `ticket.service.create` and aborted the whole intake transaction — a cover chain three people long stopped an email becoming a ticket at all. Exceeding `max_delegation_depth` is now the same outcome as any other dead end: unassigned, plus an `OOO_DELEGATION_BLOCKED` timeline row. |
| `ERROR_CODE.UNASSIGNED_TICKET`, `SNOOZE_LIMIT_EXCEEDED` | Declared, **never thrown** (snooze limits return `BAD_REQUEST`) |
| `NOTIFICATION_CHANNEL.PUSH` / `EMAIL` | Rows are written as `PENDING`; **no dispatcher drains them** |
| `notifications` table | Written but **no list/read API** beyond the unread counters on the ticket list |
| `department_settings.attachment_max_mb` | Editable; **no code reads it** (§13) |
| `ACTIVITY_TYPE.ATTACHMENT_ADDED` | Declared; **never written** |
| `optionalAuth` middleware | Implemented; **used by no route** |
| `loadFeature` middleware (non-blocking variant) | Implemented; **used by no route** |
| `helpdesk.taxonomy.* / priority.* / calendar.* / workflow.* / routing.* / ola.* / user.* / role.* / corpus.* / audit.read` | Seeded permissions with **no endpoints**. `helpdesk.ooo.*` **left this list** — it now gates twelve routes, see [§11.11](#1111-out-of-office). |

---

### 10. Operational notes that affect the frontend

| Item | Detail |
| ---- | ------ |
| `header` auth mode is an **authentication bypass by construction** | Any caller can claim any address. It is refused outright in production (`500`), but in dev/staging treat every identity as unverified. |
| Background jobs are **off by default** | `HELPDESK_JOBS_ENABLED` defaults to `false`. With jobs off, OLA escalation, auto-close and snooze wake-up **never run** — a snoozed ticket never wakes, and a resolved ticket never auto-closes. |
| Out-of-office is **the one feature that still works with jobs off** | Delegation of **new** tickets is resolved live at assignment time, so cover works regardless. What the `ooo-activation` job owns (every **10 minutes**) is only the `ALL_ACTIVE_TICKETS` sweep for a window that opens later, and the expiry/revert at `ends_at`. With jobs off: a future-dated window still delegates new tickets from `starts_at`, but never sweeps and never reverts — `POST /:id/cancel` is then the only thing that will settle it. |
| Email intake is **off by default** and per-deployment | `HELPDESK_GRAPH_INTAKE_ENABLED` defaults to `false`, and **one mailbox is polled per deployment**, chosen by an environment variable — which is why `MAIL_NOT_POLLED` always fails in readiness. A department onboarded entirely through the API receives no mail. |
| AI classification needs **two** switches | `HELPDESK_AI_ENABLED` (deployment) **and** the department's `AI_CLASSIFICATION` feature row. A classifier failure is never an intake failure — the mail still becomes a ticket, unclassified. |
| The CRM's global `cors()` answers the preflight | Only the actual request is restricted to `HELPDESK_CORS_ORIGINS`. |
| `x-request-id` | Echoed on every response and written to `audit_logs.request_id`. **Log it, and show it on any `500`.** |

> **One unrelated observation, flagged because it is a live credential rather than an API
> concern:** [config/env.js:204](src/module/helpdesk/config/env.js#L204) contains a hardcoded
> OpenAI API key as the fallback for `HELPDESK_OPENAI_API_KEY`, in a git-tracked file. That is
> a secret-management problem for the backend owner, not something the frontend consumes.

---

## Final Audit

Verified by walking every `router.get/post/patch/put/delete` declaration in
[routes/index.js](src/module/helpdesk/routes/index.js),
[routes/auth.routes.js](src/module/helpdesk/routes/auth.routes.js),
[routes/ticket.routes.js](src/module/helpdesk/routes/ticket.routes.js),
[routes/ooo.routes.js](src/module/helpdesk/routes/ooo.routes.js) and the six files under
[routes/admin/](src/module/helpdesk/routes/admin/), then reconciling that list against §11 and
against the quick-reference table in §16.

```text
Total APIs discovered:            47
Total APIs documented:            47
Undocumented APIs:                 0
Potential inconsistencies found:  11
```

**Coverage checks**

| Check | Result |
| ----- | ------ |
| Every endpoint has a method and a full path | ✅ 47/47 |
| Every endpoint states its authentication requirement | ✅ 47/47 |
| Every endpoint states its role / permission / feature gate | ✅ 47/47 |
| Every request body documented field-by-field with validation rules | ✅ all 26 body-carrying endpoints |
| Every path parameter documented | ✅ all 30 parameterised endpoints |
| Every query parameter documented | ✅ `GET /tickets` (23), `GET /tickets/counts` (20), `GET /admin/departments` (6), `GET /out-of-office` (6), `GET /admin/…/out-of-office` (7); all others explicitly `None` |
| Success response shape documented with a real example | ✅ 47/47 |
| Error responses documented per endpoint + a central §12 | ✅ |
| Pagination documented where applicable | ✅ `GET /tickets`, `GET /admin/departments`, and the two out-of-office lists |
| Sorting / filtering / search documented | ✅ §6.3, §6.4, and per-endpoint |
| Concurrency documented | ✅ §7 — `expectedVersion` (4 endpoints), `If-Match` (6 endpoints), and the 12 out-of-office routes documented as **deliberately tokenless** (§11.11) |
| File uploads | ✅ documented as **not implemented** (§13) |
| Webhooks / real-time | ✅ documented as **not implemented** (§14) |
| Enums documented from the code only | ✅ §10, all from `config/enums.js` |
| Examples verified against validators, controllers and migrations | ✅ |
| No API invented | ✅ — every path traced to a `router.*` call |
| Broken endpoints flagged rather than presented as working | ✅ 2 (`POST /tickets/:id/replies`, `POST /tickets/:id/snooze`) |

**The two broken endpoints are documented, not omitted** — their request contracts are accurate
and their failure mode is stated, so the frontend knows both what to expect today and what will
work once the wiring is fixed.

**Capabilities confirmed absent** (each stated as *Not identified in the current
implementation* in its own section): login / logout / refresh endpoints, categories,
subcategories, priorities, users, agents, teams, tags, knowledge base, notifications API,
dashboard API, reports API, global search, file upload / download / delete, webhooks,
WebSocket / SSE, workflow / routing / OLA / calendar administration,
`POST /tickets/from-email`.

**Out-of-office left that list.** Twelve endpoints across two surfaces are live and documented in
[§11.11](#1111-out-of-office). The one thing still missing around them is a **delegate picker** —
there is no endpoint listing the department's assignable users, so `defaultDelegateId` has to be
sourced from the host application. Same root cause as [Known Issues #1](#1-there-is-no-way-to-populate-the-ticket-creation-dropdowns).

