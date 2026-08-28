/**
 * Collaboration payloads — a second set of eyes on a ticket, without
 * transferring ownership.
 *
 * A ticket has two kinds of thread and the API never merges them:
 *
 *   tickets.conversation_id                 customer  <-> helpdesk
 *   collaboration_requests.conversation_id  helpdesk  <-> collaborator  (N per ticket)
 *
 * Note the casing split, which is deliberate: the collaboration row and its
 * `notes` are snake_case database rows, while `participants` are camelCase.
 */
import type { ActorType, TicketActivityRow } from "./ticket";

export type CollaborationStatus = "OPEN" | "ANSWERED" | "CLOSED" | "EXPIRED";

export type ParticipantRole = "CONTRIBUTOR" | "REVIEWER";

/** `OPEN` and `ANSWERED` together are the unresolved set. */
export const UNRESOLVED_COLLABORATION_STATUSES: readonly CollaborationStatus[] =
  ["OPEN", "ANSWERED"];

export interface CollaborationParticipant {
  userId: string;
  name: string;
  email: string;
  /** The snapshot from invite time — people move, and that must not rewrite history. */
  departmentId: string | null;
  departmentName: string | null;
  role: ParticipantRole;
  invitedAt: string;
  /** Where "who has replied" lives. Only set for a current participant. */
  respondedAt: string | null;
  /** Invitation withdrawn, or the collaboration was closed. */
  removedAt: string | null;
}

/** A row of the collaboration's own timeline. */
export interface CollaborationNote
  extends Pick<
    TicketActivityRow,
    | "id"
    | "activity_type"
    | "description"
    | "collaboration_id"
    | "inbound_message_id"
    | "occurred_at"
    | "performed_by"
    | "performed_by_name"
  > {
  actor_type: ActorType;
  performed_by_email: string | null;
  /** Joined from the inbound message when the note arrived by mail. */
  sender_email: string | null;
}

export interface CollaborationRow {
  id: string;
  ticket_id: string;
  requested_by_user_id: string;
  purpose: string;
  status: CollaborationStatus;
  /** Copied from the OLA policy at creation, not read live. */
  pauses_ola: boolean;
  /** The alternative to pausing. Mutually exclusive with `pauses_ola`. */
  extension_minutes: number;
  /** The collaboration's own Graph thread. Null until bound. */
  conversation_id: string | null;
  /** RFC 5322 id of the outbound seed mail — the trustworthy thread key. */
  seed_internet_message_id: string | null;
  started_at: string;
  completed_at: string | null;
  last_reply_at: string | null;
  /** Replies that arrived after it settled. They attach without reopening it. */
  replies_after_close: number;
  requested_by_name: string;
  requested_by_email: string;
  /** camelCase, ordered by `invitedAt`. Always present. */
  participants: CollaborationParticipant[];
  /** snake_case, `occurred_at` ASC, max 200. */
  notes: CollaborationNote[];
}

/** `GET /tickets/:id/collaborations`. Ordered `started_at` DESC. */
export interface CollaborationsResponse {
  collaborations: CollaborationRow[];
}

/** `POST /tickets/:id/collaborations`. */
export interface OpenCollaborationPayload {
  /** What you are asking for. Becomes the activity description. */
  purpose: string;
  /** At least one. Cross-department is deliberately allowed. */
  participants: Array<{
    userId: string;
    participantRole?: ParticipantRole;
  }>;
  /** The Graph thread, if the mail went out first. */
  conversationId?: string;
  /** Strongly preferred over `conversationId` — identical in every mailbox. */
  seedInternetMessageId?: string;
}

/** The rows just inserted come back raw, unlike the GET's camelCase participants. */
export interface OpenCollaborationResult {
  collaboration: Omit<CollaborationRow, "participants" | "notes">;
  participants: Array<{
    collaboration_id: string;
    user_id: string;
    department_id: string | null;
    participant_role: ParticipantRole;
    invited_at: string;
    responded_at: string | null;
    removed_at: string | null;
  }>;
}

/**
 * `PATCH …/collaborations/:collaborationId` — at least one field.
 * Binding happens before the status change, so closing and binding in one call
 * still leaves a late reply a route home.
 */
export interface PatchCollaborationPayload {
  conversationId?: string;
  seedInternetMessageId?: string;
  /** `OPEN` is deliberately not accepted — a settled collaboration never reopens. */
  status?: Exclude<CollaborationStatus, "OPEN">;
}

/** `POST …/collaborations/:collaborationId/notes`. */
export interface AddCollaborationNotePayload {
  note: string;
}
