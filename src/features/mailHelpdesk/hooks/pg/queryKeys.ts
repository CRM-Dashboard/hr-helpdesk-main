/**
 * react-query keys for the PostgreSQL helpdesk API.
 *
 * Everything ticket-shaped hangs off `["helpdesk", "tickets", …]` so one
 * `invalidateQueries({ queryKey: helpdeskKeys.tickets() })` refreshes the list,
 * the counts and every open detail pane after a write.
 */
import type {
  OutOfOfficeListFilters,
  TicketListFilters,
} from "../../types/pg";

export const helpdeskKeys = {
  all: ["helpdesk"] as const,

  /** `GET /auth/me` — identity, permissions, workflow vocabulary. */
  me: () => [...helpdeskKeys.all, "me"] as const,

  /** Everything under /tickets. Invalidate this after any write. */
  tickets: () => [...helpdeskKeys.all, "tickets"] as const,

  list: (filters?: TicketListFilters) =>
    [...helpdeskKeys.tickets(), "list", filters ?? {}] as const,

  /** Prefix matching every page-at-a-time list, whatever its filters. */
  lists: () => [...helpdeskKeys.tickets(), "list"] as const,

  infiniteList: (filters?: TicketListFilters) =>
    [...helpdeskKeys.tickets(), "infiniteList", filters ?? {}] as const,

  /** Prefix matching every scrolling list, whatever its filters. */
  infiniteLists: () => [...helpdeskKeys.tickets(), "infiniteList"] as const,

  counts: (filters?: TicketListFilters) =>
    [...helpdeskKeys.tickets(), "counts", filters ?? {}] as const,

  /** Prefix matching every counts query, whatever its filters. */
  allCounts: () => [...helpdeskKeys.tickets(), "counts"] as const,

  detail: (id: string) => [...helpdeskKeys.tickets(), "detail", id] as const,

  timeline: (id: string) => [...helpdeskKeys.tickets(), "timeline", id] as const,

  transitions: (id: string) =>
    [...helpdeskKeys.tickets(), "transitions", id] as const,

  collaborations: (id: string) =>
    [...helpdeskKeys.tickets(), "collaborations", id] as const,

  /**
   * `GET /tickets/:id/snooze`. Under `tickets()` so a blanket invalidation
   * after any write refreshes it, but keyed separately because it is its own
   * agent-only call rather than part of the detail payload.
   */
  snooze: (id: string) => [...helpdeskKeys.tickets(), "snooze", id] as const,

  /** Everything under /out-of-office. Not ticket-shaped — its own subtree. */
  ooo: () => [...helpdeskKeys.all, "ooo"] as const,

  oooList: (filters?: OutOfOfficeListFilters) =>
    [...helpdeskKeys.ooo(), "list", filters ?? {}] as const,

  oooDetail: (id: string) => [...helpdeskKeys.ooo(), "detail", id] as const,

  /**
   * People who can be picked as a delegate: the department's assignable members.
   * Department-scoped because the roster is — see `useDelegateCandidates`.
   */
  delegateCandidates: (departmentId: string) =>
    [...helpdeskKeys.all, "delegateCandidates", departmentId] as const,
};

/**
 * Keys for the `/admin/*` surface.
 *
 * Everything a department owns hangs off `["helpdesk", "admin", <departmentId>]`,
 * so switching department as a SUPER_ADMIN cannot show the previous one's
 * configuration, and one `invalidateQueries({ queryKey: adminKeys.department(id) })`
 * refreshes a whole screen after a write.
 *
 * `meta`, `roles` and `permissions` sit outside that subtree because they are
 * cross-department — a CHECK constraint and a role catalogue are identical
 * everywhere.
 */
export const adminKeys = {
  all: [...helpdeskKeys.all, "admin"] as const,

  /** `GET /admin/meta/enums` — fetched once at bootstrap, cached for the session. */
  meta: () => [...adminKeys.all, "meta"] as const,

  roles: (includePermissions: boolean) =>
    [...adminKeys.all, "roles", includePermissions] as const,
  permissions: () => [...adminKeys.all, "permissions"] as const,

  /** The cross-department department list. Not under a department id. */
  departments: (filters?: unknown) =>
    [...adminKeys.all, "departments", filters ?? {}] as const,
  departmentLists: () => [...adminKeys.all, "departments"] as const,

  /** Everything scoped to one department. Invalidate this after any config write. */
  department: (departmentId: string) =>
    [...adminKeys.all, "department", departmentId] as const,

  departmentDetail: (departmentId: string) =>
    [...adminKeys.department(departmentId), "detail"] as const,
  readiness: (departmentId: string) =>
    [...adminKeys.department(departmentId), "readiness"] as const,
  settings: (departmentId: string) =>
    [...adminKeys.department(departmentId), "settings"] as const,
  features: (departmentId: string) =>
    [...adminKeys.department(departmentId), "features"] as const,

  categories: (departmentId: string, filters?: unknown) =>
    [...adminKeys.department(departmentId), "categories", filters ?? {}] as const,
  categoryLists: (departmentId: string) =>
    [...adminKeys.department(departmentId), "categories"] as const,
  subcategories: (departmentId: string, categoryId: string, filters?: unknown) =>
    [
      ...adminKeys.department(departmentId),
      "subcategories",
      categoryId,
      filters ?? {},
    ] as const,
  subcategoryLists: (departmentId: string) =>
    [...adminKeys.department(departmentId), "subcategories"] as const,

  priorities: (departmentId: string, filters?: unknown) =>
    [...adminKeys.department(departmentId), "priorities", filters ?? {}] as const,
  priorityLists: (departmentId: string) =>
    [...adminKeys.department(departmentId), "priorities"] as const,

  users: (departmentId: string, filters?: unknown) =>
    [...adminKeys.department(departmentId), "users", filters ?? {}] as const,
  userLists: (departmentId: string) =>
    [...adminKeys.department(departmentId), "users"] as const,
  userImpact: (departmentId: string, userId: string) =>
    [...adminKeys.department(departmentId), "userImpact", userId] as const,

  routingRules: (departmentId: string, filters?: unknown) =>
    [...adminKeys.department(departmentId), "routingRules", filters ?? {}] as const,
  routingRuleLists: (departmentId: string) =>
    [...adminKeys.department(departmentId), "routingRules"] as const,
  routingGaps: (departmentId: string) =>
    [...adminKeys.department(departmentId), "routingGaps"] as const,
  routingPreview: (departmentId: string, scope: unknown) =>
    [...adminKeys.department(departmentId), "routingPreview", scope] as const,

  olaPolicies: (departmentId: string, filters?: unknown) =>
    [...adminKeys.department(departmentId), "olaPolicies", filters ?? {}] as const,
  olaPolicyLists: (departmentId: string) =>
    [...adminKeys.department(departmentId), "olaPolicies"] as const,
  olaPolicy: (departmentId: string, policyId: string) =>
    [...adminKeys.department(departmentId), "olaPolicy", policyId] as const,

  workflows: (departmentId: string) =>
    [...adminKeys.department(departmentId), "workflows"] as const,
  workflow: (departmentId: string, workflowId: string) =>
    [...adminKeys.department(departmentId), "workflow", workflowId] as const,
};
