# Helpdesk API

Base path `/api/helpdesk`, mounted by the one line in `src/app.js`.

**The contract lives in `validators/ticket.validator.js`, not here.** Every body below is
transcribed from it; if the two disagree, the validator is right and this file is stale.

---

## Identity

Every route except `GET /health` requires an identity. `users.email` is the **only** identity key —
`azure_object_id` exists on the table but the directory sync does not populate it, and `users.id` is
not something a client knows.

Where the email comes from is decided by `HELPDESK_AUTH_MODE` and resolved in exactly one function,
`resolveIdentityEmail` in `middleware/auth.middleware.js`:

| mode | header the client sends | notes |
| ---- | ---------------------- | ----- |
| `header` | `X-User-Email: manish.pandey@gera.in` | **INTERIM.** Any caller can claim any address, so this is an authentication bypass by construction. **Refused outright when `NODE_ENV=production`** — the request returns 500 naming the misconfiguration. |
| `jwt` | `Authorization: Bearer <token>` | Verification is written and pinned (`algorithms`, `issuer`, `audience`) but nothing issues these tokens yet. |

A `Bearer` header is always treated as an attempt at the JWT path, even in header mode — silently
ignoring a token the caller believed in would be worse than rejecting it.

**An unknown email is provisioned, not refused** (`HELPDESK_AUTOPROVISION`): a new row as
`EMPLOYEE` / `ACTIVE` / `is_assignable = false`, attached to `HELPDESK_AUTOPROVISION_DEPARTMENT`.
Anyone can raise a ticket; nobody is made an agent by signing in.

Email is matched case-insensitively (`users.email` is `citext`), so `MANISH.PANDEY@GERA.IN` and
`manish.pandey@gera.in` are the same person and do not produce two rows.

---

## Response envelope

One shape for the whole module (`shared/response.utils.js`):

```jsonc
// success
{ "success": true, "message": "Success", "data": { } }

// list — meta is present only on paginated reads
{ "success": true, "message": "Success", "data": [ ],
  "meta": { "page": 1, "limit": 25, "total": 9, "totalPages": 1 } }

// failure
{ "success": false, "message": "…", "code": "VALIDATION_ERROR", "details": { } }
```

`code` is one of `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`VALIDATION_ERROR`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, or one of the
domain codes the UI is expected to render a real message for: `FEATURE_DISABLED`,
`ILLEGAL_TRANSITION`, `UNASSIGNED_TICKET`, `CONCURRENT_MODIFICATION`, `CROSS_DEPARTMENT`,
`SNOOZE_LIMIT_EXCEEDED`, `COLLABORATION_THREAD_TAKEN`, `COLLABORATION_THREAD_BOUND`,
`DELEGATION_DEPTH_EXCEEDED`.

Every response carries `x-request-id`. It is written to `audit_logs.request_id`, so quote it in a
bug report.

---

## Endpoints

Agent roles below means `SPOC`, `MANAGER`, `DEPT_ADMIN`, `DEPT_HEAD`, `SUPER_ADMIN`.

| Method | Path | Role gate | Feature gate |
| ------ | ---- | --------- | ------------ |
| GET | `/health` | anonymous | — |
| GET | `/auth/me` | any | — |
| GET | `/tickets` | any · EMPLOYEE forced to own | — |
| GET | `/tickets/counts` | any · EMPLOYEE forced to own | — |
| POST | `/tickets/:id/read` | any · own view only | — |
| GET | `/tickets/:id` | any · EMPLOYEE own only | — |
| GET | `/tickets/:id/timeline` | any · EMPLOYEE filtered | — |
| GET | `/tickets/:id/transitions` | any | — |
| POST | `/tickets` | any | — |
| POST | `/tickets/:id/transitions` | per transition | — |
| PATCH | `/tickets/:id/assignment` | agent roles | — |
| PATCH | `/tickets/:id/classification` | agent roles | — |
| PATCH | `/tickets/:id/priority` | agent roles | — |
| POST | `/tickets/:id/notes` | agent roles | — |
| POST | `/tickets/:id/snooze` | any | `SNOOZE` |
| GET | `/tickets/:id/collaborations` | agent roles | — |
| POST | `/tickets/:id/collaborations` | agent roles | `COLLABORATION` |
| PATCH | `/tickets/:id/collaborations/:cid` | agent roles | `COLLABORATION` |
| POST | `/tickets/:id/collaborations/:cid/notes` | agent roles | `COLLABORATION` |
| GET | `/directory/departments` | agent roles · **not department-scoped** | — |
| GET | `/directory/users` | agent roles · **not department-scoped** | — |
| POST | `/tickets/:id/replies` | any | — ⚠️ **broken, see below** |
| GET | `/out-of-office` | `helpdesk.ooo.read`/`.write` | — |
| GET | `/out-of-office/:id` | `helpdesk.ooo.read`/`.write` · own only | — |
| POST | `/out-of-office` | `helpdesk.ooo.write` · own only | `OOO_DELEGATION` |
| POST | `/out-of-office/:id/activate` | `helpdesk.ooo.write` · own only | — |
| POST | `/out-of-office/:id/cancel` | `helpdesk.ooo.write` · own only | — |
| POST | `/out-of-office/:id/replace` | `helpdesk.ooo.write` · own only | `OOO_DELEGATION` |

The out-of-office routes are gated by **permission** rather than by role, unlike everything above
them: `helpdesk.ooo.write` already exists and is granted to exactly the roles that arrange cover.
Only the two verbs that CREATE a record are feature-gated — disabling a feature is forward-only, so
a department that switches `OOO_DELEGATION` off must still be able to activate, cancel and hand
over the windows it already has.

There is deliberately **no** `PATCH /tickets/:id {"state":"RESOLVED"}`, and it must not be added.
State changes go through `POST /:id/transitions`, validated against `workflow_transitions` — the
same rows `GET /:id/transitions` returns, so the UI cannot offer a move the engine rejects.

### Rate limits

| Scope | Window | Max |
| ----- | ------ | --- |
| everything under `/api/helpdesk` | `HELPDESK_RATE_LIMIT_WINDOW_MS` (60s) | `HELPDESK_RATE_LIMIT_MAX` (300) |
| every write verb | 60s | 60 |
| `POST /:id/replies` | 60s | 20 |

All three key per authenticated user when one is known, falling back to IP otherwise (IPv6
normalised to a /64, so a client cannot rotate through its subnet to get more quota). In practice
that means the **global** limiter is per-IP — it is mounted above authentication on purpose, since
one that needed an identity first could be bypassed entirely by an unauthenticated flood — while the
write and reply limiters are per-user.

429 responses carry a `Retry-After` header (`standardHeaders: true`), not a `retryAfter` field in the
body. Honour it.

---

## Reads

### `GET /auth/me`

Confirms the identity handoff and returns what the UI needs to decide what to render, **plus the
department's workflow states**. Call it once on mount and keep the result in the store — this is the
only place the state vocabulary is fetched. Deliberately **not** department-scoped, so a user whose
account has no department can discover exactly that instead of an opaque 403.

```jsonc
{ "success": true, "data": {
  "user": { "id": "…", "email": "manish.pandey@gera.in", "fullName": "Manish Pandey",
            "departmentId": "…", "roleId": "…", "roleCode": "SPOC",
            "managerUserId": null, "isAssignable": true, "permissions": [] },
  "authMode": "header",
  "workflowStates": [
    { "code": "NEW", "name": "New", "category": "OPEN", "isInitial": true,
      "isResolved": false, "isClosed": false, "isTerminal": false,
      "countsAsActiveWorkload": true, "displayOrder": 1 },
    { "code": "IN_PROGRESS",      "name": "In Progress",           "category": "OPEN",     "displayOrder": 2 },
    { "code": "PENDING_EMPLOYEE", "name": "Pending with Employee", "category": "PENDING",  "displayOrder": 3 },
    { "code": "RESOLVED",         "name": "Resolved",              "category": "RESOLVED", "displayOrder": 4 },
    { "code": "CLOSED",           "name": "Closed",                "category": "CLOSED",   "displayOrder": 5 },
    { "code": "NOT_RELEVANT",     "name": "Not Relevant",          "category": "PENDING",  "displayOrder": 6 }
  ] } }
```

`NOT_RELEVANT` is behaviourally identical to `PENDING_EMPLOYEE` — a parked bucket that **pauses
the OLA clock** and drops the ticket out of its assignee's active-workload count. It is not an
outcome: `isResolved` and `isClosed` are both false, so it neither opens the auto-close window nor
stamps `closed_at`. Moving *out* of it restarts the clock, because the OLA follows the state.

Already sorted by `displayOrder` — render in array order. `name` is the label; `code` is what you
send back to `GET /tickets`.

**There is no `id`, on purpose.** `workflow_definitions` is versioned and every ticket pins the
version it was created under, so one business state has a *different* uuid in each published
version. A dropdown holding `workflow_state_id` starts silently missing every pre-cutover ticket the
day an administrator publishes version 2. The `code` is the identifier that survives — the same
reason `POST /:id/transitions` prefers `transitionCode` over `toStateId`.

For an `EMPLOYEE` the list is filtered to `requester_visible` states and `name` is the
requester-facing label where the department set one. Empty array when the account has no department.

**`permissions` is populated — gate an admin UI on it, not on `roleCode`.** Seed
`db/seeds/0003_admin_permissions.sql` fills `permissions` / `role_permissions`, and
`AUTH_CONTEXT_SELECT` aggregates the codes onto every request, so a `DEPT_ADMIN` comes back with
around thirty. `roleCode` still gates the ticket verbs (`requireRole`), but every route under
`/admin` is permission-gated, and a menu built from `roleCode` will offer buttons the API
refuses.

(Any new route using `requirePermission` must ship its seed in the same commit, or it denies
everyone including `SUPER_ADMIN`.)

### `GET /tickets`

```
?page=1&limit=25&sort=-created_at&state=IN_PROGRESS
```

Filters: `state`, `stateCategory`, `stateId`, `categoryId`, `priorityId`, `assignedToUserId`,
`requesterUserId`, `unassigned`, `openOnly`, `isBreached`, `classificationStatus`, `createdFrom`,
`createdTo`, `search` (1–200 chars). Everything but `state`/`stateCategory`/`classificationStatus`
is a UUID, boolean or date — never an email.

`limit` maxes at 200, defaults to 25. Department scope is **never** taken from the query for a
non-`SUPER_ADMIN`; it comes from the caller's own record.

> As an `EMPLOYEE`, `requesterUserId` is **overridden** to your own id, whatever you pass. Your list
> is your own tickets.

#### Filtering by workflow state

```
?state=IN_PROGRESS                       one state
?state=NEW&state=IN_PROGRESS             several — repeat the parameter
?stateCategory=OPEN                      the coarse grouping, any department
```

**Send the `code` from `/auth/me`, not a uuid.** The server resolves it to every id that code means
in this department — across *all* live workflow versions — and filters on `tickets.state_id`, which
is what `ix_tickets_queue (department_id, state_id, priority_id, created_at DESC)` indexes. So the
contract is stable and the query still uses the department queue's index.

`stateCategory` takes `OPEN`, `PENDING`, `RESOLVED`, `CLOSED` — a CHECK constraint, so it is
identical in every department and every workflow version. It is the filter a saved view or a
bookmarked URL can carry across a department switch. Sending both `state` and `stateCategory`
intersects them.

An unknown code is a **`400 BAD_REQUEST`** naming the department's vocabulary, not an empty page:

```jsonc
{ "success": false, "message": "Unknown workflow state: OPENN", "code": "BAD_REQUEST",
  "details": { "unknown": ["OPENN"], "available": ["NEW","IN_PROGRESS","PENDING_EMPLOYEE","RESOLVED","CLOSED"] } }
```

Codes are matched exactly — `?state=new` is a 400. A malformed code (`?state=@bad`) is a
`422 VALIDATION_ERROR` from the schema instead.

`stateId` still accepts a raw uuid for drilling into one exact `workflow_states` row. Do not build
the filter UI on it; it is version-pinned by definition.

#### `meta.total`

The number of tickets matching **all filters on that request**, counted before `LIMIT`/`OFFSET` —
not a table total. With `?stateCategory=OPEN` it is the OPEN count; with no filter it is everything
you may see. It already accounts for department scope and the `EMPLOYEE` own-tickets override, so it
is exactly "rows you could page through".

> **Past the last page, `total` comes back `0`.** It rides on `count(*) OVER ()`, which has no rows
> to report from when the page is empty:
>
> ```
> page 3 limit 3   → { total: 9, totalPages: 3 }   rows 3
> page 99 limit 3  → { total: 0, totalPages: 0 }   rows 0
> ```
>
> Clamp `page` against the last known `totalPages` client-side, and do not overwrite a good total
> with the `0` from a zero-row page — a filter change that shrinks the result while the user sits on
> page 4 would otherwise collapse the pager and strand them.

### `GET /tickets/counts`

The numbers beside the options in the state dropdown. `meta.total` answers for **one** filter; a
dropdown needs every option at once, and five list calls would be five full counts per keystroke.

```
?search=card&openOnly=true          same filters as GET /tickets
```

```jsonc
{ "success": true, "data": {
  "total": 9,
  "byState":    { "NEW": 8, "IN_PROGRESS": 0, "PENDING_EMPLOYEE": 0, "RESOLVED": 0, "CLOSED": 1 },
  "byCategory": { "OPEN": 8, "PENDING": 0, "RESOLVED": 0, "CLOSED": 1 } } }
```

Takes every filter `GET /tickets` does, and **applies all of them except `state`, `stateCategory`
and `stateId`** — those are accepted so the frontend can spread one filter object into both calls,
but counting under the state filter would report every *other* state as zero, which is the one thing
a dropdown must not say. Everything else is applied, so each number is a page the user can actually
reach:

```
GET /tickets/counts?search=card   → all zero
GET /tickets?search=card          → meta.total 0        ✓ agree
```

`byState[code] === meta.total` of `GET /tickets?state=<code>` under the same other filters, and
`data.total === meta.total` of the same query with no state filter. Every state the department
defines is present, including the empty ones — a missing key renders as a missing option instead of
`Resolved (0)`.

`unread` is the attention badge — tickets in scope carrying a reply **this caller** has not read —
and `unreadByState` breaks it down the same way. Both are computed as a `FILTER` on the same
aggregate as `total`, so the badge and the dropdown cannot disagree.

One `GROUP BY s.code` (never `state_id` — two live workflow versions would split one business state
into two entries), served by an index-only scan on `ix_tickets_queue`. Call it when the *non-state*
filters change, not on every dropdown open.

---

## Replies, and knowing one arrived

### Reply / Reply All / Forward are Graph calls, not API calls

**The backend has no endpoint for them and stores no copy of them.** Microsoft Graph owns the
conversation; the frontend calls Graph with the user's own token. There is no `reply-all` route, no
`forwards` table, and no column holding an outbound message.

The constraint that follows is architectural, not a gap: **the ticketing system learns about a
message only when that message reaches the support mailbox.** A reply sent straight from one person
to another never touches this system and cannot appear on the ticket.

> **So put the support mailbox on the thread.** Send from it, or CC it, on every Reply / Reply All /
> Forward the agent makes from the ticket view. The copy lands in the mailbox, the intake worker
> ingests it like any other mail, `UK(internet_message_id)` makes a redelivery a no-op, and
> `conversation_id` attaches it to the right ticket. Zero backend changes, and the requester's
> portal shows the agent's reply.

`inbound_messages` is not a counter-example: it holds what intake needed to *decide* — sender,
subject, body, message id — for mail that arrived. It is a decision record, not a mail store.

### `GET /tickets` — unread fields

Every row carries this caller's own read state:

```jsonc
{ "ticket_number": "HR-2026-00009", "state_code": "NEW",
  "unread_count": 1, "has_unread": true }
```

| Parameter | Effect |
| --------- | ------ |
| `unreadFirst` | Unread tickets sort **above** read ones, ahead of `sort`. **Default on** — send `unreadFirst=false` for strict `sort` order. |
| `unreadOnly` | Only tickets with something this caller has not read. |

Ranking happens **before** the page is cut, so an unread ticket that would have sorted onto page 4
appears on page 1. That is the difference between prioritising unread and merely labelling it.

Unread is **per user**: two people looking at the same department queue see different `has_unread`
values on the same rows, and one of them reading a reply does not clear the other's badge.

### `POST /tickets/:id/read`

"I have seen this ticket." No body. Clears only this caller's markers.

```jsonc
{ "success": true, "message": "Marked as read",
  "data": { "ticketId": "…", "marked": 1 } }
```

Idempotent — a repeat returns `marked: 0` and leaves the original read time alone.

**`GET /tickets/:id` does not mark anything read.** A GET that writes means a prefetch, a link
preview or a background refresh of the detail pane silently clears the badge. Call this when the
user actually opened the ticket.

### How it works, and what it does not store

No new table and no new column. Detection already existed — intake sets
`inbound_messages.status = 'REPLY_ATTACHED'` and writes an `EMAIL_RECEIVED` activity row. What is
new is one `notifications` row per person who needs to see it:

```
notifications (user_id, ticket_id, event_code = 'EMAIL_RECEIVED', read_at)
ix_notifications_unread (user_id, created_at DESC) WHERE read_at IS NULL
```

That index is labelled "the unread badge" in migration 0011, and the table is partitioned monthly,
so read history ages out of the queries that matter. The row stores **who has not looked**, never
the reply: no body, no recipients, no thread copy.

Written inside the ingest transaction, so a reply either produced its markers or produced nothing —
the same guarantee `UK(internet_message_id)` gives the message. A redelivered Graph notification
returns `DUPLICATE` and cannot re-unread a ticket someone has just read. **The sender is excluded**,
so an agent whose reply is CC'd back into the mailbox does not find it in their own unread queue.

### `GET /tickets/:id`

Returns the detail screen in **one** call:

```jsonc
{ "success": true, "data": { "ticket": { }, "availableTransitions": [ ], "ola": { } } }
```

Do not also call `GET /:id/transitions` here — that endpoint exists to refresh the button row
*after* a transition.

### `GET /tickets/:id/timeline`

```jsonc
{ "success": true, "data": {
  "activity": [ ], "statusHistory": [ ], "assignmentHistory": [ ], "fieldChanges": [ ] } }
```

For an `EMPLOYEE` the response is filtered to `visibility = 'EMPLOYEE'` activity and the three
history arrays come back **empty**. This is read through a partial index that does not contain
internal rows at all, so a forgotten `WHERE` cannot leak one.

---

## Writes

### `POST /tickets`

```jsonc
{ "subject": "Need a replacement ID card",          // required, 1–500
  "description": "Lost it yesterday",               // optional, ≤50 000
  "categoryId": "01a018f5-67e0-78c0-a1cb-5166a1e2aa88",
  "subcategoryId": "01a018f5-6810-7d8e-af72-f4966ea8c31b",
  "priorityId": "01a018f5-6776-7081-b5cb-f574403a003e",
  "sourceCode": "PORTAL" }                          // EMAIL|PORTAL|MANUAL|API|OTHER, default PORTAL
```

Whether `categoryId` / `subcategoryId` are required is per-department
(`department_settings.require_category` / `require_subcategory`). **HR requires a category** and
returns `400 BAD_REQUEST "This department requires a category"` — a business rule, so a 400 with a
user-readable message, as distinct from the `422 VALIDATION_ERROR` you get for omitting `subject`.
Omitting `priorityId` takes the department default.

`requesterUserId` and `requesterEmail` are accepted **only from an agent role**, for raising a
ticket on someone else's behalf. As anyone else, a `requesterUserId` naming another user returns
`403`, and `requesterEmail` is dropped — the requester is the authenticated caller, and the snapshot
is loaded from `users`.

Not accepted from any caller: `stateId`, `assignedToUserId`, `ticketNumber`, `firstAssignedAt`.
Those are outcomes the engine produces, not inputs.

### `POST /tickets/:id/transitions`

The only way a ticket changes state.

```jsonc
{ "transitionCode": "START",     // preferred — it is what the button carries
  "toStateId": null,             // the alternative; one of the two is required
  "reason": "picking this up",
  "expectedVersion": 1 }
```

Who may perform which move comes from that transition's own `allowed_role_codes`, which is why this
route carries no blanket role gate. As seeded for HR:

| code | from → to | allowed |
| ---- | --------- | ------- |
| `START` | `NEW` → `IN_PROGRESS` | SPOC |
| `REQUEST_INFO` | `IN_PROGRESS` → `PENDING_EMPLOYEE` | SPOC |
| `RESOLVE` | `IN_PROGRESS` → `RESOLVED` | SPOC |
| `RESUME` | `PENDING_EMPLOYEE` → `IN_PROGRESS` | SPOC, EMPLOYEE |
| `REOPEN` | `CLOSED` → `IN_PROGRESS` | EMPLOYEE |
| `CLOSE` | `RESOLVED` → `CLOSED` | SYSTEM (the auto-close job, not a user) |
| `NOT_RELEVANT` | `IN_PROGRESS` → `NOT_RELEVANT` | SPOC — **`reason` is required** |
| `RESTORE` | `NOT_RELEVANT` → `IN_PROGRESS` | SPOC |

`NOT_RELEVANT` carries `requiresReason: true`, so `POST /tickets/:id/transitions` without a
`reason` is a `400` before anything is written. The reason lands on the
`ticket_status_history` interval and in the `STATE_CHANGED` timeline entry — which is what makes
"why was this parked?" answerable months later. Nothing needs to be sent to restart the OLA on
the way out: the clock follows the state, and `IN_PROGRESS` is not paused.

#### `NOT_RELEVANT` is a spam bucket, and that is why the way out is not called `RESUME`

The two paused states behave differently on an inbound reply, deliberately:

| parked in | employee replies | why |
| --------- | ---------------- | --- |
| `PENDING_EMPLOYEE` | **auto-resumes** to `IN_PROGRESS` | the reply *is* the thing the department was waiting for |
| `NOT_RELEVANT` | **attaches, stays parked, clock stays stopped** | the ticket was judged irrelevant; spam must not re-open itself on the sender's schedule |

`intake.service.attachReply` fires the literal code `RESUME` from the current state whenever a
reply lands on an `is_ola_paused` state, if that edge admits an `EMAIL` actor. Naming this edge
`RESTORE` is what keeps the spam bucket out of that path — **two independent barriers**, because
either alone is one edit away from the wrong behaviour: the code is not `RESUME` (intake's lookup
returns nothing) and `EMAIL` is not in `allowedActorTypes` (a future `RESUME` here would still be
refused).

The reply is not lost — it attaches to the timeline, marks the ticket unread, and cuts short any
snooze. Only the state and the clock are left alone. `EMPLOYEE` is absent from
`allowedRoleCodes` for the same reason: letting the requester un-park their own ticket from the
UI is the mail path by another route.

Restoring is an ordinary transition, with no residue. The ticket is `IN_PROGRESS` again, every
normal edge is available, and the OLA resumes on its own — it never reset, since `started_at` is
immutable by trigger and the parked interval is already banked in
`total_paused_working_minutes`. A ticket does not get a fresh commitment for having been spam.

An illegal move returns `ILLEGAL_TRANSITION` with the legal set in `details`.

### `PATCH /tickets/:id/assignment`

```jsonc
{ "assignedToUserId": "…uuid…",  // null unassigns — a real outcome, not an error
  "reason": "…", "expectedVersion": 1 }
```

The target must be `ACTIVE` and `is_assignable`. Reassignment never touches the OLA clock: the
clock belongs to the ticket, not the assignee.

### `PATCH /tickets/:id/classification`

One verb, three effects: correct the category, re-resolve routing, write the learning corpus.
Splitting them into separate calls is how a corrected ticket stays on the old queue.

```jsonc
{ "categoryId": "…uuid…",        // required
  "subcategoryId": "…uuid…",
  "confirmOnly": false,          // true = "a human agreed", not "a human changed something"
  "reason": "…", "expectedVersion": 1 }
```

### `PATCH /tickets/:id/priority`

```jsonc
{ "priorityId": "…uuid…", "reason": "…", "expectedVersion": 1 }
```

### `POST /tickets/:id/notes`

```jsonc
{ "note": "checked warranty, still covered",   // required, 1–50 000
  "collaborationId": null }
```

Writes an `INTERNAL_NOTE`, whose `visibility` is fixed to `INTERNAL` by CHECK constraint — hence
agent roles only. A requester has no business writing a note their own timeline is filtered to
exclude.

### `POST /tickets/:id/snooze` · feature `SNOOZE` · agent roles

```jsonc
{ "snoozeUntil": "2026-09-01T10:00:00Z",   // must be in the future
  "reason": "waiting on vendor" }
```

Bounded at write time by `department_settings.snooze_max_working_minutes` and `snooze_max_count`;
exceeding either returns `SNOOZE_LIMIT_EXCEEDED`, whose `details` carries
`{ limit: "count" | "workingMinutes", used, max }`. The duration is counted in **working** minutes
on the department's calendar, so a snooze over a weekend costs almost nothing.

Snoozing a ticket that is already snoozed is **409 CONFLICT** — `UK(ticket_id) WHERE ended_at IS
NULL` permits one open snooze. Snoozing a closed ticket is a 400. A snooze pauses the OLA clock
only when the resolved policy has `pause_on_snooze`.

### `DELETE /tickets/:id/snooze` · agent roles

Ends the open snooze with `end_trigger = 'MANUAL'` and resumes the clock, pushing `due_at` out by
the working minutes lost. 400 when the ticket is not snoozed.

**Deliberately NOT feature-gated**, unlike the POST. Disabling `SNOOZE` is forward-only: it must
block new snoozes without trapping one that is already open.

Cancelling does **not** refund the count — `snooze_max_count` is enforced against
`max(sequence_no)`, which counts every snooze the ticket has ever had.

### `GET /tickets/:id/snooze` · agent roles

```jsonc
{ "snooze": { "id": "…", "snoozeUntil": "…", "reason": "waiting on vendor",
              "snoozedByUserId": "…", "snoozedAt": "…", "sequenceNo": 2 },
  "snoozeCountUsed": 2,
  "snoozeMaxCount": 3 }
```

`snooze` is `null` when the ticket is not snoozed — a 200, not a 404, since "not snoozed" is a
valid answer about a ticket that exists. Use the count pair to render "2 of 3 used" and disable
the button on the last one, rather than discovering the cap from a 400.

**A separate endpoint, and not a field on `GET /tickets/:id`, on purpose.** That endpoint serves
requesters; `reason` is an agent's private triage note and `snoozedByUserId` names staff, which is
why the `SNOOZED` activity row is `INTERNAL`. Same split, same reason, as `/collaborations`.
Not feature-gated either — a department that has switched `SNOOZE` off must still be able to read
the snoozes it took while it was on.

## Collaboration — the second conversation

A ticket has **two kinds of thread** and they never mix:

```
tickets.conversation_id                  customer  <-> helpdesk
collaboration_requests.conversation_id   helpdesk  <-> collaborator   (N per ticket)
```

**The backend sends no collaboration mail.** Same rule as customer replies: the frontend calls
Graph with the acting user's own token. It then reports the thread so inbound replies route back
to the collaboration instead of becoming a new ticket.

**CC the support mailbox on the collaboration mail**, and report `seedInternetMessageId`. That
RFC 5322 id is identical in every mailbox; `conversationId` is computed *per mailbox*, so the id
your agent's mailbox shows need not be the one the support mailbox computes. When the CC'd copy
arrives, the backend matches the seed exactly and binds the support mailbox's own
`conversation_id` itself. Send `conversationId` too if you have it — it is used directly when it
matches, and harmlessly superseded when it does not.

All four routes are **agent-only**: collaboration notes are `INTERNAL` by CHECK constraint, so a
requester must not read the thread through a side door. `GET` carries no feature gate — disabling
a feature is forward-only and never hides what it already created.

### `GET /tickets/:id/collaborations` · agent roles

Every collaboration on the ticket, each with `participants` and `notes`. Participants carry
`email`, `departmentId` and `departmentName` — the department is the **snapshot from invite
time**, not the user's current team, because people move and that must not rewrite history.

```jsonc
{ "collaborations": [{
    "id": "…", "conversationId": "AAQkAD…", "purpose": "confirm the invoice",
    "status": "ANSWERED",              // OPEN | ANSWERED | CLOSED | EXPIRED
    "pausesOla": true, "lastReplyAt": "…", "repliesAfterClose": 0,
    "participants": [{ "userId": "…", "name": "A Patel", "email": "a.patel@…",
                       "departmentName": "Finance", "role": "CONTRIBUTOR",
                       "respondedAt": "…", "removedAt": null }],
    "notes": [{ "activityType": "COLLABORATION_NOTE", "description": "…",
                "inboundMessageId": "…", "senderEmail": "a.patel@…", "occurredAt": "…" }]
  }] }
```

### The participant picker — `GET /directory/*` · agent roles

`POST /tickets/:id/collaborations` takes `participants[].userId`, so something has to turn a
person into a uuid. That is these two reads, and they are **the only endpoints in the module that
are deliberately not department-scoped**.

They have to be. Collaboration exists to reach somebody the department does not employ, and
`scopeToDepartment` answers `?departmentId=<another department>` with a 403 `CROSS_DEPARTMENT` —
correct for every ticket verb, fatal for a picker. So `/directory` is mounted **above** that
middleware, alongside `/auth` and `/admin`, and neither route will ever return
`CROSS_DEPARTMENT`. What stands in its place is the agent-role gate: only the roles that can open
a collaboration can read the directory that feeds one.

No feature gate on either. Capability gating belongs on write verbs — `POST /collaborations` is
where a department with `COLLABORATION` off is stopped, and failing a name lookup with
`FEATURE_DISABLED` would only make that harder to diagnose.

Rows are **snake_case**, like `GET /tickets`, and paginated in `meta` like every other list.

#### `GET /directory/departments`

`?search=` `?status=` `?page=` `?limit=` `?sort=` — `sort` over `code`, `name`, `status`,
`created_at`.

```jsonc
{ "data": [{
    "id": "…", "code": "HR", "name": "Human Resources",
    "status": "ACTIVE", "is_active": true,          // lifecycle, for labelling
    "support_email": "hr@…",
    "invitable_user_count": 20,                     // so an empty team is visible before the click
    "is_own_department": true                       // always a boolean, never null
  }],
  "meta": { "page": 1, "limit": 25, "total": 12, "totalPages": 1 } }
```

Every non-deleted department, **the caller's own first** whatever the `sort`. There is no default
`status` filter: a collaboration participant is a person plus an in-app notification, and nothing
about inviting somebody requires their department to be running a helpdesk of its own — a `DRAFT`
department's staff are perfectly real. Ask for `?status=ACTIVE` if you only want live ones.

#### `GET /directory/users`

`?departmentId=` `?search=` `?roleCode=` `?assignableOnly=` `?page=` `?limit=` `?sort=` — `sort`
over `full_name`, `email`, `employee_code`, `designation`. `roleCode` and `status` are repeatable
(`?roleCode=SPOC&roleCode=MANAGER`).

```jsonc
{ "data": [{
    "id": "…", "full_name": "A Patel", "email": "a.patel@…",
    "employee_code": "GD1873", "designation": null,
    "department_id": "…", "department_code": "FIN", "department_name": "Finance",
    "role_id": "…", "role_code": "SPOC", "role_name": "SPOC",
    "is_assignable": true                           // the closest thing to "works tickets"
  }],
  "meta": { "page": 1, "limit": 25, "total": 44, "totalPages": 2 } }
```

**`departmentId` is optional, and omitting it is the contract rather than an oversight** — it
means every department, which is what makes `?search=` a name lookup across the business. Pass it
once the user has picked a team.

Three filters are always applied and are not yours to relax: `status = 'ACTIVE'`,
`deleted_at IS NULL`, and `user_type = 'EMPLOYEE'`. An invitation to somebody suspended or
offboarded is one nobody answers, and a `SERVICE`/`SYSTEM` principal cannot reply to a
collaboration mail at all. None of the three is a department rule.

A `departmentId` that does not exist is a **404**, never an empty page — "nobody works there" and
"that department does not exist" are different answers, the same distinction `?state=` draws on
the ticket list. An unknown `?sort=` column is a 400 naming what is allowed.

Neither endpoint excludes the caller, or people already invited on the ticket. Filter those out
client-side from `GET /tickets/:id/collaborations`, which you have already fetched.

### `POST /tickets/:id/collaborations` · feature `COLLABORATION`

```jsonc
{ "purpose": "need finance to confirm the invoice",   // required, 1–5 000
  "participants": [                                   // at least one
    { "userId": "…uuid…", "participantRole": "CONTRIBUTOR" }  // CONTRIBUTOR | REVIEWER
  ],
  "conversationId": "AAQkAD…",          // optional — send the mail first, or bind later
  "seedInternetMessageId": "<a@b.com>"  // optional, but strongly preferred
}
```

Several collaborations may be open on one ticket at a time — one per thread, so Finance and Legal
can be asked separately. A thread belongs to exactly one collaboration; reusing one returns
`COLLABORATION_THREAD_TAKEN`.

If any collaboration on the ticket pauses the OLA, the clock resumes only when the **last**
unresolved one is closed.

### `PATCH /tickets/:id/collaborations/:cid` · feature `COLLABORATION`

Binds the thread, changes the status, or both. Binding happens first, so closing and registering
in one call still leaves a late reply with a route home.

```jsonc
{ "conversationId": "AAQkAD…",
  "seedInternetMessageId": "<a@b.com>",
  "status": "CLOSED" }                 // ANSWERED | CLOSED | EXPIRED
```

`OPEN` is not accepted: a settled collaboration is never resurrected. Rebinding one that already
carries a *different* thread returns `COLLABORATION_THREAD_BOUND`.

### `POST /tickets/:id/collaborations/:cid/notes` · feature `COLLABORATION`

```jsonc
{ "note": "finance confirmed the invoice is correct" }
```

### What a collaborator's emailed reply does

Routed by `conversation_id`, written as `COLLABORATION_NOTE` / `INTERNAL`, and it deliberately
does **not**: create a ticket, appear on `/timeline` for a requester, cancel a snooze, resume the
OLA, close the collaboration, reopen the ticket, or notify the requester. `responded_at` is
stamped for that participant; the requester and assignee get a `COLLABORATION_REPLY` notification.

A reply **after close** attaches and increments `repliesAfterClose` rather than reopening. A reply
from someone never invited — a forwarded thread — attaches with a marker in the description and
does not stamp `responded_at`. Neither can ever create a ticket.

### ⚠️ `POST /tickets/:id/replies` — currently broken

```jsonc
{ "body": "…",  "bodyFormat": "HTML",   // HTML | TEXT
  "cc": ["someone@gera.in"],            // ≤50
  "attachmentIds": ["…uuid…"] }         // ≤20
```

**This endpoint returns 500 on every call.** The route requires `../services/reply.service`, which
does not exist, so it throws `MODULE_NOT_FOUND` inside the handler. Do not wire a reply UI to it
yet. `services/graph.client.js` holds the `sendMail` / `replyToMessage` primitives it needs and has
no callers.

---

## Optimistic concurrency

`expectedVersion` appears on transitions, assignment, classification and priority. Send the
`version` you read from the ticket; a mismatch returns `CONCURRENT_MODIFICATION` instead of silently
overwriting a colleague's edit. Omitting it skips the check — fine for a single-user tool, wrong for
a shared queue.

---

## Error handling rules for the client

| status | meaning | what the client does |
| ------ | ------- | -------------------- |
| 400 | a **business rule** — `BAD_REQUEST`, e.g. *"This department requires a category"* | show `message`; it is written to be read by a user |
| 422 | a **schema** failure — `VALIDATION_ERROR`, a field is missing or malformed | `details` names the offending fields; map them onto the form |
| 401 | no usable identity | re-authenticate **once**, replay, then surface |
| 403 | account not `ACTIVE`, or a role / department refusal | **never retry** |
| 404 | not found, **or** not yours | do not distinguish — that is the point |
| 409 | `CONCURRENT_MODIFICATION` | refetch and ask the user to redo |
| 429 | rate limited | back off, honour `Retry-After` |
| 500 | header mode in production, or a genuine fault | surface `x-request-id` |
| 503 | database unreachable | retry with backoff |

**The 403 rule is the one that matters.** `authenticate` returns 403 for a non-`ACTIVE` account and
`requireRole` returns 403 for a role refusal — re-authenticating fixes neither, and treating 403 as
"identity expired" is how you build an unbounded refresh loop.

A 404 on a ticket that exists is intentional: `assertSameDepartment` returns `notFound` rather than
`forbidden` for another department's ticket and for a colleague's ticket, because a 403 would
confirm the ticket exists.

---

## Out of office — arranging your own cover

`/out-of-office` is the **self-service** half of `user_out_of_office`: your own leave, and whose
work you are covering. Filing leave *for somebody else* is the administrator's surface,
`/admin/departments/:departmentId/out-of-office`, documented in `ADMIN_API.md`. Both call one
service, so the behaviour is identical either way.

Every route requires `helpdesk.ooo.read` or `helpdesk.ooo.write` — seed 0003 grants the write to
DEPT_HEAD, MANAGER and SPOC. An EMPLOYEE holds no helpdesk permission and gets `403`: they have
no assigned tickets to delegate.

**`userId` is not a field on this surface.** It is always the caller. Sending one is a `422`, not
a silent override — a filter that is accepted and then ignored is worse than one that is refused.

### `GET /out-of-office`

Your windows, newest first. `?covering=true` flips the question to "whose work am I covering".
Also takes `activeOnly`, `includeCancelled`, `sort` (`starts_at` · `ends_at` · `created_at`,
optionally `:desc`), `page`, `limit`.

`status` on each row is derived, never stored: `CANCELLED` · `ENDED` · `EXPIRING` ·
`SCHEDULED` · `AWAITING_ACTIVATION` · `ACTIVE`.

### `GET /out-of-office/:id`

Somebody else's record is a **404, not a 403** — including your delegate's. Being asked to cover
for someone does not make their leave yours to cancel.

### `POST /out-of-office` · feature `OOO_DELEGATION`

```json
{
  "defaultDelegateId": "uuid",
  "startsAt": "2026-09-01T00:00:00Z",
  "endsAt":   "2026-09-08T00:00:00Z",
  "reason": "LEAVE",
  "activationPolicy": "NEW_TICKETS_ONLY",
  "expiryPolicy": "KEEP_DELEGATE",
  "blockNewAssignment": true
}
```

Only `defaultDelegateId`, `startsAt` and `endsAt` are required. Omit `activationPolicy` /
`expiryPolicy` and the department's own setting is used. Backdating `startsAt` is allowed — it is
how you file leave you are already on, and a window that is already open does its work
immediately rather than at the next ten-minute tick.

The delegate must be ACTIVE, assignable, in your department, and not you. `409` if it overlaps
another window of yours. `201` returns `delegated` (tickets swept to the delegate) and a
`warning` when the delegate is themselves away when your window opens — allowed, because tickets
then follow the chain past them.

| `activationPolicy` | at `startsAt` |
| ------------------ | ------------- |
| `NEW_TICKETS_ONLY` | new tickets go to the delegate; nothing already assigned moves |
| `ALL_ACTIVE_TICKETS` | as above, **and** your open queue is handed over |
| `MANUAL` | **nothing at all** until you call `/activate` |

| `expiryPolicy` | at `endsAt` |
| -------------- | ----------- |
| `KEEP_DELEGATE` | the delegate finishes what they picked up |
| `RETURN_TO_OWNER` | open delegations come back to you |

### `POST /out-of-office/:id/activate`

Turns a `MANUAL` window on. Until this is called it is invisible to routing — that is the whole
difference between `MANUAL` and `NEW_TICKETS_ONLY`. Body is empty. `409` if cancelled, already
active, or already ended.

### `POST /out-of-office/:id/cancel`

```json
{ "mode": "RETURNED", "reason": "back early" }
```

`RETURNED` (the default) means you are back: `expiryPolicy` is applied **now**, so a
`RETURN_TO_OWNER` window returns your tickets at this moment rather than at an `endsAt` that no
longer applies. `HANDOVER` ends the arrangement without moving anything.

Returns `reverted` — how many tickets came back. Cancelling twice is a `409`.

### `POST /out-of-office/:id/replace`

Swap the delegate. `defaultDelegateId` is the only required field; the dates and policies are
inherited from the record being replaced.

**Tickets your first delegate already picked up stay with them.** Only new tickets go to the new
delegate. There is deliberately no `PATCH` on this resource: the table is insert/cancel and
carries no `updated_at`, so it has no concurrency token — cancel-then-create needs none, and
leaves both arrangements on the record.

### What happens to a ticket while you are away

| Situation | Outcome |
| --------- | ------- |
| Your delegate is eligible | new tickets go to them |
| Your delegate is also away | the chain is followed, up to the department's `maxDelegationDepth` |
| Nobody in the chain can take it | the ticket is **left unassigned** for the queue, never parked in your inbox. `blockNewAssignment: false` opts out of that |
| A colleague assigns one to you by hand | it lands with you as asked, and they are warned you are away |
| Your window ends but you have since become unassignable | the ticket stays with the delegate and your administrators are told |

---

## Not implemented yet

Eleven routers are listed commented-out in `routes/index.js` and are mounted as they are built.

> **The category and priority dropdowns are now servable**, from the admin surface:
> `GET /admin/departments/:departmentId/categories`, `.../subcategories` and `.../priorities`
> (see `ADMIN_API.md` §6.11–6.12). They are gated on `helpdesk.taxonomy.read` /
> `helpdesk.priority.read`, which an `EMPLOYEE` does not hold — so a **requester's** create form
> still has no way to fetch them. A ticket-surface read for the two choosers is the outstanding
> gap, not the taxonomy itself.

Still absent: **calendars** (business hours and holidays — the last piece of department
configuration that still needs hand-written SQL); role permission assignment; the classification
corpus; the audit read; `POST /tickets/from-email` (documented in `CLAUDE.md`, never built); and
the `EXTERNAL_INTAKE` / `EX_EMPLOYEE_INTAKE` feature flags, which are declared but read by
nothing.

---

## Seeded values, for fixtures

```
departments     HR · IT

HR priorities   LOW     01a018f5-6772-7c4d-aecf-c4e1307f9883
                NORMAL  01a018f5-6776-7081-b5cb-f574403a003e
                HIGH    01a018f5-6776-71e3-82a2-996187ee2dc0

HR categories   ADMIN    01a018f5-67e0-78c0-a1cb-5166a1e2aa88
                FINANCE  01a018f5-67e6-73d0-a282-9b8f73597b16
                HR_OPS   01a018f5-67e6-7549-a764-78da78092558

subcategories   ADMIN/ID_CARD  01a018f5-6810-7d8e-af72-f4966ea8c31b
                ADMIN/COURIER  01a018f5-6810-7e91-bb4d-477c58f66cdc

users           manish.pandey@gera.in     SPOC       HR
                priya.nair@gera.in        DEPT_HEAD  HR   (dev fixture only)
                sandip.dasgupta@gera.in   MANAGER    IT

HR features     SNOOZE · COLLABORATION · OOO_DELEGATION · AI_CLASSIFICATION
```

Any other address auto-provisions as an `EMPLOYEE` of the configured department, which is a
convenient way to test the requester-side behaviour.

```bash
curl localhost:5000/api/helpdesk/auth/me -H "X-User-Email: manish.pandey@gera.in"

# The state vocabulary, and a queue filtered by one of its codes
curl -s localhost:5000/api/helpdesk/auth/me -H "X-User-Email: manish.pandey@gera.in" \
  | jq '.data.workflowStates[] | {code, name, category}'
curl -s "localhost:5000/api/helpdesk/tickets?state=NEW&limit=5" \
  -H "X-User-Email: manish.pandey@gera.in" | jq '.meta, [.data[].state_code]'
```
