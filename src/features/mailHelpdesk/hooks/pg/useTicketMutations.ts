/**
 * Ticket writes against the PostgreSQL helpdesk API.
 *
 * Every mutation invalidates what it actually changed. Nothing auto-retries a
 * 409: a stale `expectedVersion` means someone else wrote first, and retrying
 * with the fresh version would overwrite their change.
 */
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  addTicketNote,
  assignTicket,
  changeTicketPriority,
  classifyTicket,
  createTicket,
  markTicketRead,
  snoozeTicket,
  transitionTicket,
  unsnoozeTicket,
} from "../../api/pg";
import type {
  AddTicketNotePayload,
  AssignTicketPayload,
  AssignTicketResult,
  ChangePriorityPayload,
  ChangePriorityResult,
  ClassifyTicketPayload,
  ClassifyTicketResult,
  CreateTicketPayload,
  MarkTicketReadResult,
  SnoozeTicketPayload,
  TicketActivityRow,
  TicketListRow,
  TicketRow,
  TicketSnoozeRow,
  TicketTransitionPayload,
  TicketTransitionResult,
} from "../../types/pg";
import { helpdeskKeys } from "./queryKeys";

/** Arguments shared by every per-ticket mutation. */
interface TicketMutation<TPayload> {
  id: string;
  payload: TPayload;
}

/** The shape every cached ticket list shares, page-at-a-time or scrolling. */
type CachedTicketPage = { rows: TicketListRow[]; meta?: unknown };
type CachedTicketList =
  | CachedTicketPage
  | { pages: CachedTicketPage[]; pageParams: unknown[] };

/**
 * Clears the unread decoration on one row of a cached list.
 *
 * Marking a ticket read is patched into the cache rather than refetched: an
 * invalidation would re-request every loaded page, and because the server ranks
 * unread tickets first, the row would jump out from under the agent who just
 * clicked it.
 *
 * @param cached whatever sits under a `["helpdesk","tickets",…]` key
 * @param ticketId the ticket that was read
 * @returns the same value when it is not a list, otherwise a patched copy
 */
const clearUnread = (
  cached: unknown,
  ticketId: string,
): unknown => {
  const patchRows = (rows: TicketListRow[]) => {
    if (!rows.some((row) => row.id === ticketId && row.has_unread)) return rows;
    return rows.map((row) =>
      row.id === ticketId ? { ...row, has_unread: false, unread_count: 0 } : row,
    );
  };

  const value = cached as CachedTicketList | undefined;
  if (!value || typeof value !== "object") return cached;

  if ("pages" in value && Array.isArray(value.pages)) {
    return {
      ...value,
      pages: value.pages.map((page) => ({
        ...page,
        rows: patchRows(page.rows ?? []),
      })),
    };
  }

  if ("rows" in value && Array.isArray(value.rows)) {
    return { ...value, rows: patchRows(value.rows) };
  }

  return cached;
};

/**
 * Raises a ticket. Invalidates the list and counts on success.
 *
 * @returns a mutation taking the create payload and resolving to the new row
 */
export const useCreateTicket = (): UseMutationResult<
  TicketRow,
  Error,
  CreateTicketPayload
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTicketPayload) => createTicket(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.tickets() });
    },
  });
};

/**
 * Marks the ticket read for THIS user. Call it when the person actually opens
 * the ticket, not on a prefetch or a background refresh.
 *
 * @returns a mutation taking the ticket id and resolving to the rows flipped
 */
export const useMarkTicketRead = (): UseMutationResult<
  MarkTicketReadResult,
  Error,
  string
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markTicketRead(id),
    onSuccess: (result, id) => {
      // Idempotent: a second call reports 0 and there is nothing to update.
      if (result.marked === 0) return;

      queryClient.setQueriesData(
        { queryKey: helpdeskKeys.lists() },
        (cached) => clearUnread(cached, id),
      );
      queryClient.setQueriesData(
        { queryKey: helpdeskKeys.infiniteLists() },
        (cached) => clearUnread(cached, id),
      );
      // The badge totals are the one thing that genuinely has to come back
      // from the server.
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.allCounts() });
    },
  });
};

/**
 * Moves the ticket through the workflow.
 *
 * @returns a mutation taking `{ id, payload }`; a 409 ILLEGAL_TRANSITION means
 *   the buttons were stale, and the refreshed transitions arrive on invalidation
 */
export const useTransitionTicket = (): UseMutationResult<
  TicketTransitionResult,
  Error,
  TicketMutation<TicketTransitionPayload>
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: TicketMutation<TicketTransitionPayload>) =>
      transitionTicket(id, payload),
    onSettled: (_result, _error, { id }) => {
      // Settled, not success: an illegal transition also means stale buttons.
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.tickets() });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.timeline(id) });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.transitions(id) });
    },
  });
};

/**
 * Reassigns the ticket, or un-assigns it with `assignedToUserId: null`.
 *
 * @returns a mutation taking `{ id, payload }` and resolving to the ticket plus
 *   the new assignment row
 */
export const useAssignTicket = (): UseMutationResult<
  AssignTicketResult,
  Error,
  TicketMutation<AssignTicketPayload>
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: TicketMutation<AssignTicketPayload>) =>
      assignTicket(id, payload),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.tickets() });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.timeline(id) });
    },
  });
};

/**
 * Corrects or confirms the category. Re-routing may move the ticket to another
 * agent, so the detail pane is invalidated too.
 *
 * @returns a mutation taking `{ id, payload }`
 */
export const useClassifyTicket = (): UseMutationResult<
  ClassifyTicketResult,
  Error,
  TicketMutation<ClassifyTicketPayload>
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: TicketMutation<ClassifyTicketPayload>) =>
      classifyTicket(id, payload),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.tickets() });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.timeline(id) });
    },
  });
};

/**
 * Changes the priority.
 *
 * @returns a mutation taking `{ id, payload }`; `changed: false` means the
 *   ticket already had that priority and nothing was written
 */
export const useChangeTicketPriority = (): UseMutationResult<
  ChangePriorityResult,
  Error,
  TicketMutation<ChangePriorityPayload>
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: TicketMutation<ChangePriorityPayload>) =>
      changeTicketPriority(id, payload),
    onSuccess: (result, { id }) => {
      if (!result.changed) return;
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.tickets() });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.timeline(id) });
    },
  });
};

/**
 * Adds an internal note.
 *
 * @returns a mutation taking `{ id, payload }` and resolving to the created
 *   activity row, ready to append to the feed
 */
export const useAddTicketNote = (): UseMutationResult<
  TicketActivityRow,
  Error,
  TicketMutation<AddTicketNotePayload>
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: TicketMutation<AddTicketNotePayload>) =>
      addTicketNote(id, payload),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.timeline(id) });
    },
  });
};

/**
 * Snoozes the ticket until a future moment.
 *
 * The OLA clock is what actually changes on the ticket, so the detail pane is
 * invalidated alongside the snooze itself.
 *
 * @returns a mutation taking `{ id, payload }`; a 400 carries a message written
 *   to be shown — the count cap, the working-minutes cap, or a closed ticket
 */
export const useSnoozeTicket = (): UseMutationResult<
  TicketSnoozeRow,
  Error,
  TicketMutation<SnoozeTicketPayload>
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: TicketMutation<SnoozeTicketPayload>) =>
      snoozeTicket(id, payload),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.snooze(id) });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.tickets() });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.timeline(id) });
    },
  });
};

/**
 * Wakes the ticket now, ending the open snooze with `end_trigger = MANUAL`.
 *
 * Deliberately reachable even when the department's SNOOZE feature is off —
 * only the POST is feature-gated, so switching the feature off must never trap
 * a ticket that is already snoozed.
 *
 * @returns a mutation taking the ticket id; a 400 means it was not snoozed,
 *   which the invalidation below then corrects on screen
 */
export const useUnsnoozeTicket = (): UseMutationResult<
  TicketSnoozeRow,
  Error,
  string
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unsnoozeTicket(id),
    // Settled, not success: "this ticket is not snoozed" also means the panel
    // is out of date, and refetching is what fixes it.
    onSettled: (_result, _error, id) => {
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.snooze(id) });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.tickets() });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.timeline(id) });
    },
  });
};
