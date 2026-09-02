/**
 * Admin — department members, roles and the permission catalogue.
 *
 * There is no create verb and no delete verb. A member is activated with a
 * `PATCH` on `is_assignable` + `status`, and a leaver is `POST …/offboard`.
 */
import { PG_ENDPOINT, pgPath } from "@/services/endPoints";
import { pgQuery, pgRequest } from "@/services/pgClient";
import type {
  DepartmentUserFilters,
  DepartmentUserRow,
  OffboardUserBody,
  PermissionRow,
  RoleRow,
  UpdateDepartmentUserBody,
  UserImpactResponse,
} from "../../types/pg";
import { ifMatch, type AdminPage } from "./adminShared";

/**
 * The member list; also the assignee picker and the OOO delegate picker.
 *
 * `assignableOnly` applies `is_assignable AND status = 'ACTIVE'` — the routing
 * engine's own predicate — so the result is exactly the set
 * `findEligibleCandidate` will choose from.
 *
 * @param departmentId the department
 * @param filters search, status, role, `assignableOnly`, paging
 * @returns the page of members, `role_code` and `role_name` joined in
 */
export const listDepartmentUsers = async (
  departmentId: string,
  filters?: DepartmentUserFilters,
): Promise<AdminPage<DepartmentUserRow>> => {
  const { data, meta } = await pgRequest<DepartmentUserRow[]>({
    method: "GET",
    url: `${pgPath(PG_ENDPOINT.ADMIN_USERS, { departmentId })}${pgQuery(filters)}`,
  });
  return { rows: data, meta };
};

/**
 * @param departmentId the department
 * @param userId the member
 * @returns the row, with the `etag` needed to modify it
 */
export const getDepartmentUser = async (
  departmentId: string,
  userId: string,
): Promise<DepartmentUserRow> => {
  const { data } = await pgRequest<DepartmentUserRow>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_USER, { departmentId, userId }),
  });
  return data;
};

/**
 * What references this person. **Writes nothing** — call it when the edit drawer
 * opens, before anything is changed, and disable the department selector when
 * `transferSafe` is false.
 *
 * @param departmentId the department
 * @param userId the member
 * @returns open tickets, routing rules, OLA stages, leave, reports and headships
 */
export const getUserImpact = async (
  departmentId: string,
  userId: string,
): Promise<UserImpactResponse> => {
  const { data } = await pgRequest<UserImpactResponse>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_USER_IMPACT, { departmentId, userId }),
  });
  return data;
};

/**
 * The activation verb: flips the two columns the routing engine reads, and
 * carries role, manager and designation changes too.
 *
 * Role and assignability changes are **reported, never refused** — demoting a
 * SPOC named on three routing rules is legitimate, but afterwards those rules
 * point at somebody routing can no longer select and there is no error to attach
 * that to. The response's `warnings` is the only moment anyone is looking, so
 * render it prominently after a successful save.
 *
 * @param departmentId the department
 * @param userId the member
 * @param body at least one field; `email`, `employeeCode` and
 *   `status: "OFFBOARDED"` are refused with 422
 * @param etag the row's current token
 * @returns the updated row, carrying `impact` and `warnings`
 * @throws {HelpdeskApiError} 409 when a department transfer would strand work
 */
export const updateDepartmentUser = async (
  departmentId: string,
  userId: string,
  body: UpdateDepartmentUserBody,
  etag: string,
): Promise<DepartmentUserRow> => {
  const { data } = await pgRequest<DepartmentUserRow>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.ADMIN_USER, { departmentId, userId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * Offboards a leaver: `status = 'OFFBOARDED'`, `offboarded_at` stamped and
 * `is_assignable` cleared in one statement.
 *
 * **Nothing is reassigned.** Open tickets stay with the person and routing simply
 * stops selecting them — which is why the count must be acknowledged. Never
 * pre-fill it from a stale read; a mismatch is the guard doing its job.
 *
 * @param departmentId the department
 * @param userId the member
 * @param body `acknowledgeOpenTickets` must equal the live count
 * @param etag the row's current token
 * @returns the offboarded row
 * @throws {HelpdeskApiError} 409 on a count mismatch (`details.openTickets` holds
 *   the real number), on an already-offboarded person, or on offboarding yourself
 */
export const offboardDepartmentUser = async (
  departmentId: string,
  userId: string,
  body: OffboardUserBody,
  etag: string,
): Promise<DepartmentUserRow> => {
  const { data } = await pgRequest<DepartmentUserRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_USER_OFFBOARD, { departmentId, userId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

// --- roles and permissions -------------------------------------------------

/**
 * The picker behind `updateDepartmentUser({ roleId })`. Platform-wide: a role
 * says *what*, `users.department_id` says *where*.
 *
 * @param includePermissions add each role's permission codes — a picker does not
 *   need thirty codes on each of six rows, so it defaults off
 * @returns the roles
 */
export const listRoles = async (includePermissions = false): Promise<RoleRow[]> => {
  const { data } = await pgRequest<RoleRow[]>({
    method: "GET",
    url: `${PG_ENDPOINT.ADMIN_ROLES}${pgQuery({ includePermissions: includePermissions || undefined })}`,
  });
  return data;
};

/**
 * The permission catalogue. `/auth/me` says which codes the signed-in user
 * **holds**; this says what they **mean**, so a permissions screen renders from
 * the database rather than from a hardcoded list that drifts from the seed.
 *
 * @returns all 32 codes, six of them flagged `is_dangerous`
 */
export const listPermissions = async (): Promise<PermissionRow[]> => {
  const { data } = await pgRequest<PermissionRow[]>({
    method: "GET",
    url: PG_ENDPOINT.ADMIN_PERMISSIONS,
  });
  return data;
};
