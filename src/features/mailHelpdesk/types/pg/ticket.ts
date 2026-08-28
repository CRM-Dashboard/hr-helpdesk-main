/**
 * Ticket payloads for the PostgreSQL helpdesk API.
 *
 * Responses are **raw database rows in snake_case** — that is the module's
 * convention, not an oversight. Request bodies are camelCase. Do not rename
 * fields on the way in or out.
 */
import type { StateCategory } from "./identity";

export type TicketSource = "EMAIL" | "PORTAL" | "MANUAL" | "API" | "OTHER";

export type ClassificationStatus =
  | "AI_SUGGESTED"
  | "AI_LOW_CONFIDENCE"
  | "CONFIRMED"
  | "CORRECTED"
  | "UNCLASSIFIED";

export type ActorType = "USER" | "SYSTEM" | "SCHEDULER" | "EMAIL";

export type Visibility = "EMPLOYEE" | "INTERNAL" | "SYSTEM";

export type AssignmentType =
  | "RULE"
  | "LEAST_LOADED"
  | "BACKUP"
  | "MANUAL"
  | "RECLASSIFICATION"
  | "OOO_DELEGATION"
  | "OOO_REVERT"
  | "ESCALATION";

export type ActivityType =
  | "TICKET_CREATED"
  | "ASSIGNED"
  | "REASSIGNED"
  | "RECLASSIFIED"
  | "DELEGATED"
  | "STATE_CHANGED"
  | "CATEGORY_CHANGED"
  | "PRIORITY_CHANGED"
  | "CLASSIFICATION_CONFIRMED"
  | "CLASSIFICATION_CORRECTED"
  | "EMAIL_RECEIVED"
  | "EMAIL_SENT"
  | "INTERNAL_NOTE"
  | "COLLABORATION_REQUESTED"
  | "COLLABORATION_NOTE"
  | "COLLABORATION_CLOSED"
  | "SNOOZED"
  | "SNOOZE_ENDED"
  | "OLA_ESCALATED"
  | "OLA_RETARGETED"
  | "OLA_BREACHED"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "ATTACHMENT_ADDED";

export type OlaTargetType = "RESPONSE" | "RESOLUTION";

export type OlaEventType =
  | "START"
  | "PAUSE"
  | "RESUME"
  | "WARNING"
  | "ESCALATION"
  | "BREACH"
  | "EXTENSION"
  | "RETARGET"
  | "STOP"
  | "INTERVENTION_REQUIRED";

export type OlaPauseReason = "PENDING" | "COLLABORATION" | "SNOOZE" | "MANUAL";

/** A `tickets` row, exactly as the API returns it. */
export interface TicketRow {
  id: string;
  /** Human-quotable, e.g. "HR-2026-00042". */
  ticket_number: string;
  department_id: string;
  subject: string;
  description: string | null;

  requester_user_id: string | null;
  /** Requester details as at creation — this is why point-in-time questions are answerable. */
  requester_email_snapshot: string | null;
  requester_name_snapshot: string | null;
  requester_emp_code_snapshot: string | null;
  requester_dept_snapshot: string | null;

  category_id: string | null;
  subcategory_id: string | null;
  priority_id: string | null;

  classification_status: ClassificationStatus | null;
  ai_suggested_category_id: string | null;
  ai_suggested_subcategory_id: string | null;
  ai_confidence: number | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  classified_by_user_id: string | null;
  classified_at: string | null;

  /** Pinned at creation; the ticket keeps this workflow version for life. */
  workflow_id: string;
  /** Do not filter on this — use `state_code` / `?state=`. */
  state_id: string;

  /** null is a real outcome: the unassigned queue. */
  assigned_to_user_id: string | null;
  routing_rule_id: string | null;

  source_code: TicketSource;
  inbound_message_id: string | null;
  /** The customer Graph thread. Collaboration threads live elsewhere. */
  conversation_id: string | null;

  parent_ticket_id: string | null;
  root_ticket_id: string;
  reopen_sequence_no: number;

  /** START DATE. Write-once, by trigger. */
  first_assigned_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  /** END DATE. Never derive it from an OLA `due_at`. */
  closed_at: string | null;
  auto_close_due_at: string | null;
  last_activity_at: string;

  reassignment_count: number;
  is_ola_breached: boolean;
  /** Send this back as `expectedVersion` on every write. */
  version: number;
  created_at: string;
  updated_at: string;
}

/** A `GET /tickets` row: the ticket plus display joins and per-caller unread. */
export interface TicketListRow extends TicketRow {
  /** Render the state from this, and send it as `?state=`. */
  state_code: string;
  state_name: string;
  state_category: StateCategory;
  priority_code: string | null;
  priority_name: string | null;
  /** Higher is more severe. Sort DESC for most-urgent-first. */
  severity_rank: number | null;
  category_name: string | null;
  assigned_to_name: string | null;
  /** Per caller. Do not cache a row across users. */
  unread_count: number;
  has_unread: boolean;
}

/** A `workflow_transitions` row joined to its target state. */
export interface WorkflowTransitionRow {
  id: string;
  workflow_id?: string;
  from_state_id: string;
  to_state_id: string;
  /** Send this as `transitionCode`. */
  code: string;
  /** Button text. */
  label: string;
  requires_reason: boolean;
  requires_assignment: boolean;
  /** Empty means every role may perform it. */
  allowed_role_codes: string[];
  /** Empty means every actor type may perform it. */
  allowed_actor_types: string[];
  is_ola_paused?: boolean;
  is_active?: boolean;
  display_order: number;
  to_state_code: string;
  to_state_name: string;
  state_category: StateCategory;
  is_resolved: boolean;
  is_closed: boolean;
  is_terminal: boolean;
}

export interface OlaInstance {
  id: string;
  ticket_id: string;
  target_type: OlaTargetType;
  due_at: string | null;
  consumed_working_minutes: number | null;
  remaining_working_minutes: number | null;
  total_paused_working_minutes: number | null;
  current_stage_no: number | null;
  is_paused: boolean;
  pause_reason: OlaPauseReason | null;
  is_stopped: boolean;
  is_breached: boolean;
  extension_minutes: number | null;
  /** The scheduler gave up; a human must clear it. Surface to administrators. */
  requires_intervention: boolean;
  started_at: string | null;
}

export interface OlaEvent {
  id: string;
  ticket_id: string;
  event_type: OlaEventType;
  occurred_at: string;
}

/** `GET /tickets/:id`. */
export interface TicketDetail {
  ticket: TicketRow;
  /** Render the action buttons from this — already filtered to the caller's role. */
  availableTransitions: WorkflowTransitionRow[];
  ola: {
    /** Empty when no OLA policy resolved. A real outcome, not an error. */
    instances: OlaInstance[];
    events: OlaEvent[];
  };
}

export interface TicketActivityRow {
  id: string;
  ticket_id: string;
  activity_type: ActivityType;
  visibility: Visibility;
  description: string | null;
  collaboration_id: string | null;
  graph_message_id: string | null;
  inbound_message_id: string | null;
  /** null for SYSTEM / SCHEDULER / EMAIL actors. */
  performed_by: string | null;
  actor_type: ActorType;
  occurred_at: string;
  performed_by_name: string | null;
}

export interface TicketStatusHistoryRow {
  id: string;
  ticket_id: string;
  state_id: string;
  previous_state_id: string | null;
  transition_id: string | null;
  started_at: string;
  /** Exactly one row has null — the current state. */
  ended_at: string | null;
  duration_wall_minutes: number | null;
  duration_working_minutes: number | null;
  is_ola_paused: boolean;
  changed_by_user_id: string | null;
  actor_type: ActorType;
  reason: string | null;
  state_code: string;
  state_name: string;
  previous_state_code: string | null;
  changed_by_name: string | null;
}

export interface TicketAssignmentHistoryRow {
  id: string;
  ticket_id: string;
  sequence_no: number;
  assigned_to_user_id: string | null;
  /** On an OOO_DELEGATION row this is the original owner. */
  assigned_from_user_id: string | null;
  assigned_by_user_id: string | null;
  assignment_type: AssignmentType;
  routing_rule_id: string | null;
  ooo_id: string | null;
  delegation_depth: number;
  escalation_stage_no: number | null;
  assigned_at: string;
  released_at: string | null;
  working_minutes: number | null;
  reason: string | null;
  assigned_to_name: string | null;
  assigned_from_name: string | null;
}

export interface TicketFieldChangeRow {
  id: string;
  ticket_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  /** Stored alongside the uuids because a category may be renamed later. */
  old_label: string | null;
  new_label: string | null;
  changed_by: string | null;
  actor_type: ActorType;
  changed_at: string;
  changed_by_name: string | null;
}

/**
 * `GET /tickets/:id/timeline`. How much arrives is decided by ROLE alone:
 * an EMPLOYEE gets EMPLOYEE-visibility activity and three empty arrays.
 */
export interface TicketTimeline {
  /** occurred_at DESC, max 200 rows. No pagination. */
  activity: TicketActivityRow[];
  statusHistory: TicketStatusHistoryRow[];
  assignmentHistory: TicketAssignmentHistoryRow[];
  fieldChanges: TicketFieldChangeRow[];
}

/** `GET /tickets/counts` — the numbers beside the state dropdown options. */
export interface TicketCounts {
  total: number;
  unread: number;
  /** Every state the department defines, including ones with zero tickets. */
  byState: Record<string, number>;
  /** Rolled up to OPEN / PENDING / RESOLVED / CLOSED; all four keys present. */
  byCategory: Record<StateCategory, number>;
  unreadByState: Record<string, number>;
}

export type TicketSortColumn =
  | "created_at"
  | "updated_at"
  | "last_activity_at"
  | "ticket_number"
  | "resolved_at"
  | "closed_at";

/**
 * Filters for `GET /tickets`. Hold ONE object and spread it into
 * `listTickets` and `getTicketCounts` — counts drops the paging keys itself.
 */
export interface TicketListFilters {
  page?: number;
  /** 1–200; over 200 is a 422. */
  limit?: number;
  /** "<column>:<asc|desc>", default "created_at:desc". */
  sort?: `${TicketSortColumn}:asc` | `${TicketSortColumn}:desc` | TicketSortColumn;
  /** SUPER_ADMIN only. Anyone else naming another department gets 403. */
  departmentId?: string;
  /** Workflow state CODE, repeatable. An unknown code is a 400, not an empty page. */
  state?: string | string[];
  stateCategory?: StateCategory | StateCategory[];
  /** Exact-row escape hatch. Prefer `state`. */
  stateId?: string;
  categoryId?: string;
  priorityId?: string;
  assignedToUserId?: string;
  /** Ignored for an EMPLOYEE — the server forces their own id. */
  requesterUserId?: string;
  unassigned?: boolean;
  openOnly?: boolean;
  isBreached?: boolean;
  classificationStatus?: ClassificationStatus | ClassificationStatus[];
  unreadOnly?: boolean;
  /** Default true: unread sorts above read, ahead of `sort`. */
  unreadFirst?: boolean;
  createdFrom?: string;
  createdTo?: string;
  /** subject ILIKE OR ticket_number ILIKE. 1–200 chars. */
  search?: string;
}

/** `POST /tickets`. */
export interface CreateTicketPayload {
  subject: string;
  description?: string;
  /** Raise on behalf of someone. Agent roles only. */
  requesterUserId?: string | null;
  /** Snapshot email for a requester with no account. Agent roles only. */
  requesterEmail?: string;
  /** Required when the department has `require_category` on (the default). */
  categoryId?: string | null;
  subcategoryId?: string | null;
  priorityId?: string | null;
  /** Defaults to PORTAL. */
  sourceCode?: TicketSource;
}

/** `POST /tickets/:id/transitions` — the only way a ticket changes state. */
export interface TicketTransitionPayload {
  /** Preferred: what the button carries, from `availableTransitions[].code`. */
  transitionCode?: string;
  /** Alternative target. Prefer `transitionCode`. */
  toStateId?: string;
  /** Required when the transition's `requires_reason` is true. */
  reason?: string;
  /** Send `ticket.version`. Omitting it skips the concurrency check. */
  expectedVersion?: number;
}

export interface TicketTransitionResult {
  ticket: TicketRow;
  transition: {
    code: string;
    label: string;
    fromStateCode: string;
    toStateCode: string;
  };
}

/** `PATCH /tickets/:id/assignment`. */
export interface AssignTicketPayload {
  /** Required but nullable — send null explicitly to un-assign. */
  assignedToUserId: string | null;
  reason?: string;
  expectedVersion?: number;
}

export interface AssignTicketResult {
  ticket: TicketRow;
  /** null when un-assigning, or when the ticket was already on that user. */
  assignment: TicketAssignmentHistoryRow | null;
  unassigned?: boolean;
}

/** `PATCH /tickets/:id/classification`. */
export interface ClassifyTicketPayload {
  categoryId: string;
  subcategoryId?: string | null;
  /** true = "a human agreed"; skips re-routing and OLA retargeting. */
  confirmOnly?: boolean;
  reason?: string;
  expectedVersion?: number;
}

export interface ClassifyTicketResult {
  ticket: TicketRow;
  /** true when something actually changed (CORRECTED), false on a confirmation. */
  corrected: boolean;
  reason?: string;
}

/** `PATCH /tickets/:id/priority`. */
export interface ChangePriorityPayload {
  priorityId: string;
  reason?: string;
  expectedVersion?: number;
}

export interface ChangePriorityResult {
  ticket: TicketRow;
  /** false when the ticket already had that priority — a no-op, version unchanged. */
  changed: boolean;
}

/** `POST /tickets/:id/notes`. Visibility is forced to INTERNAL server-side. */
export interface AddTicketNotePayload {
  note: string;
  collaborationId?: string | null;
}

export interface MarkTicketReadResult {
  ticketId: string;
  /** Idempotent: a second call reports 0 and keeps the original read time. */
  marked: number;
}

/** `POST /tickets/:id/snooze`. Gated on the SNOOZE department feature. */
export interface SnoozeTicketPayload {
  /** ISO 8601; must be in the future. */
  snoozeUntil: string;
  reason?: string;
}

/** How an interval ended. `MANUAL` is the un-snooze button. */
export type SnoozeEndTrigger = "EXPIRED" | "MANUAL" | "REPLY_RECEIVED";

export interface TicketSnoozeRow {
  id: string;
  ticket_id: string;
  sequence_no: number;
  snoozed_by_user_id: string;
  reason: string | null;
  snoozed_at: string;
  snooze_until: string;
  ended_at: string | null;
  end_trigger: SnoozeEndTrigger | null;
  working_minutes: number | null;
}

/**
 * The open snooze as `GET /tickets/:id/snooze` returns it — camelCase, and a
 * narrower projection than the raw row the POST answers with.
 */
export interface OpenSnooze {
  id: string;
  snoozeUntil: string;
  reason: string | null;
  snoozedByUserId: string;
  snoozedAt: string;
  /** Counts every snooze this ticket has ever had, cancelled ones included. */
  sequenceNo: number;
}

/**
 * `GET /tickets/:id/snooze`. Agent-only, and deliberately not folded into
 * `GET /tickets/:id`, which also serves requesters.
 */
export interface TicketSnoozeState {
  /** null when the ticket is not snoozed — a 200, never a 404. */
  snooze: OpenSnooze | null;
  /** `max(sequence_no)`: cancelling does NOT refund the count. */
  snoozeCountUsed: number;
  /** The department's `snooze_max_count`. */
  snoozeMaxCount: number;
}
