/**
 * Cover and leave, department-wide.
 *
 * The self-service screen answers "who covers *my* work". This answers "who is
 * away next week, and who is holding their tickets" — and, unlike the self-service
 * surface, it has no ownership check, which is what makes it possible to cancel
 * cover for somebody who has already left.
 *
 * Filing and swapping are feature-gated on `OOO_DELEGATION`; activating,
 * cancelling and reading are not, deliberately, so switching the feature off never
 * strands an open delegation mid-leave.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Loader2, Plus, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHelpdeskMeta } from "../../context/helpdeskMetaContext";
import {
  useActivateDepartmentOutOfOffice,
  useAssignableUsers,
  useCancelDepartmentOutOfOffice,
  useCreateDepartmentOutOfOffice,
  useDepartmentOutOfOffice,
  useReplaceDepartmentOutOfOffice,
  departmentOooKey,
} from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION, RequirePermission } from "../../permissions";
import type { OooStatus, OutOfOfficeListRow } from "../../types/pg";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAdminScope } from "../context/adminScopeContext";

const STATUS_TONE: Record<OooStatus, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  EXPIRING: "border-amber-200 bg-amber-50 text-amber-700",
  SCHEDULED: "border-blue-200 bg-blue-50 text-blue-700",
  AWAITING_ACTIVATION: "border-blue-200 bg-blue-50 text-blue-700",
  ENDED: "border-slate-200 bg-slate-100 text-slate-500",
  CANCELLED: "border-slate-200 bg-slate-100 text-slate-400",
};

/** File leave for a colleague, or hand cover on to somebody else. */
function CoverFormDialog({
  open,
  onOpenChange,
  departmentId,
  /** The record being handed over, or null to file new leave. */
  replacing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  replacing: OutOfOfficeListRow | null;
}) {
  const { options } = useHelpdeskMeta();
  const create = useCreateDepartmentOutOfOffice();
  const replace = useReplaceDepartmentOutOfOffice();
  const members = useAssignableUsers(departmentId, open);

  const [userId, setUserId] = useState("");
  const [delegateId, setDelegateId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("LEAVE");
  const [message, setMessage] = useState("");
  const [blockNewAssignment, setBlockNewAssignment] = useState(true);

  useEffect(() => {
    if (!open) return;
    create.reset();
    replace.reset();
    setUserId(replacing?.user_id ?? "");
    setDelegateId("");
    setStartsAt(
      replacing ? replacing.starts_at.slice(0, 16) : "",
    );
    setEndsAt(replacing ? replacing.ends_at.slice(0, 16) : "");
    setReason(replacing?.reason ?? "LEAVE");
    setMessage(replacing?.message ?? "");
    setBlockNewAssignment(replacing?.block_new_assignment ?? true);
  }, [open, replacing]); // eslint-disable-line react-hooks/exhaustive-deps

  const isReplace = Boolean(replacing);
  const isPending = create.isPending || replace.isPending;
  // A person cannot cover for themselves; the database enforces it too.
  const selfCover = Boolean(userId) && userId === delegateId;

  const submit = () => {
    if (isReplace && replacing) {
      replace.mutate(
        {
          departmentId,
          id: replacing.id,
          payload: { defaultDelegateId: delegateId },
        },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }
    create.mutate(
      {
        departmentId,
        payload: {
          userId,
          defaultDelegateId: delegateId,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          reason: reason as never,
          message: message.trim() || undefined,
          blockNewAssignment,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const roster = members.data?.rows ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isReplace ? "Hand cover to someone else" : "File leave for a colleague"}
          </DialogTitle>
          <DialogDescription>
            {isReplace
              ? "The current arrangement is closed as a handover and a successor opens in the same transaction — tickets the previous delegate already picked up stay with them."
              : "Backdating is allowed: it is how leave that has already begun gets filed."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Who is away</Label>
            <Select
              value={userId || undefined}
              onValueChange={setUserId}
              disabled={isReplace}
            >
              <SelectTrigger className="mt-1 h-8 text-sm">
                <SelectValue placeholder="Choose someone" />
              </SelectTrigger>
              <SelectContent>
                {roster.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">
              {isReplace ? "New delegate" : "Who covers"}
            </Label>
            <Select value={delegateId || undefined} onValueChange={setDelegateId}>
              <SelectTrigger className="mt-1 h-8 text-sm">
                <SelectValue placeholder="Choose someone" />
              </SelectTrigger>
              <SelectContent>
                {roster
                  .filter((m) => m.id !== userId)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selfCover && (
              <p className="mt-1 text-xs text-destructive">
                A person cannot be their own delegate.
              </p>
            )}
          </div>

          {!isReplace && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Until</Label>
                  <Input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options("oooReason").map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Note (optional)</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  className="mt-1 text-sm"
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-xs">Block new work reaching them</Label>
                  <p className="text-[11px] text-muted-foreground">
                    On by default. Switching it off lets work land on them anyway
                    when the cover chain dead-ends, rather than leaving the ticket
                    unassigned.
                  </p>
                </div>
                <Switch
                  checked={blockNewAssignment}
                  onCheckedChange={setBlockNewAssignment}
                />
              </div>
            </>
          )}

          <ApiErrorNotice error={create.error ?? replace.error} />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={submit}
            disabled={
              isPending ||
              !userId ||
              !delegateId ||
              selfCover ||
              (!isReplace && (!startsAt || !endsAt))
            }
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {isReplace ? "Hand over" : "File leave"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param iso a timestamp from the API
 * @returns it as a short local date, or an em dash
 */
const shortDate = (iso: string | null) =>
  iso ? format(new Date(iso), "d MMM yyyy, HH:mm") : "—";

export default function CoverPage() {
  const queryClient = useQueryClient();
  const { departmentId } = useAdminScope();

  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [replacing, setReplacing] = useState<OutOfOfficeListRow | null>(null);
  const [cancelling, setCancelling] = useState<OutOfOfficeListRow | null>(null);
  const [cancelMode, setCancelMode] = useState("RETURNED");

  const filters = {
    includeCancelled: includeCancelled || undefined,
    activeOnly: activeOnly || undefined,
    limit: 100,
    sort: "starts_at:desc",
  };
  const { data, isLoading, isFetching, error } = useDepartmentOutOfOffice(
    departmentId,
    filters,
  );
  const activate = useActivateDepartmentOutOfOffice();
  const cancel = useCancelDepartmentOutOfOffice();

  const rows = data?.rows ?? [];

  return (
    <RequirePermission
      permission={[HELPDESK_PERMISSION.OOO_READ, HELPDESK_PERMISSION.OOO_WRITE]}
      title="Cover and leave"
    >
      <AdminPageHeader
        title="Cover & leave"
        icon={ShieldCheck}
        description="Every cover arrangement in the department. Cancelled ones are hidden unless asked for."
        isFetching={isFetching}
        onRefresh={() =>
          departmentId &&
          queryClient.invalidateQueries({
            queryKey: departmentOooKey(departmentId),
          })
        }
        actions={
          <Can permission={HELPDESK_PERMISSION.OOO_WRITE}>
            <Button
              size="sm"
              className="h-8"
              onClick={() => {
                setReplacing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              File leave
            </Button>
          </Can>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className={`h-8 ${activeOnly ? "border-blue-200 bg-blue-50 text-blue-700" : "bg-white"}`}
            onClick={() => setActiveOnly((v) => !v)}
          >
            Away right now
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={`h-8 ${includeCancelled ? "border-blue-200 bg-blue-50 text-blue-700" : "bg-white"}`}
            onClick={() => setIncludeCancelled((v) => !v)}
          >
            Show ended and cancelled
          </Button>
        </div>

        <ApiErrorNotice error={error} />
        <ApiErrorNotice error={activate.error} />

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Away</TableHead>
                <TableHead>Covered by</TableHead>
                <TableHead className="w-48">From</TableHead>
                <TableHead className="w-48">Until</TableHead>
                <TableHead className="w-56">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    Loading arrangements…
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    Nobody is away. When someone files leave, their tickets follow
                    the delegate.
                  </TableCell>
                </TableRow>
              )}

              {rows.map((row) => {
                const closed = Boolean(row.cancelled_at) || row.status === "ENDED";
                return (
                  <TableRow key={row.id} className={closed ? "opacity-60" : ""}>
                    <TableCell className="font-medium">
                      {row.user_name ?? row.user_id}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.reason}
                      </span>
                    </TableCell>
                    <TableCell>{row.delegate_name ?? row.default_delegate_id}</TableCell>
                    <TableCell className="text-xs">
                      {shortDate(row.starts_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {shortDate(row.ends_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge
                          variant="outline"
                          className={`h-5 px-1.5 text-[10px] ${STATUS_TONE[row.status]}`}
                        >
                          {row.status.replace(/_/g, " ").toLowerCase()}
                        </Badge>

                        {!closed && (
                          <Can permission={HELPDESK_PERMISSION.OOO_WRITE}>
                            {row.status === "AWAITING_ACTIVATION" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                disabled={activate.isPending}
                                onClick={() =>
                                  departmentId &&
                                  activate.mutate({ departmentId, id: row.id })
                                }
                              >
                                Turn on
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setReplacing(row);
                                setFormOpen(true);
                              }}
                            >
                              Swap
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive"
                              onClick={() => {
                                cancel.reset();
                                setCancelMode("RETURNED");
                                setCancelling(row);
                              }}
                            >
                              <CalendarOff className="mr-1 h-3 w-3" />
                              End
                            </Button>
                          </Can>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {departmentId && (
        <CoverFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          departmentId={departmentId}
          replacing={replacing}
        />
      )}

      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={`End cover for ${cancelling?.user_name ?? ""}?`}
        description={
          <p>
            The mode decides what happens to the tickets the delegate is holding.
            Returning applies the arrangement's expiry policy now; a handover
            leaves them where they are.
          </p>
        }
        confirmLabel="End cover"
        destructive
        isPending={cancel.isPending}
        error={cancel.error}
        onConfirm={() =>
          departmentId &&
          cancelling &&
          cancel.mutate(
            {
              departmentId,
              id: cancelling.id,
              payload: { mode: cancelMode as never },
            },
            { onSuccess: () => setCancelling(null) },
          )
        }
      >
        <div>
          <Label className="text-xs">Mode</Label>
          <Select value={cancelMode} onValueChange={setCancelMode}>
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RETURNED">
                RETURNED — they are back; settle the delegations
              </SelectItem>
              <SelectItem value="HANDOVER">
                HANDOVER — the delegate keeps what they hold
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </ConfirmDialog>
    </RequirePermission>
  );
}
