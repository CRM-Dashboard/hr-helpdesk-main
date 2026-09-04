/**
 * Directory — the collaboration participant picker.
 *
 * `POST /tickets/:id/collaborations` takes `participants[].userId`, so something
 * has to turn a person into a uuid. These two reads are that something, and they
 * are the **only** endpoints in the module that are not department-scoped: they
 * are mounted above `scopeToDepartment`, so neither will ever answer
 * `CROSS_DEPARTMENT`. Collaboration exists to reach somebody this department does
 * not employ, which makes department scoping fatal rather than protective here.
 * The agent-role gate stands in its place — only the roles that can open a
 * collaboration can read the directory that feeds one.
 *
 * Rows are `snake_case`, like `GET /tickets` and the admin lists.
 *
 * This is not a general people search. An assignee or delegate picker must stay
 * on the department-scoped `/admin/departments/:id/users`, whose `assignableOnly`
 * is the routing engine's own predicate.
 */
import type { RoleCode } from "./identity";
import type { DepartmentStatus } from "./admin";

/**
 * One department, as the picker needs it. A narrower row than the admin
 * `DepartmentRow` — no configuration ids and, deliberately, no `etag`: nothing
 * here is writable.
 */
export interface DirectoryDepartmentRow {
  id: string;
  code: string;
  name: string;
  /** Lifecycle, for labelling. A DRAFT department's staff are perfectly real. */
  status: DepartmentStatus;
  is_active: boolean;
  support_email: string | null;
  /** So an empty team is visible before the click. */
  invitable_user_count: number;
  /** Always a boolean, never null. */
  is_own_department: boolean;
}

export interface DirectoryDepartmentFilters {
  search?: string;
  /**
   * There is no default. Nothing about inviting somebody requires their
   * department to be running a helpdesk of its own, so ask for `ACTIVE` only when
   * live departments are genuinely what you want.
   */
  status?: DepartmentStatus | DepartmentStatus[];
  page?: number;
  limit?: number;
  /** `code` | `name` | `status` | `created_at`, with `:asc`/`:desc`. */
  sort?: string;
}

/** One person, with their department joined in so a chip survives a filter change. */
export interface DirectoryUserRow {
  id: string;
  full_name: string;
  email: string;
  employee_code: string | null;
  designation: string | null;
  department_id: string;
  department_code: string;
  department_name: string;
  role_id: string;
  role_code: RoleCode;
  role_name: string;
  /** The closest thing to "works tickets". Not a filter a picker should apply. */
  is_assignable: boolean;
}

export interface DirectoryUserFilters {
  /**
   * **Optional, and omitting it is the contract rather than an oversight** — it
   * means every department, which is what makes `search` a name lookup across the
   * business. Pass it once the user has picked a team. An id that does not exist
   * is a 404, never an empty page.
   */
  departmentId?: string;
  search?: string;
  roleCode?: RoleCode | RoleCode[];
  assignableOnly?: boolean;
  page?: number;
  limit?: number;
  /** `full_name` | `email` | `employee_code` | `designation`, with `:asc`/`:desc`. */
  sort?: string;
}
