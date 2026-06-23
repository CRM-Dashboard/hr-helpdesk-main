import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import LoadingOverlay from "@/components/ui/loading-overlay";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  CalendarOff,
  Pencil,
  X as XIcon,
  ShieldCheck,
} from "lucide-react";
import {
  clearSpocAvailability,
  fetchSpocAvailability,
  setSpocAvailability,
} from "../api/trackerHelpdesk";
import { SpocAvailability } from "../types/leaveCoverage";
import { availabilityStatus, AvailabilityStatus } from "../utils/leaveCoverage";
import { LeaveCoverageDialog } from "../components/LeaveCoverageDialog";
import { getAuthCredentials } from "@/services/sapClient";

const sameId = (a?: string, b?: string) =>
  String(a || "").toUpperCase() === String(b || "").toUpperCase();

function getIsAdmin(): boolean {
  try {
    const raw = sessionStorage.getItem("roles");
    if (!raw) return true; // can't determine → allow (kept permissive for demo)
    return JSON.stringify(JSON.parse(raw)).toLowerCase().includes("admin");
  } catch {
    return true;
  }
}

const STATUS_BADGE: Record<AvailabilityStatus, string> = {
  unavailable: "bg-rose-100 text-rose-700 border-rose-200",
  scheduled: "bg-amber-100 text-amber-700 border-amber-200",
  available: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  unavailable: "Unavailable",
  scheduled: "Leave scheduled",
  available: "Available",
};

interface SpocRow {
  spocId: string;
  name: string;
  record: SpocAvailability | null;
  status: AvailabilityStatus;
  isSelf: boolean;
}

export function SpocAvailabilityPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const currentUser = (getAuthCredentials()?.userName || "").toUpperCase();
  const isAdmin = useMemo(() => getIsAdmin(), []);

  const managers = useMemo(() => {
    const m = (location.state as any)?.managers;
    return Array.isArray(m) ? m : [];
  }, [location.state]);

  const spocOptions = useMemo(
    () =>
      managers
        .filter((m: any) => m?.userid)
        .map((m: any) => ({
          value: String(m.userid),
          label: `${m.name || m.userid} (${m.userid})`,
        })),
    [managers],
  );

  const [records, setRecords] = useState<SpocAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<SpocAvailability | null>(null);
  const [clearTarget, setClearTarget] = useState<SpocAvailability | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const list = await fetchSpocAvailability();
      setRecords(list);
    } catch (error: any) {
      toast({
        title: "Failed to load availability",
        description: error?.message || "Could not fetch SPOC availability.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordFor = (spocId: string) =>
    records.find((r) => sameId(r.spocId, spocId)) || null;

  // One row per SPOC (managers), plus any orphan records not in the list.
  const rows: SpocRow[] = useMemo(() => {
    const base: SpocRow[] = managers
      .filter((m: any) => m?.userid)
      .map((m: any) => {
        const record = recordFor(m.userid);
        return {
          spocId: String(m.userid),
          name: String(m.name || m.userid),
          record,
          status: availabilityStatus(record),
          isSelf: sameId(m.userid, currentUser),
        };
      });

    const known = new Set(base.map((r) => r.spocId.toUpperCase()));
    const orphans: SpocRow[] = records
      .filter((r) => !known.has(String(r.spocId).toUpperCase()))
      .map((r) => ({
        spocId: r.spocId,
        name: r.name || r.spocId,
        record: r,
        status: availabilityStatus(r),
        isSelf: sameId(r.spocId, currentUser),
      }));

    const all = [...base, ...orphans];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.spocId.toLowerCase().includes(q),
        )
      : all;

    // Self first, then unavailable/scheduled, then by name.
    const rank: Record<AvailabilityStatus, number> = {
      unavailable: 0,
      scheduled: 1,
      available: 2,
    };
    return filtered.sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return a.name.localeCompare(b.name);
    });
  }, [managers, records, search, currentUser]);

  const canManage = (row: SpocRow) => isAdmin || row.isSelf;

  const openMarkSelf = () => {
    setEditing(null);
    setShowDialog(true);
  };

  const openEdit = (row: SpocRow) => {
    setEditing(
      row.record ?? {
        spocId: row.spocId,
        name: row.name,
        fromDate: "",
        toDate: "",
      },
    );
    setShowDialog(true);
  };

  const handleSave = async (record: SpocAvailability) => {
    setShowDialog(false);
    setIsSaving(true);

    const isEdit = records.some((r) => sameId(r.spocId, record.spocId));
    const finalRecord: SpocAvailability = {
      ...record,
      setBy: currentUser,
    };

    // Upsert locally (one active record per SPOC).
    setRecords((prev) => {
      const others = prev.filter((r) => !sameId(r.spocId, record.spocId));
      return [...others, finalRecord];
    });

    try {
      await setSpocAvailability(finalRecord, isEdit ? "UPDATE" : "SET");
      toast({
        title: isEdit ? "Availability updated" : "Marked unavailable",
        description: `${finalRecord.name || finalRecord.spocId}: ${format(
          new Date(finalRecord.fromDate),
          "dd MMM",
        )} – ${format(new Date(finalRecord.toDate), "dd MMM yyyy")}`,
      });
    } catch (e: any) {
      toast({
        title: "Saved locally only",
        description:
          "The availability is shown here but could not be persisted. " +
          (e?.message || ""),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
      setEditing(null);
    }
  };

  const handleClear = async () => {
    const target = clearTarget;
    if (!target) return;
    setClearTarget(null);
    setIsSaving(true);

    setRecords((prev) => prev.filter((r) => !sameId(r.spocId, target.spocId)));

    try {
      await clearSpocAvailability(target);
      toast({
        title: "Availability cleared",
        description: `${target.name || target.spocId} is now available.`,
      });
    } catch (e: any) {
      toast({
        title: "Cleared locally only",
        description:
          "The record was removed from view but could not be cleared on the server. " +
          (e?.message || ""),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const fmt = (d?: string) => (d ? format(new Date(d), "dd MMM yyyy") : "—");

  return (
    <div className="h-screen flex flex-col bg-background">
      <LoadingOverlay open={isSaving} text="Saving…" />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-[52px] bg-white border-b border-slate-200">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 h-8 px-2 text-slate-600"
        >
          <ArrowLeft size={16} />
          Back
        </Button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2">
          <CalendarOff size={16} className="text-slate-500" />
          <h1 className="text-sm font-semibold text-slate-800">
            SPOC Availability &amp; Leave Coverage
          </h1>
        </div>
        {isAdmin && (
          <Badge
            variant="outline"
            className="text-[10px] h-5 border-violet-200 text-violet-700"
          >
            <ShieldCheck className="h-3 w-3 mr-1" />
            Admin
          </Badge>
        )}
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-2 h-8 bg-white"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Loading…" : "Refresh"}
        </Button>
        <Button
          size="sm"
          onClick={openMarkSelf}
          className="flex items-center gap-1.5 h-8 bg-rose-600 hover:bg-rose-700 text-white"
        >
          <CalendarOff size={14} />
          Mark Unavailable
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-border bg-muted/30">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search SPOC by name or id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 pr-3 py-1.5 h-8 w-[340px] text-sm rounded-md border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length} SPOC{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24%]">SPOC</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Set By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground py-10"
                  >
                    {managers.length === 0
                      ? "No SPOCs available. Open this page from the Helpdesk so the SPOC list is loaded."
                      : "No SPOCs match your search."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.spocId}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {row.name}
                      {row.isSelf && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1.5"
                        >
                          You
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.spocId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_BADGE[row.status]}`}
                    >
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmt(row.record?.fromDate)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmt(row.record?.toDate)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                    {row.record?.reason || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.record?.setBy ? (
                      <span className="flex items-center gap-1">
                        {row.record.setBy}
                        {row.record.setByAdmin && (
                          <ShieldCheck className="h-3 w-3 text-violet-600" />
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={!canManage(row)}
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        {row.record ? "Edit" : "Set"}
                      </Button>
                      {row.record && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          disabled={!canManage(row)}
                          onClick={() => setClearTarget(row.record!)}
                          aria-label="Clear availability"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Set / Edit dialog */}
      {showDialog && (
        <LeaveCoverageDialog
          initial={editing}
          spocOptions={spocOptions}
          lockedSpocId={currentUser}
          isAdmin={isAdmin}
          onClose={() => {
            setShowDialog(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}

      {/* Clear confirmation */}
      <AlertDialog
        open={Boolean(clearTarget)}
        onOpenChange={(open) => !open && setClearTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this availability?</AlertDialogTitle>
            <AlertDialogDescription>
              {clearTarget && (
                <>
                  <span className="font-medium">
                    {clearTarget.name || clearTarget.spocId}
                  </span>{" "}
                  will be marked available again. Newly assigned tickets will
                  start their OLA immediately.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SpocAvailabilityPage;
