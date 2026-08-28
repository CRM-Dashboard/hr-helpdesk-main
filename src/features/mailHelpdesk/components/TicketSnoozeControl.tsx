/**
 * "Stop showing me this until Tuesday."
 *
 * A snooze is an event row, not a flag on the ticket, which is why the state
 * comes from its own agent-only call rather than from `GET /tickets/:id` — that
 * payload also serves requesters, and the reason on a snooze is an agent's
 * private triage note.
 *
 * Three things this control is careful about, because each is a real rule the
 * server enforces and a person cannot guess:
 *
 * - the cap counts every snooze the ticket has EVER had, so cancelling does not
 *   give one back;
 * - the duration limit is in WORKING minutes on the department calendar, so a
 *   weekend is nearly free and only the server can say whether a date fits;
 * - waking is not feature-gated, so a ticket can always be un-snoozed even
 *   after an administrator switches SNOOZE off.
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlarmClock, Loader2, PauseCircle, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  useSnoozeTicket,
  useTicketSnooze,
  useUnsnoozeTicket,
} from "../hooks/pg";
import {
  atHourInDays,
  fromDatetimeLocalValue,
  nextWeekdayAt,
  toDatetimeLocalValue,
} from "../utils/datetimeLocal";
import { fullTimestamp } from "../utils/pgTicket";

interface TicketSnoozeControlProps {
  ticketId: string;
  /** A closed ticket cannot be snoozed — the server refuses it with a 400. */
  isClosed?: boolean;
}

/** Wall-clock offers. The server measures them against the working calendar. */
const PRESETS: Array<{ label: string; at: () => Date }> = [
  { label: "In 4 hours", at: () => new Date(Date.now() + 4 * 60 * 60 * 1000) },
  { label: "Tomorrow, 9am", at: () => atHourInDays(1, 9) },
  { label: "In 3 days, 9am", at: () => atHourInDays(3, 9) },
  { label: "Next Monday, 9am", at: () => nextWeekdayAt(1, 9) },
];

export function TicketSnoozeControl({
  ticketId,
  isClosed,
}: TicketSnoozeControlProps) {
  const { toast } = useToast();
  const { isAgent } = useHelpdeskAuth();

  const { data, isLoading, error } = useTicketSnooze(ticketId, isAgent);
  const snooze = useSnoozeTicket();
  const wake = useUnsnoozeTicket();

  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");

  const remaining = data
    ? Math.max(0, data.snoozeMaxCount - data.snoozeCountUsed)
    : 0;
  const capReached = Boolean(data) && remaining === 0;

  // The wake-up job only runs when the server has HELPDESK_JOBS_ENABLED=true.
  // With it off, an interval whose time has passed simply stays open, and
  // saying so is better than showing a date in the past with no explanation.
  const overdue = useMemo(() => {
    if (!data?.snooze) return false;
    return new Date(data.snooze.snoozeUntil).getTime() <= Date.now();
  }, [data]);

  /**
   * Turns any refusal into something the agent can act on. Every 4xx here
   * carries a `message` written to be read by a person — the count cap, the
   * working-minutes cap, a closed ticket — so it is shown as-is.
   *
   * @param title what failed
   * @param err the rejection
   */
  const reportError = (title: string, err: Error) => {
    const featureOff =
      isHelpdeskApiError(err) && err.code === PG_ERROR_CODE.FEATURE_DISABLED;
    toast({
      title: featureOff ? "Snooze is switched off for this department" : title,
      description: err.message,
      variant: "destructive",
    });
  };

  const openDialog = () => {
    setUntil(toDatetimeLocalValue(PRESETS[1].at()));
    setReason("");
    setOpen(true);
  };

  const submit = () => {
    const iso = fromDatetimeLocalValue(until);
    if (!iso) {
      toast({
        title: "Pick a date and time",
        description: "The ticket has to resurface at some point.",
        variant: "destructive",
      });
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      // The server says the same thing; refusing here saves the round trip.
      toast({
        title: "That moment has passed",
        description: "A snooze has to end in the future.",
        variant: "destructive",
      });
      return;
    }

    snooze.mutate(
      {
        id: ticketId,
        payload: { snoozeUntil: iso, reason: reason.trim() || undefined },
      },
      {
        onSuccess: (row) => {
          setOpen(false);
          toast({
            title: "Ticket snoozed",
            description: `It comes back ${fullTimestamp(row.snooze_until)}.`,
          });
        },
        onError: (err) => reportError("Could not snooze the ticket", err),
      },
    );
  };

  const wakeNow = () => {
    wake.mutate(ticketId, {
      onSuccess: () =>
        toast({
          title: "Snooze ended",
          description: "Any paused OLA clock is running again.",
        }),
      onError: (err) => reportError("Could not wake the ticket", err),
    });
  };

  // Agent-only at the route: a requester never asks, and a failure here must
  // not take the ticket header down with it.
  if (!isAgent || isLoading || error || !data) return null;

  if (data.snooze) {
    return (
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={`flex items-center gap-1.5 text-xs font-normal ${
            overdue
              ? "border-orange-200 bg-orange-50 text-orange-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
          title={data.snooze.reason || undefined}
        >
          <PauseCircle className="h-3.5 w-3.5" />
          {overdue ? "Snooze overdue since" : "Snoozed until"}{" "}
          {format(new Date(data.snooze.snoozeUntil), "dd MMM, hh:mm a")}
        </Badge>

        {overdue && (
          <span
            className="flex items-center gap-1 text-xs text-orange-700"
            title="The wake-up job is off on this server, so nothing will end this on its own"
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            not woken automatically
          </span>
        )}

        <Button
          size="sm"
          variant="outline"
          disabled={wake.isPending}
          onClick={wakeNow}
        >
          {wake.isPending && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Wake now
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={capReached || isClosed}
        onClick={openDialog}
        title={
          isClosed
            ? "A closed ticket cannot be snoozed"
            : capReached
              ? `This ticket has used all ${data.snoozeMaxCount} of its snoozes`
              : `${remaining} of ${data.snoozeMaxCount} snoozes left`
        }
      >
        <AlarmClock className="mr-1.5 h-3.5 w-3.5" />
        Snooze
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Snooze this ticket</DialogTitle>
            <DialogDescription>
              It drops out of view until the moment you pick. Any OLA clock the
              department pauses on snooze stops until then.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setUntil(toDatetimeLocalValue(preset.at()))}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="snooze-until">Comes back on</Label>
              <Input
                id="snooze-until"
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                min={toDatetimeLocalValue(new Date())}
              />
              <p className="text-xs text-muted-foreground">
                The limit is counted in working hours on the department's
                calendar, so a weekend costs almost nothing. If the window is
                too long the helpdesk says by how much.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="snooze-reason">Reason (optional)</Label>
              <Textarea
                id="snooze-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What are you waiting for?"
                rows={3}
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground">
                Internal — the requester never sees it.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              {data.snoozeCountUsed} of {data.snoozeMaxCount} snoozes used on
              this ticket. Waking it early does not give one back.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!until || snooze.isPending} onClick={submit}>
              {snooze.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Snooze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default TicketSnoozeControl;
