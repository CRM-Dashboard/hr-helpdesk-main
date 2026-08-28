/**
 * The ticket's history, from `GET /tickets/:id/timeline`, plus the internal
 * note composer.
 *
 * A note is always `INTERNAL` — the visibility is forced by a CHECK constraint
 * server-side, so it can never reach the requester's timeline.
 */
import { useState } from "react";
import {
  ArrowRightLeft,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Send,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isHelpdeskApiError } from "@/services/pgClient";
import { useAddTicketNote } from "../hooks/pg";
import type {
  ActivityType,
  TicketActivityRow,
  TicketTimeline,
} from "../types/pg";
import { fullTimestamp } from "../utils/pgTicket";

interface TicketActivityFeedProps {
  ticketId: string;
  timeline?: TicketTimeline;
  isLoading: boolean;
  /** Only the five agent roles may write a note; everyone else gets a 403. */
  canWriteNotes: boolean;
}

/**
 * Picks an icon for one activity row.
 *
 * @param type the row's `activity_type`
 * @returns the lucide icon component to render
 */
function iconFor(type: ActivityType) {
  if (type === "EMAIL_RECEIVED" || type === "EMAIL_SENT") return Mail;
  if (type === "INTERNAL_NOTE") return Lock;
  if (type.startsWith("COLLABORATION")) return Users;
  if (type === "STATE_CHANGED" || type === "REOPENED") return ArrowRightLeft;
  return MessageSquare;
}

/**
 * One row in the feed.
 *
 * @param row a `ticket_activity` row
 */
function ActivityRow({ row }: { row: TicketActivityRow }) {
  const Icon = iconFor(row.activity_type);
  const isInternal = row.visibility === "INTERNAL";

  return (
    <li className="flex gap-3 py-3 border-b border-border/50 last:border-0">
      <div
        className={`mt-0.5 h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center ${
          isInternal
            ? "bg-amber-50 text-amber-600"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-medium text-foreground">
            {row.activity_type.replace(/_/g, " ").toLowerCase()}
            {isInternal && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">
                internal
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {fullTimestamp(row.occurred_at)}
          </span>
        </div>

        {row.description && (
          <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
            {row.description}
          </p>
        )}

        <p className="mt-1 text-xs text-muted-foreground/70">
          {/* performed_by is null for SYSTEM / SCHEDULER / EMAIL actors. */}
          {row.performed_by_name || row.actor_type.toLowerCase()}
        </p>
      </div>
    </li>
  );
}

export function TicketActivityFeed({
  ticketId,
  timeline,
  isLoading,
  canWriteNotes,
}: TicketActivityFeedProps) {
  const { toast } = useToast();
  const addNote = useAddTicketNote();
  const [note, setNote] = useState("");

  const submitNote = () => {
    const text = note.trim();
    if (!text) return;

    addNote.mutate(
      { id: ticketId, payload: { note: text } },
      {
        onSuccess: () => {
          setNote("");
          toast({ title: "Note added", description: "Visible to agents only." });
        },
        onError: (error) => {
          toast({
            title: "Could not add the note",
            description: isHelpdeskApiError(error)
              ? error.message
              : error.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const activity = timeline?.activity ?? [];
  const statusHistory = timeline?.statusHistory ?? [];

  return (
    <div className="space-y-4">
      {canWriteNotes && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Internal note — never shown to the requester
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you find out?"
            rows={3}
            maxLength={50000}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={!note.trim() || addNote.isPending}
              onClick={submitNote}
            >
              {addNote.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              Add note
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-2.5 border-b border-border text-sm font-medium">
          Activity
          {activity.length > 0 && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              ({activity.length})
            </span>
          )}
        </div>

        <div className="px-4">
          {isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading activity…
            </div>
          )}

          {!isLoading && activity.length === 0 && (
            <p className="py-6 text-sm text-muted-foreground">
              Nothing has happened on this ticket yet.
            </p>
          )}

          <ul>
            {activity.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </ul>
        </div>
      </div>

      {/* Empty for a requester by design: the API returns [] rather than
          filtering rows they may not see. */}
      {statusHistory.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-2.5 border-b border-border text-sm font-medium">
            State history
          </div>
          <ul className="px-4 py-1">
            {statusHistory.map((row) => (
              <li
                key={row.id}
                className="flex items-baseline justify-between gap-3 py-2 border-b border-border/50 last:border-0 text-sm"
              >
                <span className="text-foreground">
                  {row.previous_state_code
                    ? `${row.previous_state_code} → ${row.state_code}`
                    : row.state_name}
                  {row.reason && (
                    <span className="text-muted-foreground"> — {row.reason}</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {fullTimestamp(row.started_at)}
                  {row.duration_working_minutes !== null &&
                    ` · ${row.duration_working_minutes}m working`}
                  {row.ended_at === null && " · current"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TicketActivityFeed;
