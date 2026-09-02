/**
 * A workflow transition, on a draft version.
 *
 * `fromStateId: null` is the **creation** transition — the move from nothing into
 * the initial state. A workflow without one cannot have a ticket created against
 * it at all.
 *
 * On edit, both endpoints and the code are rejected: an edge whose endpoints moved
 * is a different edge, and it could collide with a real one under the uniqueness
 * index. On a draft, delete it and add the edge you meant.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  useCreateWorkflowTransition,
  useUpdateWorkflowTransition,
} from "../../hooks/pg";
import type {
  RoleCode,
  WorkflowStateRow,
  WorkflowTransitionConfig,
} from "../../types/pg";
import { ApiErrorNotice } from "./ApiErrorNotice";

const CREATION = "__creation";

interface WorkflowTransitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  workflowId: string;
  states: WorkflowStateRow[];
  record: WorkflowTransitionConfig | null;
}

export function WorkflowTransitionDialog({
  open,
  onOpenChange,
  departmentId,
  workflowId,
  states,
  record,
}: WorkflowTransitionDialogProps) {
  const { options } = useHelpdeskMeta();
  const create = useCreateWorkflowTransition();
  const update = useUpdateWorkflowTransition();
  const isEdit = Boolean(record);

  const [fromStateId, setFromStateId] = useState<string>(CREATION);
  const [toStateId, setToStateId] = useState("");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [actorTypes, setActorTypes] = useState<string[]>(["USER"]);
  const [requiresReason, setRequiresReason] = useState(false);
  const [requiresAssignment, setRequiresAssignment] = useState(false);
  const [displayOrder, setDisplayOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    create.reset();
    update.reset();
    setFromStateId(record ? (record.from_state_id ?? CREATION) : CREATION);
    setToStateId(record?.to_state_id ?? "");
    setCode(record?.code ?? "");
    setLabel(record?.label ?? "");
    setRoleCodes(record?.allowed_role_codes ?? []);
    setActorTypes(record?.allowed_actor_types ?? ["USER"]);
    setRequiresReason(record?.requires_reason ?? false);
    setRequiresAssignment(record?.requires_assignment ?? false);
    setDisplayOrder(String(record?.display_order ?? 0));
    setIsActive(record?.is_active ?? true);
  }, [open, record]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleIn = (
    list: string[],
    set: (next: string[]) => void,
    value: string,
  ) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const submit = () => {
    const shared = {
      label: label.trim(),
      allowedRoleCodes: roleCodes as RoleCode[],
      allowedActorTypes: actorTypes,
      requiresReason,
      requiresAssignment,
      displayOrder: Number(displayOrder) || 0,
      isActive,
    };

    if (isEdit && record) {
      update.mutate(
        {
          departmentId,
          workflowId,
          transitionId: record.id,
          body: shared,
          etag: record.etag,
        },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }

    create.mutate(
      {
        departmentId,
        workflowId,
        body: {
          ...shared,
          fromStateId: fromStateId === CREATION ? null : fromStateId,
          toStateId,
          code: code.trim().toUpperCase(),
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit transition" : "New transition"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "The endpoints and code are fixed — an edge whose ends moved is a different edge. Delete it and add the one you meant."
              : "Choose “ticket creation” as the source for the move into the initial state."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">From</Label>
              <Select
                value={fromStateId}
                onValueChange={setFromStateId}
                disabled={isEdit}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CREATION}>Ticket creation</SelectItem>
                  {states.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">To</Label>
              <Select
                value={toStateId || undefined}
                onValueChange={setToStateId}
                disabled={isEdit}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Choose a state" />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isEdit}
                placeholder="RESOLVE"
                className="mt-1 h-8 font-mono text-sm uppercase"
              />
            </div>

            <div>
              <Label className="text-xs">Button label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Resolve"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Allowed roles</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {options("roleCode").map((value) => (
                <Badge
                  key={value}
                  variant="outline"
                  onClick={() => toggleIn(roleCodes, setRoleCodes, value)}
                  className={`cursor-pointer text-[10px] ${
                    roleCodes.includes(value)
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "bg-white"
                  }`}
                >
                  {value}
                </Badge>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Select none to allow <strong>any</strong> role.
            </p>
          </div>

          <div>
            <Label className="text-xs">Allowed actors</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {options("actorType").map((value) => (
                <Badge
                  key={value}
                  variant="outline"
                  onClick={() => toggleIn(actorTypes, setActorTypes, value)}
                  className={`cursor-pointer text-[10px] ${
                    actorTypes.includes(value)
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "bg-white"
                  }`}
                >
                  {value}
                </Badge>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Unlike roles, empty is <strong>not</strong> “any” — at least one is
              required.
            </p>
          </div>

          <div className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3">
            {(
              [
                ["Requires a reason", requiresReason, setRequiresReason],
                [
                  "Requires an assignee",
                  requiresAssignment,
                  setRequiresAssignment,
                ],
                ["Active", isActive, setIsActive],
              ] as const
            ).map(([text, value, set]) => (
              <label
                key={text}
                className="flex items-center justify-between py-1.5 text-xs"
              >
                {text}
                <Switch checked={value} onCheckedChange={set} />
              </label>
            ))}
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
              !label.trim() ||
              actorTypes.length === 0 ||
              (!isEdit && (!toStateId || !code.trim()))
            }
          >
            {(create.isPending || update.isPending) && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            {isEdit ? "Save" : "Add transition"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
