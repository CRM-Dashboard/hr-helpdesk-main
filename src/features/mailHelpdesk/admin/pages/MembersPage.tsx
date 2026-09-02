/**
 * Department members.
 *
 * **This is an Activate screen, not a Create User screen**, and that is the
 * single most likely wrong assumption to make against this API. People arrive
 * from the SAP employee sync or by auto-provision on first sign-in; there is no
 * `POST /users` and there must not be one, because it would put rows in `users`
 * that the next sync has no employee record for.
 *
 * "A ticket can land on this person" is two columns — `is_assignable` and
 * `status = 'ACTIVE'` — which is exactly what the routing engine filters on and
 * exactly what the edit drawer writes.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, UserMinus, Users } from "lucide-react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHelpdeskAuth } from "../../context/helpdeskAuthContext";
import {
  adminKeys,
  useDepartmentUsers,
  useOffboardDepartmentUser,
  useRoles,
  useUpdateDepartmentUser,
  useUserImpact,
} from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION, RequirePermission } from "../../permissions";
import type { DepartmentUserRow, UserStatus } from "../../types/pg";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAdminScope } from "../context/adminScopeContext";

const STATUS_TONE: Record<UserStatus, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  INACTIVE: "border-slate-200 bg-slate-100 text-slate-600",
  SUSPENDED: "border-amber-200 bg-amber-50 text-amber-700",
  OFFBOARDED: "border-slate-200 bg-slate-100 text-slate-400",
};

/** What already references this person, read before anything is changed. */
function ImpactPanel({
  departmentId,
  userId,
}: {
  departmentId: string;
  userId: string;
}) {
  const { data, isLoading } = useUserImpact(departmentId, userId);

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground">Checking what references them…</p>
    );
  }
  if (!data) return null;

  const { impact } = data;
  const items: Array<[string, number | string]> = [
    ["Open tickets", impact.openTickets],
    ["Live routing rules", impact.routingRules.length],
    ["OLA escalation stages", impact.olaStages.length],
    ["Out-of-office windows", impact.outOfOffice.length],
    ["Direct reports", impact.directReports],
    ["Departments headed", impact.headsDepartments.length],
  ];

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-medium text-slate-700">
        This person is referenced by
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {items.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium text-slate-700">{value}</dd>
          </div>
        ))}
      </dl>
      {!data.transferSafe && (
        <p className="mt-2 text-[11px] text-amber-700">
          A department transfer is refused while any of these stand — the database
          would not catch it, and the work would be stranded in both departments at
          once.
        </p>
      )}
    </div>
  );
}

/** The activation drawer. */
function MemberDrawer({
  departmentId,
  member,
  onClose,
}: {
  departmentId: string;
  member: DepartmentUserRow;
  onClose: () => void;
}) {
  const { user: me } = useHelpdeskAuth();
  const roles = useRoles(false);
  const update = useUpdateDepartmentUser();
  const offboard = useOffboardDepartmentUser();

  const [isAssignable, setIsAssignable] = useState(member.is_assignable);
  const [status, setStatus] = useState<string>(member.status);
  const [roleId, setRoleId] = useState(member.role_id);
  const [designation, setDesignation] = useState(member.designation ?? "");

  const [offboardOpen, setOffboardOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState("");
  const [reason, setReason] = useState("");

  // Populated after a save when the person became unselectable while rows still
  // name them. Nothing else ever reports this — it is the only moment anyone looks.
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    setIsAssignable(member.is_assignable);
    setStatus(member.status);
    setRoleId(member.role_id);
    setDesignation(member.designation ?? "");
    setWarnings([]);
  }, [member]);

  const isOffboarded = member.status === "OFFBOARDED";
  const dirty =
    isAssignable !== member.is_assignable ||
    status !== member.status ||
    roleId !== member.role_id ||
    designation !== (member.designation ?? "");

  const save = () => {
    const body: Record<string, unknown> = {};
    if (isAssignable !== member.is_assignable) body.isAssignable = isAssignable;
    if (status !== member.status) body.status = status;
    if (roleId !== member.role_id) body.roleId = roleId;
    if (designation !== (member.designation ?? "")) {
      body.designation = designation.trim() === "" ? null : designation.trim();
    }
    if (Object.keys(body).length === 0) return;

    update.mutate(
      { departmentId, userId: member.id, body, etag: member.etag },
      { onSuccess: (row) => setWarnings(row.warnings ?? []) },
    );
  };

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-800">{member.full_name}</p>
          <p className="text-xs text-muted-foreground">{member.email}</p>
          {member.employee_code && (
            <p className="mt-1 font-mono text-[11px] text-slate-400">
              {member.employee_code}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Email and employee code are owned by the identity key and the SAP sync —
            an edit here would be overwritten, so neither is editable.
          </p>
        </div>

        <ImpactPanel departmentId={departmentId} userId={member.id} />

        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="text-sm">Tickets can land on them</Label>
            <p className="text-[11px] text-muted-foreground">
              Half of the routing engine's predicate. The other half is an ACTIVE
              status.
            </p>
          </div>
          <Switch
            checked={isAssignable}
            onCheckedChange={setIsAssignable}
            disabled={isOffboarded}
          />
        </div>

        <div>
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus} disabled={isOffboarded}>
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* OFFBOARDED is deliberately absent: it also stamps offboarded_at,
                  which the ex-employee intake window reads, so it is its own verb. */}
              {(["ACTIVE", "INACTIVE", "SUSPENDED"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isOffboarded && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Offboarded. Setting the status back to ACTIVE reinstates them and
              clears the offboarding stamp in the same statement.
            </p>
          )}
        </div>

        <div>
          <Label className="text-xs">Role</Label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(roles.data ?? [])
                .filter((r) => r.is_active)
                .map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Designation</Label>
          <Input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            maxLength={100}
            className="mt-1 h-8 text-sm"
          />
        </div>

        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs font-medium text-amber-800">Saved, with effects</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-amber-800">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <ApiErrorNotice error={update.error} />

        <Can permission={HELPDESK_PERMISSION.USER_WRITE}>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={onClose}>
              Close
            </Button>
            <Button
              size="sm"
              className="h-8"
              disabled={!dirty || update.isPending}
              onClick={save}
            >
              {update.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Save
            </Button>
          </div>
        </Can>

        <Can permission={HELPDESK_PERMISSION.USER_OFFBOARD}>
          {!isOffboarded && member.id !== me?.id && (
            <div className="border-t border-slate-200 pt-4">
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-destructive/30 text-destructive"
                onClick={() => {
                  setAcknowledged("");
                  setReason("");
                  offboard.reset();
                  setOffboardOpen(true);
                }}
              >
                <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                Offboard
              </Button>
            </div>
          )}
        </Can>
      </div>

      <ConfirmDialog
        open={offboardOpen}
        onOpenChange={setOffboardOpen}
        title={`Offboard ${member.full_name}?`}
        description={
          <>
            <p>
              Their status becomes OFFBOARDED, the leaving date is stamped, and
              routing stops selecting them.
            </p>
            <p>
              <strong>Nothing is reassigned.</strong> Their open tickets stay
              assigned to them — which is why the count has to be acknowledged.
              Confirm the live number; a mismatch is refused and reports the real
              one.
            </p>
          </>
        }
        confirmLabel="Offboard"
        destructive
        isPending={offboard.isPending}
        error={offboard.error}
        confirmDisabled={acknowledged.trim() === ""}
        onConfirm={() =>
          offboard.mutate(
            {
              departmentId,
              userId: member.id,
              body: {
                acknowledgeOpenTickets: Number(acknowledged),
                reason: reason.trim() || undefined,
              },
              etag: member.etag,
            },
            {
              onSuccess: () => {
                setOffboardOpen(false);
                onClose();
              },
            },
          )
        }
      >
        <div>
          <Label className="text-xs" htmlFor="offboard-count">
            Open tickets
          </Label>
          <Input
            id="offboard-count"
            type="number"
            min={0}
            value={acknowledged}
            onChange={(e) => setAcknowledged(e.target.value)}
            className="mt-1 h-8 text-sm"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Read it off the panel behind this dialog. Do not pre-fill it from a
            stale count — the mismatch check is the guard doing its job.
          </p>
        </div>
        <div>
          <Label className="text-xs" htmlFor="offboard-reason">
            Reason (optional)
          </Label>
          <Input
            id="offboard-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="mt-1 h-8 text-sm"
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

export default function MembersPage() {
  const queryClient = useQueryClient();
  const { departmentId } = useAdminScope();

  const [search, setSearch] = useState("");
  const [assignableOnly, setAssignableOnly] = useState(false);
  const [selected, setSelected] = useState<DepartmentUserRow | null>(null);

  const filters = {
    search: search.trim() || undefined,
    assignableOnly: assignableOnly || undefined,
    limit: 100,
    sort: "full_name:asc",
  };
  const { data, isLoading, isFetching, error } = useDepartmentUsers(
    departmentId,
    filters,
  );
  const rows = data?.rows ?? [];

  // Keep the drawer bound to the freshest row, so its etag is never the one from
  // before the last save.
  const current = selected
    ? (rows.find((r) => r.id === selected.id) ?? selected)
    : null;

  return (
    <RequirePermission permission={HELPDESK_PERMISSION.USER_READ} title="Members">
      <AdminPageHeader
        title="Members"
        icon={Users}
        description="People already in this department. There is no Create User — activating someone means letting tickets land on them."
        isFetching={isFetching}
        onRefresh={() =>
          departmentId &&
          queryClient.invalidateQueries({
            queryKey: adminKeys.userLists(departmentId),
          })
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or employee code"
            className="h-8 w-72 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            className={`h-8 ${assignableOnly ? "border-blue-200 bg-blue-50 text-blue-700" : "bg-white"}`}
            onClick={() => setAssignableOnly((v) => !v)}
          >
            Can receive tickets
          </Button>
          {data?.meta && (
            <span className="text-xs text-muted-foreground">
              {rows.length} of {data.meta.total}
            </span>
          )}
        </div>

        <ApiErrorNotice error={error} />

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-32">Role</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-36">Receives tickets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    Loading members…
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    Nobody here yet. People appear after the employee sync runs or
                    when they first sign in.
                  </TableCell>
                </TableRow>
              )}

              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <TableCell className="font-medium">
                    {row.full_name}
                    {row.designation && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.designation}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {row.role_code}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`h-5 px-1.5 text-[10px] ${STATUS_TONE[row.status]}`}
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.is_assignable && row.status === "ACTIVE" ? (
                      <span className="text-xs text-emerald-700">Yes</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {row.is_assignable ? "Flagged, but not active" : "No"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet
        open={Boolean(current)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent className="w-[420px] overflow-y-auto sm:max-w-[420px]">
          <SheetHeader>
            <SheetTitle>Member</SheetTitle>
            <SheetDescription>
              Read what references them before changing anything — a role or
              assignability change is reported, never refused.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {current && departmentId && (
              <MemberDrawer
                key={current.id}
                departmentId={departmentId}
                member={current}
                onClose={() => setSelected(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </RequirePermission>
  );
}
