/**
 * A workflow state, on a draft version.
 *
 * The eight behavioural flags are why `workflow_states` is a table rather than an
 * enum — the engine reads every one at runtime.
 *
 * `code` is required on create and rejected on edit. The workflow is versioned and
 * a ticket pins `workflow_id`, so one business state has a different uuid in every
 * published version: the code is the identifier, which is why `/auth/me` returns
 * states with a code and no id, and why `?state=IN_PROGRESS` is resolved
 * server-side.
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
import { useHelpdeskMeta } from "../../context/helpdeskMetaContext";
import {
  useCreateWorkflowState,
  useUpdateWorkflowState,
} from "../../hooks/pg";
import type { StateCategory, WorkflowStateRow } from "../../types/pg";
import { ApiErrorNotice } from "./ApiErrorNotice";

interface WorkflowStateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  workflowId: string;
  record: WorkflowStateRow | null;
}

export function WorkflowStateDialog({
  open,
  onOpenChange,
  departmentId,
  workflowId,
  record,
}: WorkflowStateDialogProps) {
  const { options } = useHelpdeskMeta();
  const create = useCreateWorkflowState();
  const update = useUpdateWorkflowState();
  const isEdit = Boolean(record);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [stateCategory, setStateCategory] = useState<StateCategory>("OPEN");
  const [flags, setFlags] = useState({
    isInitial: false,
    isTerminal: false,
    isOlaPaused: false,
    isResolved: false,
    isClosed: false,
    countsAsActiveWorkload: true,
    requesterVisible: true,
    isActive: true,
  });
  const [requesterLabel, setRequesterLabel] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");

  useEffect(() => {
    if (!open) return;
    create.reset();
    update.reset();
    setCode(record?.code ?? "");
    setName(record?.name ?? "");
    setStateCategory(record?.state_category ?? "OPEN");
    setFlags({
      isInitial: record?.is_initial ?? false,
      isTerminal: record?.is_terminal ?? false,
      isOlaPaused: record?.is_ola_paused ?? false,
      isResolved: record?.is_resolved ?? false,
      isClosed: record?.is_closed ?? false,
      countsAsActiveWorkload: record?.counts_as_active_workload ?? true,
      requesterVisible: record?.requester_visible ?? true,
      isActive: record?.is_active ?? true,
    });
    setRequesterLabel(record?.requester_facing_label ?? "");
    setDisplayOrder(String(record?.display_order ?? 0));
  }, [open, record]); // eslint-disable-line react-hooks/exhaustive-deps

  // A closed state must also be terminal. On edit the server checks against the
  // stored half, so only the create path can be fully validated here.
  const closedNotTerminal = !isEdit && flags.isClosed && !flags.isTerminal;

  const body = {
    name: name.trim(),
    stateCategory,
    ...flags,
    requesterFacingLabel: requesterLabel.trim() === "" ? null : requesterLabel.trim(),
    displayOrder: Number(displayOrder) || 0,
  };

  const submit = () => {
    if (isEdit && record) {
      update.mutate(
        {
          departmentId,
          workflowId,
          stateId: record.id,
          body,
          etag: record.etag,
        },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }
    create.mutate(
      { departmentId, workflowId, body: { ...body, code: code.trim().toUpperCase() } },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const toggle = (
    key: keyof typeof flags,
    label: string,
    hint?: string,
  ) => (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-xs text-slate-700">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        checked={flags[key]}
        onCheckedChange={(v) => setFlags((prev) => ({ ...prev, [key]: v }))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit state" : "New state"}</DialogTitle>
          <DialogDescription>
            Only a draft version can be changed. Every flag here is read by the
            engine at runtime.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isEdit}
                placeholder="IN_PROGRESS"
                className="mt-1 h-8 font-mono text-sm uppercase"
              />
              {isEdit && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The code is the identifier across versions — it cannot change.
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="mt-1 h-8 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">Category</Label>
              <Select
                value={stateCategory}
                onValueChange={(v) => setStateCategory(v as StateCategory)}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options("stateCategory").map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Display order</Label>
              <Input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3">
            {toggle(
              "isInitial",
              "Initial state",
              "Exactly one active state per workflow.",
            )}
            {toggle("isTerminal", "Terminal", "No further moves from here.")}
            {toggle(
              "isClosed",
              "Closed",
              "Must also be terminal. Auto-close needs one of these to exist.",
            )}
            {toggle(
              "isResolved",
              "Resolved",
              "Starts the auto-close window.",
            )}
            {toggle(
              "isOlaPaused",
              "Pauses the OLA clock",
              "While a ticket sits here.",
            )}
            {toggle(
              "countsAsActiveWorkload",
              "Counts as active workload",
              "Feeds LEAST_LOADED routing.",
            )}
            {toggle("requesterVisible", "Visible to the requester")}
            {toggle("isActive", "Active")}
          </div>

          {closedNotTerminal && (
            <p className="text-xs text-destructive">
              A closed state must also be terminal.
            </p>
          )}

          <div>
            <Label className="text-xs">Requester-facing label (optional)</Label>
            <Input
              value={requesterLabel}
              onChange={(e) => setRequesterLabel(e.target.value)}
              placeholder="Leave empty to show the name above"
              className="mt-1 h-8 text-sm"
            />
          </div>

          <ApiErrorNotice error={create.error ?? update.error} />
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
              create.isPending ||
              update.isPending ||
              !name.trim() ||
              (!isEdit && !code.trim()) ||
              closedNotTerminal
            }
          >
            {(create.isPending || update.isPending) && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            {isEdit ? "Save" : "Add state"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
