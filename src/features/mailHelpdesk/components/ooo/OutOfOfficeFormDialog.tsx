/**
 * Files leave, or hands cover to somebody else.
 *
 * One dialog for both because the second is the first with everything inherited:
 * the API has no `PATCH`, and a delegate change is `POST /:id/replace` — cancel
 * plus create in one transaction. Tickets the outgoing delegate already picked
 * up stay with them; only new work follows the swap, and the dialog says so
 * rather than letting someone assume a swap moves everything.
 */
import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getFieldErrors, isHelpdeskApiError } from "@/services/pgClient";
import {
  useCreateOutOfOffice,
  useDelegateCandidates,
  useReplaceOutOfOffice,
} from "../../hooks/pg";
import type {
  CreateOutOfOfficePayload,
  OooActivationPolicy,
  OooExpiryPolicy,
  OooReason,
  OutOfOfficeListRow,
  ReplaceOutOfOfficePayload,
} from "../../types/pg";
import {
  atHourInDays,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "../../utils/datetimeLocal";
import {
  ACTIVATION_POLICY_LABEL,
  EXPIRY_POLICY_LABEL,
} from "../../utils/pgOoo";

interface OutOfOfficeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The caller — never offered as their own delegate. */
  currentUserId?: string | null;
  /** Whose roster the delegate picker reads. The caller's own department. */
  departmentId?: string | null;
  /** Present in replace mode: the record whose cover is being handed over. */
  replacing?: OutOfOfficeListRow | null;
}

/** Sent as the value of a "use the department's setting" option. */
const INHERIT = "__inherit__";

const REASONS: OooReason[] = ["LEAVE", "TRAVEL", "TRAINING", "OTHER"];

export function OutOfOfficeFormDialog({
  open,
  onOpenChange,
  currentUserId,
  departmentId,
  replacing,
}: OutOfOfficeFormDialogProps) {
  const { toast } = useToast();
  const isReplace = Boolean(replacing);

  const {
    data: candidateList,
    isLoading: candidatesLoading,
    error: candidatesError,
  } = useDelegateCandidates(departmentId, currentUserId, open);
  const create = useCreateOutOfOffice();
  const replace = useReplaceOutOfOffice();
  const isPending = create.isPending || replace.isPending;

  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [delegateId, setDelegateId] = useState("");
  const [reason, setReason] = useState<OooReason>("LEAVE");
  const [message, setMessage] = useState("");
  const [activationPolicy, setActivationPolicy] = useState<string>(INHERIT);
  const [expiryPolicy, setExpiryPolicy] = useState<string>(INHERIT);
  const [blockNewAssignment, setBlockNewAssignment] = useState(true);
  const [handoverReason, setHandoverReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reset on every open so a dismissed draft never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setDelegateId("");
    setHandoverReason("");
    if (replacing) return;
    setStartsAt(toDatetimeLocalValue(new Date()));
    setEndsAt(toDatetimeLocalValue(atHourInDays(7, 9)));
    setReason("LEAVE");
    setMessage("");
    setActivationPolicy(INHERIT);
    setExpiryPolicy(INHERIT);
    setBlockNewAssignment(true);
  }, [open, replacing]);

  // In replace mode the current delegate is the one value that is refused, so
  // it is dropped from the list rather than offered and then rejected.
  const options = useMemo(
    () =>
      (candidateList?.candidates ?? []).filter(
        (candidate) => candidate.id !== replacing?.default_delegate_id,
      ),
    [candidateList, replacing],
  );

  /**
   * Surfaces a refusal. A 422 binds to the field it names; everything else is
   * shown as written — the API's messages are meant for a person.
   *
   * @param title what failed
   * @param error the rejection
   */
  const reportError = (title: string, error: Error) => {
    const fields = getFieldErrors(error);
    if (fields) setFieldErrors(fields);
    toast({
      title,
      description: isHelpdeskApiError(error)
        ? error.message
        : "Something went wrong.",
      variant: "destructive",
    });
  };

  const submitCreate = () => {
    const startIso = fromDatetimeLocalValue(startsAt);
    const endIso = fromDatetimeLocalValue(endsAt);
    if (!startIso || !endIso || !delegateId) {
      setFieldErrors({
        ...(startIso ? {} : { startsAt: "Pick when the leave begins." }),
        ...(endIso ? {} : { endsAt: "Pick when it ends." }),
        ...(delegateId ? {} : { defaultDelegateId: "Choose who covers." }),
      });
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      setFieldErrors({ endsAt: "The end has to come after the start." });
      return;
    }

    // The body is `.strict()`: an unknown or empty field is a 422, so build it
    // rather than spreading a form object with blanks in it.
    const payload: CreateOutOfOfficePayload = {
      startsAt: startIso,
      endsAt: endIso,
      defaultDelegateId: delegateId,
      reason,
      blockNewAssignment,
    };
    if (message.trim()) payload.message = message.trim();
    if (activationPolicy !== INHERIT) {
      payload.activationPolicy = activationPolicy as OooActivationPolicy;
    }
    if (expiryPolicy !== INHERIT) {
      payload.expiryPolicy = expiryPolicy as OooExpiryPolicy;
    }

    create.mutate(payload, {
      onSuccess: (result) => {
        onOpenChange(false);
        toast({
          title: "Out-of-office recorded",
          description:
            result.warning ??
            (result.delegated > 0
              ? `${result.delegated} open ${result.delegated === 1 ? "ticket" : "tickets"} moved to your delegate.`
              : "No tickets moved — new ones will follow the cover."),
        });
      },
      onError: (error) => reportError("Could not record the leave", error),
    });
  };

  const submitReplace = () => {
    if (!replacing) return;
    if (!delegateId) {
      setFieldErrors({ defaultDelegateId: "Choose the new delegate." });
      return;
    }

    const payload: ReplaceOutOfOfficePayload = {
      defaultDelegateId: delegateId,
    };
    if (handoverReason.trim()) payload.handoverReason = handoverReason.trim();

    replace.mutate(
      { id: replacing.id, payload },
      {
        onSuccess: (result) => {
          onOpenChange(false);
          toast({
            title: "Delegate changed",
            description:
              result.warning ??
              (result.delegated > 0
                ? `${result.delegated} open ${result.delegated === 1 ? "ticket" : "tickets"} moved to the new delegate.`
                : "Tickets the previous delegate already picked up stay with them."),
          });
        },
        onError: (error) => reportError("Could not change the delegate", error),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isReplace ? "Change delegate" : "File out-of-office"}
          </DialogTitle>
          <DialogDescription>
            {isReplace
              ? "Same leave, different cover. Tickets the current delegate already picked up stay with them — only new work follows the swap."
              : "Choose who covers your tickets while you are away."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isReplace && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ooo-start">From</Label>
                <Input
                  id="ooo-start"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
                {fieldErrors.startsAt && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.startsAt}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ooo-end">To</Label>
                <Input
                  id="ooo-end"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
                {fieldErrors.endsAt && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.endsAt}
                  </p>
                )}
              </div>
            </div>
          )}

          {!isReplace && (
            <p className="text-xs text-muted-foreground">
              A start in the past is fine — that is how leave you are already on
              gets filed, and it takes effect immediately.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>{isReplace ? "New delegate" : "Delegate"}</Label>
            <Select value={delegateId} onValueChange={setDelegateId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    candidatesLoading ? "Loading…" : "Who covers for you?"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {options.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                    {candidate.detail && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {candidate.detail}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.defaultDelegateId && (
              <p className="text-xs text-destructive">
                {fieldErrors.defaultDelegateId}
              </p>
            )}
            {candidatesError && (
              <p className="text-xs text-destructive">
                {candidatesError.message}
              </p>
            )}
            {/* Honest about which list is on screen. The roster is the right
                answer; the queue fallback is a narrower set and saying so is
                the difference between "nobody is available" and "you cannot
                see everybody who is". */}
            <p className="text-xs text-muted-foreground">
              {options.length === 0 && !candidatesLoading && !candidatesError
                ? "Nobody in your department can be offered as a delegate — a member has to be active and able to receive tickets. An administrator sets that in Admin → Members."
                : candidateList?.source === "queue"
                  ? "Your account cannot read the department roster, so this list is drawn from agents currently holding tickets. It may not be everybody."
                  : "Your department's members who can receive tickets."}
            </p>
          </div>

          {isReplace ? (
            <div className="space-y-1.5">
              <Label htmlFor="ooo-handover">Why is cover changing?</Label>
              <Textarea
                id="ooo-handover"
                value={handoverReason}
                onChange={(e) => setHandoverReason(e.target.value)}
                placeholder="Recorded on the arrangement being handed over."
                rows={2}
                maxLength={2000}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Select
                    value={reason}
                    onValueChange={(v) => setReason(v as OooReason)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value.charAt(0) + value.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>When it ends</Label>
                  <Select value={expiryPolicy} onValueChange={setExpiryPolicy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={INHERIT}>
                        Department default
                      </SelectItem>
                      {(
                        Object.keys(EXPIRY_POLICY_LABEL) as OooExpiryPolicy[]
                      ).map((value) => (
                        <SelectItem key={value} value={value}>
                          {EXPIRY_POLICY_LABEL[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>What it does to my tickets</Label>
                <Select
                  value={activationPolicy}
                  onValueChange={setActivationPolicy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT}>Department default</SelectItem>
                    {(
                      Object.keys(
                        ACTIVATION_POLICY_LABEL,
                      ) as OooActivationPolicy[]
                    ).map((value) => (
                      <SelectItem key={value} value={value}>
                        {ACTIVATION_POLICY_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activationPolicy === "MANUAL" && (
                  <p className="text-xs text-amber-700">
                    A manual arrangement does nothing until you activate it — it
                    will sit here waiting.
                  </p>
                )}
              </div>

              <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="ooo-block" className="text-sm">
                    Never assign new tickets to me while I am away
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    When the cover chain dead-ends, a new ticket is left
                    unassigned rather than parked in your inbox.
                  </p>
                </div>
                <Switch
                  id="ooo-block"
                  checked={blockNewAssignment}
                  onCheckedChange={setBlockNewAssignment}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ooo-message">Note (optional)</Label>
                <Textarea
                  id="ooo-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Shown as context on the arrangement."
                  rows={2}
                  maxLength={2000}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={isPending}
            onClick={isReplace ? submitReplace : submitCreate}
          >
            {isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            {isReplace ? "Change delegate" : "File leave"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OutOfOfficeFormDialog;
