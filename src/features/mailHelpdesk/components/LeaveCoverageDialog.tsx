import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarOff, AlertCircle, ShieldCheck } from "lucide-react";
import { SpocAvailability } from "../types/leaveCoverage";

interface LeaveCoverageDialogProps {
  initial?: SpocAvailability | null;
  /** SPOC options for the picker (userid + label). */
  spocOptions: { value: string; label: string }[];
  /** When set, the SPOC is fixed (self-service) and the picker is disabled. */
  lockedSpocId?: string;
  /** Admin can set/override on behalf of any SPOC. */
  isAdmin?: boolean;
  onClose: () => void;
  onSave: (record: SpocAvailability, isEdit: boolean) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function LeaveCoverageDialog({
  initial,
  spocOptions,
  lockedSpocId,
  isAdmin,
  onClose,
  onSave,
}: LeaveCoverageDialogProps) {
  const isEdit = Boolean(initial);
  const [spocId, setSpocId] = useState(
    initial?.spocId || lockedSpocId || "",
  );
  const [fromDate, setFromDate] = useState(initial?.fromDate || today());
  const [toDate, setToDate] = useState(initial?.toDate || today());
  const [reason, setReason] = useState(initial?.reason || "");
  const [error, setError] = useState<string | null>(null);

  const spocLabel = useMemo(
    () => spocOptions.find((o) => o.value === spocId)?.label || spocId,
    [spocOptions, spocId],
  );

  const isOverride = Boolean(lockedSpocId) && spocId !== lockedSpocId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!spocId) {
      setError("Please select a SPOC.");
      return;
    }
    if (!fromDate || !toDate) {
      setError("Please provide both start and end dates.");
      return;
    }
    if (new Date(toDate) < new Date(fromDate)) {
      setError("End date cannot be before the start date.");
      return;
    }
    onSave(
      {
        spocId,
        name: spocOptions.find((o) => o.value === spocId)?.label,
        fromDate,
        toDate,
        reason: reason.trim(),
        setByAdmin: isOverride || (isAdmin && spocId !== lockedSpocId) || false,
        updatedAt: new Date().toISOString(),
      },
      isEdit,
    );
  };

  // Whether the SPOC field can be changed: admins always; otherwise only when
  // not locked to the current user.
  const canChangeSpoc = isAdmin || !lockedSpocId;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-rose-600" />
            {isEdit ? "Edit Leave / Unavailability" : "Mark Unavailable"}
          </DialogTitle>
        </DialogHeader>

        {isOverride && (
          <div className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin override — setting availability on behalf of {spocLabel}.
          </div>
        )}

        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          While unavailable, the OLA for newly assigned tickets will not start
          until the SPOC resumes. The employee is acknowledged with the expected
          timeline.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">SPOC *</label>
            {canChangeSpoc ? (
              <select
                value={spocId}
                onChange={(e) => setSpocId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
              >
                <option value="">Select a SPOC…</option>
                {spocOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="outline">{spocLabel}</Badge>
                <span className="text-xs text-muted-foreground">(you)</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                From date *
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                To date *
              </label>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Reason</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background resize-none"
              placeholder="e.g. Annual leave, training, medical…"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isEdit ? "Save" : "Mark Unavailable"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default LeaveCoverageDialog;
