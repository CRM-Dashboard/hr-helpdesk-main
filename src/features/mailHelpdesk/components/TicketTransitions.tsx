/**
 * The ticket's legal next moves, rendered straight from the workflow.
 *
 * One button per `availableTransitions` entry — the server already filtered
 * them by the caller's role and re-checks everything at execution, so the
 * interface cannot offer a move the engine will reject.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isHelpdeskApiError, PG_ERROR_CODE } from "@/services/pgClient";
import { useTransitionTicket } from "../hooks/pg";
import type { WorkflowTransitionRow } from "../types/pg";

interface TicketTransitionsProps {
  ticketId: string;
  /** Sent as `expectedVersion` so a concurrent edit is refused, not overwritten. */
  ticketVersion: number;
  transitions: WorkflowTransitionRow[];
}

export function TicketTransitions({
  ticketId,
  ticketVersion,
  transitions,
}: TicketTransitionsProps) {
  const { toast } = useToast();
  const transition = useTransitionTicket();
  const [pending, setPending] = useState<WorkflowTransitionRow | null>(null);
  const [reason, setReason] = useState("");

  /**
   * Runs one transition and turns any refusal into a message the agent can act on.
   *
   * @param move the transition row behind the button
   * @param withReason the typed reason, when the edge demands one
   */
  const run = (move: WorkflowTransitionRow, withReason?: string) => {
    transition.mutate(
      {
        id: ticketId,
        payload: {
          transitionCode: move.code,
          reason: withReason || undefined,
          expectedVersion: ticketVersion,
        },
      },
      {
        onSuccess: (result) => {
          setPending(null);
          setReason("");
          toast({
            title: `Moved to ${result.transition.toStateCode}`,
            description: result.transition.label,
          });
        },
        onError: (error) => {
          if (!isHelpdeskApiError(error)) {
            toast({
              title: "Could not move the ticket",
              description: error.message,
              variant: "destructive",
            });
            return;
          }

          // Every one of these carries a message written to be read by a person.
          const title =
            error.code === PG_ERROR_CODE.CONCURRENT_MODIFICATION
              ? "Someone else changed this ticket"
              : error.code === PG_ERROR_CODE.ILLEGAL_TRANSITION
                ? "That move is no longer available"
                : "Could not move the ticket";

          toast({
            title,
            description: error.message,
            variant: "destructive",
          });
          // The mutation invalidates on settle, so the buttons and the ticket
          // refresh themselves — never auto-retry with the newer version.
          setPending(null);
        },
      },
    );
  };

  /**
   * @param move the transition the agent clicked
   */
  const onClick = (move: WorkflowTransitionRow) => {
    if (move.requires_reason) {
      setReason("");
      setPending(move);
      return;
    }
    run(move);
  };

  if (transitions.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No moves available from this state
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {transitions.map((move) => (
          <Button
            key={move.code}
            size="sm"
            variant={move.is_terminal ? "outline" : "default"}
            disabled={transition.isPending}
            onClick={() => onClick(move)}
            title={
              move.requires_assignment
                ? "Requires the ticket to be assigned first"
                : `Moves to ${move.to_state_name}`
            }
          >
            {transition.isPending && (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            )}
            {move.label}
          </Button>
        ))}
      </div>

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.label}</DialogTitle>
            <DialogDescription>
              This move requires a reason. It is recorded on the ticket's
              history.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is the ticket moving to this state?"
            rows={4}
            maxLength={5000}
            autoFocus
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              disabled={!reason.trim() || transition.isPending}
              onClick={() => pending && run(pending, reason.trim())}
            >
              {transition.isPending && (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              )}
              {pending?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default TicketTransitions;
