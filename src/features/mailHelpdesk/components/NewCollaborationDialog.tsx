/**
 * Asks another team to look at a ticket, without handing the ticket over.
 *
 * The picker is deliberately **not** filtered by `assignableOnly`. Assignment
 * and collaboration are different questions: "can a ticket land on this person"
 * is about the routing engine, whereas "can this person answer a question about
 * a ticket" is about anybody in the department — a payroll clerk who never owns
 * a ticket is exactly who Finance needs on the thread. So the roster comes back
 * whole, and only offboarded leavers are dropped, because the API silently skips
 * inactive participants on insert and an invitation that vanishes is worse than
 * a name that was never offered.
 *
 * Cross-department is the point, so the department selector is a filter over the
 * search, not a scope: switching it keeps everyone already chosen. Both rosters
 * come from `/directory/*`, the only two reads in the API that are mounted above
 * `scopeToDepartment` — the admin lists this used to call are department-scoped
 * and answer `CROSS_DEPARTMENT` for exactly the team a collaboration is for.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isHelpdeskApiError, PG_ERROR_CODE } from "@/services/pgClient";
import { useHelpdeskAuth } from "../context/helpdeskAuthContext";
import {
  useDirectoryDepartments,
  useDirectoryUsers,
  useOpenCollaboration,
} from "../hooks/pg";
import type { GraphMessage, SentDraftMeta } from "../api/graphEmail";
import type { ParticipantRole } from "../types/pg";
import { CollaborationEmailComposer } from "./CollaborationEmailComposer";

interface NewCollaborationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  /** Where the picker starts. Any department can be chosen from there. */
  ticketDepartmentId: string;
  /** Rendered into the seed mail's subject so a stray reply stays traceable. */
  ticketNumber: string;
  ticketSubject?: string;
  /** Always CC'd on the seed mail — inbound replies route through it. */
  supportEmail: string;
  /** The customer's newest message, quoted into the seed mail when present. */
  sourceEmail?: GraphMessage | null;
}

/** One chosen collaborator, held independently of whichever roster is on screen. */
interface Chosen {
  userId: string;
  name: string;
  /** Needed to address the seed mail; the roster always joins it in. */
  email: string;
  departmentName: string | null;
  role: ParticipantRole;
}

export function NewCollaborationDialog({
  open,
  onOpenChange,
  ticketId,
  ticketDepartmentId,
  ticketNumber,
  ticketSubject,
  supportEmail,
  sourceEmail,
}: NewCollaborationDialogProps) {
  const { toast } = useToast();
  const { user } = useHelpdeskAuth();

  const [step, setStep] = useState<"pick" | "compose">("pick");
  const [purpose, setPurpose] = useState("");
  const [departmentId, setDepartmentId] = useState(ticketDepartmentId);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Record<string, Chosen>>({});
  /**
   * The sent mail's thread keys, held so a failed report can be retried without
   * sending a second mail.
   */
  const [sentMeta, setSentMeta] = useState<SentDraftMeta | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  // Reset on every open so a dismissed draft never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setStep("pick");
    setPurpose("");
    setDepartmentId(ticketDepartmentId);
    setSearch("");
    setChosen({});
    setSentMeta(null);
    setReportError(null);
  }, [open, ticketDepartmentId]);

  // Nothing is fetched until the dialog opens — every read shares the module's
  // per-user request budget with the rest of the desk.
  const { data: departments, isLoading: departmentsLoading } =
    useDirectoryDepartments({ limit: 200, sort: "name:asc" }, open);

  const {
    data: roster,
    isLoading: rosterLoading,
    error: rosterError,
  } = useDirectoryUsers(
    // `assignableOnly` is deliberately absent — see the note at the top of the
    // file. Everything that comes back is already ACTIVE and a real employee;
    // the server applies those unconditionally.
    { departmentId, limit: 200, sort: "full_name:asc" },
    open,
  );

  const create = useOpenCollaboration();

  /**
   * The ticket's own department is always an option, even while the list is
   * loading or if it fails: an empty list then narrows the picker to that one
   * department rather than emptying it and stranding the dialog.
   */
  const departmentOptions = useMemo(() => {
    const rows = (departments?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      invitableUserCount: row.invitable_user_count,
    }));
    if (rows.some((row) => row.id === ticketDepartmentId)) return rows;
    return [
      {
        id: ticketDepartmentId,
        name: "This ticket's department",
        status: "ACTIVE" as const,
        invitableUserCount: null,
      },
      ...rows,
    ];
  }, [departments, ticketDepartmentId]);

  const departmentName = useMemo(
    () =>
      departmentOptions.find((row) => row.id === departmentId)?.name ?? null,
    [departmentOptions, departmentId],
  );

  const candidates = useMemo(() => {
    const rows = (roster?.rows ?? []).filter(
      // Leavers and suspended accounts never reach us — `/directory/users`
      // applies `status = 'ACTIVE'`, `deleted_at IS NULL` and
      // `user_type = 'EMPLOYEE'` unconditionally. What it does not do is exclude
      // the caller, and a person cannot be asked to collaborate with themselves.
      (row) => row.id !== user?.id,
    );
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.full_name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle) ||
        (row.employee_code ?? "").toLowerCase().includes(needle) ||
        (row.designation ?? "").toLowerCase().includes(needle),
    );
  }, [roster, search, user]);

  const chosenList = Object.values(chosen);

  /**
   * @param userId the person to add or drop
   * @param name their display name, kept so a chip survives a department switch
   * @param email their address, kept for the same reason
   * @param team the department the roster row itself reported, which is the one
   *   to keep: the selector's own name is wrong the moment the roster is
   *   unfiltered. Falls back to the selector for a row that carried none
   */
  const toggle = (
    userId: string,
    name: string,
    email = "",
    team: string | null = departmentName,
  ) => {
    setChosen((prev) => {
      if (prev[userId]) {
        const next = { ...prev };
        delete next[userId];
        return next;
      }
      return {
        ...prev,
        [userId]: {
          userId,
          name,
          email,
          departmentName: team,
          role: "CONTRIBUTOR",
        },
      };
    });
  };

  /**
   * A REVIEWER is being asked to approve; a CONTRIBUTOR to help. The API stores
   * both the same way — the distinction is for the people reading the thread.
   *
   * @param userId whose role to flip
   */
  const flipRole = (userId: string) => {
    setChosen((prev) => {
      const row = prev[userId];
      if (!row) return prev;
      return {
        ...prev,
        [userId]: {
          ...row,
          role: row.role === "CONTRIBUTOR" ? "REVIEWER" : "CONTRIBUTOR",
        },
      };
    });
  };

  /**
   * Records the collaboration, reporting the seed mail's thread keys when one
   * was sent. Both are optional to the API: a collaboration with no thread
   * simply has no inbound route until it is bound.
   *
   * @param meta the sent mail's Graph metadata, or null when nothing was emailed
   */
  const report = useCallback(
    (meta: SentDraftMeta | null) => {
      const text = purpose.trim();
      const participants = Object.values(chosen);
      if (!text || participants.length === 0) return;

      setReportError(null);
      create.mutate(
        {
          ticketId,
          payload: {
            purpose: text,
            participants: participants.map((row) => ({
              userId: row.userId,
              participantRole: row.role,
            })),
            // `seedInternetMessageId` is the trustworthy key — it is identical
            // in every mailbox, so intake can repair the thread from it.
            ...(meta?.conversation_id
              ? { conversationId: meta.conversation_id }
              : {}),
            ...(meta?.internet_message_id
              ? { seedInternetMessageId: meta.internet_message_id }
              : {}),
          },
        },
        {
          onSuccess: (result) => {
            onOpenChange(false);
            // The response reports who was actually inserted, which can be fewer
            // than were asked for — inactive users are skipped without an error.
            const inserted = result.participants.length;
            const skipped = participants.length - inserted;
            const who = `${inserted} ${inserted === 1 ? "person" : "people"}`;
            const unrouted =
              meta && !meta.internet_message_id
                ? " The mail carried no message id, so a reply may need the thread bound by hand."
                : "";

            toast({
              title: meta ? "Collaboration sent" : "Collaboration opened",
              description:
                skipped > 0
                  ? `${inserted} of ${participants.length} invited — ${skipped} could not be added because their account is inactive.${unrouted}`
                  : meta
                    ? `${who} emailed. Their replies will land on this thread.${unrouted}`
                    : `${who} invited. Nothing has been emailed yet — send the collaboration email to start a thread.`,
            });
          },
          onError: (error) => {
            const featureOff =
              isHelpdeskApiError(error) &&
              error.code === PG_ERROR_CODE.FEATURE_DISABLED;
            const title = featureOff
              ? "Collaboration is switched off for this department"
              : "Could not open the collaboration";

            // The mail is already out; keep the composer up with a retry rather
            // than dismissing and losing the thread keys.
            if (meta) {
              setReportError(`${title}. ${error.message}`);
              return;
            }
            toast({
              title,
              description: error.message,
              variant: "destructive",
            });
          },
        },
      );
    },
    [chosen, create, onOpenChange, purpose, ticketId, toast],
  );

  /** Only people with an address can be written to; the rest are still invited. */
  const mailable = chosenList.filter((row) => Boolean(row.email));

  const canProceed = Boolean(purpose.trim()) && chosenList.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`flex flex-col ${
          step === "compose"
            ? "max-h-[90vh] max-w-5xl"
            : "max-h-[85vh] max-w-2xl"
        }`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {step === "compose"
              ? "Send the collaboration email"
              : "Ask someone to help"}
          </DialogTitle>
          <DialogDescription>
            {step === "compose"
              ? "The mail creates the thread; the collaboration is recorded once it is out, so replies route back here."
              : "An internal thread on this ticket, invisible to the requester. Ownership does not move — the ticket stays with whoever has it."}
          </DialogDescription>
        </DialogHeader>

        {step === "compose" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CollaborationEmailComposer
              ticketNumber={ticketNumber}
              ticketSubject={ticketSubject}
              purpose={purpose}
              recipients={mailable}
              supportEmail={supportEmail}
              sourceEmail={sourceEmail}
              onSent={(meta) => {
                setSentMeta(meta);
                report(meta);
              }}
              onCancel={() => {
                // Only a mail that never went out can be walked back.
                if (sentMeta) return;
                setStep("pick");
              }}
              reporting={create.isPending}
              reportError={reportError}
              onRetryReport={() => report(sentMeta)}
            />
          </div>
        )}

        {step === "pick" && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="collab-purpose">What are you asking for?</Label>
              <Textarea
                id="collab-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Confirm whether this reimbursement falls under the 2026 travel policy."
                rows={2}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground">
                Becomes the thread's title and its first activity entry.
              </p>
            </div>

            {chosenList.length > 0 && (
              <div className="space-y-1.5">
                <Label>
                  Collaborators ({chosenList.length}) — click a role to change
                  it
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {chosenList.map((row) => (
                    <span
                      key={row.userId}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                    >
                      {row.name}
                      {row.departmentName && (
                        <span className="text-muted-foreground">
                          · {row.departmentName}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => flipRole(row.userId)}
                        title="Switch between contributor and reviewer"
                      >
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            row.role === "REVIEWER"
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {row.role === "REVIEWER" ? "Reviewer" : "Contributor"}
                        </Badge>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(row.userId, row.name)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                {mailable.length < chosenList.length && (
                  <p className="text-xs text-amber-700">
                    {chosenList.length - mailable.length} of them have no email
                    address on file. They are still invited and notified in the
                    app, but the mail cannot reach them.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        departmentsLoading ? "Loading…" : "Choose one"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {departmentOptions.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                        {row.status !== "ACTIVE" && ` (${row.status})`}
                        {/* So a team with nobody to invite is visible before
                            the click rather than after it. */}
                        {row.invitableUserCount === 0 && " — nobody to invite"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="collab-search">Find a person</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="collab-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, email or employee code"
                    className="pl-8"
                  />
                </div>
              </div>
            </div>

            {rosterLoading && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading the department's people…
              </div>
            )}

            {rosterError && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">
                    This department's people could not be loaded
                  </p>
                  <p className="mt-0.5">{rosterError.message}</p>
                  {/* The directory is never department-scoped, so a refusal here
                      is about the account's role, not the department chosen. */}
                  {isHelpdeskApiError(rosterError) &&
                    rosterError.status === 403 && (
                      <p className="mt-0.5">
                        Your account's role cannot open a collaboration, so it
                        cannot read the directory that feeds one.
                      </p>
                    )}
                </div>
              </div>
            )}

            {!rosterLoading && !rosterError && candidates.length === 0 && (
              <p className="py-8 text-sm text-muted-foreground">
                {search.trim()
                  ? "Nobody in this department matches that."
                  : "This department has nobody to collaborate with."}
              </p>
            )}

            {candidates.length > 0 && (
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {candidates.map((person) => {
                  const isChosen = Boolean(chosen[person.id]);
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() =>
                          toggle(
                            person.id,
                            person.full_name,
                            person.email,
                            person.department_name,
                          )
                        }
                        className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                          isChosen
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={isChosen}
                          // The row is the hit target; the box only reports state.
                          tabIndex={-1}
                          className="pointer-events-none"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {person.full_name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {person.designation || person.role_name}
                            {person.department_name &&
                              ` · ${person.department_name}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="flex-shrink-0">
          {step === "compose" ? (
            <Button
              variant="ghost"
              disabled={Boolean(sentMeta)}
              onClick={() => setStep("pick")}
              title={
                sentMeta
                  ? "The mail has already been sent"
                  : "Back to the collaborators"
              }
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {/* Opening without a thread stays available: it can be bound later. */}
              {/* <Button
                variant="outline"
                disabled={!canProceed || create.isPending}
                onClick={() => report(null)}
              >
                {create.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Open without email
              </Button> */}
              <Button
                disabled={!canProceed || mailable.length === 0}
                onClick={() => setStep("compose")}
                title={
                  mailable.length === 0
                    ? "None of the people chosen have an email address on file"
                    : undefined
                }
              >
                Compose email
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewCollaborationDialog;
