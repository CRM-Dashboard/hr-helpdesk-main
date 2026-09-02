/**
 * Routing rules.
 *
 * The grid is in **resolution order** — `specificity DESC, effective_from DESC` —
 * because that order *is* the answer to "which rule wins", with the catch-all at
 * the bottom where it belongs. It is deliberately not sortable: sorting a routing
 * screen alphabetically hides the only thing an administrator needs to see.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { History, Plus, Route, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  useRetireRoutingRule,
  useRoutingGaps,
  useRoutingRules,
} from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION, RequirePermission } from "../../permissions";
import type { RoutingRuleRow } from "../../types/pg";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RoutingPreviewPanel } from "../components/RoutingPreviewPanel";
import { RoutingRuleDialog } from "../components/RoutingRuleDialog";
import { useAdminScope } from "../context/adminScopeContext";

/** The three scope columns, as one readable cell. */
function ScopeCell({ rule }: { rule: RoutingRuleRow }) {
  if (rule.is_catch_all) {
    return (
      <Badge
        variant="outline"
        className="h-5 border-blue-200 bg-blue-50 px-1.5 text-[10px] text-blue-700"
      >
        catch-all
      </Badge>
    );
  }
  return (
    <div className="space-y-0.5 text-xs">
      {rule.category_name && (
        <p>
          <span className="text-slate-400">category</span> {rule.category_name}
        </p>
      )}
      {rule.subcategory_name && (
        <p>
          <span className="text-slate-400">subcategory</span>{" "}
          {rule.subcategory_name}
        </p>
      )}
      {rule.priority_name && (
        <p>
          <span className="text-slate-400">priority</span> {rule.priority_name}
        </p>
      )}
    </div>
  );
}

export default function RoutingRulesPage() {
  const queryClient = useQueryClient();
  const { departmentId } = useAdminScope();

  const [includeSuperseded, setIncludeSuperseded] = useState(false);
  const filters = { includeSuperseded: includeSuperseded || undefined };
  const { data, isLoading, isFetching, error } = useRoutingRules(
    departmentId,
    filters,
  );
  const gaps = useRoutingGaps(departmentId);
  const retire = useRetireRoutingRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [superseding, setSuperseding] = useState<RoutingRuleRow | null>(null);
  const [retiring, setRetiring] = useState<RoutingRuleRow | null>(null);

  const rules = data ?? [];
  const liveCatchAlls = rules.filter(
    (r) => r.is_catch_all && r.effective_to === null && r.is_active,
  );

  return (
    <RequirePermission
      permission={HELPDESK_PERMISSION.ROUTING_READ}
      title="Routing rules"
    >
      <AdminPageHeader
        title="Routing rules"
        icon={Route}
        description="Listed in the order the engine scans them — most specific first, catch-all last."
        isFetching={isFetching}
        onRefresh={() =>
          departmentId &&
          queryClient.invalidateQueries({
            queryKey: adminKeys.routingRuleLists(departmentId),
          })
        }
        actions={
          <Can permission={HELPDESK_PERMISSION.ROUTING_WRITE}>
            <Button
              size="sm"
              className="h-8"
              onClick={() => {
                setSuperseding(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New rule
            </Button>
          </Can>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {liveCatchAlls.length === 0
                  ? "There is no catch-all. Every ticket that matches nothing else will be created unassigned, with nothing on its timeline explaining why."
                  : "Saving a rule creates a new version — the old one stays, read-only, because tickets pin it."}
              </p>
              <Button
                size="sm"
                variant="outline"
                className={`h-8 flex-shrink-0 ${includeSuperseded ? "border-blue-200 bg-blue-50 text-blue-700" : "bg-white"}`}
                onClick={() => setIncludeSuperseded((v) => !v)}
              >
                <History className="mr-1.5 h-3.5 w-3.5" />
                Show history
              </Button>
            </div>

            {liveCatchAlls.length === 0 && !isLoading && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                No catch-all rule. This is a blocking readiness check — the
                department cannot go live without one.
              </div>
            )}

            <ApiErrorNotice error={error} />

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Spec.</TableHead>
                    <TableHead className="w-48">Scope</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Backup</TableHead>
                    <TableHead className="w-28">Strategy</TableHead>
                    <TableHead className="w-40">Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-sm text-muted-foreground"
                      >
                        Loading rules…
                      </TableCell>
                    </TableRow>
                  )}

                  {!isLoading && rules.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-sm text-muted-foreground"
                      >
                        No rules yet. Start with a catch-all, then add more
                        specific ones above it.
                      </TableCell>
                    </TableRow>
                  )}

                  {rules.map((rule) => {
                    const superseded = rule.effective_to !== null;
                    // The lone live catch-all cannot be retired — without one,
                    // every unmatched ticket is silently unassigned. Superseding
                    // it is fine, because the successor carries the same scope.
                    const isLoneCatchAll =
                      rule.is_catch_all &&
                      !superseded &&
                      liveCatchAlls.length === 1;

                    return (
                      <TableRow
                        key={rule.id}
                        className={superseded ? "opacity-50" : ""}
                      >
                        <TableCell className="text-xs text-slate-400">
                          {rule.specificity}
                        </TableCell>
                        <TableCell>
                          <ScopeCell rule={rule} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {rule.primary_user_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {rule.backup_user_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">{rule.strategy}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px]"
                            >
                              v{rule.version_no}
                            </Badge>
                            {superseded ? (
                              <span className="text-[10px] text-slate-400">
                                superseded
                              </span>
                            ) : (
                              <Can permission={HELPDESK_PERMISSION.ROUTING_WRITE}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    setSuperseding(rule);
                                    setDialogOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive"
                                  disabled={isLoneCatchAll}
                                  title={
                                    isLoneCatchAll
                                      ? "The only catch-all cannot be retired — create a replacement first"
                                      : undefined
                                  }
                                  onClick={() => {
                                    retire.reset();
                                    setRetiring(rule);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
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

            {(gaps.data ?? []).length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">
                  Categories with no rule of their own
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  These fall through to the catch-all. Ranked by how much traffic
                  that is.
                </p>
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {(gaps.data ?? []).map((gap) => (
                    <li key={gap.category_id}>
                      <strong>{gap.category_name}</strong> —{" "}
                      {gap.tickets_last_90_days} tickets in 90 days
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {departmentId && <RoutingPreviewPanel departmentId={departmentId} />}
        </div>
      </div>

      {departmentId && (
        <RoutingRuleDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          departmentId={departmentId}
          record={superseding}
        />
      )}

      <ConfirmDialog
        open={Boolean(retiring)}
        onOpenChange={(open) => !open && setRetiring(null)}
        title="Retire this rule?"
        description={
          <p>
            Its effective window closes now. Nothing is removed — a closed
            ticket's routing rule must always resolve, or its history would stop
            explaining who it went to and why.
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
            { departmentId, ruleId: retiring.id, etag: retiring.etag },
            { onSuccess: () => setRetiring(null) },
          )
        }
      />
    </RequirePermission>
  );
}
