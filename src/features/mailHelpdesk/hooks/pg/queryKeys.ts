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
   * People who can be picked as a delegate. Derived from the queue, not fetched:
   * the API publishes no user-lookup endpoint yet. See `useDelegateCandidates`.
   */
  delegateCandidates: () => [...helpdeskKeys.all, "delegateCandidates"] as const,
};
