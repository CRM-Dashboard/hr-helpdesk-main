/**
 * Ends a cover arrangement early.
 *
 * The mode is the whole decision and cannot be inferred from the record, so it
 * is asked for explicitly rather than defaulted silently: `RETURNED` applies the
 * expiry policy **now**, `HANDOVER` leaves the delegated tickets where they are.
 * Which of those actually moves anything depends on the arrangement's own expiry
 * policy, so the dialog spells out the combination in front of the user.
 */
import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCancelOutOfOffice } from "../../hooks/pg";
import type { OooCancelMode, OutOfOfficeListRow } from "../../types/pg";

interface OutOfOfficeCancelDialogProps {
  record: OutOfOfficeListRow | null;
  onOpenChange: (open: boolean) => void;
}

export function OutOfOfficeCancelDialog({
  record,
  onOpenChange,
}: OutOfOfficeCancelDialogProps) {
  const { toast } = useToast();
  const cancel = useCancelOutOfOffice();
  const [mode, setMode] = useState<OooCancelMode>("RETURNED");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!record) return;
    setMode("RETURNED");
    setReason("");
  }, [record]);

  const returnsWork =
    mode === "RETURNED" && record?.expiry_policy === "RETURN_TO_OWNER";

  const submit = () => {
    if (!record) return;
    cancel.mutate(
      { id: record.id, payload: { mode, reason: reason.trim() || undefined } },
      {
        onSuccess: (result) => {
          onOpenChange(false);
          toast({
            title: "Cover ended",
            // `mode` is echoed because the server, not this form, decides what
            // was actually applied.
            description:
              result.reverted > 0
                ? `${result.reverted} ${result.reverted === 1 ? "ticket" : "tickets"} came back to you (${result.mode.toLowerCase()}).`
                : `Nothing moved (${result.mode.toLowerCase()}).`,
          });
        },
        onError: (error) =>
          toast({
            title: "Could not end the cover",
            description: error.message,
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>End this cover early</DialogTitle>
          <DialogDescription>
            The expiry policy is applied now, not at the end date the
            arrangement no longer has.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as OooCancelMode)}
          className="space-y-2"
        >
          <div className="flex items-start gap-3 rounded-md border border-border p-3">
            <RadioGroupItem value="RETURNED" id="ooo-cancel-returned" />
            <div>
              <Label htmlFor="ooo-cancel-returned">I am back</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {record?.expiry_policy === "RETURN_TO_OWNER"
                  ? "Open delegated tickets come back to you in this request."
                  : "This arrangement keeps tickets with the delegate, so nothing moves."}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border border-border p-3">
            <RadioGroupItem value="HANDOVER" id="ooo-cancel-handover" />
            <div>
              <Label htmlFor="ooo-cancel-handover">
                Just end the arrangement
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Nothing moves. The delegate keeps everything they picked up.
              </p>
            </div>
          </div>
        </RadioGroup>

        <div className="space-y-1.5">
          <Label htmlFor="ooo-cancel-reason">Reason (optional)</Label>
          <Textarea
            id="ooo-cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Recorded on the arrangement."
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button disabled={cancel.isPending} onClick={submit}>
            {cancel.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            {returnsWork ? "End and take my tickets back" : "End cover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OutOfOfficeCancelDialog;
