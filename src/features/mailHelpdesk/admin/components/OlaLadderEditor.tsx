/**
 * The escalation ladder.
 *
 * Sent whole, always. There is no per-stage verb, and that is a correctness
 * constraint rather than an ergonomic preference: thresholds must ascend with
 * `stage_no` and exactly one stage may be the breach stage, so moving a threshold
 * past its neighbour or moving the breach flag down a rung has **no valid
 * intermediate state** — every one-row step violates one of the two rules.
 *
 * `stageNo` is explicit rather than inferred from array position, so reordering
 * renumbers and sends both. If the array's order and the stored `stage_no`
 * disagreed, the ladder would read one way and fire another.
 */
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useAssignableUsers, usePutOlaStages } from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION } from "../../permissions";
import type {
  EscalateToType,
  OlaPolicyRow,
  OlaStageRow,
  PutOlaStagesBody,
} from "../../types/pg";
import { ApiErrorNotice } from "./ApiErrorNotice";

/** The form's view of one rung. */
interface DraftStage {
  stageCode: string;
  thresholdMinutes: string;
  escalateToType: EscalateToType;
  escalateToUserId: string;
  escalateToRoleCode: string;
  preBreachWarningMin: string;
  notifyAssignee: boolean;
  notifyRequester: boolean;
  autoReassign: boolean;
  isBreachStage: boolean;
}

/**
 * @param stage a stored stage
 * @returns its editable form
 */
const toDraft = (stage: OlaStageRow): DraftStage => ({
  stageCode: stage.stage_code,
  thresholdMinutes: String(stage.threshold_minutes),
  escalateToType: stage.escalate_to_type,
  escalateToUserId: stage.escalate_to_user_id ?? "",
  escalateToRoleCode: stage.escalate_to_role_code ?? "",
  preBreachWarningMin:
    stage.pre_breach_warning_min === null
      ? ""
      : String(stage.pre_breach_warning_min),
  notifyAssignee: stage.notify_assignee,
  notifyRequester: stage.notify_requester,
  autoReassign: stage.auto_reassign,
  isBreachStage: stage.is_breach_stage,
});

const EMPTY: DraftStage = {
  stageCode: "",
  thresholdMinutes: "",
  escalateToType: "ASSIGNEE_MANAGER",
  escalateToUserId: "",
  escalateToRoleCode: "",
  preBreachWarningMin: "",
  notifyAssignee: true,
  notifyRequester: false,
  autoReassign: false,
  isBreachStage: false,
};

export function OlaLadderEditor({
  departmentId,
  policy,
}: {
  departmentId: string;
  policy: OlaPolicyRow;
}) {
  const { options } = useHelpdeskMeta();
  const save = usePutOlaStages();
  const members = useAssignableUsers(departmentId);

  const [stages, setStages] = useState<DraftStage[]>([]);

  useEffect(() => {
    setStages((policy.stages ?? []).map(toDraft));
    save.reset();
  }, [policy]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = policy.stages_editable;

  const patch = (index: number, changes: Partial<DraftStage>) =>
    setStages((prev) =>
      prev.map((stage, i) => (i === index ? { ...stage, ...changes } : stage)),
    );

  /** Exactly one breach stage — setting it here clears the others. */
  const setBreach = (index: number) =>
    setStages((prev) =>
      prev.map((stage, i) => ({ ...stage, isBreachStage: i === index })),
    );

  const move = (index: number, delta: number) =>
    setStages((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  // Client-side mirrors of the two database rules, so the common mistakes are
  // caught before a round trip. The server enforces both regardless.
  const ascending = stages.every(
    (stage, i) =>
      i === 0 ||
      Number(stage.thresholdMinutes) > Number(stages[i - 1].thresholdMinutes),
  );
  const breachCount = stages.filter((s) => s.isBreachStage).length;
  const warningsValid = stages.every(
    (s) =>
      s.preBreachWarningMin.trim() === "" ||
      Number(s.preBreachWarningMin) < Number(s.thresholdMinutes),
  );
  const complete = stages.every(
    (s) => s.stageCode.trim() !== "" && s.thresholdMinutes.trim() !== "",
  );
  const valid =
    stages.length > 0 && ascending && breachCount === 1 && warningsValid && complete;

  const submit = () => {
    const body: PutOlaStagesBody = {
      stages: stages.map((stage, index) => ({
        // Renumbered from the rendered order — the two must never disagree.
        stageNo: index + 1,
        stageCode: stage.stageCode.trim().toUpperCase(),
        thresholdMinutes: Number(stage.thresholdMinutes),
        escalateToType: stage.escalateToType,
        escalateToUserId:
          stage.escalateToType === "USER" ? stage.escalateToUserId || null : null,
        escalateToRoleCode:
          stage.escalateToType === "ROLE"
            ? (stage.escalateToRoleCode as never) || null
            : null,
        preBreachWarningMin:
          stage.preBreachWarningMin.trim() === ""
            ? null
            : Number(stage.preBreachWarningMin),
        notifyAssignee: stage.notifyAssignee,
        notifyRequester: stage.notifyRequester,
        autoReassign: stage.autoReassign,
        isBreachStage: stage.isBreachStage,
      })),
    };
    save.mutate({ departmentId, policyId: policy.id, body });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Escalation ladder
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Thresholds are <strong>working</strong> minutes from the clock start
            and must ascend. Exactly one stage records the breach.
          </p>
        </div>
        {!editable && (
          <p className="max-w-xs rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            {policy.live_instances} clock(s) are running against this policy. The
            ladder is read at every evaluation, so editing it would re-time
            escalation for tickets already in flight. Supersede the policy — its
            stages are cloned onto a version only new tickets use.
          </p>
        )}
      </div>

      {stages.length === 0 && (
        <p className="py-3 text-xs text-muted-foreground">
          No ladder. Measuring without escalating is legal — the clock still runs
          and still records a breach target, nothing is notified.
        </p>
      )}

      <div className="space-y-3">
        {stages.map((stage, index) => (
          <div
            key={index}
            className="rounded-md border border-slate-200 bg-slate-50/60 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">
                Stage {index + 1}
              </span>
              {editable && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={index === stages.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={() =>
                      setStages((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs">Code</Label>
                <Input
                  value={stage.stageCode}
                  onChange={(e) => patch(index, { stageCode: e.target.value })}
                  disabled={!editable}
                  placeholder="L1"
                  className="mt-1 h-8 font-mono text-sm uppercase"
                />
              </div>

              <div>
                <Label className="text-xs">Fires after (working min)</Label>
                <Input
                  type="number"
                  min={1}
                  value={stage.thresholdMinutes}
                  onChange={(e) =>
                    patch(index, { thresholdMinutes: e.target.value })
                  }
                  disabled={!editable}
                  className="mt-1 h-8 text-sm"
                />
              </div>

              <div>
                <Label className="text-xs">Escalate to</Label>
                <Select
                  value={stage.escalateToType}
                  onValueChange={(v) =>
                    patch(index, { escalateToType: v as EscalateToType })
                  }
                  disabled={!editable}
                >
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options("escalateToType").map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Warn before (min)</Label>
                <Input
                  type="number"
                  min={1}
                  value={stage.preBreachWarningMin}
                  onChange={(e) =>
                    patch(index, { preBreachWarningMin: e.target.value })
                  }
                  disabled={!editable}
                  placeholder="none"
                  className="mt-1 h-8 text-sm"
                />
              </div>

              {stage.escalateToType === "USER" && (
                <div className="sm:col-span-2">
                  <Label className="text-xs">Person</Label>
                  <Select
                    value={stage.escalateToUserId || undefined}
                    onValueChange={(v) => patch(index, { escalateToUserId: v })}
                    disabled={!editable}
                  >
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue placeholder="Choose someone" />
                    </SelectTrigger>
                    <SelectContent>
                      {(members.data?.rows ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {stage.escalateToType === "ROLE" && (
                <div className="sm:col-span-2">
                  <Label className="text-xs">Role</Label>
                  <Select
                    value={stage.escalateToRoleCode || undefined}
                    onValueChange={(v) => patch(index, { escalateToRoleCode: v })}
                    disabled={!editable}
                  >
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue placeholder="Choose a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {options("roleCode").map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {(
                [
                  ["notifyAssignee", "Notify the assignee"],
                  ["notifyRequester", "Notify the requester"],
                  ["autoReassign", "Reassign automatically"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={stage[key]}
                    onCheckedChange={(v) => patch(index, { [key]: v })}
                    disabled={!editable}
                  />
                  {label}
                </label>
              ))}

              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={stage.isBreachStage}
                  onCheckedChange={() => setBreach(index)}
                  disabled={!editable}
                />
                Records the breach
              </label>
            </div>
          </div>
        ))}
      </div>

      {editable && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 h-8"
            disabled={stages.length >= 20}
            onClick={() => setStages((prev) => [...prev, { ...EMPTY }])}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add a stage
          </Button>

          {stages.length > 0 && !valid && (
            <ul className="mt-3 list-inside list-disc space-y-0.5 text-xs text-destructive">
              {!complete && <li>Every stage needs a code and a threshold.</li>}
              {!ascending && (
                <li>
                  Thresholds must ascend — a stage cannot fire before the one above
                  it.
                </li>
              )}
              {breachCount !== 1 && (
                <li>
                  Exactly one stage must record the breach; {breachCount} do. With
                  none, nothing would ever mark the policy breached.
                </li>
              )}
              {!warningsValid && (
                <li>
                  A pre-breach warning must come before its own stage fires.
                </li>
              )}
            </ul>
          )}

          <ApiErrorNotice error={save.error} className="mt-3" />

          <Can permission={HELPDESK_PERMISSION.OLA_WRITE}>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                className="h-8"
                disabled={!valid || save.isPending}
                onClick={submit}
              >
                {save.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Save ladder
              </Button>
            </div>
          </Can>
        </>
      )}
    </div>
  );
}
