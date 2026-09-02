/**
 * Department members.
 *
 * A member write can change who routing is able to select, so it invalidates the
 * routing subtree too: a rule naming somebody just made unassignable still reads
 * as healthy in a cached grid, which is the exact failure `warnings` exists to
 * report.
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
  getDepartmentUser,
  getUserImpact,
  listDepartmentUsers,
  offboardDepartmentUser,
  updateDepartmentUser,
  type AdminPage,
} from "../../api/pg";
import type {
  DepartmentUserFilters,
  DepartmentUserRow,
  OffboardUserBody,
  UpdateDepartmentUserBody,
  UserImpactResponse,
} from "../../types/pg";
import { adminKeys } from "./queryKeys";

/**
 * The member grid, and the source of every assignee and delegate picker.
 *
 * @param departmentId the department
 * @param filters search, status, role, `assignableOnly`, paging
 * @param enabled skip until the screen is open
 * @returns the page of members, `role_code` and `role_name` joined in
 */
export const useDepartmentUsers = (
  departmentId: string | null | undefined,
  filters?: DepartmentUserFilters,
  enabled = true,
): UseQueryResult<AdminPage<DepartmentUserRow>, Error> =>
  useQuery({
    queryKey: adminKeys.users(departmentId ?? "", filters),
    queryFn: () => listDepartmentUsers(departmentId as string, filters),
    enabled: enabled && Boolean(departmentId),
    placeholderData: keepPreviousData,
  });

/**
 * The people a ticket can actually land on — the routing engine's own predicate.
 *
 * Held apart from `useDepartmentUsers` so the picker's cache is not thrown away
 * every time the member grid changes a filter.
 *
 * @param departmentId the department
 * @param enabled skip until the picker is on screen
 * @returns assignable, active members
 */
export const useAssignableUsers = (
  departmentId: string | null | undefined,
  enabled = true,
): UseQueryResult<AdminPage<DepartmentUserRow>, Error> =>
  useDepartmentUsers(
    departmentId,
    { assignableOnly: true, limit: 200, sort: "full_name:asc" },
    enabled,
  );

/**
 * @param departmentId the department
 * @param userId the member, or null while no drawer is open
 * @returns the row and its `etag`
 */
export const useDepartmentUser = (
  departmentId: string | null | undefined,
  userId: string | null | undefined,
): UseQueryResult<DepartmentUserRow, Error> =>
  useQuery({
    queryKey: [...adminKeys.userLists(departmentId ?? ""), "detail", userId],
    queryFn: () => getDepartmentUser(departmentId as string, userId as string),
    enabled: Boolean(departmentId) && Boolean(userId),
  });

/**
 * What references this person. Writes nothing — call it when the edit drawer
 * opens, before anything is changed.
 *
 * @param departmentId the department
 * @param userId the member, or null while no drawer is open
 * @returns open tickets, rules, stages, leave, reports, headships, plus
 *   `transferSafe` — disable the department selector when it is false
 */
export const useUserImpact = (
  departmentId: string | null | undefined,
  userId: string | null | undefined,
): UseQueryResult<UserImpactResponse, Error> =>
  useQuery({
    queryKey: adminKeys.userImpact(departmentId ?? "", userId ?? ""),
    queryFn: () => getUserImpact(departmentId as string, userId as string),
    enabled: Boolean(departmentId) && Boolean(userId),
  });

/**
 * Invalidates what a member write can have moved.
 *
 * @param queryClient the client from `useQueryClient`
 * @param departmentId the department that was written
 */
const invalidateMembers = (
  queryClient: ReturnType<typeof useQueryClient>,
  departmentId: string,
): void => {
  queryClient.invalidateQueries({ queryKey: adminKeys.userLists(departmentId) });
  // Rules and ladders name people; who they can select just changed.
  queryClient.invalidateQueries({
    queryKey: adminKeys.routingRuleLists(departmentId),
  });
  queryClient.invalidateQueries({ queryKey: adminKeys.olaPolicyLists(departmentId) });
  // NO_ASSIGNABLE_USER is a readiness warning.
  queryClient.invalidateQueries({ queryKey: adminKeys.readiness(departmentId) });
};

/**
 * The activation verb, and the role / manager / designation edit.
 *
 * @returns a mutation taking `{ departmentId, userId, body, etag }`. The result
 *   carries `warnings` whenever the person became unselectable while rows still
 *   name them — render those prominently; nothing else will ever report it
 */
export const useUpdateDepartmentUser = (): UseMutationResult<
  DepartmentUserRow,
  Error,
  {
    departmentId: string;
    userId: string;
    body: UpdateDepartmentUserBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, userId, body, etag }) =>
      updateDepartmentUser(departmentId, userId, body, etag),
    onSuccess: (_row, { departmentId, userId }) => {
      invalidateMembers(queryClient, departmentId);
      queryClient.invalidateQueries({
        queryKey: adminKeys.userImpact(departmentId, userId),
      });
    },
  });
};

/**
 * Offboards a leaver. Nothing is reassigned — their open tickets stay with them
 * and routing simply stops selecting them.
 *
 * @returns a mutation taking `{ departmentId, userId, body, etag }`; on a count
 *   mismatch the 409 carries the real `details.openTickets`, and re-sending that
 *   number is the second half of a deliberate two-step confirmation
 */
export const useOffboardDepartmentUser = (): UseMutationResult<
  DepartmentUserRow,
  Error,
  {
    departmentId: string;
    userId: string;
    body: OffboardUserBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, userId, body, etag }) =>
      offboardDepartmentUser(departmentId, userId, body, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateMembers(queryClient, departmentId),
  });
};
