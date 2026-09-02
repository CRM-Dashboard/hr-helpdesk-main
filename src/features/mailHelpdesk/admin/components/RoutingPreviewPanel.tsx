/**
 * "Who would actually get this ticket?"
 *
 * Answered by `resolveAssignee` — the same function ticket creation calls —
 * writing nothing. Specificity tie-breaks, eligibility drops and the
 * out-of-office chain walk are all in that function, so they are all in this
 * answer.
 *
 * This panel is the point of the routing screen. The rules' *combined* effect is
 * otherwise invisible: a grid of seven rows does not tell an administrator which
 * one wins for a Payroll question at HIGH, and the specificity tie-break is not
 * something to work out by hand.
 */
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useCategories, usePriorities, useRoutingPreview, useSubcategories } from "../../hooks/pg";
import type { RoutingPreviewReason } from "../../types/pg";
import { ApiErrorNotice } from "./ApiErrorNotice";

/** The engine's vocabulary, in words an administrator can act on. */
const REASON_COPY: Record<RoutingPreviewReason, { label: string; tone: string }> = {
  RESOLVED: {
    label: "The named owner takes it",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  DELEGATED: {
    label: "The owner is away — cover picks it up",
    tone: "border-blue-200 bg-blue-50 text-blue-700",
  },
  DELEGATE_UNAVAILABLE: {
    label: "The owner is away with no eligible cover, but work may still land on them",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  NO_MATCHING_RULE: {
    label: "Nothing matched, and there is no catch-all",
    tone: "border-destructive/30 bg-destructive/5 text-destructive",
  },
  NO_ELIGIBLE_CANDIDATE: {
    label: "A rule matched, but neither primary nor backup can be selected",
    tone: "border-destructive/30 bg-destructive/5 text-destructive",
  },
  NO_ELIGIBLE_DELEGATE: {
    label: "The owner is away and the cover chain dead-ends",
    tone: "border-destructive/30 bg-destructive/5 text-destructive",
  },
};

/** How long to wait before asking the server. The admin limiter is 60/minute. */
const DEBOUNCE_MS = 350;

export function RoutingPreviewPanel({ departmentId }: { departmentId: string }) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [subcategoryId, setSubcategoryId] = useState<string>("");
  const [priorityId, setPriorityId] = useState<string>("");

  const categories = useCategories(departmentId, { limit: 200 });
  const subcategories = useSubcategories(departmentId, categoryId || null);
  const priorities = usePriorities(departmentId);

  // Debounced copy of the scope, so dragging through a dropdown is one request.
  const [scope, setScope] = useState({});
  useEffect(() => {
    const next = {
      categoryId: categoryId || null,
      subcategoryId: subcategoryId || null,
      priorityId: priorityId || null,
    };
    const timer = setTimeout(() => setScope(next), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [categoryId, subcategoryId, priorityId]);

  const { data, isFetching, error } = useRoutingPreview(departmentId, scope);

  const reason = data?.reason;
  const copy = reason ? REASON_COPY[reason] : null;

  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Radar size={15} className="text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-800">
          Where would this go?
        </h2>
        {isFetching && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
        )}
      </div>

      <p className="mb-3 text-[11px] text-muted-foreground">
        Run against the live engine. Nothing is written. Leave everything empty to
        see what an unclassified ticket does.
      </p>

      <div className="space-y-3">
        <div>
          <Label className="text-xs">Category</Label>
          <Select
            value={categoryId || "__any"}
            onValueChange={(v) => {
              setCategoryId(v === "__any" ? "" : v);
              // A subcategory only means something under its own parent.
              setSubcategoryId("");
            }}
          >
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any">Any</SelectItem>
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
            value={subcategoryId || "__any"}
            onValueChange={(v) => setSubcategoryId(v === "__any" ? "" : v)}
            disabled={!categoryId}
          >
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any">Any</SelectItem>
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
            value={priorityId || "__any"}
            onValueChange={(v) => setPriorityId(v === "__any" ? "" : v)}
          >
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any">Any</SelectItem>
              {(priorities.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ApiErrorNotice error={error} className="mt-3" />

      {data && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          {copy && (
            <Badge variant="outline" className={`h-auto py-1 text-[11px] ${copy.tone}`}>
              {copy.label}
            </Badge>
          )}

          <div className="flex items-center gap-2 text-sm">
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            {data.wouldAssignTo ? (
              <div className="min-w-0">
                <p className="font-medium text-slate-800">
                  {data.wouldAssignTo.fullName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {data.wouldAssignTo.email}
                </p>
              </div>
            ) : (
              <p className="font-medium text-destructive">Unassigned</p>
            )}
          </div>

          {data.matchedRule && (
            <p className="text-xs text-muted-foreground">
              Matched v{data.matchedRule.versionNo}, specificity{" "}
              {data.matchedRule.specificity}
              {data.matchedRule.isCatchAll && " — the catch-all"}
            </p>
          )}

          {data.assignmentType && (
            <p className="font-mono text-[11px] text-slate-400">
              {data.assignmentType}
            </p>
          )}

          {data.delegation && (
            <p className="text-xs text-muted-foreground">
              Through a cover chain, depth {data.delegation.depth}
            </p>
          )}

          {/* Written to be shown to the user. Each of the three unassigned
              reasons means something different, and this is what says which. */}
          {data.warning && (
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              {data.warning}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
