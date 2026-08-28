/**
 * Out-of-office ("who covers my work while I am away") on the PostgreSQL
 * helpdesk API.
 *
 * Rows are snake_case, like every other raw row in this module; request bodies
 * are camelCase. There is **no `PATCH`** — the table carries no `updated_at`,
 * so it has no concurrency token and a delegate change is
 * `POST /:id/replace` (cancel + create in one transaction).
 */

export type OooReason = "LEAVE" | "TRAVEL" | "TRAINING" | "OTHER";

/**
 * What the window does to work.
 * - `NEW_TICKETS_ONLY` — routing sends new tickets to the delegate.
 * - `ALL_ACTIVE_TICKETS` — as above, plus a one-off sweep of what is already open.
 * - `MANUAL` — inert until `POST /:id/activate` stamps `applied_at`.
 */
export type OooActivationPolicy =
  | "NEW_TICKETS_ONLY"
  | "ALL_ACTIVE_TICKETS"
  | "MANUAL";

/** What happens to delegated tickets when the window ends. */
export type OooExpiryPolicy = "KEEP_DELEGATE" | "RETURN_TO_OWNER";

/**
 * How a window was ended early.
 * - `RETURNED` — the person is back: `expiry_policy` is applied now.
 * - `HANDOVER` — cover ends without settling; the delegate keeps what they hold.
 */
export type OooCancelMode = "RETURNED" | "HANDOVER";

/**
 * Derived from the five timestamps, never stored. The list endpoint computes it;
 * the detail read and every write response do not — use `deriveOooStatus`.
 */
export type OooStatus =
  | "CANCELLED"
  | "ENDED"
  | "EXPIRING"
  | "SCHEDULED"
  | "AWAITING_ACTIVATION"
  | "ACTIVE";

/** A `user_out_of_office` row, plus the two people both read shapes resolve. */
export interface OutOfOfficeRow {
  id: string;
  /** Whose leave. */
  user_id: string;
  /** Stored, not derived: moving the owner mid-leave cannot move the arrangement. */
  department_id: string;
  starts_at: string;
  ends_at: string;
  /** Who covers. Never the owner. */
  default_delegate_id: string;
  reason: OooReason;
  message: string | null;
  activation_policy: OooActivationPolicy;
  expiry_policy: OooExpiryPolicy;
  /** Default true: a dead-end cover chain leaves new tickets unassigned. */
  block_new_assignment: boolean;
  /** Set once the window is live to routing. This is what makes MANUAL real. */
  applied_at: string | null;
  /** The expiry policy has been applied — by the scheduler, or by a cancel. */
  reverted_at: string | null;
  cancelled_at: string | null;
  /** Present exactly when `cancelled_at` is, by CHECK. */
  cancel_mode: OooCancelMode | null;
  cancelled_reason: string | null;
  cancelled_by: string | null;
  /** Set only on a HANDOVER — follow it to show "cover passed from X to Y". */
  replaced_by_ooo_id: string | null;
  created_at: string;
  created_by: string | null;

  user_name: string | null;
  user_email: string | null;
  delegate_name: string | null;
  delegate_email: string | null;
}

/** `GET /out-of-office` — the only shape that carries a server-computed status. */
export interface OutOfOfficeListRow extends OutOfOfficeRow {
  status: OooStatus;
  /** The window function behind `meta.total`. Read `meta.total`; ignore this. */
  total_count?: string;
}

/**
 * `GET /out-of-office/:id` and every write response. No `status` — derive it —
 * but the only shape carrying the eligibility flags, which is what warns that a
 * chosen delegate can no longer receive tickets.
 */
export interface OutOfOfficeRecord extends OutOfOfficeRow {
  user_status: string | null;
  user_is_assignable: boolean | null;
  delegate_status: string | null;
  delegate_is_assignable: boolean | null;
}

/** `GET /out-of-office`. `userId` / `delegateId` are stripped on this surface. */
export interface OutOfOfficeListFilters {
  /** true → windows where I am the delegate; false/absent → my own leave. */
  covering?: boolean;
  /** Only windows covering now(). */
  activeOnly?: boolean;
  /** Cancelled rows are excluded by default. */
  includeCancelled?: boolean;
  page?: number;
  /** 1–200. */
  limit?: number;
  sort?: string;
}

/**
 * `POST /out-of-office`. The body is `.strict()` — an unknown field is a 422,
 * so send only what the user actually chose.
 *
 * `userId` is NOT a field here: this surface is always the caller.
 */
export interface CreateOutOfOfficePayload {
  /** ISO 8601. Backdating is allowed — it is how leave already begun is filed. */
  startsAt: string;
  endsAt: string;
  defaultDelegateId: string;
  reason?: OooReason;
  message?: string;
  /** Omit to inherit the department's `ooo_activation_policy`. */
  activationPolicy?: OooActivationPolicy;
  /** Omit to inherit the department's `ooo_expiry_policy`. */
  expiryPolicy?: OooExpiryPolicy;
  /** Defaults to true server-side; there is no department default. */
  blockNewAssignment?: boolean;
}

/** `POST /out-of-office/:id/cancel`. Every field is optional. */
export interface CancelOutOfOfficePayload {
  /** Defaults to RETURNED, which settles the delegations. */
  mode?: OooCancelMode;
  reason?: string;
}

/**
 * `POST /out-of-office/:id/replace`. Only the new delegate is required —
 * everything else is inherited from the record being handed over.
 */
export interface ReplaceOutOfOfficePayload {
  defaultDelegateId: string;
  /** Recorded as `cancelled_reason` on the record being replaced. */
  handoverReason?: string;
  startsAt?: string;
  endsAt?: string;
  reason?: OooReason;
  /** `null` fails validation; send "" to give the successor no message. */
  message?: string;
  activationPolicy?: OooActivationPolicy;
  expiryPolicy?: OooExpiryPolicy;
  blockNewAssignment?: boolean;
}

/** `POST /out-of-office` — 201. */
export interface CreateOutOfOfficeResult {
  record: OutOfOfficeRecord;
  /** Existing tickets moved to the delegate right now. 0 is an honest answer. */
  delegated: number;
  /** The chosen delegate is themselves away. Advisory, not an error. */
  warning: string | null;
}

/** `POST /out-of-office/:id/activate` — 200. */
export interface ActivateOutOfOfficeResult {
  record: OutOfOfficeRecord;
  /** Non-zero only under ALL_ACTIVE_TICKETS: activating by hand still owes the sweep. */
  delegated: number;
}

/** `POST /out-of-office/:id/cancel` — 200. */
export interface CancelOutOfOfficeResult {
  record: OutOfOfficeRecord;
  /** Tickets handed back to the owner. Non-zero only for RETURNED + RETURN_TO_OWNER. */
  reverted: number;
  /** The mode actually applied — echo it rather than assuming the default. */
  mode: OooCancelMode;
}

/** `POST /out-of-office/:id/replace` — 201. */
export interface ReplaceOutOfOfficeResult {
  /** The SUCCESSOR, with a new id. Repoint any local state at it. */
  record: OutOfOfficeRecord;
  /** The record handed over: now CANCELLED with `cancel_mode: "HANDOVER"`. */
  replaced: string;
  delegated: number;
  warning: string | null;
}
