/**
 * Out-of-office, self-service surface (`/api/helpdesk/out-of-office`).
 *
 * Every call here is about the CALLER's own leave — `userId` is not a field on
 * any of them, and a record belonging to a colleague answers 404 even when the
 * caller is its delegate. Acting for somebody else is the admin surface, which
 * this frontend does not use yet.
 *
 * There is no `PATCH`: the table carries no `updated_at`, so it has no
 * concurrency token, and changing the delegate is `replace` — cancel + create in
 * one transaction, which keeps the tickets the old delegate already picked up
 * with them and leaves both arrangements on the record.
 */
import { PG_ENDPOINT, pgPath } from "@/services/endPoints";
import { pgQuery, pgRequest, type PgResult } from "@/services/pgClient";
import type {
  ActivateOutOfOfficeResult,
  CancelOutOfOfficePayload,
  CancelOutOfOfficeResult,
  CreateOutOfOfficePayload,
  CreateOutOfOfficeResult,
  OutOfOfficeListFilters,
  OutOfOfficeListRow,
  OutOfOfficeRecord,
  ReplaceOutOfOfficePayload,
  ReplaceOutOfOfficeResult,
} from "../../types/pg";

/**
 * My leave, or — with `covering: true` — whose work I am covering.
 *
 * This is the ONLY shape carrying a server-computed `status`; the detail read
 * and the write responses do not have one. Cancelled rows are excluded unless
 * `includeCancelled` is set.
 *
 * @param filters `covering`, `activeOnly`, `includeCancelled`, paging and sort
 * @returns the page in `data`, `page`/`limit`/`total`/`totalPages` in `meta`
 * @throws {HelpdeskApiError} 403 FORBIDDEN for an EMPLOYEE — they hold no
 *   helpdesk permissions and have no assigned tickets to delegate
 */
export const listOutOfOffice = (
  filters?: OutOfOfficeListFilters,
): Promise<PgResult<OutOfOfficeListRow[]>> =>
  pgRequest<OutOfOfficeListRow[]>({
    method: "GET",
    url: `${PG_ENDPOINT.OOO}${pgQuery(filters as Record<string, unknown>)}`,
  });

/**
 * One of my own records, with both people's current eligibility resolved.
 *
 * `delegate_status` / `delegate_is_assignable` are what warn that the chosen
 * cover can no longer receive tickets. There is no `status` on this shape —
 * derive it with `deriveOooStatus`.
 *
 * @param id the record's uuid
 * @returns the record
 * @throws {HelpdeskApiError} 404 when it is not the caller's own, or not in
 *   their department — being the delegate is not enough
 */
export const getOutOfOffice = async (
  id: string,
): Promise<OutOfOfficeRecord> => {
  const { data } = await pgRequest<OutOfOfficeRecord>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.OOO_DETAIL, { id }),
  });
  return data;
};

/**
 * Files my own leave.
 *
 * The body is `.strict()` — an unknown field is a 422, not an ignored one — so
 * omit what the user did not choose rather than sending `undefined` through a
 * spread. Omitting `activationPolicy` / `expiryPolicy` inherits the
 * department's defaults, which is usually what is wanted.
 *
 * @param payload the window, the delegate, and any policy overrides
 * @returns the created record, plus `delegated` (existing tickets that moved
 *   right now) and an advisory `warning` when the delegate is themselves away
 * @throws {HelpdeskApiError} 409 CONFLICT on an overlapping window for the same
 *   person; 422 when the delegate is the caller or cannot receive tickets;
 *   403 FEATURE_DISABLED when OOO_DELEGATION is off
 */
export const createOutOfOffice = async (
  payload: CreateOutOfOfficePayload,
): Promise<CreateOutOfOfficeResult> => {
  const { data } = await pgRequest<CreateOutOfOfficeResult>({
    method: "POST",
    url: PG_ENDPOINT.OOO,
    data: payload,
  });
  return data;
};

/**
 * Turns a MANUAL window on. The only way one becomes visible to routing.
 *
 * Offer this for `AWAITING_ACTIVATION` alone: the other two policies are live
 * from `starts_at` regardless, and calling it on them merely claims a stamp the
 * scheduler would make anyway.
 *
 * @param id the record's uuid
 * @returns the record with `applied_at` set, and the tickets the sweep moved
 * @throws {HelpdeskApiError} 409 CONFLICT when it is already active, cancelled,
 *   or has ended
 */
export const activateOutOfOffice = async (
  id: string,
): Promise<ActivateOutOfOfficeResult> => {
  const { data } = await pgRequest<ActivateOutOfOfficeResult>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.OOO_ACTIVATE, { id }),
    // `.strict()` on an empty schema: any field at all is a 422.
    data: {},
  });
  return data;
};

/**
 * Ends a window early, applying the expiry policy NOW rather than at an
 * `ends_at` the window no longer has.
 *
 * `mode` is the whole decision and cannot be inferred from the row:
 * `RETURNED` settles the delegations, `HANDOVER` leaves them with the delegate.
 *
 * @param id the record's uuid
 * @param payload `mode` (defaults to RETURNED server-side) and a reason
 * @returns the cancelled record, how many tickets went home, and the mode
 *   actually applied — echo that rather than assuming the default
 * @throws {HelpdeskApiError} 409 CONFLICT when it is already cancelled
 */
export const cancelOutOfOffice = async (
  id: string,
  payload: CancelOutOfOfficePayload = {},
): Promise<CancelOutOfOfficeResult> => {
  const { data } = await pgRequest<CancelOutOfOfficeResult>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.OOO_CANCEL, { id }),
    data: payload,
  });
  return data;
};

/**
 * Swaps the delegate: `cancel(HANDOVER)` + `create`, in one transaction.
 *
 * Tickets the OLD delegate already picked up stay with them — they are not the
 * owner's any more, so the sweep correctly leaves them alone. Only new work
 * goes to the successor.
 *
 * @param id the record being handed over
 * @param payload only `defaultDelegateId` is required; the rest is inherited
 * @returns the SUCCESSOR under `record` (a new id — repoint local state at it)
 *   and the handed-over id under `replaced`
 * @throws {HelpdeskApiError} 422 when the new delegate is the current one, the
 *   owner, or ineligible; 409 when the record is cancelled or has ended
 */
export const replaceOutOfOffice = async (
  id: string,
  payload: ReplaceOutOfOfficePayload,
): Promise<ReplaceOutOfOfficeResult> => {
  const { data } = await pgRequest<ReplaceOutOfOfficeResult>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.OOO_REPLACE, { id }),
    data: payload,
  });
  return data;
};
