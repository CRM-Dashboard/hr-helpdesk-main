/**
 * Collaboration endpoints on the PostgreSQL helpdesk API.
 *
 * The backend sends no collaboration mail. The frontend creates the thread by
 * calling Microsoft Graph with the acting user's own token, then reports it
 * here so inbound replies route back to this collaboration instead of becoming
 * a new junk ticket.
 *
 * All four routes are agent-only.
 */
import { PG_ENDPOINT, pgPath } from "@/services/endPoints";
import { pgRequest } from "@/services/pgClient";
import type {
  AddCollaborationNotePayload,
  CollaborationNote,
  CollaborationRow,
  CollaborationsResponse,
  OpenCollaborationPayload,
  OpenCollaborationResult,
  PatchCollaborationPayload,
} from "../../types/pg";

/**
 * Every collaboration on the ticket, each with its participants and its notes.
 *
 * Deliberately not feature-gated: disabling `COLLABORATION` is forward-only, so
 * records created while it was on stay readable after it is switched off.
 *
 * @param ticketId ticket uuid
 * @returns the collaborations, newest first
 * @throws {HelpdeskApiError} 403 when the caller holds no agent role
 */
export const listCollaborations = async (
  ticketId: string,
): Promise<CollaborationRow[]> => {
  const { data } = await pgRequest<CollaborationsResponse>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.TICKET_COLLAB, { id: ticketId }),
  });
  return data.collaborations;
};

/**
 * Records a collaboration. Send the mail through Graph first — CC'ing the
 * support mailbox — then report it here with `seedInternetMessageId`.
 *
 * Opening first and binding the thread later with `patchCollaboration` is
 * equally supported; a collaboration with no thread simply has no inbound route
 * until it is bound.
 *
 * @param ticketId ticket uuid
 * @param payload purpose and at least one participant
 * @returns the new collaboration and the participant rows actually inserted
 *   (inactive or deleted users are silently skipped)
 * @throws {HelpdeskApiError} 403 FEATURE_DISABLED when COLLABORATION is off;
 *   409 COLLABORATION_THREAD_TAKEN when the thread belongs to another one
 */
export const openCollaboration = async (
  ticketId: string,
  payload: OpenCollaborationPayload,
): Promise<OpenCollaborationResult> => {
  const { data } = await pgRequest<OpenCollaborationResult>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.TICKET_COLLAB, { id: ticketId }),
    data: payload,
  });
  return data;
};

/**
 * Binds the email thread, changes the status, or both in one call.
 *
 * @param ticketId ticket uuid
 * @param collaborationId must belong to that ticket, else 404
 * @param payload at least one of `conversationId`, `seedInternetMessageId`,
 *   `status`; `ANSWERED` requires the collaboration to currently be `OPEN`
 * @returns the updated collaboration row, reflecting both a bind and a status change
 * @throws {HelpdeskApiError} 409 COLLABORATION_THREAD_BOUND when rebinding to a
 *   different thread — it never silently re-points
 */
export const patchCollaboration = async (
  ticketId: string,
  collaborationId: string,
  payload: PatchCollaborationPayload,
): Promise<CollaborationRow> => {
  const { data } = await pgRequest<CollaborationRow>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.TICKET_COLLAB_ITEM, {
      id: ticketId,
      collaborationId,
    }),
    data: payload,
  });
  return data;
};

/**
 * Writes a note on the collaboration thread through the API rather than by mail.
 *
 * Side effect: an `OPEN` collaboration moves to `ANSWERED`, `last_reply_at` is
 * stamped, and the caller's `responded_at` is set if they are a participant.
 * Answering does not close it — the requester decides when it is settled.
 *
 * @param ticketId ticket uuid
 * @param collaborationId must belong to that ticket
 * @param payload the note text
 * @returns the created activity row, always INTERNAL
 */
export const addCollaborationNote = async (
  ticketId: string,
  collaborationId: string,
  payload: AddCollaborationNotePayload,
): Promise<CollaborationNote> => {
  const { data } = await pgRequest<CollaborationNote>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.TICKET_COLLAB_NOTES, {
      id: ticketId,
      collaborationId,
    }),
    data: payload,
  });
  return data;
};
