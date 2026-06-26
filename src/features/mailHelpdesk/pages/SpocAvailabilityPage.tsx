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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import LoadingOverlay from "@/components/ui/loading-overlay";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  CalendarOff,
  Trash2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import {
  fetchOooList,
  postOooRequest,
  deleteOooRequest,
  type OooRecord,
} from "../api/trackerHelpdesk";
import { getAuthCredentials } from "@/services/sapClient";
import { STORAGE_KEY } from "@/constant";

const sameId = (a?: string, b?: string) =>
  String(a || "").toUpperCase() === String(b || "").toUpperCase();

function getIsAdmin(): boolean {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY.CredRoles);
    if (!raw) return true;
    return JSON.stringify(JSON.parse(raw)).toLowerCase().includes("admin");
  } catch {
    return true;
  }
}

const localToday = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};

const toIsoDate = (d: string) => (d ? `${d}T00:00:00.000Z` : "");

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd MMM yyyy");
  } catch {
    return iso;
  }
};

interface OooFormState {
  crmid: string;
  delegated: string;
  start_dt: string;
  end_dt: string;
  reason: string;
}

const emptyForm = (currentUser: string): OooFormState => ({
  crmid: currentUser,
  delegated: "",
  start_dt: localToday(),
  end_dt: "",
  reason: "",
});

export function SpocAvailabilityPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const currentUser = (getAuthCredentials()?.userName || "").toUpperCase();
  const isAdmin = useMemo(() => getIsAdmin(), []);

  const managers: { userid: string; name: string }[] = useMemo(() => {
    const m = (location.state as any)?.managers;
    return Array.isArray(m) ? m : [];
  }, [location.state]);

  console.log("managers -->", managers);

  const [oooRecords, setOooRecords] = useState<OooRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<OooFormState>(emptyForm(currentUser));
  const [deleteTarget, setDeleteTarget] = useState<OooRecord | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const list = await fetchOooList();
      setOooRecords(list);
    } catch (error: any) {
      toast({
        title: "Failed to load OOO list",
        description: error?.message || "Could not fetch Out-of-Office records.",
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

  const nameFor = (id: string, fallback?: string) =>
    managers.find((m) => sameId(m.userid, id))?.name || fallback || id;

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return oooRecords;
    return oooRecords.filter(
      (r) =>
        r.crmid?.toLowerCase().includes(q) ||
        r.delegated?.toLowerCase().includes(q) ||
        r.name?.toLowerCase().includes(q) ||
        nameFor(r.crmid).toLowerCase().includes(q),
    );
  }, [oooRecords, search, managers]);

  console.log("filteredRecords -->", filteredRecords);

  const isFormValid =
    !!form.crmid &&
    !!form.delegated &&
    !!form.start_dt &&
    !!form.end_dt &&
    form.end_dt >= form.start_dt &&
    !!form.reason.trim();

  const openAddDialog = () => {
    setForm(emptyForm(currentUser));
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    setShowDialog(false);
    setIsSaving(true);
    const payload: OooRecord = {
      crmid: form.crmid,
      delegated: form.delegated,
      start_dt: toIsoDate(form.start_dt),
      end_dt: toIsoDate(form.end_dt),
      reason: form.reason.trim(),
    };
    try {
      await postOooRequest(payload);
      toast({
        title: "OOO request submitted",
        description: `${nameFor(form.crmid)} marked Out of Office from ${format(
          new Date(form.start_dt),
          "dd MMM",
        )} to ${format(new Date(form.end_dt), "dd MMM yyyy")}.`,
      });
      loadData();
    } catch (e: any) {
      toast({
        title: "Failed to submit OOO",
        description: e?.message || "Could not submit the OOO request.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    setIsSaving(true);
    try {
      await deleteOooRequest(target.CRMID, target.DELEGATED);
      setOooRecords((prev) =>
        prev.filter(
          (r) =>
            !(
              sameId(r.CRMID, target.CRMID) &&
              sameId(r.DELEGATED, target.DELEGATED)
            ),
        ),
      );
      toast({
        title: "OOO record removed",
        description: `${nameFor(target.crmid, target.name)} is now available.`,
      });
    } catch (e: any) {
      toast({
        title: "Failed to remove OOO",
        description: e?.message || "Could not clear the OOO record.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const canManage = (record: OooRecord) =>
    isAdmin || sameId(record.crmid, currentUser);

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
          onClick={openAddDialog}
          className="flex items-center gap-1.5 h-8 bg-rose-600 hover:bg-rose-700 text-white"
        >
          <Plus size={14} />
          Mark OOO
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
            placeholder="Search by name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 pr-3 py-1.5 h-8 w-[340px] text-sm rounded-md border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filteredRecords.length} record
          {filteredRecords.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[22%]">Executive</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Delegated To</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground py-10"
                  >
                    {isLoading
                      ? "Loading…"
                      : oooRecords.length === 0
                        ? "No Out-of-Office records found."
                        : "No records match your search."}
                  </TableCell>
                </TableRow>
              )}
              {filteredRecords.map((record, idx) => (
                <TableRow key={`${record.crmid}-${record.delegated}-${idx}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {/* {nameFor(record.crmid, record.name)} */}
                      {record.crmid}
                      {sameId(record.crmid, currentUser) && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1.5"
                        >
                          You
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {record.crmid}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-xs bg-rose-100 text-rose-700 border-rose-200"
                    >
                      Out of Office
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmtDate(record.start_dt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmtDate(record.end_dt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {record.reason || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {/* <div>{nameFor(record.delegated, record.delegatedName)}</div> */}
                    <div>{record.delegated}</div>
                    <div className="text-xs text-muted-foreground">
                      {record.delegated}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      // disabled={!canManage(record)}
                      onClick={() => setDeleteTarget(record)}
                      aria-label="Remove OOO record"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mark OOO Dialog */}
      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          if (!open) setForm(emptyForm(currentUser));
          setShowDialog(open);
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Mark Out of Office</DialogTitle>
            <DialogDescription>
              Select the executive going OOO and assign a delegate to handle
              tasks during their absence.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* From */}
            <div className="space-y-1.5">
              <Label>From (Going OOO)</Label>
              <Select
                value={form.crmid}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    crmid: v,
                    delegated: sameId(f.delegated, v) ? "" : f.delegated,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select executive" />
                </SelectTrigger>
                <SelectContent>
                  {managers.map((m) => (
                    <SelectItem key={m.empid} value={m.empid}>
                      {m.name} ({m.empid})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* {isAdmin ? (
                <Select
                  value={form.crmid}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      crmid: v,
                      delegated: sameId(f.delegated, v) ? "" : f.delegated,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select executive" />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => (
                      <SelectItem key={m.userid} value={m.userid}>
                        {m.name} ({m.userid})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={`${nameFor(currentUser)} (${currentUser})`}
                  disabled
                />
              )} */}
            </div>

            {/* Delegate Tasks To */}
            <div className="space-y-1.5">
              <Label>Delegate Tasks To</Label>
              <Select
                value={form.delegated}
                onValueChange={(v) => setForm((f) => ({ ...f, delegated: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select delegate" />
                </SelectTrigger>
                <SelectContent>
                  {managers
                    .filter((m) => !sameId(m.empid, form.empid))
                    .map((m) => (
                      <SelectItem key={m.empid} value={m.empid}>
                        {m.name} ({m.empid})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={form.start_dt}
                  min={localToday()}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      start_dt: e.target.value,
                      end_dt:
                        f.end_dt && f.end_dt < e.target.value
                          ? e.target.value
                          : f.end_dt,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={form.end_dt}
                  min={form.start_dt || localToday()}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, end_dt: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                placeholder="Reason for Out of Office…"
                value={form.reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reason: e.target.value }))
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove OOO record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="font-medium">
                    {nameFor(deleteTarget.crmid, deleteTarget.name)}
                  </span>{" "}
                  will be marked available again.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SpocAvailabilityPage;
