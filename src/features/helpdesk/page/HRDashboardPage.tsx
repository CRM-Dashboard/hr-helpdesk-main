import React, { useMemo, useState } from "react";
import { useHelpdesk } from "../context/HelpdeskContext";
import { Input } from "@/components/ui/input";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { StatusBadge } from "../components/StatusBadge";
import type { HelpdeskStatus } from "../types/types";
import { Label } from "@/components/ui/label";

export default function HRDashboardPage() {
  const { requests, bulkUpdate } = useHelpdesk();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | HelpdeskStatus>("all");
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    return requests
      .filter((r) => (status === "all" ? true : r.status === status))
      .filter((r) =>
        q.trim() === ""
          ? true
          : [
              r.title,
              r.description,
              r.category,
              r.subCategory,
              r.employeeEmail,
              r.assigneeEmail,
            ]
              .join(" ")
              .toLowerCase()
              .includes(q.toLowerCase())
      );
  }, [requests, q, status]);

  const allSelected =
    selected.length > 0 && selected.length === filtered.length;
  const toggleAll = () =>
    setSelected((prev) => (allSelected ? [] : filtered.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <Input
          placeholder="Search requests..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="secondary" disabled={selected.length === 0}>
              Resolve
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Resolve selected requests?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark {selected.length} request(s) as resolved. You can
                reopen later by editing the request.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => bulkUpdate(selected, { type: "resolve" })}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="secondary" disabled={selected.length === 0}>
              Close
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Close selected requests?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark {selected.length} request(s) as closed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => bulkUpdate(selected, { type: "close" })}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll as any}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} data-selected={selected.includes(r.id)}>
                <TableCell className="w-10">
                  <Checkbox
                    checked={selected.includes(r.id)}
                    onCheckedChange={() => toggleOne(r.id)}
                    aria-label="Select row"
                  />
                </TableCell>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell>{r.employeeName ?? r.employeeEmail}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{r.category}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.subCategory}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell>
                  {r.assigneeName ?? r.assigneeEmail ?? "—"}
                </TableCell>
                <TableCell>
                  {new Date(r.updatedAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="w-full sm:max-w-lg">
                      <SheetHeader>
                        <SheetTitle>{r.title}</SheetTitle>
                      </SheetHeader>
                      <EditRequestPanel id={r.id} />
                    </SheetContent>
                  </Sheet>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {filtered.length === 0 && (
        <div className="text-sm text-muted-foreground">No requests found.</div>
      )}
    </div>
  );
}

function EditRequestPanel({ id }: { id: string }) {
  const { requests, updateRequest } = useHelpdesk();
  const req = requests.find((x) => x.id === id)!;

  const [local, setLocal] = useState({
    status: req.status as HelpdeskStatus,
    assigneeEmail: req.assigneeEmail ?? "",
    responseSummary: req.responseSummary ?? "",
    closureDate: req.closureDateTime ? req.closureDateTime.slice(0, 10) : "",
    closureTime: req.closureDateTime ? req.closureDateTime.slice(11, 16) : "",
    comment: "",
  });

  const onSave = () => {
    const closureDateTime =
      local.closureDate && local.closureTime
        ? new Date(`${local.closureDate}T${local.closureTime}:00`).toISOString()
        : undefined;
    updateRequest(id, {
      status: local.status,
      assigneeEmail: local.assigneeEmail || undefined,
      responseSummary: local.responseSummary || undefined,
      closureDateTime,
      addNote: local.comment.trim()
        ? {
            authorEmail: "hr@gera.in",
            authorName: "HR",
            message: local.comment.trim(),
            type: "comment",
          }
        : undefined,
    });
  };

  const resolutionTimeText = (() => {
    if (!req.resolutionMs) return undefined;
    const hours = Math.floor(req.resolutionMs / 3600000);
    const minutes = Math.floor((req.resolutionMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  })();

  return (
    <div className="mt-4 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={local.status}
            onValueChange={(v) =>
              setLocal((p) => ({ ...p, status: v as HelpdeskStatus }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Assignee</Label>
          <Input
            placeholder="email@gera.in"
            value={local.assigneeEmail}
            onChange={(e) =>
              setLocal((p) => ({ ...p, assigneeEmail: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Response Summary</Label>
          <Input
            placeholder="Summary"
            value={local.responseSummary}
            onChange={(e) =>
              setLocal((p) => ({ ...p, responseSummary: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Closure Date</Label>
          <Input
            type="date"
            value={local.closureDate}
            onChange={(e) =>
              setLocal((p) => ({ ...p, closureDate: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Closure Time</Label>
          <Input
            type="time"
            value={local.closureTime}
            onChange={(e) =>
              setLocal((p) => ({ ...p, closureTime: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Comment</Label>
          <Input
            placeholder="Add a comment"
            value={local.comment}
            onChange={(e) =>
              setLocal((p) => ({ ...p, comment: e.target.value }))
            }
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Created: {new Date(req.createdAt).toLocaleString()}
          {resolutionTimeText && (
            <span className="ml-2">Resolution: {resolutionTimeText}</span>
          )}
        </div>
        <Button onClick={onSave}>Save</Button>
      </div>

      <div className="space-y-2">
        <div className="font-medium">History</div>
        <div className="space-y-3 max-h-[40vh] overflow-auto pr-2">
          {req.history.map((h) => (
            <div key={h.id} className="text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {h.authorName ?? h.authorEmail}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(h.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{h.type}</div>
              <div>{h.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
