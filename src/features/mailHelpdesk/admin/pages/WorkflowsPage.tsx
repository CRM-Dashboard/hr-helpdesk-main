/**
 * Workflows — states and transitions, edited as a draft and published as a version.
 *
 * Tickets pin `workflow_id`, and `/auth/me` builds an agent's state vocabulary
 * from the active states of the version they are on. A state deactivated under
 * live tickets therefore vanishes from the client's list *while those tickets sit
 * in it*: the grid shows a state its own filter cannot name, and the ticket can be
 * left with no legal move at all. So a published version is frozen, and retiring
 * a state means publishing a version without it.
 *
 * Two consequences shape this screen. The editor is rendered from `is_draft` — not
 * from the dates, because a draft's `effective_from` is `'infinity'` and reaches
 * the wire as `null`, which would read as "current". And the Publish button is
 * rendered from `validation.publishable`, so the UI cannot offer a publish the
 * server will refuse.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  GitBranch,
  Loader2,
  Plus,
  Rocket,
  Trash2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminKeys,
  useCreateWorkflow,
  useCreateWorkflowVersion,
  useDeleteWorkflowState,
  useDeleteWorkflowTransition,
  usePublishWorkflow,
  useWorkflow,
  useWorkflows,
} from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION, RequirePermission } from "../../permissions";
import type {
  WorkflowStateRow,
  WorkflowTransitionConfig,
} from "../../types/pg";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { WorkflowStateDialog } from "../components/WorkflowStateDialog";
import { WorkflowTransitionDialog } from "../components/WorkflowTransitionDialog";
import { useAdminScope } from "../context/adminScopeContext";

/** Which state flags are set, as short labels. */
function StateFlags({ state }: { state: WorkflowStateRow }) {
  const flags = [
    state.is_initial && "initial",
    state.is_terminal && "terminal",
    state.is_closed && "closed",
    state.is_resolved && "resolved",
    state.is_ola_paused && "clock paused",
    !state.counts_as_active_workload && "off workload",
    !state.requester_visible && "internal",
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge
          key={flag}
          variant="outline"
          className="h-4 px-1 text-[9px] text-slate-500"
        >
          {flag}
        </Badge>
      ))}
    </div>
  );
}

function CreateWorkflowDialog({
  open,
  onOpenChange,
  departmentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
}) {
  const create = useCreateWorkflow();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    create.reset();
    setCode("");
    setName("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription>
            It starts as a draft with no states. Add states and transitions, then
            publish.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="HR_DEFAULT"
              className="mt-1 h-8 font-mono text-sm uppercase"
            />
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="HR default"
              className="mt-1 h-8 text-sm"
            />
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
            disabled={create.isPending || !code.trim() || !name.trim()}
            onClick={() =>
              create.mutate(
                {
                  departmentId,
                  body: { code: code.trim().toUpperCase(), name: name.trim() },
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {create.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const { departmentId } = useAdminScope();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [stateDialogOpen, setStateDialogOpen] = useState(false);
  const [editingState, setEditingState] = useState<WorkflowStateRow | null>(null);
  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);
  const [editingTransition, setEditingTransition] =
    useState<WorkflowTransitionConfig | null>(null);
  const [deletingState, setDeletingState] = useState<WorkflowStateRow | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [publishWarning, setPublishWarning] = useState<string | null>(null);

  const list = useWorkflows(departmentId);
  const detail = useWorkflow(departmentId, selectedId);
  const newVersion = useCreateWorkflowVersion();
  const publish = usePublishWorkflow();
  const deleteState = useDeleteWorkflowState();
  const deleteTransition = useDeleteWorkflowTransition();

  // Memoised because the default-selection effect depends on it: `?? []` would
  // be a fresh array every render and re-run the effect each time.
  const versions = useMemo(() => list.data ?? [], [list.data]);

  useEffect(() => {
    if (selectedId || versions.length === 0) return;
    // Prefer the open draft — it is the only thing on this screen that can be
    // worked on — and fall back to whatever is live.
    const draft = versions.find((v) => v.is_draft);
    setSelectedId((draft ?? versions[0]).id);
  }, [selectedId, versions]);

  const workflow = detail.data;
  const isDraft = workflow?.is_draft ?? false;
  const states = workflow?.states ?? [];
  const transitions = workflow?.transitions ?? [];
  const validation = workflow?.validation;

  return (
    <RequirePermission
      permission={HELPDESK_PERMISSION.WORKFLOW_READ}
      title="Workflows"
    >
      <AdminPageHeader
        title="Workflows"
        icon={GitBranch}
        description="Every version, newest first. A published version is frozen — tickets pin it, and a state that vanished under them would be unnameable by the filter meant to find it."
        isFetching={list.isFetching || detail.isFetching}
        onRefresh={() =>
          departmentId &&
          queryClient.invalidateQueries({
            queryKey: adminKeys.workflows(departmentId),
          })
        }
        actions={
          <Can permission={HELPDESK_PERMISSION.WORKFLOW_WRITE}>
            <Button size="sm" className="h-8" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New workflow
            </Button>
          </Can>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <ApiErrorNotice error={list.error} />

        {publishWarning && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {publishWarning}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {list.isLoading && (
              <p className="text-sm text-muted-foreground">Loading versions…</p>
            )}
            {!list.isLoading && versions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No workflow. A department cannot go live without an active one.
              </p>
            )}
            {versions.map((row) => (
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
                <div className="mt-1 flex items-center gap-1.5">
                  {/* Booleans, not dates — see the file header. */}
                  {row.is_draft && (
                    <Badge
                      variant="outline"
                      className="h-4 border-blue-200 bg-blue-50 px-1 text-[9px] text-blue-700"
                    >
                      draft
                    </Badge>
                  )}
                  {row.is_live && (
                    <Badge
                      variant="outline"
                      className="h-4 border-emerald-200 bg-emerald-50 px-1 text-[9px] text-emerald-700"
                    >
                      live
                    </Badge>
                  )}
                  {!row.is_draft && !row.is_live && (
                    <Badge
                      variant="outline"
                      className="h-4 px-1 text-[9px] text-slate-400"
                    >
                      superseded
                    </Badge>
                  )}
                  <span className="text-[10px] text-slate-400">
                    {row.state_count}s · {row.transition_count}t
                  </span>
                </div>
              </button>
            ))}
          </aside>

          <div className="space-y-4">
            {detail.isLoading && (
              <p className="text-sm text-muted-foreground">Loading version…</p>
            )}

            {workflow && (
              <>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-800">
                        {workflow.name} v{workflow.version_no}
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {workflow.ticket_count} ticket
                        {workflow.ticket_count === 1 ? "" : "s"} pin this version
                        {isDraft && " — none, so it is still editable"}
                      </p>
                    </div>

                    <Can permission={HELPDESK_PERMISSION.WORKFLOW_WRITE}>
                      <div className="flex flex-wrap gap-2">
                        {!isDraft && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={newVersion.isPending}
                            onClick={() =>
                              departmentId &&
                              newVersion.mutate(
                                {
                                  departmentId,
                                  workflowId: workflow.id,
                                  body: { copyFrom: true },
                                },
                                { onSuccess: (row) => setSelectedId(row.id) },
                              )
                            }
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            {newVersion.isPending ? "Copying…" : "Edit as new version"}
                          </Button>
                        )}

                        <Can permission={HELPDESK_PERMISSION.WORKFLOW_PUBLISH}>
                          {isDraft && (
                            <Button
                              size="sm"
                              className="h-8"
                              // Rendered from the server's own verdict, so a
                              // publish this button offers cannot be refused.
                              disabled={!validation?.publishable}
                              title={
                                validation?.publishable
                                  ? undefined
                                  : "Resolve the failed checks first"
                              }
                              onClick={() => {
                                publish.reset();
                                setEffectiveFrom("");
                                setPublishOpen(true);
                              }}
                            >
                              <Rocket className="mr-1.5 h-3.5 w-3.5" />
                              Publish
                            </Button>
                          )}
                        </Can>
                      </div>
                    </Can>
                  </div>

                  <ApiErrorNotice error={newVersion.error} className="mt-3" />

                  {validation && (
                    <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 pt-2">
                      {validation.checks.map((check) => (
                        <li
                          key={check.code}
                          className="flex items-start gap-2 py-1.5"
                        >
                          {check.passed ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                          ) : (
                            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                          )}
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-slate-700">
                              {check.code}
                            </p>
                            {check.message && (
                              <p className="text-xs text-muted-foreground">
                                {check.message}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-slate-800">States</h3>
                    {isDraft && (
                      <Can permission={HELPDESK_PERMISSION.WORKFLOW_WRITE}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => {
                            setEditingState(null);
                            setStateDialogOpen(true);
                          }}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                      </Can>
                    )}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-28">Category</TableHead>
                        <TableHead>Behaviour</TableHead>
                        {isDraft && <TableHead className="w-24" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {states.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={isDraft ? 5 : 4}
                            className="text-sm text-muted-foreground"
                          >
                            No states yet.
                          </TableCell>
                        </TableRow>
                      )}
                      {states.map((state) => (
                        <TableRow
                          key={state.id}
                          className={state.is_active ? "" : "opacity-50"}
                        >
                          <TableCell className="font-mono text-xs">
                            {state.code}
                          </TableCell>
                          <TableCell className="font-medium">{state.name}</TableCell>
                          <TableCell className="text-xs">
                            {state.state_category}
                          </TableCell>
                          <TableCell>
                            <StateFlags state={state} />
                          </TableCell>
                          {isDraft && (
                            <TableCell>
                              <Can permission={HELPDESK_PERMISSION.WORKFLOW_WRITE}>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => {
                                      setEditingState(state);
                                      setStateDialogOpen(true);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive"
                                    onClick={() => {
                                      deleteState.reset();
                                      setDeletingState(state);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </Can>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-slate-800">
                      Transitions
                    </h3>
                    {isDraft && (
                      <Can permission={HELPDESK_PERMISSION.WORKFLOW_WRITE}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => {
                            setEditingTransition(null);
                            setTransitionDialogOpen(true);
                          }}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                      </Can>
                    )}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-32">Code</TableHead>
                        <TableHead>Move</TableHead>
                        <TableHead className="w-32">Label</TableHead>
                        <TableHead>Who may</TableHead>
                        {isDraft && <TableHead className="w-24" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transitions.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={isDraft ? 5 : 4}
                            className="text-sm text-muted-foreground"
                          >
                            No transitions. Without one from ticket creation, no
                            ticket can be raised against this workflow.
                          </TableCell>
                        </TableRow>
                      )}
                      {transitions.map((t) => (
                        <TableRow
                          key={t.id}
                          className={t.is_active ? "" : "opacity-50"}
                        >
                          <TableCell className="font-mono text-xs">{t.code}</TableCell>
                          <TableCell className="text-xs">
                            {t.from_state_code ? (
                              <>
                                {t.from_state_code} → {t.to_state_code}
                              </>
                            ) : (
                              <span className="text-blue-700">
                                creation → {t.to_state_code}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{t.label}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.allowed_role_codes.length === 0
                              ? "any role"
                              : t.allowed_role_codes.join(", ")}
                            {" · "}
                            {t.allowed_actor_types.join(", ")}
                          </TableCell>
                          {isDraft && (
                            <TableCell>
                              <Can permission={HELPDESK_PERMISSION.WORKFLOW_WRITE}>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => {
                                      setEditingTransition(t);
                                      setTransitionDialogOpen(true);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive"
                                    onClick={() =>
                                      departmentId &&
                                      deleteTransition.mutate({
                                        departmentId,
                                        workflowId: workflow.id,
                                        transitionId: t.id,
                                      })
                                    }
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </Can>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <ApiErrorNotice error={deleteTransition.error} />
              </>
            )}
          </div>
        </div>
      </div>

      {departmentId && (
        <CreateWorkflowDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          departmentId={departmentId}
        />
      )}

      {departmentId && workflow && (
        <>
          <WorkflowStateDialog
            open={stateDialogOpen}
            onOpenChange={setStateDialogOpen}
            departmentId={departmentId}
            workflowId={workflow.id}
            record={editingState}
          />
          <WorkflowTransitionDialog
            open={transitionDialogOpen}
            onOpenChange={setTransitionDialogOpen}
            departmentId={departmentId}
            workflowId={workflow.id}
            states={states}
            record={editingTransition}
          />
        </>
      )}

      <ConfirmDialog
        open={Boolean(deletingState)}
        onOpenChange={(open) => !open && setDeletingState(null)}
        title={`Delete ${deletingState?.name ?? ""}?`}
        description={
          <p>
            This is a real delete, and legitimately so — a draft has governed no
            ticket, so there is no history to keep. If a transition still
            references the state, the request is refused and names them.
          </p>
        }
        confirmLabel="Delete"
        destructive
        isPending={deleteState.isPending}
        error={deleteState.error}
        onConfirm={() =>
          departmentId &&
          workflow &&
          deletingState &&
          deleteState.mutate(
            {
              departmentId,
              workflowId: workflow.id,
              stateId: deletingState.id,
            },
            { onSuccess: () => setDeletingState(null) },
          )
        }
      />

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={`Publish version ${workflow?.version_no ?? ""}?`}
        description={
          <>
            <p>
              Tickets created from now pin this version. Existing tickets keep the
              version they were created under, forever — that is what makes
              publishing safe where editing in place is not.
            </p>
            <p>
              Agents fetch their state vocabulary once when the app loads, so open
              sessions keep the previous set until they next refresh.
            </p>
          </>
        }
        confirmLabel="Publish"
        isPending={publish.isPending}
        error={publish.error}
        onConfirm={() =>
          departmentId &&
          workflow &&
          publish.mutate(
            {
              departmentId,
              workflowId: workflow.id,
              body: {
                // Empty means now. A future instant schedules the cutover;
                // back-dating is refused, since a workflow that took effect
                // before it existed would claim tickets it never governed.
                effectiveFrom: effectiveFrom
                  ? new Date(effectiveFrom).toISOString()
                  : undefined,
                supersedeCurrent: true,
              },
              etag: workflow.etag,
            },
            {
              onSuccess: (row) => {
                setPublishOpen(false);
                setPublishWarning(
                  row.warning ??
                    "Published. Agents will see the new states after their next refresh.",
                );
              },
            },
          )
        }
      >
        <div>
          <Label className="text-xs" htmlFor="publish-when">
            Take effect (optional)
          </Label>
          <Input
            id="publish-when"
            type="datetime-local"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="mt-1 h-8 text-sm"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Leave empty to publish now. A future time schedules the cutover.
          </p>
        </div>
      </ConfirmDialog>
    </RequirePermission>
  );
}
