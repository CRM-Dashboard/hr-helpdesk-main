/**
 * Department-wide out of office.
 *
 * Every write here can move tickets — creating and activating sweep, cancelling
 * reverts — so the ticket queue is invalidated alongside the roster, and so is the
 * self-service subtree: the person whose leave was just filed may be looking at
 * their own screen.
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
  activateDepartmentOutOfOffice,
  cancelDepartmentOutOfOffice,
  createDepartmentOutOfOffice,
  listDepartmentOutOfOffice,
  replaceDepartmentOutOfOffice,
  type AdminPage,
} from "../../api/pg";
import type {
  ActivateOutOfOfficeResult,
  AdminCreateOutOfOfficePayload,
  AdminOutOfOfficeFilters,
  CancelOutOfOfficePayload,
  CancelOutOfOfficeResult,
  CreateOutOfOfficeResult,
  OutOfOfficeListRow,
  ReplaceOutOfOfficePayload,
  ReplaceOutOfOfficeResult,
} from "../../types/pg";
import { adminKeys, helpdeskKeys } from "./queryKeys";

/** Keyed under the department, so switching scope cannot show the wrong roster. */
const oooKey = (departmentId: string, filters?: unknown) =>
  [...adminKeys.department(departmentId), "ooo", filters ?? {}] as const;

/** Prefix matching every department roster query, whatever its filters. */
export const departmentOooKey = (departmentId: string) =>
  [...adminKeys.department(departmentId), "ooo"] as const;

/**
 * Who is away in the department, and who is covering them.
 *
 * @param departmentId the department
 * @param filters `userId`, `delegateId`, `activeOnly`, `includeCancelled`, paging
 * @param enabled skip until the permission is known
 * @returns the page of arrangements
 */
export const useDepartmentOutOfOffice = (
  departmentId: string | null | undefined,
  filters?: AdminOutOfOfficeFilters,
  enabled = true,
): UseQueryResult<AdminPage<OutOfOfficeListRow>, Error> =>
  useQuery({
    queryKey: oooKey(departmentId ?? "", filters),
    queryFn: () => listDepartmentOutOfOffice(departmentId as string, filters),
    enabled: enabled && Boolean(departmentId),
    placeholderData: keepPreviousData,
  });

/**
 * Invalidates everything a cover write can have moved.
 *
 * @param queryClient the client from `useQueryClient`
 * @param departmentId the department that was written
 */
const invalidateCover = (
  queryClient: ReturnType<typeof useQueryClient>,
  departmentId: string,
): void => {
  queryClient.invalidateQueries({ queryKey: departmentOooKey(departmentId) });
  // The same records reach the person's own self-service screen.
  queryClient.invalidateQueries({ queryKey: helpdeskKeys.ooo() });
  // A window that is already open sweeps assignments in the same transaction.
  queryClient.invalidateQueries({ queryKey: helpdeskKeys.tickets() });
};

/**
 * Files leave for a colleague.
 *
 * @returns a mutation taking `{ departmentId, payload }`; `delegated` says how
 *   many tickets moved right now, and `warning` means the delegate is themselves
 *   away — advisory, not a failure
 */
export const useCreateDepartmentOutOfOffice = (): UseMutationResult<
  CreateOutOfOfficeResult,
  Error,
  { departmentId: string; payload: AdminCreateOutOfOfficePayload }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, payload }) =>
      createDepartmentOutOfOffice(departmentId, payload),
    onSuccess: (_r, { departmentId }) => invalidateCover(queryClient, departmentId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, id }`; a 409 means the scheduler or
 *   another tab claimed it first, and the refetch shows that
 */
export const useActivateDepartmentOutOfOffice = (): UseMutationResult<
  ActivateOutOfOfficeResult,
  Error,
  { departmentId: string; id: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, id }) =>
      activateDepartmentOutOfOffice(departmentId, id),
    onSettled: (_r, _e, { departmentId }) =>
      invalidateCover(queryClient, departmentId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, id, payload }`; read `mode` off the
 *   result rather than assuming the RETURNED default
 */
export const useCancelDepartmentOutOfOffice = (): UseMutationResult<
  CancelOutOfOfficeResult,
  Error,
  { departmentId: string; id: string; payload?: CancelOutOfOfficePayload }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, id, payload }) =>
      cancelDepartmentOutOfOffice(departmentId, id, payload),
    onSettled: (_r, _e, { departmentId }) =>
      invalidateCover(queryClient, departmentId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, id, payload }`; `record` is the
 *   SUCCESSOR with a new id, and `replaced` is the record handed over
 */
export const useReplaceDepartmentOutOfOffice = (): UseMutationResult<
  ReplaceOutOfOfficeResult,
  Error,
  { departmentId: string; id: string; payload: ReplaceOutOfOfficePayload }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, id, payload }) =>
      replaceDepartmentOutOfOffice(departmentId, id, payload),
    onSuccess: (_r, { departmentId }) => invalidateCover(queryClient, departmentId),
  });
};
