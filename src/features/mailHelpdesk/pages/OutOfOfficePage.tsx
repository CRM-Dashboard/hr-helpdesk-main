/**
 * Out of office — "who covers my work while I am away".
 *
 * Self-service only: every call on this screen is about the signed-in agent,
 * and a record belonging to a colleague answers 404 even when that agent is its
 * delegate. Managing somebody else's cover is the admin surface, which the API
 * exposes but this frontend does not use yet.
 *
 * Replaces the SAP-era `SpocAvailabilityPage`, which stored leave with no
 * delegation behaviour behind it — filing a window there moved no tickets.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarOff,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHelpdeskAuth } from "../context/helpdeskAuthContext";
import { helpdeskKeys, useOutOfOfficeList } from "../hooks/pg";
import type { OutOfOfficeListRow } from "../types/pg";
import { OutOfOfficeCancelDialog } from "../components/ooo/OutOfOfficeCancelDialog";
import { OutOfOfficeCard } from "../components/ooo/OutOfOfficeCard";
import { OutOfOfficeFormDialog } from "../components/ooo/OutOfOfficeFormDialog";

/** Which question the list is answering. Same rows either way. */
type Lens = "mine" | "covering";

export function OutOfOfficePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, hasPermission, isLoading: authLoading } = useHelpdeskAuth();

  const [lens, setLens] = useState<Lens>("mine");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [replacing, setReplacing] = useState<OutOfOfficeListRow | null>(null);
  const [cancelling, setCancelling] = useState<OutOfOfficeListRow | null>(null);

  // Branch on the permission, not the role code: DEPT_HEAD, MANAGER and SPOC
  // hold `helpdesk.ooo.write`, an EMPLOYEE holds no helpdesk permissions at all
  // and every route here answers 403 for them.
  const canRead =
    hasPermission("helpdesk.ooo.read") || hasPermission("helpdesk.ooo.write");
  const canWrite = hasPermission("helpdesk.ooo.write");

  const filters = useMemo(
    () => ({
      covering: lens === "covering" ? true : undefined,
      includeCancelled: includeCancelled || undefined,
      limit: 50,
      sort: "starts_at:desc",
    }),
    [lens, includeCancelled],
  );

  const { data, isFetching, error } = useOutOfOfficeList(filters, canRead);
  const rows = data?.rows ?? [];

  const openCreate = () => {
    setReplacing(null);
    setFormOpen(true);
  };

  const openReplace = (record: OutOfOfficeListRow) => {
    setReplacing(record);
    setFormOpen(true);
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex h-[52px] items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="flex h-8 items-center gap-1.5 px-2 text-slate-600"
        >
          <ArrowLeft size={16} />
          Back
        </Button>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <CalendarOff size={16} className="text-slate-500" />
          <h1 className="text-sm font-semibold text-slate-800">Out of office</h1>
        </div>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: helpdeskKeys.ooo() })
          }
          disabled={isFetching}
          className="flex h-8 items-center gap-2 bg-white"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Loading…" : "Refresh"}
        </Button>

        {canWrite && (
          <Button size="sm" className="h-8" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            File leave
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-6">
          {authLoading && (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking your access…
            </div>
          )}

          {!authLoading && !canRead && (
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-medium">Cover arrangements are not yours to set</p>
                <p className="mt-0.5">
                  Out-of-office delegation is for people who are assigned
                  tickets. Your account
                  {user?.roleCode ? ` (${user.roleCode})` : ""} does not hold the
                  helpdesk out-of-office permission.
                </p>
              </div>
            </div>
          )}

          {canRead && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs value={lens} onValueChange={(v) => setLens(v as Lens)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="mine" className="text-xs">
                      My leave
                    </TabsTrigger>
                    <TabsTrigger value="covering" className="text-xs">
                      I am covering
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 ${
                    includeCancelled
                      ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      : "bg-white"
                  }`}
                  onClick={() => setIncludeCancelled((v) => !v)}
                >
                  Show ended and cancelled
                </Button>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error.message}
                </div>
              )}

              {isFetching && rows.length === 0 && (
                <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading arrangements…
                </div>
              )}

              {!isFetching && rows.length === 0 && !error && (
                <p className="py-10 text-sm text-muted-foreground">
                  {lens === "mine"
                    ? "You have no cover arranged. File leave when you are going to be away, and your tickets follow the delegate."
                    : "You are not covering for anyone."}
                </p>
              )}

              {rows.map((record) => (
                <OutOfOfficeCard
                  key={record.id}
                  record={record}
                  // Being someone's delegate does not make their leave yours to
                  // cancel or hand on — the API answers 404 for that.
                  canManage={canWrite && lens === "mine"}
                  onReplace={openReplace}
                  onCancel={setCancelling}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <OutOfOfficeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        currentUserId={user?.id}
        departmentId={user?.departmentId}
        replacing={replacing}
      />

      <OutOfOfficeCancelDialog
        record={cancelling}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
      />
    </div>
  );
}

export default OutOfOfficePage;
