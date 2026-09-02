/**
 * Create a routing rule, or supersede one.
 *
 * **There is no edit.** A rule is effective-dated and `tickets.routing_rule_id`
 * pins it, so editing in place would not change future routing — it would rewrite
 * who owned every ticket the rule has already resolved. A ticket assigned to
 * Priya last quarter would start reporting that it was always Rahul's.
 *
 * So the form is "new version", and on supersede the scope is fixed: a rule whose
 * scope moved is a different rule wearing the old one's lineage, and it could
 * collide with a real rule at the new scope.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import {
  useAssignableUsers,
  useCategories,
  useCreateRoutingRule,
  useDepartmentUsers,
  usePriorities,
  useSubcategories,
  useSupersedeRoutingRule,
} from "../../hooks/pg";
import type { RoutingRuleRow, RoutingStrategy } from "../../types/pg";
import { ApiErrorNotice } from "./ApiErrorNotice";

const NONE = "__none";

interface RoutingRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  /** The incumbent when superseding; null when creating. */
  record: RoutingRuleRow | null;
}

export function RoutingRuleDialog({
  open,
  onOpenChange,
  departmentId,
  record,
}: RoutingRuleDialogProps) {
  const isSupersede = Boolean(record);

  const create = useCreateRoutingRule();
  const supersede = useSupersedeRoutingRule();

  const categories = useCategories(departmentId, { limit: 200 }, open);
  const priorities = usePriorities(departmentId, undefined, open);

  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [primaryUserId, setPrimaryUserId] = useState("");
  const [backupUserId, setBackupUserId] = useState("");
  const [escalationUserId, setEscalationUserId] = useState("");
  const [strategy, setStrategy] = useState<RoutingStrategy>("DIRECT");
  const [reason, setReason] = useState("");

  const subcategories = useSubcategories(departmentId, categoryId || null);

  // Naming somebody currently unassignable is legal and only warns — they may be
  // on leave with cover arranged. So the picker is the full member list, and the
  // assignable set is used only to flag who routing cannot select today.
  const members = useDepartmentUsers(
    departmentId,
    { limit: 200, sort: "full_name:asc" },
    open,
  );
  const assignable = useAssignableUsers(departmentId, open);
  const assignableIds = new Set((assignable.data?.rows ?? []).map((r) => r.id));

  useEffect(() => {
    if (!open) return;
    create.reset();
    supersede.reset();
    setCategoryId(record?.category_id ?? "");
    setSubcategoryId(record?.subcategory_id ?? "");
    setPriorityId(record?.priority_id ?? "");
    setPrimaryUserId(record?.primary_user_id ?? "");
    setBackupUserId(record?.backup_user_id ?? "");
    setEscalationUserId(record?.escalation_user_id ?? "");
    setStrategy(record?.strategy ?? "DIRECT");
    setReason("");
  }, [open, record]); // eslint-disable-line react-hooks/exhaustive-deps

  // The candidate set for LEAST_LOADED is exactly {primary, backup}, so choosing
  // the least loaded of one person is not a choice.
  const needsBackup = strategy === "LEAST_LOADED" && !backupUserId;
  const isCatchAll = !categoryId && !subcategoryId && !priorityId;
  const isPending = create.isPending || supersede.isPending;

  const submit = () => {
    if (isSupersede && record) {
      supersede.mutate(
        {
          departmentId,
          ruleId: record.id,
          body: {
            primaryUserId,
            backupUserId: backupUserId || null,
            escalationUserId: escalationUserId || null,
            strategy,
            reason: reason.trim() || undefined,
          },
          etag: record.etag,
        },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }
    create.mutate(
      {
        departmentId,
        body: {
          categoryId: categoryId || null,
          subcategoryId: subcategoryId || null,
          priorityId: priorityId || null,
          primaryUserId,
          backupUserId: backupUserId || null,
          escalationUserId: escalationUserId || null,
          strategy,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const personSelect = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    hint: string,
    allowNone: boolean,
  ) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select
        value={value || (allowNone ? NONE : undefined)}
        onValueChange={(v) => onChange(v === NONE ? "" : v)}
      >
        <SelectTrigger className="mt-1 h-8 text-sm">
          <SelectValue placeholder="Choose someone" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>None</SelectItem>}
          {(members.data?.rows ?? []).map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.full_name}
              {!assignableIds.has(m.id) && " — cannot receive tickets today"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isSupersede
              ? `New version of rule v${record?.version_no}`
              : "New routing rule"}
          </DialogTitle>
          <DialogDescription>
            {isSupersede
              ? "The current version closes and this one takes effect at the same instant, so the scope is never uncovered. It gets a new id."
              : "Leave all three scopes empty to make this the catch-all — the rule every department must have."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Select
                value={categoryId || NONE}
                onValueChange={(v) => {
                  setCategoryId(v === NONE ? "" : v);
                  setSubcategoryId("");
                }}
                disabled={isSupersede}
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
              <Label className="text-xs">Subcategory</Label>
              <Select
                value={subcategoryId || NONE}
                onValueChange={(v) => setSubcategoryId(v === NONE ? "" : v)}
                disabled={isSupersede || !categoryId}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Any</SelectItem>
                  {(subcategories.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
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
                disabled={isSupersede}
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
          </div>

          {isSupersede && (
            <p className="text-[11px] text-muted-foreground">
              The scope is fixed on a new version. To route a different scope,
              retire this rule and create another.
            </p>
          )}

          {!isSupersede && isCatchAll && (
            <p className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-700">
              This will be a catch-all. Only one live catch-all can exist — if one
              already does, supersede that instead.
            </p>
          )}

          {personSelect(
            "Primary owner",
            primaryUserId,
            setPrimaryUserId,
            "Who the ticket lands on.",
            false,
          )}

          {personSelect(
            "Backup",
            backupUserId,
            setBackupUserId,
            "Picked up when the primary cannot be selected. Must differ from the primary.",
            true,
          )}

          {personSelect(
            "Escalation owner",
            escalationUserId,
            setEscalationUserId,
            "The functional escalation owner. Time-based escalation is the OLA ladder, not this.",
            true,
          )}

          <div>
            <Label className="text-xs">Strategy</Label>
            <Select
              value={strategy}
              onValueChange={(v) => setStrategy(v as RoutingStrategy)}
            >
              <SelectTrigger className="mt-1 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DIRECT">DIRECT</SelectItem>
                <SelectItem value="LEAST_LOADED">LEAST_LOADED</SelectItem>
              </SelectContent>
            </Select>
            {needsBackup && (
              <p className="mt-1 text-xs text-destructive">
                LEAST_LOADED needs a backup — the candidate set is the primary and
                the backup, so with one person there is nothing to choose between.
              </p>
            )}
          </div>

          {isSupersede && (
            <div>
              <Label className="text-xs">Reason (optional)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                className="mt-1 h-8 text-sm"
                placeholder="Priya moved to Finance"
              />
            </div>
          )}

          <ApiErrorNotice error={create.error ?? supersede.error} />
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
            onClick={submit}
            disabled={isPending || !primaryUserId || needsBackup}
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {isSupersede ? "Publish new version" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
