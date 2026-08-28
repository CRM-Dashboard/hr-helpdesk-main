/**
 * END POINTS: object storing all end points
 *
 * @returns object (object containing all the project end points in a key value pair)
 */
export const END_POINTS = {
  IN_LINE_EMAIL: "/api/graph/fetch-inline-email",
  GET_TICKET_DETAIL: "/api/ticket/get-ticket-details",
  GET_TOKEN: "/api/ticket/get-token",
  HR_CATEGORY: "/api/hr/get-catgegory",
  HR_CATEGORY_SAVE: "/api/hr/post-category",
  HR_HELPDESK_LIST: "/api/hr/get-hr-email-list",
  HR_TICKET_DETAIL: "/api/hr/get-hr-ticket-details",
  GET_EMPLOYEE_INFO: "/api/hr/get-parking-employee",
  HR_POST_TICKET_DETAIL: "/api/hr/post-hr-ticket-details",
  ALL_CATEGORY: "/api/it-tracker/category",
  HELPDESK_EMAIL_LIST: "/api/it-tracker/get-ticket-list",
  HELPDESK_TICKET_DETAIL: "/api/it-tracker/get-ticket-details",
  HELPDESK_POST_TICKET_DETAIL: "/api/it-tracker/post-ticket-details",
  HELPDESK_GET_TICKET_LIST: "/api/it-tracker/get-email-list",
};

/**
 * PostgreSQL-backed helpdesk API (`/api/helpdesk`). JSON only — no multipart.
 * Paths carrying `:id` are templated with `pgPath()` below.
 */
export const PG_ENDPOINT = {
  HEALTH: "/api/helpdesk/health", // anonymous liveness probe

  // identity
  ME: `/api/helpdesk/auth/me`, // call this on project mount

  // tickets — reads
  TICKETS: "/api/helpdesk/tickets", // fetches ticket list
  TICKETS_COUNT: "/api/helpdesk/tickets/counts", // it help in showing header dropdown of buckets
  TICKET_DETAIL: "/api/helpdesk/tickets/:id", // detail of selected ticket
  TICKET_TIMELINE: "/api/helpdesk/tickets/:id/timeline", // timeline detail of selected ticket
  TICKET_TRANSITIONS: "/api/helpdesk/tickets/:id/transitions", // transitions detail of ticket

  // tickets — writes (POST /tickets/:id/transitions shares the read path)
  TICKET_CREATE: "/api/helpdesk/tickets",
  TICKET_READ: "/api/helpdesk/tickets/:id/read", // clears THIS user's unread markers
  TICKET_ASSIGNMENT: "/api/helpdesk/tickets/:id/assignment",
  TICKET_CLASSIFICATION: "/api/helpdesk/tickets/:id/classification",
  TICKET_PRIORITY: "/api/helpdesk/tickets/:id/priority",
  TICKET_NOTES: "/api/helpdesk/tickets/:id/notes", // internal notes
  // One path, three verbs: GET reads the open snooze and the department's cap,
  // POST opens one (feature-gated), DELETE ends one (deliberately not gated, so
  // switching SNOOZE off cannot trap a ticket that is already snoozed).
  TICKET_SNOOZE: "/api/helpdesk/tickets/:id/snooze",

  // collab — the internal thread, kept separate from the customer conversation
  TICKET_COLLAB: "/api/helpdesk/tickets/:id/collaborations",
  TICKET_COLLAB_ITEM:
    "/api/helpdesk/tickets/:id/collaborations/:collaborationId",
  TICKET_COLLAB_NOTES:
    "/api/helpdesk/tickets/:id/collaborations/:collaborationId/notes",

  // out of office — SELF-SERVICE. Always the caller's own leave: `userId` is not
  // a field on any of these. Acting for somebody else is the admin surface,
  // `/admin/departments/:departmentId/out-of-office`, which is not built yet.
  OOO: "/api/helpdesk/out-of-office", // GET my leave (?covering=true), POST to file
  OOO_DETAIL: "/api/helpdesk/out-of-office/:id",
  OOO_ACTIVATE: "/api/helpdesk/out-of-office/:id/activate", // a MANUAL window, turned on
  OOO_CANCEL: "/api/helpdesk/out-of-office/:id/cancel", // ends it early, applying the expiry policy NOW
  OOO_REPLACE: "/api/helpdesk/out-of-office/:id/replace", // swap the delegate — there is no PATCH
} as const;

/**
 * Fills `:param` placeholders in a PG_ENDPOINT path.
 *
 * @param template path from PG_ENDPOINT, e.g. "/api/helpdesk/tickets/:id"
 * @param params   map of placeholder name to value
 * @returns the path with every placeholder replaced and URI-encoded
 */
export const pgPath = (
  template: string,
  params: Record<string, string>,
): string =>
  template.replace(/:([A-Za-z0-9_]+)/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined || value === null || value === "") {
      throw new Error(`Missing path parameter "${key}" for ${template}`);
    }
    return encodeURIComponent(String(value));
  });
