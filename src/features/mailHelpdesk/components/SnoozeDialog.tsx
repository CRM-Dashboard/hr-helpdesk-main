import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { AlarmClock, Clock, History, AlertCircle } from "lucide-react";
import { SnoozeRecord } from "../types/collaboration";
import {
  addWorkingHours,
  MAX_SNOOZE_COUNT,
  SNOOZE_PRESETS,
} from "../utils/workingHours";

interface SnoozeDialogProps {
  ticketId: string;
  /** Existing snooze records for this ticket (audit trail). */
  records: SnoozeRecord[];
  onClose: () => void;
  /** Called with the new snooze record to apply. */
  onSnooze: (hours: number, reason: string) => void;
}

export function SnoozeDialog({
  ticketId,
  records,
  onClose,
  onSnooze,
}: SnoozeDialogProps) {
  const [hours, setHours] = useState<number>(SNOOZE_PRESETS[2].hours);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const usedCount = records.length;
  const remaining = Math.max(0, MAX_SNOOZE_COUNT - usedCount);
  const limitReached = usedCount >= MAX_SNOOZE_COUNT;

  const untilPreview = useMemo(
    () => addWorkingHours(new Date(), hours),
    [hours],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (limitReached) {
      setError(`Snooze limit reached (max ${MAX_SNOOZE_COUNT} per ticket).`);
      return;
    }
    if (!reason.trim()) {
      setError("Please provide a reason for snoozing.");
      return;
    }
    onSnooze(hours, reason.trim());
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <AlarmClock className="h-5 w-5 text-amber-600" />
            Snooze Ticket
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline">#{ticketId}</Badge>
          <span className="text-muted-foreground">
            Snoozes used:{" "}
            <span className="font-medium text-foreground">
              {usedCount}/{MAX_SNOOZE_COUNT}
            </span>{" "}
            ({remaining} left)
          </span>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Snoozing pauses the OLA timer. It will resume automatically when the
          snooze ends.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Snooze duration
            </label>
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              disabled={limitReached}
              className="w-full px-3 py-2 border border-border rounded-md bg-background disabled:opacity-60"
            >
              {SNOOZE_PRESETS.map((p) => (
                <option key={p.hours} value={p.hours}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              OLA resumes around{" "}
              <span className="font-medium text-foreground">
                {format(untilPreview, "dd MMM yyyy")}
                {/* {format(untilPreview, "dd MMM yyyy, hh:mm a")} */}
              </span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Reason *</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={limitReached}
              className="w-full px-3 py-2 border border-border rounded-md bg-background resize-none disabled:opacity-60"
              placeholder="Why is this ticket being snoozed? (recorded in the audit trail)"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Audit trail */}
          {records.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <History className="h-4 w-4" />
                Snooze history
              </h4>
              <div className="space-y-2">
                {records.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{r.hours} working hrs</span>
                      <span className="text-muted-foreground">
                        {r.snoozedByName || r.snoozedById}
                      </span>
                    </div>
                    {r.snoozedAt && r.until && (
                      <div className="text-muted-foreground mt-0.5">
                        {format(new Date(r.snoozedAt), "dd MMM, hh:mm a")} →{" "}
                        {format(new Date(r.until), "dd MMM, hh:mm a")}
                      </div>
                    )}
                    {r.reason && (
                      <div className="mt-1 italic text-muted-foreground">
                        “{r.reason}”
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={limitReached}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Snooze
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default SnoozeDialog;
