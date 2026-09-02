/**
 * OLA policies — the clocks, and the ladder they escalate up.
 *
 * Versioned like routing rules and for the same reason: `ticket_ola_instances`
 * pins both the policy and its version, and the ladder is read live at every
 * evaluation. Editing a running policy's ladder would not change future tickets —
 * it would silently re-time escalation for every clock already started, so a
 * ticket created under a four-hour L1 would begin escalating at two.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Copy, Loader2, Plus, Timer, Trash2 } from "lucide-react";
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
import {
  adminKeys,
  useCategories,
  useCreateOlaPolicy,
  useOlaPolicies,
  useOlaPolicy,
  usePriorities,
  useRetireOlaPolicy,
  useSupersedeOlaPolicy,
} from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION, RequirePermission } from "../../permissions";
import type { OlaPolicyRow } from "../../types/pg";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { OlaLadderEditor } from "../components/OlaLadderEditor";
import { useAdminScope } from "../context/adminScopeContext";

const NONE = "__none";

/** Create a policy. It lands with no ladder — that is the second step. */
function CreatePolicyDialog({
  open,
  onOpenChange,
  departmentId,
  /** Calendars have no admin API; the only honest source is an existing policy. */
  calendarOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  calendarOptions: Array<{ id: string; label: string }>;
}) {
  const create = useCreateOlaPolicy();
  const categories = useCategories(departmentId, { limit: 200 }, open);
  const priorities = usePriorities(departmentId, undefined, open);

  const [name, setName] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [responseTarget, setResponseTarget] = useState("");
  const [resolutionTarget, setResolutionTarget] = useState("");
  const [pauseOnPending, setPauseOnPending] = useState(true);
  const [pauseOnCollaboration, setPauseOnCollaboration] = useState(false);
  const [pauseOnSnooze, setPauseOnSnooze] = useState(true);
  const [extensionMin, setExtensionMin] = useState("0");

  useEffect(() => {
    if (!open) return;
    create.reset();
    setName("");
    setCalendarId(calendarOptions[0]?.id ?? "");
    setCategoryId("");
    setPriorityId("");
    setResponseTarget("");
    setResolutionTarget("");
    setPauseOnPending(true);
    setPauseOnCollaboration(false);
    setPauseOnSnooze(true);
    setExtensionMin("0");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasTarget =
    responseTarget.trim() !== "" || resolutionTarget.trim() !== "";
  // Doing both counts the same delay twice and inflates every compliance number.
  const doubleCounts = pauseOnCollaboration && Number(extensionMin) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New OLA policy</DialogTitle>
          <DialogDescription>
            It is created with no ladder. Add the escalation stages afterwards —
            measuring without escalating is a legitimate configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
              placeholder="HR standard"
              className="mt-1 h-8 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs">Business calendar</Label>
            <Select
              value={calendarId || undefined}
              onValueChange={setCalendarId}
            >
              <SelectTrigger className="mt-1 h-8 text-sm">
                <SelectValue placeholder="No calendar available" />
              </SelectTrigger>
              <SelectContent>
                {calendarOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Calendars have no admin API yet — this list is taken from the
              department's existing policies. A new calendar still needs SQL.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Category</Label>
              <Select
                value={categoryId || NONE}
                onValueChange={(v) => setCategoryId(v === NONE ? "" : v)}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Any</SelectItem>
                  {(categories.data?.rows ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Priority</Label>
              <Select
                value={priorityId || NONE}
                onValueChange={(v) => setPriorityId(v === NONE ? "" : v)}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Any</SelectItem>
                  {(priorities.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">First response (working min)</Label>
              <Input
                type="number"
                min={1}
                value={responseTarget}
                onChange={(e) => setResponseTarget(e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">Resolution (working min)</Label>
              <Input
                type="number"
                min={1}
                value={resolutionTarget}
                onChange={(e) => setResolutionTarget(e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          {!hasTarget && (
            <p className="text-xs text-destructive">
              At least one target is required — a clock with nothing to measure is
              not a policy.
            </p>
          )}

          <div className="space-y-2 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-600">Pause the clock</p>
            {(
              [
                ["Pending on the requester", pauseOnPending, setPauseOnPending],
                [
                  "While a collaboration is open",
                  pauseOnCollaboration,
                  setPauseOnCollaboration,
                ],
                ["While snoozed", pauseOnSnooze, setPauseOnSnooze],
              ] as const
            ).map(([label, value, set]) => (
              <label key={label} className="flex items-center justify-between text-xs">
                {label}
                <Switch checked={value} onCheckedChange={set} />
              </label>
            ))}

            <div>
              <Label className="text-xs">
                Collaboration extension (min instead of pausing)
              </Label>
              <Input
                type="number"
                min={0}
                value={extensionMin}
                onChange={(e) => setExtensionMin(e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>

            {doubleCounts && (
              <p className="text-xs text-destructive">
                Pausing on collaboration and extending for it are mutually
                exclusive — doing both counts the same delay twice.
              </p>
            )}
          </div>

          <ApiErrorNotice error={create.error} />
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
            disabled={
              create.isPending ||
              !name.trim() ||
              !calendarId ||
              !hasTarget ||
              doubleCounts
            }
            onClick={() =>
              create.mutate(
                {
                  departmentId,
                  body: {
                    name: name.trim(),
                    calendarId,
                    categoryId: categoryId || null,
                    priorityId: priorityId || null,
                    responseTargetMinutes:
                      responseTarget.trim() === "" ? null : Number(responseTarget),
                    resolutionTargetMinutes:
                      resolutionTarget.trim() === ""
                        ? null
                        : Number(resolutionTarget),
                    pauseOnPending,
                    pauseOnCollaboration,
                    pauseOnSnooze,
                    collaborationExtensionMin: Number(extensionMin) || 0,
                  },
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {create.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            Create policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OlaPoliciesPage() {
  const queryClient = useQueryClient();
  const { departmentId } = useAdminScope();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [retiring, setRetiring] = useState<OlaPolicyRow | null>(null);

  const list = useOlaPolicies(departmentId);
  const detail = useOlaPolicy(departmentId, selectedId);
  const supersede = useSupersedeOlaPolicy();
  const retire = useRetireOlaPolicy();

  // Memoised because the default-selection effect depends on it: `?? []` would
  // be a fresh array every render and re-run the effect each time.
  const policies = useMemo(() => list.data ?? [], [list.data]);

  // Every distinct calendar the department already uses. The only honest source
  // there is — calendars have no admin API.
  const calendarOptions = useMemo(
    () =>
      Array.from(
        new Map(
          policies
            .filter((p) => p.calendar_id)
            .map((p) => [
              p.calendar_id,
              {
                id: p.calendar_id,
                label: p.calendar_name ?? p.calendar_code ?? p.calendar_id,
              },
            ]),
        ).values(),
      ),
    [policies],
  );

  useEffect(() => {
    if (!selectedId && policies.length > 0) setSelectedId(policies[0].id);
  }, [selectedId, policies]);

  const policy = detail.data;

  return (
    <RequirePermission
      permission={HELPDESK_PERMISSION.OLA_READ}
      title="OLA policies"
    >
      <AdminPageHeader
        title="OLA policies"
        icon={Timer}
        description="Response and resolution clocks, in resolution order. A department with no policy is legal — its tickets simply get no clock."
        isFetching={list.isFetching || detail.isFetching}
        onRefresh={() =>
          departmentId &&
          queryClient.invalidateQueries({
            queryKey: adminKeys.olaPolicyLists(departmentId),
          })
        }
        actions={
          <Can permission={HELPDESK_PERMISSION.OLA_WRITE}>
            <Button
              size="sm"
              className="h-8"
              disabled={calendarOptions.length === 0}
              title={
                calendarOptions.length === 0
                  ? "No calendar is available — the first policy for a department still needs SQL"
                  : undefined
              }
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New policy
            </Button>
          </Can>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <ApiErrorNotice error={list.error} />

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {list.isLoading && (
              <p className="text-sm text-muted-foreground">Loading policies…</p>
            )}
            {!list.isLoading && policies.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No policies. Tickets are created without a clock — a readiness
                warning, not a blocker.
              </p>
            )}
            {policies.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  row.id === selectedId
                    ? "border-slate-300 bg-slate-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">
                    {row.name}
                  </span>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    v{row.version_no}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.category_name ?? "any category"} · specificity{" "}
                  {row.specificity}
                </p>
                {row.live_instances > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-blue-700">
                    <Clock className="h-3 w-3" />
                    {row.live_instances} running
                  </p>
                )}
              </button>
            ))}
          </aside>

          <div className="space-y-4">
            {detail.isLoading && (
              <p className="text-sm text-muted-foreground">Loading policy…</p>
            )}

            {policy && (
              <>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-800">
                        {policy.name}{" "}
                        <span className="text-muted-foreground">
                          v{policy.version_no}
                        </span>
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {policy.calendar_name ?? policy.calendar_code}
                        {policy.calendar_is_24x7 && " · 24×7"}
                      </p>
                    </div>

                    <Can permission={HELPDESK_PERMISSION.OLA_WRITE}>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={supersede.isPending}
                          onClick={() =>
                            departmentId &&
                            supersede.mutate(
                              {
                                departmentId,
                                policyId: policy.id,
                                body: {},
                                etag: policy.etag,
                              },
                              { onSuccess: (row) => setSelectedId(row.id) },
                            )
                          }
                        >
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          New version
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={() => {
                            retire.reset();
                            setRetiring(policy);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Can>
                  </div>

                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">First response</dt>
                      <dd>
                        {policy.response_target_minutes
                          ? `${policy.response_target_minutes} working min`
                          : "not measured"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Resolution</dt>
                      <dd>
                        {policy.resolution_target_minutes
                          ? `${policy.resolution_target_minutes} working min`
                          : "not measured"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Pauses on</dt>
                      <dd>
                        {[
                          policy.pause_on_pending && "pending",
                          policy.pause_on_collaboration && "collaboration",
                          policy.pause_on_snooze && "snooze",
                        ]
                          .filter(Boolean)
                          .join(", ") || "nothing"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Running clocks</dt>
                      <dd>{policy.live_instances}</dd>
                    </div>
                  </dl>

                  <ApiErrorNotice error={supersede.error} className="mt-3" />

                  {supersede.data?.stagesCloned && (
                    <p className="mt-2 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-700">
                      Version {supersede.data.version_no} is in effect. Its ladder
                      was cloned and is editable; the previous version keeps its
                      own, frozen, for the clocks still running against it.
                    </p>
                  )}
                </div>

                {departmentId && (
                  <OlaLadderEditor
                    key={`${policy.id}-${policy.etag}`}
                    departmentId={departmentId}
                    policy={policy}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {departmentId && (
        <CreatePolicyDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          departmentId={departmentId}
          calendarOptions={calendarOptions}
        />
      )}

      <ConfirmDialog
        open={Boolean(retiring)}
        onOpenChange={(open) => !open && setRetiring(null)}
        title={`Retire ${retiring?.name ?? ""}?`}
        description={
          <p>
            New tickets stop resolving to it.{" "}
            {retiring && retiring.live_instances > 0
              ? `The ${retiring.live_instances} clock(s) already running keep running under it and will still escalate — retiring affects new tickets only.`
              : "Nothing is running against it."}
          </p>
        }
        confirmLabel="Retire"
        destructive
        isPending={retire.isPending}
        error={retire.error}
        onConfirm={() =>
          departmentId &&
          retiring &&
          retire.mutate(
            { departmentId, policyId: retiring.id, etag: retiring.etag },
            {
              onSuccess: () => {
                setRetiring(null);
                setSelectedId(null);
              },
            },
          )
        }
      />
    </RequirePermission>
  );
}
