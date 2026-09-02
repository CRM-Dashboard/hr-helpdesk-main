/**
 * Admin surface — meta, departments, settings, features.
 *
 * These payloads are `snake_case`: they are raw configuration rows, unlike the
 * camelCase `/auth/me`. Request bodies are camelCase. The mismatch is the API's,
 * not a transcription slip — see §6 "Mixed casing" in the API documentation.
 *
 * Every row carries `etag`, which must be echoed as `If-Match` on the next write
 * to it. A missing `If-Match` is refused with 428, never treated as "overwrite".
 */
// The two out-of-office policies are the same vocabulary the department settings
// row defaults for, so they are defined once, beside the resource that uses them.
import type { OooActivationPolicy, OooExpiryPolicy } from "./outOfOffice";

// --- meta ------------------------------------------------------------------

/**
 * One controlled vocabulary. Keys and values are identical — `Object.values()`
 * builds the dropdown.
 */
export type Vocabulary = Record<string, string>;

/** Facts a CHECK constraint cannot express. */
export interface MetaConventions {
  severityRank: {
    /** `HIGHER_IS_MORE_SEVERE` today. Never assume it. */
    order: string;
    /** The direction to sort a priority list for "most urgent first". */
    sortForMostUrgentFirst: "ASC" | "DESC";
    note: string;
  };
}

/**
 * `GET /admin/meta/enums`. Fetch once when the admin area mounts and cache for
 * the session — a CHECK constraint does not change while a user has the app open,
 * and the admin rate limit is 60 requests a minute for the whole surface.
 */
export interface MetaEnumsResponse {
  vocabularies: Record<string, Vocabulary>;
  conventions: MetaConventions;
}

export type DepartmentStatus = "DRAFT" | "READY" | "ACTIVE" | "INACTIVE";

export type FeatureCode =
  | "EXTERNAL_INTAKE"
  | "EX_EMPLOYEE_INTAKE"
  | "OOO_DELEGATION"
  | "SNOOZE"
  | "COLLABORATION"
  | "AI_CLASSIFICATION";

// --- departments -----------------------------------------------------------

export interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  status: DepartmentStatus;
  /** Derived from `status` by a CHECK constraint — true only when ACTIVE. Never send it. */
  is_active: boolean;
  parent_department_id: string | null;
  head_user_id: string | null;
  support_email: string | null;
  business_calendar_id: string | null;
  default_priority_id: string | null;
  default_workflow_id: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  etag: string;
  /** Only on a `deactivate` response — the service adds it, no column holds it. */
  deactivation_reason?: string;
}

export interface DepartmentListFilters {
  status?: DepartmentStatus | DepartmentStatus[];
  search?: string;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  /** `code` | `name` | `status` | `created_at` | `updated_at`, with `:asc`/`:desc`. */
  sort?: string;
}

export interface CreateDepartmentBody {
  /** Immutable identity, rendered into ticket numbers as `{DEPT}`. `^[A-Z][A-Z0-9_]*$`. */
  code: string;
  name: string;
  supportEmail?: string | null;
  parentDepartmentId?: string | null;
}

/**
 * `code` and `status` are rejected with 422, not ignored: `code` is immutable
 * identity, and lifecycle moves only through `/activate` and `/deactivate`, so a
 * silent no-op would let a caller believe they had activated a department.
 */
export interface UpdateDepartmentBody {
  name?: string;
  supportEmail?: string | null;
  headUserId?: string | null;
  parentDepartmentId?: string | null;
  businessCalendarId?: string | null;
  defaultPriorityId?: string | null;
  defaultWorkflowId?: string | null;
}

export interface DeactivateDepartmentBody {
  /** Must equal the live open-ticket count. A mismatch answers 409 with the real number. */
  acknowledgeOpenTickets: number;
  reason?: string;
}

// --- readiness -------------------------------------------------------------

export type CheckSeverity = "BLOCKING" | "WARNING";

export interface ReadinessCheck {
  code: string;
  severity: CheckSeverity;
  passed: boolean;
  /** Present only when `passed` is false. */
  message?: string;
  /** Present only when failed and the check names a fix. */
  hint?: string;
}

/**
 * `GET …/readiness`. Always 200 — "not ready" is the answer, not an error.
 * Re-read after any configuration write: the department may have moved
 * DRAFT ⇄ READY on its own.
 */
export interface ReadinessResponse {
  /** True when no BLOCKING check failed. Warnings never block. */
  ready: boolean;
  status: DepartmentStatus;
  blocking: number;
  warnings: number;
  checks: ReadinessCheck[];
}

// --- settings --------------------------------------------------------------

export type TicketNumberReset = "NEVER" | "YEARLY" | "MONTHLY";
export type AssignmentStrategy = "RULE_BASED" | "MANUAL";
export type OlaStartTrigger = "ON_CREATE" | "ON_ASSIGN";
export type ReopenAction = "REOPEN_SAME_TICKET" | "NEW_LINKED_TICKET";

export interface DepartmentSettingsRow {
  department_id: string;
  ticket_number_format: string;
  ticket_number_reset: TicketNumberReset;
  require_category: boolean;
  require_subcategory: boolean;
  assignment_strategy: AssignmentStrategy;
  auto_assign_on_create: boolean;
  /** `null` means uncapped — a real setting, not an absent one. */
  max_open_tickets_per_user: number | null;
  ola_start_trigger: OlaStartTrigger;
  auto_close_days: number;
  auto_close_warning_days: number;
  reopen_window_days: number;
  reopen_within_window_action: ReopenAction;
  ex_employee_window_days: number;
  ooo_activation_policy: OooActivationPolicy;
  ooo_expiry_policy: OooExpiryPolicy;
  max_delegation_depth: number;
  snooze_max_working_minutes: number;
  snooze_max_count: number;
  attachment_max_mb: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  etag: string;
}

/** camelCase, `.strict()`, at least one field. Send only what changed. */
export interface UpdateSettingsBody {
  /** 1–60 chars and **must contain `{SEQ}`**. Only `{DEPT} {YYYY} {YY} {MM} {SEQ}` substitute. */
  ticketNumberFormat?: string;
  ticketNumberReset?: TicketNumberReset;
  requireCategory?: boolean;
  requireSubcategory?: boolean;
  assignmentStrategy?: AssignmentStrategy;
  autoAssignOnCreate?: boolean;
  maxOpenTicketsPerUser?: number | null;
  olaStartTrigger?: OlaStartTrigger;
  autoCloseDays?: number;
  /** Must be strictly less than `autoCloseDays` — checked against the merged row. */
  autoCloseWarningDays?: number;
  reopenWindowDays?: number;
  reopenWithinWindowAction?: ReopenAction;
  exEmployeeWindowDays?: number;
  oooActivationPolicy?: OooActivationPolicy;
  oooExpiryPolicy?: OooExpiryPolicy;
  maxDelegationDepth?: number;
  snoozeMaxWorkingMinutes?: number;
  snoozeMaxCount?: number;
  attachmentMaxMb?: number;
}

// --- features --------------------------------------------------------------

/** Per-code knobs. Every schema is `.strict()` — an unknown key is rejected, not stripped. */
export interface FeatureConfig {
  /** AI_CLASSIFICATION, 0–1. */
  confidenceThreshold?: number;
  /** AI_CLASSIFICATION. */
  model?: string;
  /** EXTERNAL_INTAKE — lower-cased, max 100 entries. */
  allowedDomains?: string[];
}

export interface FeatureRow {
  department_id: string;
  feature_code: FeatureCode;
  /** A missing row means `false`. */
  is_enabled: boolean;
  config: FeatureConfig;
  /** Stamped only on a genuine false → true transition. */
  enabled_at: string | null;
  disabled_at: string | null;
  created_at?: string;
  created_by?: string | null;
  updated_at?: string;
  updated_by?: string | null;
  /** Absent when `exists` is false — there is no row to hold a token. */
  etag?: string;
  /**
   * Synthesised by the API, not a column. `false` means no row exists, so the
   * save action is POST rather than PATCH.
   */
  exists: boolean;
}

export interface CreateFeatureBody {
  featureCode: FeatureCode;
  isEnabled?: boolean;
  config?: FeatureConfig;
}

/** `config` **replaces** the stored object rather than merging — send it whole. */
export interface UpdateFeatureBody {
  isEnabled?: boolean;
  config?: FeatureConfig;
}
