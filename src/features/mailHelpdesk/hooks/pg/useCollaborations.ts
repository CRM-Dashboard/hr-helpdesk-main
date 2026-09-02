/**
 * Collaboration queries and writes.
 *
 * Invalidation follows the documented side effects rather than blanket-clearing
 * the ticket tree: a note can flip the status to ANSWERED and also lands in the
 * ticket's activity, and closing settles the OLA clocks the header renders.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  addCollaborationNote,
  listCollaborations,
  openCollaboration,
  patchCollaboration,
} from "../../api/pg";
import type {
  AddCollaborationNotePayload,
  CollaborationNote,
  CollaborationRow,
  OpenCollaborationPayload,
  OpenCollaborationResult,
  PatchCollaborationPayload,
} from "../../types/pg";
import { helpdeskKeys } from "./queryKeys";

/**
 * Every collaboration on one ticket.
 *
 * @param ticketId ticket uuid, or null/undefined when nothing is selected
 * @param enabled skip the call for a non-agent — all four routes are agent-only
 * @returns the collaborations, newest first
 */
export const useCollaborations = (
  ticketId: string | null | undefined,
  enabled = true,
): UseQueryResult<CollaborationRow[], Error> =>
  useQuery({
    queryKey: helpdeskKeys.collaborations(ticketId ?? ""),
    queryFn: () => listCollaborations(ticketId as string),
    enabled: Boolean(ticketId) && enabled,
  });

/**
 * Adds a note to a collaboration thread.
 *
 * @returns a mutation taking `{ ticketId, collaborationId, payload }`
 */
export const useAddCollaborationNote = (): UseMutationResult<
  CollaborationNote,
  Error,
  {
    ticketId: string;
    collaborationId: string;
    payload: AddCollaborationNotePayload;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, collaborationId, payload }) =>
      addCollaborationNote(ticketId, collaborationId, payload),
    onSuccess: (_result, { ticketId }) => {
      // The status may have moved OPEN -> ANSWERED, and the note is also a
      // ticket_activity row that the Activity tab renders.
      queryClient.invalidateQueries({
        queryKey: helpdeskKeys.collaborations(ticketId),
      });
      queryClient.invalidateQueries({
        queryKey: helpdeskKeys.timeline(ticketId),
      });
    },
  });
};

/**
 * Binds a thread, marks a collaboration answered, or closes it.
 *
 * @returns a mutation taking `{ ticketId, collaborationId, payload }`
 */
export const usePatchCollaboration = (): UseMutationResult<
  CollaborationRow,
  Error,
  {
    ticketId: string;
    collaborationId: string;
    payload: PatchCollaborationPayload;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, collaborationId, payload }) =>
      patchCollaboration(ticketId, collaborationId, payload),
    onSuccess: (_result, { ticketId, payload }) => {
      queryClient.invalidateQueries({
        queryKey: helpdeskKeys.collaborations(ticketId),
      });
      // Settling one resumes or extends the clock — but only when it was the
      // last unresolved collaboration, which is the server's call, not ours.
      if (payload.status === "CLOSED" || payload.status === "EXPIRED") {
        queryClient.invalidateQueries({
          queryKey: helpdeskKeys.detail(ticketId),
        });
        queryClient.invalidateQueries({
          queryKey: helpdeskKeys.timeline(ticketId),
        });
      }
    },
  });
};

/**
 * Opens a collaboration, reporting the seed mail's thread keys when one was
 * sent — `NewCollaborationDialog` sends through Graph first and passes both
 * `conversationId` and `seedInternetMessageId`. Both are optional: a
 * collaboration with no thread has no inbound route until `patchCollaboration`
 * binds one.
 *
 * @returns a mutation taking `{ ticketId, payload }`
 */
export const useOpenCollaboration = (): UseMutationResult<
  OpenCollaborationResult,
  Error,
  { ticketId: string; payload: OpenCollaborationPayload }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, payload }) => openCollaboration(ticketId, payload),
    onSuccess: (_result, { ticketId }) => {
      queryClient.invalidateQueries({
        queryKey: helpdeskKeys.collaborations(ticketId),
      });
      queryClient.invalidateQueries({
        queryKey: helpdeskKeys.timeline(ticketId),
      });
      // Opening one may pause the OLA.
      queryClient.invalidateQueries({
        queryKey: helpdeskKeys.detail(ticketId),
      });
    },
  });
};
