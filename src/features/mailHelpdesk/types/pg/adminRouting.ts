/**
 * Admin surface — routing rules, OLA policies, workflows.
 *
 * All three are **versioned, never edited in place**, and for the same reason:
 * a ticket pins the row it was resolved against. Editing one would not change
 * future behaviour — it would rewrite the past. The Save button is `supersede`
 * for the first two and `versions` + `publish` for the third.
 */
import type { RoleCode, StateCategory } from "./identity";

export type RoutingStrategy = "DIRECT" | "LEAST_LOADED";

export interface RoutingRuleRow {
  id: string;
  department_id: string;
  category_id: string | null;
  category_code: string | null;
  category_name: string | null;
  subcategory_id: string | null;
  subcategory_code: string | null;
  subcategory_name: string | null;
  priority_id: string | null;
  priority_code: string | null;
  priority_name: string | null;
  strategy: RoutingStrategy;
  /** `GENERATED ALWAYS`: 4 category, 2 subcategory, 1 priority. Never write or re-sort by anything else. */
  specificity: number;
  primary_user_id: string;
  primary_user_name: string | null;
  primary_user_email: string | null;
  backup_user_id: string | null;
  backup_user_name: string | null;
  backup_user_email: string | null;
  escalation_user_id: string | null;
  escalation_user_name: string | null;
  escalation_user_email: string | null;
  version_no: number;
  effective_from: string;
  /** `null` = live. Non-null = superseded, and kept forever. */
  effective_to: string | null;
  is_active: boolean;
  /** All three scopes null. Every department must have exactly this rule. */
  is_catch_all: boolean;
  etag: string;
  /** On a create or supersede: people named who routing cannot currently select. */
  warnings?: string[];
  /** On a supersede response — the id that was just closed. */
  supersededRuleId?: string;
}

export interface RoutingRuleFilters {
  categoryId?: string;
  subcategoryId?: string;
  priorityId?: string;
  /** Rules naming this person in any of the three slots. */
  userId?: string;
  /** Historical versions. For a history panel, not the grid. */
  includeSuperseded?: boolean;
  includeInactive?: boolean;
  sort?: string;
}

export interface CreateRoutingRuleBody {
  categoryId?: string | null;
  /** Must name its category too. */
  subcategoryId?: string | null;
  priorityId?: string | null;
  primaryUserId: string;
  /** Required when `strategy` is `LEAST_LOADED` — the candidate set is {primary, backup}. */
  backupUserId?: string | null;
  /** The functional escalation owner. Time-based escalation is the OLA ladder. */
  escalationUserId?: string | null;
  strategy?: RoutingStrategy;
}

/**
 * `.strict()`, every field optional — **unspecified fields carry forward**. The
 * scope cannot be changed (422): a rule whose scope moved is a different rule
 * wearing the old one's lineage.
 */
export interface SupersedeRoutingRuleBody {
  primaryUserId?: string;
  backupUserId?: string | null;
  escalationUserId?: string | null;
  strategy?: RoutingStrategy;
  reason?: string;
}

/** What a hypothetical ticket would carry. `{}` previews an unclassified one. */
export interface RoutingPreviewBody {
  categoryId?: string | null;
  subcategoryId?: string | null;
  priorityId?: string | null;
}

/** The engine's own vocabulary. The last three all produce an unassigned ticket. */
export type RoutingPreviewReason =
  | "RESOLVED"
  | "DELEGATED"
  | "DELEGATE_UNAVAILABLE"
  | "NO_MATCHING_RULE"
  | "NO_ELIGIBLE_CANDIDATE"
  | "NO_ELIGIBLE_DELEGATE";

/**
 * `POST …/routing-rules/preview` — answered by `resolveAssignee`, the same
 * function ticket creation calls, writing nothing. It is the only way to see the
 * rules' combined effect, so it belongs beside the editor, not behind a button.
 */
export interface RoutingPreviewResponse {
  scope: RoutingPreviewBody;
  reason: RoutingPreviewReason;
  wouldAssignTo: { id: string; fullName: string; email: string } | null;
  assignmentType: string | null;
  matchedRule: {
    id: string;
    versionNo: number;
    specificity: number;
    isCatchAll: boolean;
  } | null;
  delegation: { oooId: string; depth: number } | null;
  /** Written to be shown to the user. Render it. */
  warning: string | null;
}

/** `v_taxonomy_routing_gaps` — categories with no rule, already ranked by traffic. */
export interface RoutingGapRow {
  department_id: string;
  department_code: string;
  category_id: string;
  category_code: string;
  category_name: string;
  tickets_last_90_days: number;
}

// --- OLA policies ----------------------------------------------------------

export type EscalateToType =
  | "USER"
  | "ROLE"
  | "ASSIGNEE_MANAGER"
  | "DEPT_HEAD"
  | "BACKUP"
  | "ROUTING_ESCALATION";

export interface OlaStageRow {
  id?: string;
  policy_id?: string;
  stage_no: number;
  stage_code: string;
  /** **Working** minutes from clock start. Must ascend with `stage_no`. */
  threshold_minutes: number;
  escalate_to_type: EscalateToType;
  escalate_to_user_id: string | null;
  escalate_to_user_name?: string | null;
  escalate_to_role_code: RoleCode | null;
  /** Strictly less than this stage's own threshold. */
  pre_breach_warning_min: number | null;
  notify_assignee: boolean;
  notify_requester: boolean;
  auto_reassign: boolean;
  /** Exactly one stage in a ladder must carry it. */
  is_breach_stage: boolean;
}

export interface OlaPolicyRow {
  id: string;
  name: string;
  department_id: string;
  calendar_id: string;
  calendar_code: string | null;
  calendar_name: string | null;
  calendar_is_24x7: boolean;
  category_id: string | null;
  category_code: string | null;
  category_name: string | null;
  subcategory_id: string | null;
  priority_id: string | null;
  response_target_minutes: number | null;
  resolution_target_minutes: number | null;
  pause_on_pending: boolean;
  pause_on_collaboration: boolean;
  pause_on_snooze: boolean;
  collaboration_extension_min: number;
  specificity: number;
  version_no: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  /** Clocks still running against this policy. */
  live_instances: number;
  /**
   * False once anything is running against it. Branch the ladder editor on this:
   * a live policy's stages are read at every evaluation, so editing them re-times
   * escalation for clocks already started.
   */
  stages_editable: boolean;
  stages?: OlaStageRow[];
  etag: string;
  warning?: string;
  supersededPolicyId?: string;
  /** True when the successor cloned the incumbent's ladder rather than taking yours. */
  stagesCloned?: boolean;
}

export interface OlaPolicyFilters {
  categoryId?: string;
  subcategoryId?: string;
  priorityId?: string;
  includeSuperseded?: boolean;
  includeInactive?: boolean;
  sort?: string;
}

export interface CreateOlaPolicyBody {
  name: string;
  /** Calendars have no admin API yet — take the id from an existing policy. */
  calendarId: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  priorityId?: string | null;
  /** At least one target is required — a clock with nothing to measure is not a policy. */
  responseTargetMinutes?: number | null;
  resolutionTargetMinutes?: number | null;
  pauseOnPending?: boolean;
  /** Mutually exclusive with `collaborationExtensionMin > 0` — both would double-count. */
  pauseOnCollaboration?: boolean;
  pauseOnSnooze?: boolean;
  collaborationExtensionMin?: number;
}

/** The whole ladder, always — 1–20 stages. There is no per-stage verb. */
export interface PutOlaStagesBody {
  stages: Array<{
    /** Explicit, not positional. A drag-reorder must renumber and send both. */
    stageNo: number;
    stageCode: string;
    thresholdMinutes: number;
    escalateToType: EscalateToType;
    escalateToUserId?: string | null;
    escalateToRoleCode?: RoleCode | null;
    preBreachWarningMin?: number | null;
    notifyAssignee?: boolean;
    notifyRequester?: boolean;
    autoReassign?: boolean;
    isBreachStage?: boolean;
  }>;
}

/** Scope fields are rejected (422), as for routing rules. */
export interface SupersedeOlaPolicyBody
  extends Partial<Omit<CreateOlaPolicyBody, "categoryId" | "subcategoryId" | "priorityId">> {
  /** Omit and the incumbent's ladder is cloned; send one and it replaces it. */
  stages?: PutOlaStagesBody["stages"];
  reason?: string;
}

// --- workflows -------------------------------------------------------------

export interface WorkflowStateRow {
  id: string;
  workflow_id: string;
  /** The identifier. One business state has a different uuid in every version. */
  code: string;
  name: string;
  state_category: StateCategory;
  is_initial: boolean;
  is_terminal: boolean;
  is_ola_paused: boolean;
  is_resolved: boolean;
  is_closed: boolean;
  counts_as_active_workload: boolean;
  requester_visible: boolean;
  requester_facing_label: string | null;
  auto_transition_minutes: number | null;
  auto_transition_to_state: string | null;
  display_order: number;
  is_active: boolean;
  etag: string;
}

/**
 * A transition **as configured** on a workflow version.
 *
 * Distinct from `WorkflowTransitionRow` in ./ticket.ts, which is one entry in a
 * particular ticket's `availableTransitions` — the moves that ticket may make
 * right now. This is the edge in the definition, which is what an administrator
 * edits and what that list is computed from.
 */
export interface WorkflowTransitionConfig {
  id: string;
  workflow_id: string;
  /** `null` is the creation transition. Without one, no ticket can be created. */
  from_state_id: string | null;
  from_state_code: string | null;
  to_state_id: string;
  to_state_code: string;
  code: string;
  label: string;
  /** Empty means **any** role. */
  allowed_role_codes: RoleCode[];
  /** Empty is **not** "any" — at least one is required. */
  allowed_actor_types: string[];
  requires_reason: boolean;
  requires_assignment: boolean;
  display_order: number;
  is_active: boolean;
  etag: string;
}

export interface WorkflowValidationCheck {
  code: string;
  passed: boolean;
  message?: string;
}

export interface WorkflowRow {
  id: string;
  department_id: string;
  code: string;
  name: string;
  version_no: number;
  /**
   * A draft is stored with `effective_from = 'infinity'`, which reaches the wire
   * as `null` — so `effective_from: null` and `effective_to: null` mean opposite
   * things. Branch on `is_draft` / `is_live`, never on the dates.
   */
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  state_count: number;
  transition_count: number;
  ticket_count: number;
  is_draft: boolean;
  is_live: boolean;
  states?: WorkflowStateRow[];
  transitions?: WorkflowTransitionConfig[];
  /** Render the Publish button from `validation.publishable` and it can never be refused. */
  validation?: {
    publishable: boolean;
    failed: number;
    checks: WorkflowValidationCheck[];
  };
  etag: string;
  supersededWorkflowId?: string;
  warning?: string;
}

export interface CreateWorkflowBody {
  code: string;
  name: string;
}

export interface CreateWorkflowVersionBody {
  name?: string;
  /** Defaults true: the usual reason to make a version is to change one row of many. */
  copyFrom?: boolean;
}

export interface PublishWorkflowBody {
  /** May be future-dated to schedule a cutover. Back-dating is a 422. */
  effectiveFrom?: string;
  supersedeCurrent?: boolean;
}

/** `code` is required on create and rejected on PATCH — see `WorkflowStateRow.code`. */
export interface WorkflowStateBody {
  code?: string;
  name?: string;
  stateCategory?: StateCategory;
  isInitial?: boolean;
  isTerminal?: boolean;
  isOlaPaused?: boolean;
  isResolved?: boolean;
  /** Must also be terminal (422). */
  isClosed?: boolean;
  countsAsActiveWorkload?: boolean;
  requesterVisible?: boolean;
  requesterFacingLabel?: string | null;
  /** Both or neither, with `autoTransitionToState` (422). */
  autoTransitionMinutes?: number | null;
  autoTransitionToState?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

/** Endpoints and `code` are rejected on PATCH — an edge whose ends moved is a different edge. */
export interface WorkflowTransitionBody {
  fromStateId?: string | null;
  toStateId?: string;
  code?: string;
  label?: string;
  allowedRoleCodes?: RoleCode[];
  allowedActorTypes?: string[];
  requiresReason?: boolean;
  requiresAssignment?: boolean;
  displayOrder?: number;
  isActive?: boolean;
}
