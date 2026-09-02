/**
 * The three cross-department admin reads: the controlled vocabularies, the role
 * catalogue and the permission catalogue.
 *
 * None of them is department-scoped and none changes while a user has the app
 * open, so all three are cached hard. That matters more here than elsewhere: the
 * whole `/admin/*` router shares one 60-request-per-minute budget per user, GETs
 * included, and a dashboard that re-fetched vocabularies per screen would spend
 * that budget on answers it already had.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getMetaEnums, listPermissions, listRoles } from "../../api/pg";
import { HELPDESK_PERMISSION, usePermissions } from "../../permissions";
import type {
  MetaEnumsResponse,
  PermissionRow,
  RoleRow,
} from "../../types/pg";
import { adminKeys } from "./queryKeys";

/**
 * Every controlled vocabulary, fetched once per session.
 *
 * Gated on `helpdesk.department.read` — the permission the endpoint itself
 * requires — so an EMPLOYEE never spends a request to be told 403. The query
 * simply idles for them, and `HelpdeskMetaProvider` renders the admin area away.
 *
 * @param enabled override the permission gate; the caller's own check is ANDed with it
 * @returns the vocabularies and the `conventions` block
 */
export const useMetaEnums = (
  enabled = true,
): UseQueryResult<MetaEnumsResponse, Error> => {
  const { has } = usePermissions();
  return useQuery({
    queryKey: adminKeys.meta(),
    queryFn: getMetaEnums,
    enabled: enabled && has(HELPDESK_PERMISSION.DEPARTMENT_READ),
    // A CHECK constraint does not change under a running session.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
};

/**
 * The role picker behind the member edit form.
 *
 * @param includePermissions attach each role's permission codes — only the
 *   permissions screen needs them, and asking for them on a picker fetches thirty
 *   codes per row to render six labels
 * @param enabled skip until the screen that needs it is open
 * @returns the roles
 */
export const useRoles = (
  includePermissions = false,
  enabled = true,
): UseQueryResult<RoleRow[], Error> => {
  const { has } = usePermissions();
  return useQuery({
    queryKey: adminKeys.roles(includePermissions),
    queryFn: () => listRoles(includePermissions),
    enabled: enabled && has(HELPDESK_PERMISSION.ROLE_READ),
    staleTime: 15 * 60_000,
  });
};

/**
 * The permission catalogue — what each code **means**, as opposed to `/auth/me`,
 * which says which ones the signed-in user **holds**.
 *
 * @param enabled skip until the permissions screen is open
 * @returns all 32 codes with their descriptions and `is_dangerous` flags
 */
export const useAdminPermissions = (
  enabled = true,
): UseQueryResult<PermissionRow[], Error> => {
  const { has } = usePermissions();
  return useQuery({
    queryKey: adminKeys.permissions(),
    queryFn: listPermissions,
    enabled: enabled && has(HELPDESK_PERMISSION.ROLE_READ),
    staleTime: 15 * 60_000,
  });
};
