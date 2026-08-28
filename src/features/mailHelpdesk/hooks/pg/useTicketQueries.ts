/** Ticket reads against the PostgreSQL helpdesk API. */
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  getTicket,
  getTicketCounts,
  getTicketSnooze,
  getTicketTimeline,
  getTicketTransitions,
  listTickets,
} from "../../api/pg";
import type { PgPageMeta } from "@/services/pgClient";
import type {
  TicketCounts,
  TicketDetail,
  TicketListFilters,
  TicketListRow,
  TicketSnoozeState,
  TicketTimeline,
  WorkflowTransitionRow,
} from "../../types/pg";
import { helpdeskKeys } from "./queryKeys";

export interface TicketPage {
  rows: TicketListRow[];
  meta?: PgPageMeta;
}

/**
 * One page of the department queue. The previous page stays on screen while a
 * new filter loads, so the grid does not blink on every keystroke.
 *
 * @param filters the shared filter object — pass the SAME one to `useTicketCounts`
 * @param enabled skip the call until the identity is known
 * @returns rows plus the pagination meta
 */
export const useTickets = (
  filters?: TicketListFilters,
  enabled = true,
): UseQueryResult<TicketPage, Error> =>
  useQuery({
    queryKey: helpdeskKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await listTickets(filters);
      return { rows: data, meta };
    },
    enabled,
    placeholderData: keepPreviousData,
  });

/**
 * The department queue as one growing list, a page at a time.
 *
 * The API pages by number rather than by cursor, so a ticket that moves between
 * pages while the agent scrolls could arrive twice — `flattenTicketPages`
 * de-duplicates by id rather than letting React see two rows with one key.
 *
 * @param filters the shared filter object — **must not carry `page`**, which
 *   this hook supplies per page
 * @param enabled skip the call until the identity is known
 * @returns the infinite query result; pages hold `{ rows, meta }`
 */
export const useInfiniteTickets = (
  filters?: TicketListFilters,
  enabled = true,
): UseInfiniteQueryResult<InfiniteData<TicketPage, number>, Error> =>
  useInfiniteQuery({
    queryKey: helpdeskKeys.infiniteList(filters),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data, meta } = await listTickets({ ...filters, page: pageParam });
      return { rows: data, meta };
    },
    getNextPageParam: (lastPage) => {
      const meta = lastPage.meta;
      if (!meta) return undefined;
      return meta.page < meta.totalPages ? meta.page + 1 : undefined;
    },
    enabled,
  });

/**
 * Flattens the loaded pages into one list, keeping the first row seen for any
 * id so a re-ordered result set cannot produce duplicates.
 *
 * @param pages what `useInfiniteTickets` returned, or undefined before the
 *   first page arrives
 * @returns the rows in server order, de-duplicated
 */
export const flattenTicketPages = (
  pages: InfiniteData<TicketPage, number> | undefined,
): TicketListRow[] => {
  const seen = new Set<string>();
  const rows: TicketListRow[] = [];
  for (const page of pages?.pages ?? []) {
    for (const row of page.rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
};

/**
 * The numbers beside the state-dropdown options, under the same filters.
 *
 * @param filters the same object passed to `useTickets`
 * @param enabled skip the call until the identity is known
 * @returns totals, unread, and the per-state breakdowns
 */
export const useTicketCounts = (
  filters?: TicketListFilters,
  enabled = true,
): UseQueryResult<TicketCounts, Error> =>
  useQuery({
    queryKey: helpdeskKeys.counts(filters),
    queryFn: () => getTicketCounts(filters),
    enabled,
    placeholderData: keepPreviousData,
  });

/**
 * Detail, transition buttons and OLA clocks for one ticket.
 *
 * @param id ticket uuid, or null/undefined when nothing is selected
 * @returns the detail payload; the query idles while `id` is empty
 */
export const useTicket = (
  id: string | null | undefined,
): UseQueryResult<TicketDetail, Error> =>
  useQuery({
    queryKey: helpdeskKeys.detail(id ?? ""),
    queryFn: () => getTicket(id as string),
    enabled: Boolean(id),
  });

/**
 * The activity feed for one ticket.
 *
 * @param id ticket uuid, or null/undefined when nothing is selected
 * @returns activity, status, assignment and field-change history
 */
export const useTicketTimeline = (
  id: string | null | undefined,
): UseQueryResult<TicketTimeline, Error> =>
  useQuery({
    queryKey: helpdeskKeys.timeline(id ?? ""),
    queryFn: () => getTicketTimeline(id as string),
    enabled: Boolean(id),
  });

/**
 * The legal next moves alone. `useTicket` already carries these — reach for
 * this only to refresh the buttons without re-fetching the ticket.
 *
 * @param id ticket uuid, or null/undefined when nothing is selected
 * @param enabled skip the call when the detail query already supplies them
 * @returns the transition rows, ordered by `display_order`
 */
export const useTicketTransitions = (
  id: string | null | undefined,
  enabled = true,
): UseQueryResult<WorkflowTransitionRow[], Error> =>
  useQuery({
    queryKey: helpdeskKeys.transitions(id ?? ""),
    queryFn: () => getTicketTransitions(id as string),
    enabled: Boolean(id) && enabled,
  });

/**
 * The open snooze and the department's remaining budget for this ticket.
 *
 * Agent-only at the route: `reason` is a triage note and `snoozedByUserId` names
 * staff, so a requester must never ask. Pass `enabled: isAgent`.
 *
 * The wake-up job only runs when the server has `HELPDESK_JOBS_ENABLED=true`, so
 * a snooze whose time has passed can still read as open. `TicketSnoozeControl`
 * says so rather than pretending otherwise.
 *
 * @param id ticket uuid, or null/undefined when nothing is selected
 * @param enabled skip the call for a non-agent
 * @returns `snooze`, `snoozeCountUsed`, `snoozeMaxCount`
 */
export const useTicketSnooze = (
  id: string | null | undefined,
  enabled = true,
): UseQueryResult<TicketSnoozeState, Error> =>
  useQuery({
    queryKey: helpdeskKeys.snooze(id ?? ""),
    queryFn: () => getTicketSnooze(id as string),
    enabled: Boolean(id) && enabled,
  });
