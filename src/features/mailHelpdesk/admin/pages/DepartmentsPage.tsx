/**
 * Departments — the list, the configuration form, and the go-live checklist.
 *
 * The three defaults (calendar, priority, workflow) and the readiness panel are
 * on one screen deliberately: readiness is re-evaluated after every write and can
 * move a department DRAFT ⇄ READY on its own, so the checklist has to be beside
 * the form that changes it rather than behind a wizard step.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Circle, Plus, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  useActivateDepartment,
  useDeactivateDepartment,
  useDepartmentReadiness,
  usePriorities,
  useUpdateDepartment,
  useWorkflows,
} from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION, RequirePermission } from "../../permissions";
import type { DepartmentRow, ReadinessCheck } from "../../types/pg";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DepartmentStatusBadge } from "../components/DepartmentStatusBadge";
import { CreateDepartmentDialog } from "../components/CreateDepartmentDialog";
import { useAdminScope } from "../context/adminScopeContext";

/** One line of the readiness checklist. */
function CheckRow({ check }: { check: ReadinessCheck }) {
  const Icon = check.passed
    ? CheckCircle2
    : check.severity === "BLOCKING"
      ? XCircle
      : Circle;
  const tone = check.passed
    ? "text-emerald-600"
    : check.severity === "BLOCKING"
      ? "text-destructive"
      : "text-amber-600";

  return (
    <li className="flex items-start gap-2 py-1.5">
      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${tone}`} />
      <div className="min-w-0">
        <p className="font-mono text-xs text-slate-700">{check.code}</p>
        {check.message && (
          <p className="text-xs text-muted-foreground">{check.message}</p>
        )}
        {check.hint && (
          <p className="text-[11px] text-slate-400">{check.hint}</p>
        )}
      </div>
    </li>
  );
}

/** The configuration form and checklist for the department in scope. */
function DepartmentDetail({ department }: { department: DepartmentRow }) {
  const departmentId = department.id;

  const readiness = useDepartmentReadiness(departmentId);
  const update = useUpdateDepartment();
  const activate = useActivateDepartment();
  const deactivate = useDeactivateDepartment();

  // Defaults the department points at. Both lists are small and unpaginated.
  const priorities = usePriorities(departmentId, { includeInactive: false });
  const workflows = useWorkflows(departmentId);

  const [name, setName] = useState(department.name);
  const [supportEmail, setSupportEmail] = useState(department.support_email ?? "");
  const [defaultPriorityId, setDefaultPriorityId] = useState(
    department.default_priority_id ?? "",
  );
  const [defaultWorkflowId, setDefaultWorkflowId] = useState(
    department.default_workflow_id ?? "",
  );

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState("");
  const [reason, setReason] = useState("");

  // Re-seed the form when the scope moves to another department, and after a
  // save — the response is the authority on what was stored.
  useEffect(() => {
    setName(department.name);
    setSupportEmail(department.support_email ?? "");
    setDefaultPriorityId(department.default_priority_id ?? "");
    setDefaultWorkflowId(department.default_workflow_id ?? "");
  }, [department]);

  const dirty =
    name !== department.name ||
    supportEmail !== (department.support_email ?? "") ||
    defaultPriorityId !== (department.default_priority_id ?? "") ||
    defaultWorkflowId !== (department.default_workflow_id ?? "");

  const save = () => {
    // Only what changed: the server rejects an empty body, and sending unchanged
    // values would make every save look like an edit in the audit trail.
    const body: Record<string, unknown> = {};
    if (name !== department.name) body.name = name;
    if (supportEmail !== (department.support_email ?? "")) {
      body.supportEmail = supportEmail.trim() === "" ? null : supportEmail.trim();
    }
    if (defaultPriorityId !== (department.default_priority_id ?? "")) {
      body.defaultPriorityId = defaultPriorityId || null;
    }
    if (defaultWorkflowId !== (department.default_workflow_id ?? "")) {
      body.defaultWorkflowId = defaultWorkflowId || null;
    }
    if (Object.keys(body).length === 0) return;

    update.mutate({ departmentId, body, etag: department.etag });
  };

  const canActivate =
    readiness.data?.ready === true &&
    (department.status === "READY" || department.status === "INACTIVE");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            Configuration
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Code</Label>
              {/* Immutable after creation — it is rendered into every ticket
                  number this department has ever issued. */}
              <Input
                value={department.code}
                disabled
                className="mt-1 h-8 font-mono text-sm"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Immutable — it appears in every ticket number.
              </p>
            </div>

            <div>
              <Label className="text-xs" htmlFor="dept-name">
                Name
              </Label>
              <Input
                id="dept-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={150}
                className="mt-1 h-8 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <Label className="text-xs" htmlFor="dept-email">
                Support mailbox
              </Label>
              <Input
                id="dept-email"
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="hr.support@gera.in"
                className="mt-1 h-8 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">Default priority</Label>
              <Select
                value={defaultPriorityId || undefined}
                onValueChange={setDefaultPriorityId}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {(priorities.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.is_platform ? " (platform)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Default workflow</Label>
              <Select
                value={defaultWorkflowId || undefined}
                onValueChange={setDefaultWorkflowId}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {(workflows.data ?? [])
                    .filter((w) => w.is_live)
                    .map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} v{w.version_no}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            The business calendar is still set in SQL — calendars have no admin
            API yet.
          </p>

          <ApiErrorNotice error={update.error} className="mt-3" />

          <Can permission={HELPDESK_PERMISSION.DEPARTMENT_WRITE}>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                className="h-8"
                disabled={!dirty || update.isPending}
                onClick={save}
              >
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </Can>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-800">Lifecycle</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Deactivating stops intake and new tickets. It touches no existing
            ticket — open work stays workable and OLA clocks keep running.
          </p>

          <div className="flex flex-wrap gap-2">
            <Can permission={HELPDESK_PERMISSION.DEPARTMENT_ACTIVATE}>
              <Button
                size="sm"
                className="h-8"
                disabled={!canActivate || activate.isPending}
                onClick={() =>
                  activate.mutate({ departmentId, etag: department.etag })
                }
              >
                {activate.isPending ? "Activating…" : "Take live"}
              </Button>
            </Can>

            <Can permission={HELPDESK_PERMISSION.DEPARTMENT_DEACTIVATE}>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={department.status !== "ACTIVE"}
                onClick={() => {
                  setAcknowledged("");
                  setReason("");
                  deactivate.reset();
                  setDeactivateOpen(true);
                }}
              >
                Take out of service
              </Button>
            </Can>
          </div>

          {!canActivate && department.status !== "ACTIVE" && (
            <p className="mt-2 text-xs text-muted-foreground">
              {readiness.data?.ready
                ? `A ${department.status} department cannot be activated directly.`
                : "Resolve the blocking checks before taking this department live."}
            </p>
          )}

          <ApiErrorNotice
            error={activate.error}
            title="This department could not go live"
            className="mt-3"
          />
        </div>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Readiness</h2>
          {readiness.data && (
            <Badge
              variant="outline"
              className={
                readiness.data.ready
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-destructive/30 bg-destructive/5 text-destructive"
              }
            >
              {readiness.data.ready ? "Ready" : `${readiness.data.blocking} blocking`}
            </Badge>
          )}
        </div>

        <p className="mb-2 text-[11px] text-muted-foreground">
          Warnings never block. MAIL_NOT_POLLED always fails today — mailbox
          configuration is per deployment, not per department.
        </p>

        {readiness.isLoading && (
          <p className="py-4 text-xs text-muted-foreground">Checking…</p>
        )}

        <ul className="divide-y divide-slate-100">
          {(readiness.data?.checks ?? []).map((check) => (
            <CheckRow key={check.code} check={check} />
          ))}
        </ul>
      </aside>

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={`Take ${department.name} out of service?`}
        description={
          <>
            <p>
              Intake, auto-provisioning and new tickets stop. Nothing that already
              exists is touched: open tickets stay assigned and workable, and
              their OLA clocks keep running.
            </p>
            <p>
              Confirm the number of open tickets. The server checks it against the
              live count and refuses a mismatch — that is what stops a department
              being closed over work nobody has looked at.
            </p>
          </>
        }
        confirmLabel="Take out of service"
        destructive
        isPending={deactivate.isPending}
        error={deactivate.error}
        confirmDisabled={acknowledged.trim() === ""}
        onConfirm={() =>
          deactivate.mutate(
            {
              departmentId,
              body: {
                acknowledgeOpenTickets: Number(acknowledged),
                reason: reason.trim() || undefined,
              },
              etag: department.etag,
            },
            { onSuccess: () => setDeactivateOpen(false) },
          )
        }
      >
        <div>
          <Label className="text-xs" htmlFor="ack-count">
            Open tickets
          </Label>
          <Input
            id="ack-count"
            type="number"
            min={0}
            value={acknowledged}
            onChange={(e) => setAcknowledged(e.target.value)}
            className="mt-1 h-8 text-sm"
            placeholder="e.g. 12"
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="ack-reason">
            Reason (optional)
          </Label>
          <Input
            id="ack-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="mt-1 h-8 text-sm"
            placeholder="merging into Shared Services"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const { departments, department, departmentId, setDepartmentId, isLoading, error } =
    useAdminScope();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <RequirePermission
      permission={HELPDESK_PERMISSION.DEPARTMENT_READ}
      title="Departments"
    >
      <AdminPageHeader
        title="Departments"
        icon={Building2}
        description="Lifecycle, defaults and the go-live checklist. All four statuses are listed — lifecycle decides whether a department is operational, not whether it can be seen."
        isFetching={isLoading}
        onRefresh={() =>
          queryClient.invalidateQueries({ queryKey: adminKeys.departmentLists() })
        }
        actions={
          <Can permission={HELPDESK_PERMISSION.DEPARTMENT_CREATE}>
            <Button size="sm" className="h-8" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New department
            </Button>
          </Can>
        }
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <ApiErrorNotice error={error} />

        {departments.length > 1 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead>Support mailbox</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => setDepartmentId(row.id)}
                    className={`cursor-pointer ${
                      row.id === departmentId ? "bg-slate-50" : ""
                    }`}
                  >
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <DepartmentStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.support_email ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {department ? (
          <DepartmentDetail key={department.id} department={department} />
        ) : (
          !isLoading && (
            <p className="text-sm text-muted-foreground">
              No department is in scope.
            </p>
          )
        )}
      </div>

      <CreateDepartmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </RequirePermission>
  );
}
