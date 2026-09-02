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

  // ---------------------------------------------------------------------------
  // admin surface. Every route below is behind a `helpdesk.*` permission, and
  // the whole `/admin/*` router — GETs included — shares one 60-request/minute
  // budget per user. Load a screen's data when that screen opens, never on
  // mount, and cache `/auth/me` + `/admin/meta/enums` for the session.
  // ---------------------------------------------------------------------------

  // meta — the controlled vocabularies. Cross-department; fetch once.
  ADMIN_META_ENUMS: "/api/helpdesk/admin/meta/enums",

  // departments. The collection is cross-department (visibility is enforced in
  // SQL); everything under `/:departmentId` is scoped and 403s CROSS_DEPARTMENT.
  ADMIN_DEPARTMENTS: "/api/helpdesk/admin/departments",
  ADMIN_DEPARTMENT: "/api/helpdesk/admin/departments/:departmentId",
  ADMIN_DEPARTMENT_READINESS:
    "/api/helpdesk/admin/departments/:departmentId/readiness",
  ADMIN_DEPARTMENT_ACTIVATE:
    "/api/helpdesk/admin/departments/:departmentId/activate",
  ADMIN_DEPARTMENT_DEACTIVATE:
    "/api/helpdesk/admin/departments/:departmentId/deactivate",

  // settings — a 1:1 satellite of the department, so there is no `/:id`.
  ADMIN_SETTINGS: "/api/helpdesk/admin/departments/:departmentId/settings",

  // features — keyed by `feature_code`, not a uuid. DELETE disables, never deletes.
  ADMIN_FEATURES: "/api/helpdesk/admin/departments/:departmentId/features",
  ADMIN_FEATURE: "/api/helpdesk/admin/departments/:departmentId/features/:code",

  // taxonomy. Creating a subcategory names its parent; reading or editing one
  // does not — hence the two different subcategory paths.
  ADMIN_CATEGORIES: "/api/helpdesk/admin/departments/:departmentId/categories",
  ADMIN_CATEGORY:
    "/api/helpdesk/admin/departments/:departmentId/categories/:categoryId",
  ADMIN_SUBCATEGORIES:
    "/api/helpdesk/admin/departments/:departmentId/categories/:categoryId/subcategories",
  ADMIN_SUBCATEGORY:
    "/api/helpdesk/admin/departments/:departmentId/subcategories/:subcategoryId",

  // priorities — the one resource with two scopes: department rows and
  // platform-wide rows (`department_id IS NULL`), resolved as a union.
  ADMIN_PRIORITIES: "/api/helpdesk/admin/departments/:departmentId/priorities",
  ADMIN_PRIORITY:
    "/api/helpdesk/admin/departments/:departmentId/priorities/:priorityId",
  // Its own verb because it moves three rows at once — no If-Match applies.
  ADMIN_PRIORITY_DEFAULT:
    "/api/helpdesk/admin/departments/:departmentId/priorities/:priorityId/default",

  // users. There is deliberately no POST: people arrive from the SAP sync or by
  // signing in, and "activate a member" is a PATCH on isAssignable + status.
  ADMIN_USERS: "/api/helpdesk/admin/departments/:departmentId/users",
  ADMIN_USER: "/api/helpdesk/admin/departments/:departmentId/users/:userId",
  ADMIN_USER_IMPACT:
    "/api/helpdesk/admin/departments/:departmentId/users/:userId/impact",
  ADMIN_USER_OFFBOARD:
    "/api/helpdesk/admin/departments/:departmentId/users/:userId/offboard",

  // roles and permissions — platform-wide, read-only, no etag.
  ADMIN_ROLES: "/api/helpdesk/admin/roles",
  ADMIN_PERMISSIONS: "/api/helpdesk/admin/permissions",

  // routing rules. No PATCH: a rule is effective-dated and `tickets.routing_rule_id`
  // pins it, so the Save button is `supersede`, which returns a NEW id.
  ADMIN_ROUTING_RULES:
    "/api/helpdesk/admin/departments/:departmentId/routing-rules",
  ADMIN_ROUTING_RULE:
    "/api/helpdesk/admin/departments/:departmentId/routing-rules/:ruleId",
  ADMIN_ROUTING_GAPS:
    "/api/helpdesk/admin/departments/:departmentId/routing-rules/gaps",
  // Runs the real resolver and writes nothing — gated on `.read`, not `.write`.
  ADMIN_ROUTING_PREVIEW:
    "/api/helpdesk/admin/departments/:departmentId/routing-rules/preview",
  ADMIN_ROUTING_SUPERSEDE:
    "/api/helpdesk/admin/departments/:departmentId/routing-rules/:ruleId/supersede",

  // OLA policies — same versioned model as routing rules.
  ADMIN_OLA_POLICIES:
    "/api/helpdesk/admin/departments/:departmentId/ola-policies",
  ADMIN_OLA_POLICY:
    "/api/helpdesk/admin/departments/:departmentId/ola-policies/:policyId",
  // PUT replaces the whole ladder; a piecewise edit has no valid intermediate state.
  ADMIN_OLA_STAGES:
    "/api/helpdesk/admin/departments/:departmentId/ola-policies/:policyId/stages",
  ADMIN_OLA_SUPERSEDE:
    "/api/helpdesk/admin/departments/:departmentId/ola-policies/:policyId/supersede",

  // workflows — draft → publish, never edit-in-place. Every write below the
  // version level answers 409 once the version is published.
  ADMIN_WORKFLOWS: "/api/helpdesk/admin/departments/:departmentId/workflows",
  ADMIN_WORKFLOW:
    "/api/helpdesk/admin/departments/:departmentId/workflows/:workflowId",
  ADMIN_WORKFLOW_VERSIONS:
    "/api/helpdesk/admin/departments/:departmentId/workflows/:workflowId/versions",
  ADMIN_WORKFLOW_PUBLISH:
    "/api/helpdesk/admin/departments/:departmentId/workflows/:workflowId/publish",
  ADMIN_WORKFLOW_STATES:
    "/api/helpdesk/admin/departments/:departmentId/workflows/:workflowId/states",
  ADMIN_WORKFLOW_STATE:
    "/api/helpdesk/admin/departments/:departmentId/workflows/:workflowId/states/:stateId",
  ADMIN_WORKFLOW_TRANSITIONS:
    "/api/helpdesk/admin/departments/:departmentId/workflows/:workflowId/transitions",
  ADMIN_WORKFLOW_TRANSITION:
    "/api/helpdesk/admin/departments/:departmentId/workflows/:workflowId/transitions/:transitionId",

  // out of office, department-wide. Acting for somebody else, unlike OOO above.
  ADMIN_OOO: "/api/helpdesk/admin/departments/:departmentId/out-of-office",
  ADMIN_OOO_DETAIL:
    "/api/helpdesk/admin/departments/:departmentId/out-of-office/:id",
  ADMIN_OOO_ACTIVATE:
    "/api/helpdesk/admin/departments/:departmentId/out-of-office/:id/activate",
  ADMIN_OOO_CANCEL:
    "/api/helpdesk/admin/departments/:departmentId/out-of-office/:id/cancel",
  ADMIN_OOO_REPLACE:
    "/api/helpdesk/admin/departments/:departmentId/out-of-office/:id/replace",
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
