# CLAUDE.md — HR Helpdesk (frontend)

React 18 + Vite + TypeScript + Tailwind + shadcn/ui. An Outlook-style helpdesk:
ticket list on the left, thread and actions on the right.

Exposed as a **module federation remote** (`hr_helpdesk_app`, `./App`) consumed by
the Gera host shell, so it is not usually run standalone in production.

```bash
npm install
npm run dev        # vite, port 3014, strict
npm run build
npm run lint
```

Backend: [`CRM-Dashboard-Server`](../crm-node-project/CRM-Dashboard-Server).
Read its `CLAUDE.md` for the API, and
[`HELPDESK-GAPS.md`](../crm-node-project/CRM-Dashboard-Server/HELPDESK-GAPS.md)
before migrating any screen — it lists the places where the new API does not yet
match what this frontend needs (missing `Edit Ticket Details` fields, the
scheduled escalation ladder, the collaboration mail trail, the mailbox browser)
and which of them are backend fixes versus frontend changes.

## Layout

```
src/
  app/            AppProviders, RootLayout, router, navigation
  features/
    mailHelpdesk/       ← the product. Everything else is scaffolding.
      pages/            EmailInterface (the two-pane shell), Index, config pages
      components/       EmailList, EmailThread, MessageCard, TicketHeader,
                        EmailCompose/, dialogs (Snooze, AssignAgent, EditTicket)
      collaboration/    cross-department sub-thread
      api/              graphEmail, trackerHelpdesk, ticketActionLog, collabApi
      types/  utils/  constant/  hooks/
    MailBox/            standalone mailbox browser
    auth/login/         SAP credential form
    helpdesk/           employee-facing request form (separate from the agent desk)
  components/ui/  shadcn primitives — generated, do not hand-edit
  services/       api.ts, sapClient.ts, endPoints.ts
  context/        sockets/, notifications/
```

## Current state: mid-migration

The backend used to be SAP with no storage, so this frontend absorbed a lot of
work that belongs on a server. A PostgreSQL-backed API now exists at
`/api/helpdesk/v1` and screens move over one at a time. **New work targets the new
API.** Do not extend the patterns below.

### What is being replaced, and why

| Today | Where | Problem | Replacement |
|---|---|---|---|
| Browser calls `graph.microsoft.com` directly with a token from `/api/ticket/get-token` | `api/graphEmail.ts` | that token is tenant-wide `Mail.ReadWrite`/`Mail.Send`; devtools = every mailbox | `GET /tickets/:id/thread`, `POST /tickets/:id/messages` |
| SAP password in `sessionStorage`, re-sent as a form field per request | `services/sapClient.ts` `appendAuthToFormData` | plaintext in storage and logs; unrevocable | `POST /auth/login` -> bearer token in memory |
| Six pre-grouped arrays fetched whole, then filtered/searched/counted in memory | `pages/EmailInterface.tsx` | does not survive a few thousand tickets | `GET /tickets` + `GET /tickets/counts` |
| Recipient rules, `Re:`/`FW:` prefixing, quoted-original HTML built client-side | `utils/threadUtils.ts`, `components/EmailThread.tsx` | duplicated per call site, drifts | `GET /tickets/:id/compose?mode=` |
| Whole detail object round-tripped on every edit | `api/trackerHelpdesk.ts` | concurrent editors overwrite each other | `PATCH /tickets/:id` with `version` |
| Attachments downloaded as base64 to resolve `cid:`, then re-uploaded to forward | `api/graphEmail.ts` `processEmbeddedImages` | threads with screenshots are tens of MB | inline images served by URL; forward carries by `{id}` |
| Category matrix refetched and regrouped per ticket open | `utils/groupCategories.ts`, `utils/module/groupCategory/` | ~100 lines of reducer, repeated cost | `GET /catalog` (pre-grouped) |
| Assignee visibility derived from the escalation matrix at render time | `groupEscalationCategory.ts` | guesswork; changing the picker reloaded everything | `GET /agents` (server-scoped) |
| Audit written fire-and-forget, failures swallowed | `api/ticketActionLog.ts` | log silently diverges from reality | written in the same transaction as the change |
| Mail templates as hardcoded `.ts` | `constant/*MailTemplates.ts` | copy change = deploy | `GET /templates` |

### Bugs the old data model caused

Worth knowing, because they look like UI bugs and are not:

- **"Snoozed until" never renders.** `EmailThread.tsx` computes `activeSnooze`
  from `record.until`, but SAP stored only `snooze1..3` hours with no timestamps,
  so `until` is always `""` and `activeSnooze` is always `null`. Fixed server-side:
  snoozes are rows with real `snoozed_at`/`until`.
- **The unread indicator clears for everyone.** `ticket.unread` was one shared
  counter, so the first SPOC to open a ticket cleared the badge for the whole
  desk. Unread is now per-agent.
- **Replies sometimes opened a duplicate ticket.** Ingestion deduped in an
  in-memory `Set`, lost on every restart. Now keyed on `graph_message_id` in the
  database, and replies match by `conversationId`.
- **Collaborators were never persisted.** `handleCollaboratorAdd` kept them in
  React state with the persist call commented out — the toast literally says
  "Added locally only".

## Working with the new API

Base `/api/helpdesk/v1`. JSON, bearer auth, one envelope:

```ts
type ApiOk<T>  = { data: T; meta?: Record<string, unknown> };
type ApiErr    = { error: { code: string; message: string;
                            details?: unknown; requestId: string } };
```

`error.message` is written to be shown to a user. `error.code` is what to branch
on. Include `requestId` in any bug report — it ties to the server log line.

Codes worth handling explicitly:

| Code | Do |
|---|---|
| `VERSION_CONFLICT` | refetch the ticket, re-apply the edit, tell the user it changed |
| `VALIDATION_FAILED` | `details.fields` is `{ field: message }` — bind to form errors |
| `RATE_LIMITED` | back off by `details.retryAfterSec` |
| `UNAUTHORIZED` | try `POST /auth/refresh` once, then send them to login |
| `UPSTREAM_FAILURE` | Graph is unavailable; the thread still reads from cache |

### Patterns to adopt

**Let the server prefill the composer.** Do not rebuild recipients or the quote:

```ts
const { data } = await api.get(`/tickets/${id}/compose`, {
  params: { mode: "replyAll" },
});
// data.to / cc / subject / quotedHtml / signatureHtml / attachments
// Render them. The suppression and prefixing rules live server-side on purpose.

await api.post(`/tickets/${id}/messages`, {
  mode: "replyAll",
  sourceMessageId: data.sourceMessageId,
  to: data.to,
  cc: data.cc,
  subject: data.subject,
  bodyHtml: editorHtml,      // just what the agent typed
  statusCode: "IN_PROGRESS", // optional post-send transition
}, { headers: { "Idempotency-Key": key } });
```

**Load thread headers first, bodies on expand.** `GET …/thread` returns previews;
`GET /messages/:id` returns one body. That is the single biggest payload win.

**Send only what changed, with the version:**

```ts
await api.patch(`/tickets/${id}`, { statusCode: "RESOLVED", version: ticket.version });
```

**Use `react-query` for server state.** It is already a dependency and barely
used; most screens are hand-rolled `useState` + `useEffect` + manual loading flags
with request-id guards against stale responses (`detailReqIdRef` in
`EmailThread.tsx`). `useQuery` removes that class of bug. New screens should use
it; converting an old one is a good incidental cleanup.

**Paginate with the cursor.** `meta.nextCursor` is opaque; loop until it is null.
Do not build offsets — the list reorders as mail arrives.

**Render message bodies in a sandboxed iframe.** The server sanitises on every
read, but bodies are attacker-controlled and defence in depth is cheap:
`<iframe sandbox srcDoc={bodyHtml} />`.

### Realtime

Rooms, not the legacy single-socket-per-agent map (which meant only the last-opened
tab received anything):

```ts
socket.emit("helpdesk:join", { agentId, departmentCode });
socket.emit("helpdesk:watch-ticket", { ticketId });

socket.on("helpdesk:message:added", (p) => { /* p.isNew -> unread indicator */ });
socket.on("helpdesk:counts:changed", () => invalidate(["tickets", "counts"]));
```

Payloads say what changed, not the whole record — patch the cache or invalidate.
Note `context/sockets/socketProvider.tsx` is currently a stub with its body
commented out; wiring it up is part of the list-panel migration.

## Conventions

- Path alias `@/` -> `src/`.
- Feature-first: a screen owns its `api/`, `types/`, `utils/`, `components/`.
  Only genuinely shared things go in top-level `components/` or `utils/`.
- `components/ui/*` is generated shadcn. Add variants via
  `class-variance-authority` in the component, do not fork the file.
- Tailwind utilities inline; `cn()` from `@/lib/utils` to merge.
- Forms: `react-hook-form` + `zod` via `@hookform/resolvers`.
- `date-fns` for dates. Do not add another date library.
- Types describe the API response, and the new API is camelCase — the
  `UPPER_SNAKE` interfaces in `types/` (`OooRecord`, `TicketActionLog`) mirror the
  SAP contract and go away with it.
- Keep `console.log` out of committed code. There is a lot of commented-out
  logging; deleting it while nearby is welcome.

## Migration order

Cheapest and highest-value first. Each step is independently shippable because the
SAP endpoints stay mounted.

1. **Auth** — `POST /auth/login`; token in memory, password out of
   `sessionStorage`. Closes the worst hole, unblocks the rest.
2. **Ticket list** — `GET /tickets` + `/tickets/counts`. Deletes the in-memory
   grouping, filtering, searching and counting from `EmailInterface.tsx`.
3. **Thread** — `GET /tickets/:id/thread`. Deletes `api/graphEmail.ts` entirely.
4. **Compose** — `GET …/compose` + `POST …/messages`. Deletes `utils/threadUtils.ts`.
5. **Header actions** — assign, status, snooze, escalate.
6. **Config screens** — `CategoryConfigPage`, `SpocAvailabilityPage`,
   `SignatureManager`, templates.

New capabilities the backend already exposes and there is no UI for yet: internal
notes (`POST …/notes`), cross-ticket body search (`GET /search`), saved views
(`/views`), the activity dashboard (`/analytics/dashboard`), agent workload
(`/agents/workload`), and a ticket-wide files list (`GET …/attachments`).

## Cautions

- `api/graphEmail.ts` hardcodes `GRAPH_USER_PATH` to one mailbox object id, with
  two others commented out above it. Switching desks currently means editing
  source. The new API takes the mailbox from server env.
- `services/api.ts` and `services/sapClient.ts` both hardcode the backend base URL
  with alternatives commented out, and each defines its own `END_POINTS`. Move to
  a single client reading `import.meta.env.VITE_API_BASE_URL`.
- `features/helpdesk/` (employee request form) is separate from
  `features/mailHelpdesk/` (agent desk) and has its own mock data. Do not conflate.
