/**
 * `GET /auth/me` — the only source of the department's workflow vocabulary.
 * This payload is camelCase; the ticket payloads are not. See ./ticket.ts.
 */

export type RoleCode =
  | "EMPLOYEE"
  | "SPOC"
  | "MANAGER"
  | "DEPT_ADMIN"
  | "DEPT_HEAD"
  | "SUPER_ADMIN";

/** Roles the API accepts on a ticket write verb. Everyone else gets a 403. */
export const AGENT_ROLES: readonly RoleCode[] = [
  "SPOC",
  "MANAGER",
  "DEPT_ADMIN",
  "DEPT_HEAD",
  "SUPER_ADMIN",
];

export type StateCategory = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";

export type AuthMode = "header" | "jwt";

/**
 * One state in the department's workflow. There is deliberately no `id`: a
 * state's uuid belongs to one workflow version, so `code` is the identifier
 * and the value to send as `?state=`.
 */
export interface WorkflowState {
  code: string;
  name: string;
  category: StateCategory;
  isInitial: boolean;
  isResolved: boolean;
  isClosed: boolean;
  isTerminal: boolean;
  countsAsActiveWorkload: boolean;
  displayOrder: number;
}

export interface HelpdeskUser {
  id: string;
  email: string;
  fullName: string;
  /** null means the account is attached to no department — every /tickets call 403s. */
  departmentId: string | null;
  roleId: string;
  roleCode: RoleCode;
  managerUserId: string | null;
  /** Whether this user can receive tickets. Auto-provisioned users cannot. */
  isAssignable: boolean;
  /** Drive the admin menu from this array, not from `roleCode`. */
  permissions: string[];
}

export interface MeResponse {
  user: HelpdeskUser;
  authMode: AuthMode;
  /** Empty when `user.departmentId` is null. A requester sees a filtered list. */
  workflowStates: WorkflowState[];
}

/** `GET /health` — anonymous boot probe. */
export interface HealthResponse {
  database?: string;
  schema?: string;
  table_count?: number;
  latencyMs?: number;
}
