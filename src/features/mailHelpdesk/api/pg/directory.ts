/**
 * Directory reads — the collaboration participant picker.
 *
 * The two endpoints in the module that are **not** department-scoped. Mounted
 * above `scopeToDepartment` alongside `/auth` and `/admin`, so neither can return
 * `CROSS_DEPARTMENT`: a picker whose whole purpose is reaching another team
 * cannot be scoped to this one. The agent-role gate replaces it.
 *
 * Both are reads, both paginate in `meta`, and neither carries an `etag` — there
 * is nothing here to write.
 */
import { PG_ENDPOINT } from "@/services/endPoints";
import { pgQuery, pgRequest } from "@/services/pgClient";
import type {
  DirectoryDepartmentFilters,
  DirectoryDepartmentRow,
  DirectoryUserFilters,
  DirectoryUserRow,
} from "../../types/pg";
import type { AdminPage } from "./adminShared";

/**
 * Every non-deleted department, the caller's own first whatever the sort.
 *
 * No `status` filter is applied by default, on purpose: a collaboration
 * participant is a person plus an in-app notification, and a `DRAFT`
 * department's staff are perfectly real. Pass `status: "ACTIVE"` only when live
 * departments are genuinely what is wanted.
 *
 * @param filters search, status, paging and sort
 * @returns the page of departments, each carrying `invitable_user_count` so an
 *   empty team is visible before the click
 * @throws {HelpdeskApiError} 403 when the caller holds no agent role
 */
export const listDirectoryDepartments = async (
  filters?: DirectoryDepartmentFilters,
): Promise<AdminPage<DirectoryDepartmentRow>> => {
  const { data, meta } = await pgRequest<DirectoryDepartmentRow[]>({
    method: "GET",
    url: `${PG_ENDPOINT.DIRECTORY_DEPARTMENTS}${pgQuery(filters)}`,
  });
  return { rows: data, meta };
};

/**
 * People who can be invited onto a collaboration, in any department.
 *
 * Three filters are always applied server-side and are not ours to relax:
 * `status = 'ACTIVE'`, `deleted_at IS NULL` and `user_type = 'EMPLOYEE'` — an
 * invitation to somebody suspended or offboarded is one nobody answers, and a
 * service principal cannot reply to a collaboration mail at all. So every row
 * that comes back is invitable, and there is no client-side status filtering to
 * do.
 *
 * Neither the caller nor the people already invited on the ticket are excluded;
 * filter those out against `listCollaborations`, which the ticket has already
 * fetched.
 *
 * @param filters `departmentId` (optional — omitting it searches every
 *   department), search, roleCode, paging and sort
 * @returns the page of people, their department joined in
 * @throws {HelpdeskApiError} 403 when the caller holds no agent role; 404 for a
 *   `departmentId` that does not exist — "nobody works there" and "that
 *   department does not exist" are different answers
 */
export const listDirectoryUsers = async (
  filters?: DirectoryUserFilters,
): Promise<AdminPage<DirectoryUserRow>> => {
  const { data, meta } = await pgRequest<DirectoryUserRow[]>({
    method: "GET",
    url: `${PG_ENDPOINT.DIRECTORY_USERS}${pgQuery(filters)}`,
  });
  return { rows: data, meta };
};
