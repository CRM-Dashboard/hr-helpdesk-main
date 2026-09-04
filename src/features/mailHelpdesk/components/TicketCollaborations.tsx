/**
 * The internal collaboration panel — a second set of eyes on a ticket, without
 * transferring ownership.
 *
 * Deliberately separate from the requester-facing timeline: the API keeps the
 * two conversations apart and will never merge them, and every note here is
 * INTERNAL by CHECK constraint.
 */
import { useCallback, useState } from "react";
import {
  Check,
  Clock,
  Loader2,
  Lock,
  Mail,
  MailPlus,
  Plus,
  Send,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isHelpdeskApiError, PG_ERROR_CODE } from "@/services/pgClient";
import { CollaborationMailTrail } from "../collaboration/CollaborationMailTrail";
import {
  useAddCollaborationNote,
  useDepartment,
  usePatchCollaboration,
} from "../hooks/pg";
import type { GraphMessage, SentDraftMeta } from "../api/graphEmail";
import { CollaborationEmailComposer } from "./CollaborationEmailComposer";
import { NewCollaborationDialog } from "./NewCollaborationDialog";
import type {
  CollaborationParticipant,
  CollaborationRow,
  CollaborationStatus,
} from "../types/pg";
import { resolveSupportMailbox } from "../utils/collaborationMail";
import { fullTimestamp } from "../utils/pgTicket";
import type { TicketListRow } from "../types/pg";

interface TicketCollaborationsProps {
  ticketId: string;
  /** Where the collaborator picker starts. Any department can be chosen from there. */
  ticketDepartmentId: string;
  /** Rendered into the seed mail's subject so a stray reply stays traceable. */
  ticketNumber: string;
  ticketSubject?: string;
  /** The customer's newest message, quoted into a collaboration mail when present. */
  sourceEmail?: GraphMessage | null;
  collaborations: CollaborationRow[];
  isLoading: boolean;
  listRow?: TicketListRow;
}

/** True once either thread key is known — either one reaches the mail trail. */
const hasThread = (collaboration: CollaborationRow): boolean =>
  Boolean(
    collaboration.conversation_id || collaboration.seed_internet_message_id,
  );

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
      {replied ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
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
  onSendMail,
}: {
  ticketId: string;
  collaboration: CollaborationRow;
  onOpenTrail: (collaboration: CollaborationRow) => void;
  onSendMail: (collaboration: CollaborationRow) => void;
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
          {collaboration.replies_after_close === 1 ? "reply" : "replies"}{" "}
          arrived after this was settled. They attach without reopening it.
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
              {hasThread(collaboration) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenTrail(collaboration)}
                >
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  Reply by email
                </Button>
              ) : (
                /* No thread yet, so an emailed reply has no route home. */
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSendMail(collaboration)}
                >
                  <MailPlus className="mr-1.5 h-3.5 w-3.5" />
                  Send collaboration email
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

        {!isUnresolved && hasThread(collaboration) && (
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

/**
 * Sends the seed mail for a collaboration that was opened without one, then
 * binds the thread it created.
 *
 * Binding is deliberately one-way: per the API, rebinding never silently
 * re-points a thread, so a `COLLABORATION_THREAD_BOUND` refusal is final and
 * offers no retry.
 */
function BindThreadDialog({
  ticketId,
  collaboration,
  ticketNumber,
  ticketSubject,
  supportEmail,
  sourceEmail,
  onClose,
}: {
  ticketId: string;
  collaboration: CollaborationRow;
  ticketNumber: string;
  ticketSubject?: string;
  supportEmail: string;
  sourceEmail?: GraphMessage | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const patch = usePatchCollaboration();
  const [sentMeta, setSentMeta] = useState<SentDraftMeta | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(true);

  const recipients = collaboration.participants
    .filter((row) => !row.removedAt && row.email)
    .map((row) => ({ name: row.name, email: row.email }));

  const bind = useCallback(
    (meta: SentDraftMeta | null) => {
      if (!meta) return;
      setReportError(null);
      patch.mutate(
        {
          ticketId,
          collaborationId: collaboration.id,
          payload: {
            ...(meta.conversation_id
              ? { conversationId: meta.conversation_id }
              : {}),
            ...(meta.internet_message_id
              ? { seedInternetMessageId: meta.internet_message_id }
              : {}),
          },
        },
        {
          onSuccess: () => {
            onClose();
            toast({
              title: "Thread bound",
              description:
                "Replies to that mail will land on this collaboration.",
            });
          },
          onError: (error) => {
            const bound =
              isHelpdeskApiError(error) &&
              error.code === PG_ERROR_CODE.COLLABORATION_THREAD_BOUND;
            const taken =
              isHelpdeskApiError(error) &&
              error.code === PG_ERROR_CODE.COLLABORATION_THREAD_TAKEN;
            setRetryable(!bound && !taken);
            setReportError(
              bound
                ? `This collaboration is already on a different email thread, and rebinding never re-points one. ${error.message}`
                : taken
                  ? `That thread belongs to another collaboration. ${error.message}`
                  : `Could not bind the thread. ${error.message}`,
            );
          },
        },
      );
    },
    [collaboration.id, onClose, patch, ticketId, toast],
  );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // A mail that is already out must not be walked back — but a bind that
        // cannot succeed must still be escapable.
        if (!next && (!sentMeta || reportError)) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailPlus className="h-4 w-4" />
            Send the collaboration email
          </DialogTitle>
          <DialogDescription>
            This collaboration has no email thread, so a reply has no route back
            to it. Sending this mail creates one and binds it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {recipients.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              None of this collaboration's participants have an email address on
              file, so there is nobody to write to.
            </p>
          ) : (
            <CollaborationEmailComposer
              ticketNumber={ticketNumber}
              ticketSubject={ticketSubject}
              purpose={collaboration.purpose}
              recipients={recipients}
              supportEmail={supportEmail}
              sourceEmail={sourceEmail}
              onSent={(meta) => {
                setSentMeta(meta);
                bind(meta);
              }}
              onCancel={() => {
                if (!sentMeta) onClose();
              }}
              reporting={patch.isPending}
              reportError={reportError}
              onRetryReport={retryable ? () => bind(sentMeta) : undefined}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TicketCollaborations({
  ticketId,
  ticketDepartmentId,
  ticketNumber,
  ticketSubject,
  sourceEmail,
  listRow,
  collaborations,
  isLoading,
}: TicketCollaborationsProps) {
  const [trail, setTrail] = useState<CollaborationRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [binding, setBinding] = useState<CollaborationRow | null>(null);

  // Held back until a composer is actually open — the whole `/admin/*` router
  // shares one 60-request-a-minute budget per user.
  const { data: department } = useDepartment(
    ticketDepartmentId,
    creating || Boolean(binding),
  );
  const supportEmail = resolveSupportMailbox(department);

  if (trail && hasThread(trail)) {
    return (
      <CollaborationMailTrail
        conversationId={trail.conversation_id}
        seedInternetMessageId={trail.seed_internet_message_id}
        supportEmail={supportEmail}
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

        {listRow?.state_category !== "PENDING" ? (
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New collaboration
          </Button>
        ) : null}
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
          onSendMail={setBinding}
        />
      ))}

      <NewCollaborationDialog
        open={creating}
        onOpenChange={setCreating}
        ticketId={ticketId}
        ticketDepartmentId={ticketDepartmentId}
        ticketNumber={ticketNumber}
        ticketSubject={ticketSubject}
        supportEmail={supportEmail}
        sourceEmail={sourceEmail}
      />

      {binding && (
        <BindThreadDialog
          ticketId={ticketId}
          collaboration={binding}
          ticketNumber={ticketNumber}
          ticketSubject={ticketSubject}
          supportEmail={supportEmail}
          sourceEmail={sourceEmail}
          onClose={() => setBinding(null)}
        />
      )}
    </div>
  );
}

export default TicketCollaborations;
