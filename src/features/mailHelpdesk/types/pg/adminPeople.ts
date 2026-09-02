/**
 * Admin surface — department members, roles and the permission catalogue.
 *
 * There is no `POST /users`, and there must not be one: people arrive from the
 * SAP employee sync or by auto-provision on first sign-in. "Activate a member so
 * tickets land on them" is a `PATCH` on the two columns the routing engine reads
 * (`is_assignable` and `status`), which is why the screen is Invite/Activate and
 * not Create User.
 */
import type { RoleCode } from "./identity";

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "OFFBOARDED";
export type UserType = "EMPLOYEE" | "SERVICE" | "SYSTEM";

export interface DepartmentUserRow {
  id: string;
  employee_code: string | null;
  email: string;
  full_name: string;
  designation: string | null;
  department_id: string;
  role_id: string;
  /** Joined in, so a list needs no second request per row. */
  role_code: RoleCode;
  role_name: string;
  manager_user_id: string | null;
  location_code: string | null;
  user_type: UserType;
  status: UserStatus;
  /** Half of "can a ticket land on them"; `status === "ACTIVE"` is the other half. */
  is_assignable: boolean;
  offboarded_at: string | null;
  last_login_at: string | null;
  deleted_at: string | null;
  etag: string;
  /** Present on a PATCH response. */
  impact?: UserImpact;
  /**
   * Present on a PATCH response. Populated when the person became unselectable
   * while rows still name them. Nothing else will ever report this — render it.
   */
  warnings?: string[];
}

export interface DepartmentUserFilters {
  search?: string;
  status?: UserStatus | UserStatus[];
  roleCode?: RoleCode | RoleCode[];
  /**
   * Applies `is_assignable AND status = 'ACTIVE'` — the routing engine's own
   * predicate. Use it for every assignee and delegate picker.
   */
  assignableOnly?: boolean;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface UserImpact {
  openTickets: number;
  routingRules: Array<{
    id: string;
    version_no: number;
    department_id: string;
    /** `primary` · `backup` · `escalation`. */
    role: string;
  }>;
  olaStages: Array<{ policy_id: string; stage_no: number; stage_code: string }>;
  outOfOffice: Array<{
    id: string;
    /** `absentee` · `delegate`. */
    role: string;
    starts_at: string;
    ends_at: string;
  }>;
  directReports: number;
  headsDepartments: Array<{ id: string; code: string }>;
}

/** `GET …/users/:userId/impact` — writes nothing. Call it before the edit drawer opens. */
export interface UserImpactResponse {
  user: DepartmentUserRow;
  /** False when a department transfer would strand something. Disable the selector. */
  transferSafe: boolean;
  impact: UserImpact;
}

/**
 * `.strict()`, at least one field.
 *
 * `email`, `employeeCode` and `azureObjectId` are rejected with 422 — the first
 * is the identity key `auth.middleware` matches on, the other two are owned by
 * the SAP sync. `status: "OFFBOARDED"` is rejected too, naming the verb instead.
 */
export interface UpdateDepartmentUserBody {
  isAssignable?: boolean;
  status?: Exclude<UserStatus, "OFFBOARDED">;
  roleId?: string;
  managerUserId?: string | null;
  designation?: string | null;
  /** `SUPER_ADMIN` only, and refused unless `transferSafe`. */
  departmentId?: string;
}

export interface OffboardUserBody {
  /** Must equal the live count. Nothing is reassigned — that is why it is acknowledged. */
  acknowledgeOpenTickets: number;
  reason?: string;
}

// --- roles and permissions (platform-wide, read-only) ----------------------

export interface RoleRow {
  id: string;
  code: RoleCode;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  permission_count: number;
  /** `null` unless `?includePermissions=true`. */
  permissions: string[] | null;
}

export interface PermissionRow {
  id: string;
  module: string;
  code: string;
  description: string;
  /** Six are dangerous. Render those behind a confirmation step. */
  is_dangerous: boolean;
  held_by: RoleCode[];
}
