/**
 * Every ticket endpoint on the PostgreSQL helpdesk API.
 *
 * The frontend asks for outcomes, never for column writes: there is no
 * `PATCH /tickets/:id`. A state change is `POST /tickets/:id/transitions`,
 * validated against the department's workflow.
 */
import { PG_ENDPOINT, pgPath } from "@/services/endPoints";
import { pgQuery, pgRequest, type PgResult } from "@/services/pgClient";
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
  TicketCounts,
  TicketDetail,
  TicketListFilters,
  TicketListRow,
  TicketRow,
  TicketSnoozeRow,
  TicketSnoozeState,
  TicketTimeline,
  TicketTransitionPayload,
  TicketTransitionResult,
  WorkflowTransitionRow,
} from "../../types/pg";

/* ------------------------------------------------------------------ reads */

/**
 * The department queue, paginated and decorated with this caller's unread state.
 *
 * @param filters one shared filter object; arrays repeat the key
 *   (`?state=NEW&state=IN_PROGRESS`)
 * @returns the page in `data` and `page`/`limit`/`total`/`totalPages` in `meta`
 * @throws {HelpdeskApiError} 400 on an unknown state code — `details.available`
 *   names the department's real vocabulary
 */
export const listTickets = (
  filters?: TicketListFilters,
): Promise<PgResult<TicketListRow[]>> =>
  pgRequest<TicketListRow[]>({
    method: "GET",
    url: `${PG_ENDPOINT.TICKETS}${pgQuery(filters)}`,
  });

/**
 * Per-state totals under the same filters as the list, for the dropdown.
 *
 * `state`, `stateCategory` and `stateId` are accepted and then ignored by the
 * server — a facet that honoured its own facet would report every other state
 * as zero. `page`, `limit` and `sort` are a 422, so they are stripped here.
 *
 * @param filters the same object passed to `listTickets`
 * @returns totals, unread, `byState`, `byCategory`, `unreadByState`
 */
export const getTicketCounts = async (
  filters?: TicketListFilters,
): Promise<TicketCounts> => {
  const rest: TicketListFilters = { ...(filters ?? {}) };
  delete rest.page;
  delete rest.limit;
  delete rest.sort;
  const { data } = await pgRequest<TicketCounts>({
    method: "GET",
    url: `${PG_ENDPOINT.TICKETS_COUNT}${pgQuery(rest)}`,
  });
  return data;
};

/**
 * Ticket detail with the legal next moves and the OLA clocks, in one call.
 *
 * Reading this does NOT clear the unread badge — call `markTicketRead` when the
 * user genuinely opens the ticket.
 *
 * @param id ticket uuid
 * @returns `ticket`, `availableTransitions`, `ola`
 * @throws {HelpdeskApiError} 404 when absent, in another department, or another
 *   requester's ticket — the three are deliberately indistinguishable
 */
export const getTicket = async (id: string): Promise<TicketDetail> => {
  const { data } = await pgRequest<TicketDetail>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.TICKET_DETAIL, { id }),
  });
  return data;
};

/**
 * The ticket's history: activity, status intervals, assignments, field changes.
 *
 * @param id ticket uuid
 * @returns four arrays; for an EMPLOYEE the last three are empty by design
 */
export const getTicketTimeline = async (
  id: string,
): Promise<TicketTimeline> => {
  const { data } = await pgRequest<TicketTimeline>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.TICKET_TIMELINE, { id }),
  });
  return data;
};

/**
 * The legal next moves, filtered to the caller's role. Use this to refresh the
 * buttons after a transition without re-fetching the whole ticket.
 *
 * @param id ticket uuid
 * @returns the same rows as `availableTransitions` on `getTicket`
 */
export const getTicketTransitions = async (
  id: string,
): Promise<WorkflowTransitionRow[]> => {
  const { data } = await pgRequest<WorkflowTransitionRow[]>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.TICKET_TRANSITIONS, { id }),
  });
  return data;
};

/* ----------------------------------------------------------------- writes */

/**
 * Raises a ticket. Everything else — number, initial state, routing, OLA — is
 * an outcome the engine produces and cannot be asserted by the caller.
 *
 * @param payload subject is mandatory; `categoryId` is too when the department
 *   has `require_category` on
 * @returns the created ticket row (no `state_code` — resolve it from the
 *   cached `workflowStates`, or re-fetch the ticket)
 */
export const createTicket = async (
  payload: CreateTicketPayload,
): Promise<TicketRow> => {
  const { data } = await pgRequest<TicketRow>({
    method: "POST",
    url: PG_ENDPOINT.TICKET_CREATE,
    data: payload,
  });
  return data;
};

/**
 * "I have seen this ticket." Clears only this user's unread markers.
 *
 * @param id ticket uuid
 * @returns how many notification rows were flipped; a second call reports 0
 */
export const markTicketRead = async (
  id: string,
): Promise<MarkTicketReadResult> => {
  const { data } = await pgRequest<MarkTicketReadResult>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.TICKET_READ, { id }),
  });
  return data;
};

/**
 * Moves the ticket through the workflow. The only way its state changes.
 *
 * @param id ticket uuid
 * @param payload `transitionCode` from the button, plus `reason` when the
 *   transition requires one and `expectedVersion` on a shared queue
 * @returns the updated ticket and the transition that ran
 * @throws {HelpdeskApiError} 409 ILLEGAL_TRANSITION when the buttons are stale
 *   (`details.allowed` lists the legal set); 409 CONCURRENT_MODIFICATION when
 *   `expectedVersion` is behind
 */
export const transitionTicket = async (
  id: string,
  payload: TicketTransitionPayload,
): Promise<TicketTransitionResult> => {
  const { data } = await pgRequest<TicketTransitionResult>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.TICKET_TRANSITIONS, { id }),
    data: payload,
  });
  return data;
};

/**
 * Moves the ticket to a new owner, or off the queue.
 *
 * @param id ticket uuid
 * @param payload `assignedToUserId: null` un-assigns and must be sent explicitly
 * @returns the updated ticket and the new assignment row
 * @throws {HelpdeskApiError} 400 when the target cannot receive tickets,
 *   403 CROSS_DEPARTMENT when they belong elsewhere
 */
export const assignTicket = async (
  id: string,
  payload: AssignTicketPayload,
): Promise<AssignTicketResult> => {
  const { data } = await pgRequest<AssignTicketResult>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.TICKET_ASSIGNMENT, { id }),
    data: payload,
  });
  return data;
};

/**
 * Corrects or confirms the category. One verb, three inseparable effects: the
 * category changes, routing is re-resolved, and the classifier's corpus learns.
 *
 * Re-fetch the ticket afterwards — the assignee may have changed.
 *
 * @param id ticket uuid
 * @param payload `confirmOnly: true` records agreement without re-routing
 * @returns the updated ticket and whether it counted as a correction
 */
export const classifyTicket = async (
  id: string,
  payload: ClassifyTicketPayload,
): Promise<ClassifyTicketResult> => {
  const { data } = await pgRequest<ClassifyTicketResult>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.TICKET_CLASSIFICATION, { id }),
    data: payload,
  });
  return data;
};

/**
 * Changes the priority. May change which OLA policy applies.
 *
 * @param id ticket uuid
 * @param payload the new `priorityId`, which must belong to the ticket's
 *   department or be platform-wide
 * @returns the updated ticket; `changed` is false on a no-op
 */
export const changeTicketPriority = async (
  id: string,
  payload: ChangePriorityPayload,
): Promise<ChangePriorityResult> => {
  const { data } = await pgRequest<ChangePriorityResult>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.TICKET_PRIORITY, { id }),
    data: payload,
  });
  return data;
};

/**
 * Writes an internal note. Visibility is forced to INTERNAL by a CHECK
 * constraint, so it can never reach a requester's timeline.
 *
 * @param id ticket uuid
 * @param payload the note text, optionally attached to a collaboration thread
 * @returns the created activity row — append it to your `activity` list
 */
export const addTicketNote = async (
  id: string,
  payload: AddTicketNotePayload,
): Promise<TicketActivityRow> => {
  const { data } = await pgRequest<TicketActivityRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.TICKET_NOTES, { id }),
    data: payload,
  });
  return data;
};

/**
 * Hides the ticket until a future moment.
 *
 * The limits are the department's, not this ticket's: `snooze_max_count` counts
 * every snooze the ticket has ever had, and the duration is measured in WORKING
 * minutes on the department calendar, so a weekend costs almost nothing. Both
 * refusals are a 400 whose `message` is written to be shown.
 *
 * @param id ticket uuid
 * @param payload `snoozeUntil` must be in the future
 * @returns the created snooze row
 * @throws {HelpdeskApiError} 403 FEATURE_DISABLED when SNOOZE is off for the
 *   department; 400 on a closed ticket, or the count or working-minutes limit
 */
export const snoozeTicket = async (
  id: string,
  payload: SnoozeTicketPayload,
): Promise<TicketSnoozeRow> => {
  const { data } = await pgRequest<TicketSnoozeRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.TICKET_SNOOZE, { id }),
    data: payload,
  });
  return data;
};

/**
 * The open snooze, if any, plus how much of the department's budget it has spent.
 *
 * A separate call rather than a field on `getTicket`, because that payload also
 * serves requesters and `reason` is an agent's private triage note. Not
 * feature-gated: a department that has switched SNOOZE off must still see the
 * snoozes it took while it was on.
 *
 * @param id ticket uuid
 * @returns `snooze` (null when not snoozed — a 200, never a 404) and the counts
 * @throws {HelpdeskApiError} 404 when the ticket is absent or in another department
 */
export const getTicketSnooze = async (
  id: string,
): Promise<TicketSnoozeState> => {
  const { data } = await pgRequest<TicketSnoozeState>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.TICKET_SNOOZE, { id }),
  });
  return data;
};

/**
 * Wakes the ticket now, ending the open interval with `end_trigger = MANUAL`
 * and resuming any OLA clock the snooze paused.
 *
 * Cancelling does NOT refund the count — the cap is enforced against
 * `max(sequence_no)`, so three snooze/un-snooze cycles exhaust a limit of three.
 *
 * @param id ticket uuid
 * @returns the interval that was closed
 * @throws {HelpdeskApiError} 400 *"This ticket is not snoozed"*; 404 when the
 *   ticket is absent or in another department
 */
export const unsnoozeTicket = async (
  id: string,
): Promise<TicketSnoozeRow> => {
  const { data } = await pgRequest<TicketSnoozeRow>({
    method: "DELETE",
    url: pgPath(PG_ENDPOINT.TICKET_SNOOZE, { id }),
  });
  return data;
};
