/**
 * The internal collaboration panel — a second set of eyes on a ticket, without
 * transferring ownership.
 *
 * Deliberately separate from the requester-facing timeline: the API keeps the
 * two conversations apart and will never merge them, and every note here is
 * INTERNAL by CHECK constraint.
 */
import { useState } from "react";
import {
  Check,
  Clock,
  Loader2,
  Lock,
  Mail,
  Plus,
  Send,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { isHelpdeskApiError } from "@/services/pgClient";
import { CollaborationMailTrail } from "../collaboration/CollaborationMailTrail";
import { useAddCollaborationNote, usePatchCollaboration } from "../hooks/pg";
import type {
  CollaborationParticipant,
  CollaborationRow,
  CollaborationStatus,
} from "../types/pg";
import { fullTimestamp } from "../utils/pgTicket";

interface TicketCollaborationsProps {
  ticketId: string;
  ticketSubject?: string;
  collaborations: CollaborationRow[];
  isLoading: boolean;
}

/**
 * Tailwind classes for a collaboration status badge.
 *
 * @param status the collaboration's current status
 * @returns the badge class string
 */
const statusClass = (status: CollaborationStatus): string => {
  switch (status) {
    case "OPEN":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "ANSWERED":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "CLOSED":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "EXPIRED":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
};

/**
 * One participant chip. `respondedAt` is where "who has replied" lives, so the
 * panel can show Finance ✓ / Legal ⏳ at a glance.
 *
 * @param participant a participant row from the collaboration
 */
function ParticipantChip({
  participant,
}: {
  participant: CollaborationParticipant;
}) {
  const replied = Boolean(participant.respondedAt);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
        replied
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
      title={
        replied
          ? `Replied ${fullTimestamp(participant.respondedAt)}`
          : `Invited ${fullTimestamp(participant.invitedAt)}`
      }
    >
      {replied ? (
        <Check className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {participant.name}
      {/* The department snapshot from invite time, not the user's current team. */}
      {participant.departmentName && (
        <span className="text-muted-foreground">
          · {participant.departmentName}
        </span>
      )}
    </span>
  );
}

/**
 * One collaboration: purpose, participants, its notes, and the controls that
 * settle it.
 */
function CollaborationCard({
  ticketId,
  collaboration,
  onOpenTrail,
}: {
  ticketId: string;
  collaboration: CollaborationRow;
  onOpenTrail: (collaboration: CollaborationRow) => void;
}) {
  const { toast } = useToast();
  const addNote = useAddCollaborationNote();
  const patch = usePatchCollaboration();
  const [note, setNote] = useState("");

  const isUnresolved =
    collaboration.status === "OPEN" || collaboration.status === "ANSWERED";

  /**
   * Surfaces the API's own message — these are written to be read by a person.
   *
   * @param title what failed
   * @param error the rejection
   */
  const reportError = (title: string, error: Error) => {
    toast({
      title,
      description: isHelpdeskApiError(error) ? error.message : error.message,
      variant: "destructive",
    });
  };

  const submitNote = () => {
    const text = note.trim();
    if (!text) return;
    addNote.mutate(
      {
        ticketId,
        collaborationId: collaboration.id,
        payload: { note: text },
      },
      {
        onSuccess: () => {
          setNote("");
          toast({
            title: "Note added",
            description:
              collaboration.status === "OPEN"
                ? "The collaboration is now marked answered."
                : "Visible to agents only.",
          });
        },
        onError: (error) => reportError("Could not add the note", error),
      },
    );
  };

  /**
   * @param status the terminal or marker status to move to
   */
  const setStatus = (status: "ANSWERED" | "CLOSED") => {
    patch.mutate(
      { ticketId, collaborationId: collaboration.id, payload: { status } },
      {
        onSuccess: () =>
          toast({
            title:
              status === "CLOSED"
                ? "Collaboration closed"
                : "Marked as answered",
          }),
        onError: (error) => reportError("Could not update", error),
      },
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground">
              {collaboration.purpose}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Asked by {collaboration.requested_by_name} ·{" "}
              {fullTimestamp(collaboration.started_at)}
              {collaboration.completed_at &&
                ` · settled ${fullTimestamp(collaboration.completed_at)}`}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {collaboration.pauses_ola && isUnresolved && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] text-amber-700"
              >
                OLA paused
              </Badge>
            )}
            {collaboration.extension_minutes > 0 && (
              <Badge
                variant="outline"
                className="border-slate-200 bg-slate-50 text-[10px] text-slate-600"
              >
                +{collaboration.extension_minutes}m on close
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`text-xs font-semibold border ${statusClass(collaboration.status)}`}
            >
              {collaboration.status}
            </Badge>
          </div>
        </div>

        {collaboration.participants.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {collaboration.participants.map((participant) => (
              <ParticipantChip
                key={participant.userId}
                participant={participant}
              />
            ))}
          </div>
        )}
      </div>

      {/* Notes: the collaboration's own timeline, oldest first. */}
      <ul className="px-4">
        {collaboration.notes.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">
            Nothing on this thread yet.
          </li>
        )}
        {collaboration.notes.map((row) => (
          <li
            key={row.id}
            className="border-b border-border/50 py-3 last:border-0"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium">
                {/* performed_by is null for an emailed reply; the sender is joined instead. */}
                {row.performed_by_name || row.sender_email || "System"}
                {row.actor_type === "EMAIL" && (
                  <Mail className="ml-1.5 inline h-3 w-3 text-muted-foreground" />
                )}
              </span>
              <span className="flex-shrink-0 text-xs text-muted-foreground">
                {fullTimestamp(row.occurred_at)}
              </span>
            </div>
            {row.description && (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {row.description}
              </p>
            )}
          </li>
        ))}
      </ul>

      {collaboration.replies_after_close > 0 && (
        <p className="px-4 pb-2 text-xs text-muted-foreground">
          {collaboration.replies_after_close}{" "}
          {collaboration.replies_after_close === 1 ? "reply" : "replies"} arrived
          after this was settled. They attach without reopening it.
        </p>
      )}

      <div className="border-t border-border p-3">
        {isUnresolved && (
          <>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reply on this thread…"
              rows={2}
              maxLength={50000}
            />
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              {collaboration.conversation_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenTrail(collaboration)}
                >
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  Reply by email
                </Button>
              )}
              {/* ANSWERED is refused unless it is currently OPEN. */}
              {collaboration.status === "OPEN" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={patch.isPending}
                  onClick={() => setStatus("ANSWERED")}
                >
                  Mark answered
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={patch.isPending}
                onClick={() => setStatus("CLOSED")}
              >
                {patch.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Close
              </Button>
              <Button
                size="sm"
                disabled={!note.trim() || addNote.isPending}
                onClick={submitNote}
              >
                {addNote.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                Add note
              </Button>
            </div>
          </>
        )}

        {!isUnresolved && collaboration.conversation_id && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenTrail(collaboration)}
            >
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              View mail trail
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TicketCollaborations({
  ticketId,
  ticketSubject,
  collaborations,
  isLoading,
}: TicketCollaborationsProps) {
  const [trail, setTrail] = useState<CollaborationRow | null>(null);

  if (trail?.conversation_id) {
    return (
      <CollaborationMailTrail
        conversationId={trail.conversation_id}
        ticketSubject={ticketSubject}
        title={trail.purpose}
        onBack={() => setTrail(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Collaboration</span>
          <Badge
            variant="outline"
            className="h-5 border-amber-300 px-1.5 text-[10px] text-amber-700"
          >
            <Lock className="mr-1 h-2.5 w-2.5" />
            Not visible to the requester
          </Badge>
        </div>

        {/* Opening one needs participant uuids, and the API publishes no user
            list. Shown disabled so the gap is visible rather than absent. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button variant="outline" size="sm" disabled>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New collaboration
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Waiting on the backend: choosing a collaborator needs a user lookup
            endpoint, which the helpdesk API does not publish yet.
          </TooltipContent>
        </Tooltip>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading collaborations…
        </div>
      )}

      {!isLoading && collaborations.length === 0 && (
        <p className="py-6 text-sm text-muted-foreground">
          Nobody has been asked to help on this ticket.
        </p>
      )}

      {collaborations.map((collaboration) => (
        <CollaborationCard
          key={collaboration.id}
          ticketId={ticketId}
          collaboration={collaboration}
          onOpenTrail={setTrail}
        />
      ))}
    </div>
  );
}

export default TicketCollaborations;
