/**
 * Out-of-office queries and writes.
 *
 * The whole surface is caller-scoped, so there is nothing to key by user: one
 * `helpdeskKeys.ooo()` subtree covers "my leave" and "what I am covering", and
 * every write invalidates the lot. A write can move tickets — `create` and
 * `activate` sweep, `cancel` reverts — so the ticket queue is invalidated too.
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  isHelpdeskApiError,
  PG_ERROR_CODE,
  type PgPageMeta,
} from "@/services/pgClient";
import {
  activateOutOfOffice,
  cancelOutOfOffice,
  createOutOfOffice,
  getOutOfOffice,
  listDepartmentUsers,
  listOutOfOffice,
  listTickets,
  replaceOutOfOffice,
} from "../../api/pg";
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
import { helpdeskKeys } from "./queryKeys";

export interface OutOfOfficePage {
  rows: OutOfOfficeListRow[];
  meta?: PgPageMeta;
}

/** Someone who can be offered as a delegate. */
export interface DelegateCandidate {
  id: string;
  name: string;
  email?: string;
  /** Designation, or the role name when there is none. */
  detail?: string | null;
}

/**
 * The candidates, and where they came from. `queue` means the roster was
 * refused and these are the people currently holding tickets — a narrower set,
 * which the screen must say out loud rather than pass off as the roster.
 */
export interface DelegateCandidateList {
  source: "roster" | "queue";
  candidates: DelegateCandidate[];
}

/**
 * The fallback list: distinct assignees on one page of the queue.
 *
 * 200 is the API's ceiling. One page of recent work names everyone actively
 * carrying tickets; going deeper would cost pages for names that are, by
 * definition, no longer active.
 *
 * @returns distinct assignees, by name
 */
const candidatesFromQueue = async (): Promise<DelegateCandidate[]> => {
  const { data } = await listTickets({
    limit: 200,
    sort: "last_activity_at:desc",
  });

  const byId = new Map<string, DelegateCandidate>();
  for (const row of data) {
    if (!row.assigned_to_user_id) continue;
    if (byId.has(row.assigned_to_user_id)) continue;
    byId.set(row.assigned_to_user_id, {
      id: row.assigned_to_user_id,
      name: row.assigned_to_name || row.assigned_to_user_id,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * My leave, or what I am covering.
 *
 * @param filters `covering`, `activeOnly`, `includeCancelled`, paging, sort
 * @param enabled skip the call until the identity and permission are known
 * @returns the rows — the only shape carrying a server-computed `status` — and
 *   the pagination meta
 */
export const useOutOfOfficeList = (
  filters?: OutOfOfficeListFilters,
  enabled = true,
): UseQueryResult<OutOfOfficePage, Error> =>
  useQuery({
    queryKey: helpdeskKeys.oooList(filters),
    queryFn: async () => {
      const { data, meta } = await listOutOfOffice(filters);
      return { rows: data, meta };
    },
    enabled,
    placeholderData: keepPreviousData,
  });

/**
 * One of my own records, with both people's eligibility resolved.
 *
 * Reach for this when a screen needs `delegate_is_assignable` — the list does
 * not carry it, just as the detail read does not carry `status`.
 *
 * @param id the record's uuid, or null when nothing is open
 * @returns the record; the query idles while `id` is empty
 */
export const useOutOfOffice = (
  id: string | null | undefined,
): UseQueryResult<OutOfOfficeRecord, Error> =>
  useQuery({
    queryKey: helpdeskKeys.oooDetail(id ?? ""),
    queryFn: () => getOutOfOffice(id as string),
    enabled: Boolean(id),
  });

/**
 * Invalidates everything an out-of-office write can have changed.
 *
 * @param queryClient the client from `useQueryClient`
 */
const invalidateOoo = (
  queryClient: ReturnType<typeof useQueryClient>,
): void => {
  queryClient.invalidateQueries({ queryKey: helpdeskKeys.ooo() });
  // A window that is already open sweeps assignments in the same transaction.
  queryClient.invalidateQueries({ queryKey: helpdeskKeys.tickets() });
};

/**
 * Files my own leave.
 *
 * @returns a mutation taking the create payload; `delegated` on the result is
 *   how many tickets moved right now, and `warning` means the delegate is
 *   themselves away — advisory, not a failure
 */
export const useCreateOutOfOffice = (): UseMutationResult<
  CreateOutOfOfficeResult,
  Error,
  CreateOutOfOfficePayload
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOutOfOfficePayload) =>
      createOutOfOffice(payload),
    onSuccess: () => invalidateOoo(queryClient),
  });
};

/**
 * Turns a MANUAL window on.
 *
 * @returns a mutation taking the record id; a 409 means the scheduler or
 *   another tab claimed it first, and the refetch shows that
 */
export const useActivateOutOfOffice = (): UseMutationResult<
  ActivateOutOfOfficeResult,
  Error,
  string
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateOutOfOffice(id),
    onSettled: () => invalidateOoo(queryClient),
  });
};

/**
 * Ends a window early. The mode decides whether the delegated tickets come home.
 *
 * @returns a mutation taking `{ id, payload }`; read `mode` off the result
 *   rather than assuming the RETURNED default
 */
export const useCancelOutOfOffice = (): UseMutationResult<
  CancelOutOfOfficeResult,
  Error,
  { id: string; payload?: CancelOutOfOfficePayload }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload?: CancelOutOfOfficePayload;
    }) => cancelOutOfOffice(id, payload),
    onSettled: () => invalidateOoo(queryClient),
  });
};

/**
 * Swaps the delegate. This is the edit verb — there is no PATCH.
 *
 * @returns a mutation taking `{ id, payload }`; `record` is the SUCCESSOR with
 *   a new id, and `replaced` is the record that was handed over
 */
export const useReplaceOutOfOffice = (): UseMutationResult<
  ReplaceOutOfOfficeResult,
  Error,
  { id: string; payload: ReplaceOutOfOfficePayload }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: ReplaceOutOfOfficePayload;
    }) => replaceOutOfOffice(id, payload),
    onSuccess: () => invalidateOoo(queryClient),
  });
};

/**
 * People who can be offered as a delegate.
 *
 * The department roster filtered by `assignableOnly`, which applies
 * `is_assignable AND status = 'ACTIVE'` server-side. That is the right predicate
 * and not merely a convenient one: a delegate who cannot receive tickets makes
 * the arrangement a no-op, and the create verb would accept it and then move
 * nothing.
 *
 * Reading the roster needs `helpdesk.user.read`, which not every role holding
 * `helpdesk.ooo.write` also holds. Rather than presenting an empty picker to
 * someone who is perfectly entitled to file leave, a refusal falls back to the
 * names this client can always obtain — the assignees on the queue. The screen
 * is told which list it is showing, because the two are not the same set.
 *
 * @param departmentId whose roster to read; the caller's own department
 * @param excludeUserId the caller — a person cannot be their own delegate
 * @param enabled skip the call until the identity is known
 * @returns the candidates by name, and which source produced them
 */
export const useDelegateCandidates = (
  departmentId: string | null | undefined,
  excludeUserId?: string | null,
  enabled = true,
): UseQueryResult<DelegateCandidateList, Error> =>
  useQuery({
    queryKey: helpdeskKeys.delegateCandidates(departmentId ?? ""),
    queryFn: async (): Promise<DelegateCandidateList> => {
      try {
        const { rows } = await listDepartmentUsers(departmentId as string, {
          assignableOnly: true,
          limit: 200,
          sort: "full_name:asc",
        });
        return {
          source: "roster",
          candidates: rows.map((row) => ({
            id: row.id,
            name: row.full_name,
            email: row.email,
            detail: row.designation || row.role_name,
          })),
        };
      } catch (error) {
        const denied =
          isHelpdeskApiError(error) &&
          (error.code === PG_ERROR_CODE.FORBIDDEN ||
            error.code === PG_ERROR_CODE.CROSS_DEPARTMENT);
        if (!denied) throw error;
        return { source: "queue", candidates: await candidatesFromQueue() };
      }
    },
    enabled: enabled && Boolean(departmentId),
    // Who is assignable changes when an administrator says so, which is rare.
    staleTime: 5 * 60_000,
    select: (result: DelegateCandidateList) =>
      excludeUserId
        ? {
            ...result,
            candidates: result.candidates.filter(
              (row) => row.id !== excludeUserId,
            ),
          }
        : result,
  });
