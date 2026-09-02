/**
 * "This one is not mine" — reassigns the ticket, or hands it back to the queue.
 *
 * The picker is the department roster filtered by `assignableOnly`, which applies
 * `is_assignable AND status = 'ACTIVE'` server-side — the routing engine's own
 * predicate. That matters: it is exactly the set `findEligibleCandidate` would
 * choose from, so a name offered here can never be refused by the assignment
 * verb for being unselectable.
 *
 * `expectedVersion` is always sent. Two agents triaging the same queue is the
 * normal case, not the edge case, and a silent last-write-wins reassignment is
 * the kind of thing nobody notices until a ticket has quietly moved twice.
 */
import { useMemo, useState } from "react";
import { Loader2, Search, ShieldAlert, UserCheck, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isHelpdeskApiError, PG_ERROR_CODE } from "@/services/pgClient";
import { useHelpdeskAuth } from "../context/helpdeskAuthContext";
import { useAssignableUsers, useAssignTicket } from "../hooks/pg";
import type { DepartmentUserRow } from "../types/pg";

interface TicketAssignmentControlProps {
  ticketId: string;
  /** Scopes the roster. The ticket's own department, not the caller's. */
  departmentId: string;
  /** Sent as `expectedVersion` so a concurrent reassignment is refused, not merged. */
  ticketVersion: number;
  assignedToUserId: string | null;
  /** Joined display name, when a list row carried one. */
  assignedToName?: string | null;
  /** A closed ticket is not reassigned — it is reopened first. */
  isClosed?: boolean;
}

export function TicketAssignmentControl({
  ticketId,
  departmentId,
  ticketVersion,
  assignedToUserId,
  assignedToName,
  isClosed,
}: TicketAssignmentControlProps) {
  const { toast } = useToast();
  const { isAgent, user } = useHelpdeskAuth();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  // Nothing is fetched until the dialog opens: the whole `/admin/*` router
  // shares one 60-request-per-minute budget per user, and a roster on every
  // ticket open would spend it on a list nobody asked to see.
  const {
    data: roster,
    isLoading: rosterLoading,
    error: rosterError,
  } = useAssignableUsers(departmentId, open && isAgent);

  const assign = useAssignTicket();

  const candidates = useMemo(() => {
    const rows = roster?.rows ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.full_name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle) ||
        (row.employee_code ?? "").toLowerCase().includes(needle) ||
        (row.designation ?? "").toLowerCase().includes(needle),
    );
  }, [roster, search]);

  const openDialog = () => {
    setSearch("");
    setReason("");
    setSelectedId(assignedToUserId);
    setOpen(true);
  };

  /**
   * Surfaces a refusal. Every 4xx here carries a `message` written for a person
   * — an unassignable target, a closed ticket, a stale version — so it is shown
   * as written rather than replaced with a guess.
   *
   * @param error the rejection
   */
  const reportError = (error: Error) => {
    const stale =
      isHelpdeskApiError(error) &&
      error.code === PG_ERROR_CODE.CONCURRENT_MODIFICATION;
    const denied =
      isHelpdeskApiError(error) && error.code === PG_ERROR_CODE.FORBIDDEN;
    toast({
      title: stale
        ? "Somebody changed this ticket first"
        : denied
          ? "You cannot reassign this ticket"
          : "Could not reassign the ticket",
      description: stale
        ? "The ticket was reloaded. Check who has it now, then try again."
        : error.message,
      variant: "destructive",
    });
  };

  /**
   * @param userId who to hand it to, or null to return it to the queue
   * @param person the roster row, for the confirmation message
   */
  const submit = (userId: string | null, person?: DepartmentUserRow) => {
    assign.mutate(
      {
        id: ticketId,
        payload: {
          assignedToUserId: userId,
          reason: reason.trim() || undefined,
          expectedVersion: ticketVersion,
        },
      },
      {
        onSuccess: (result) => {
          setOpen(false);
          toast({
            title: userId ? "Ticket reassigned" : "Ticket unassigned",
            description: userId
              ? // `assignment` is null when the ticket was already on that
                // person, which is a no-op rather than a failure.
                result.assignment
                ? `Now with ${person?.full_name ?? "the selected member"}.`
                : "It was already assigned to them — nothing changed."
              : "It is back on the queue and routing can pick it up again.",
          });
        },
        onError: reportError,
      },
    );
  };

  // Agent-only at the route, and a requester has nothing to reassign.
  if (!isAgent) return null;

  const currentLabel = assignedToName || (assignedToUserId ? "someone" : null);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={isClosed}
        onClick={openDialog}
        title={
          isClosed
            ? "Reopen the ticket before reassigning it"
            : currentLabel
              ? `Currently with ${currentLabel}`
              : "Nobody owns this ticket yet"
        }
      >
        <UserCheck className="mr-1.5 h-3.5 w-3.5" />
        {assignedToUserId ? "Reassign" : "Assign"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>
              {assignedToUserId ? "Reassign this ticket" : "Assign this ticket"}
            </DialogTitle>
            <DialogDescription>
              {currentLabel
                ? `It is with ${currentLabel} right now. Choose who takes it on.`
                : "Nobody owns it yet. Choose who takes it on."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or employee code"
                className="pl-8"
              />
            </div>

            {rosterLoading && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading the department roster…
              </div>
            )}

            {/* Most likely a 403: reading the roster needs `helpdesk.user.read`,
                which not every agent role holds. Saying which permission is
                missing is more use than "something went wrong". */}
            {rosterError && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">The roster could not be loaded</p>
                  <p className="mt-0.5">{rosterError.message}</p>
                  {isHelpdeskApiError(rosterError) &&
                    rosterError.code === PG_ERROR_CODE.FORBIDDEN && (
                      <p className="mt-0.5">
                        Reading the department's members needs
                        <code className="mx-1">helpdesk.user.read</code>, which
                        your account does not hold.
                      </p>
                    )}
                </div>
              </div>
            )}

            {!rosterLoading && !rosterError && candidates.length === 0 && (
              <p className="py-8 text-sm text-muted-foreground">
                {search.trim()
                  ? "Nobody in this department matches that."
                  : "This department has nobody who can receive tickets. A member becomes assignable in Admin → Members."}
              </p>
            )}

            {candidates.length > 0 && (
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {candidates.map((person) => {
                  const isSelected = selectedId === person.id;
                  const isCurrent = person.id === assignedToUserId;
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(person.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                          {person.full_name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">
                              {person.full_name}
                            </span>
                            {isCurrent && (
                              <span className="flex-shrink-0 text-[10px] uppercase text-muted-foreground">
                                current
                              </span>
                            )}
                            {person.id === user?.id && (
                              <span className="flex-shrink-0 text-[10px] uppercase text-muted-foreground">
                                you
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {person.designation || person.role_name}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="assign-reason">Reason (optional)</Label>
              <Textarea
                id="assign-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this moving? Recorded on the ticket's history."
                rows={2}
                maxLength={2000}
              />
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 sm:justify-between">
            {/* Un-assigning is a separate verb's worth of intent, so it gets its
                own button rather than a "nobody" row in the list. */}
            {assignedToUserId ? (
              <Button
                variant="outline"
                disabled={assign.isPending}
                onClick={() => submit(null)}
              >
                <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                Unassign
              </Button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !selectedId ||
                  selectedId === assignedToUserId ||
                  assign.isPending
                }
                onClick={() =>
                  submit(
                    selectedId,
                    candidates.find((row) => row.id === selectedId),
                  )
                }
              >
                {assign.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Assign
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default TicketAssignmentControl;
