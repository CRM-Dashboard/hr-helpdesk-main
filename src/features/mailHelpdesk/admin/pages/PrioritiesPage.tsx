/**
 * Priorities — the urgency scale.
 *
 * The one configuration resource with two scopes: a priority belongs either to
 * this department or to the platform, and the department resolves against the
 * union of both. Platform rows are shown because they are assignable here, and
 * locked because writing one is a 403 — showing them as editable would let a user
 * discover that by pressing Save.
 *
 * `severity_rank` ascends with urgency, and the sort direction is read from
 * `conventions.severityRank` rather than assumed: guessing wrong ranks the
 * calmest ticket as the most urgent one.
 */
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Pencil, Plus, Star, Timer, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHelpdeskMeta } from "../../context/helpdeskMetaContext";
import {
  adminKeys,
  useCreatePriority,
  useMakePriorityDefault,
  usePriorities,
  useRetirePriority,
  useUpdatePriority,
} from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION, RequirePermission } from "../../permissions";
import type { PriorityRow } from "../../types/pg";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAdminScope } from "../context/adminScopeContext";

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Upper-case letters, digits and underscores"),
  name: z.string().trim().min(1, "Required").max(100),
  // No default: one would put every new priority at the same rank, and a tie
  // makes the queue reshuffle between runs for no observable reason.
  severityRank: z.coerce.number().int().min(1).max(32767),
  isActive: z.boolean(),
});

/**
 * Declared rather than derived with `z.infer`: this project compiles with
 * `strictNullChecks: false`, under which zod infers every key as optional, and
 * `severityRank` is genuinely required by the API.
 */
interface FormValues {
  code: string;
  name: string;
  severityRank: number;
  isActive: boolean;
}

function PriorityFormDialog({
  open,
  onOpenChange,
  departmentId,
  record,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  record: PriorityRow | null;
}) {
  const create = useCreatePriority();
  const update = useUpdatePriority();
  const isEdit = Boolean(record);

  const form = useForm<FormValues>({
    // Cast because `severityRank` is coerced: the schema's input and output types
    // differ, and the form is bound to the output.
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { code: "", name: "", severityRank: 1, isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    create.reset();
    update.reset();
    form.reset({
      code: record?.code ?? "",
      name: record?.name ?? "",
      severityRank: record?.severity_rank ?? 1,
      isActive: record?.is_active ?? true,
    });
  }, [open, record]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (values: FormValues) => {
    if (isEdit && record) {
      // `code` is immutable and `isDefault` is its own verb — neither goes here.
      update.mutate(
        {
          departmentId,
          priorityId: record.id,
          body: {
            name: values.name,
            severityRank: values.severityRank,
            isActive: values.isActive,
          },
          etag: record.etag,
        },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }
    create.mutate(
      { departmentId, body: values },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const rankChanged =
    isEdit && record && form.watch("severityRank") !== record.severity_rank;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit priority" : "New priority"}</DialogTitle>
          <DialogDescription>
            A department may define its own HIGH alongside the platform's — that is
            the override mechanism, not a mistake.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
          <div>
            <Label className="text-xs">Code</Label>
            <Input
              {...form.register("code")}
              disabled={isEdit}
              placeholder="URGENT"
              className="mt-1 h-8 font-mono text-sm uppercase"
            />
            {form.formState.errors.code && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.code.message}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Name</Label>
            <Input {...form.register("name")} className="mt-1 h-8 text-sm" />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Severity rank</Label>
            <Input
              type="number"
              {...form.register("severityRank")}
              className="mt-1 h-8 text-sm"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Higher is more urgent. Must not tie with another active priority,
              platform rows included.
            </p>
            {rankChanged && (
              <p className="mt-1 text-[11px] text-amber-700">
                Changing this reorders every open ticket at this priority
                immediately — the rank is read live and is not pinned to a ticket.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">Active</Label>
            <Switch
              checked={form.watch("isActive")}
              onCheckedChange={(v) => form.setValue("isActive", v)}
            />
          </div>

          <ApiErrorNotice error={create.error ?? update.error} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8"
              disabled={create.isPending || update.isPending}
            >
              {(create.isPending || update.isPending) && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PrioritiesPage() {
  const queryClient = useQueryClient();
  const { departmentId } = useAdminScope();
  const { conventions } = useHelpdeskMeta();

  const [includeInactive, setIncludeInactive] = useState(false);
  const filters = { includeInactive: includeInactive || undefined };
  const { data, isLoading, isFetching, error } = usePriorities(
    departmentId,
    filters,
  );

  const makeDefault = useMakePriorityDefault();
  const retire = useRetirePriority();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PriorityRow | null>(null);
  const [retiring, setRetiring] = useState<PriorityRow | null>(null);
  const [lastWarning, setLastWarning] = useState<string | null>(null);

  const rows = data ?? [];

  return (
    <RequirePermission
      permission={HELPDESK_PERMISSION.PRIORITY_READ}
      title="Priorities"
    >
      <AdminPageHeader
        title="Priorities"
        icon={Timer}
        description="The urgency scale this department resolves against — its own rows plus the platform-wide ones."
        isFetching={isFetching}
        onRefresh={() =>
          departmentId &&
          queryClient.invalidateQueries({
            queryKey: adminKeys.priorityLists(departmentId),
          })
        }
        actions={
          <Can permission={HELPDESK_PERMISSION.PRIORITY_WRITE}>
            <Button
              size="sm"
              className="h-8"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New priority
            </Button>
          </Can>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {conventions?.severityRank?.note ??
              "Severity rank ascends with urgency."}{" "}
            The list is already ordered most urgent first.
          </p>
          <Button
            size="sm"
            variant="outline"
            className={`h-8 ${includeInactive ? "border-blue-200 bg-blue-50 text-blue-700" : "bg-white"}`}
            onClick={() => setIncludeInactive((v) => !v)}
          >
            Show inactive
          </Button>
        </div>

        <ApiErrorNotice error={error} />
        <ApiErrorNotice error={makeDefault.error} />

        {/* A rank change reorders live queues, and the server says so. */}
        {lastWarning && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {lastWarning}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Rank</TableHead>
                <TableHead className="w-28">Scope</TableHead>
                <TableHead className="w-44">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    Loading priorities…
                  </TableCell>
                </TableRow>
              )}

              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {row.name}
                      {row.is_default && (
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{row.severity_rank}</TableCell>
                  <TableCell>
                    {row.is_platform ? (
                      <Badge
                        variant="outline"
                        className="h-5 gap-1 border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-600"
                      >
                        <Lock className="h-2.5 w-2.5" />
                        platform
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">department</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!row.is_active && (
                        <Badge
                          variant="outline"
                          className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700"
                        >
                          inactive
                        </Badge>
                      )}

                      <Can permission={HELPDESK_PERMISSION.PRIORITY_WRITE}>
                        {!row.is_default && row.is_active && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={makeDefault.isPending}
                            onClick={() =>
                              departmentId &&
                              makeDefault.mutate(
                                { departmentId, priorityId: row.id },
                                {
                                  onSuccess: (result) =>
                                    setLastWarning(
                                      result.scope === "PLATFORM"
                                        ? `${result.name} is platform-wide, so this department points at it without owning it.`
                                        : null,
                                    ),
                                },
                              )
                            }
                          >
                            Make default
                          </Button>
                        )}

                        {/* A platform row is refused with 403 — do not offer it. */}
                        {!row.is_platform && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setEditing(row);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={() => {
                                retire.reset();
                                setRetiring(row);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </Can>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {departmentId && (
        <PriorityFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          departmentId={departmentId}
          record={editing}
        />
      )}

      <ConfirmDialog
        open={Boolean(retiring)}
        onOpenChange={(open) => !open && setRetiring(null)}
        title={`Retire ${retiring?.name ?? ""}?`}
        description={
          <p>
            It stops being offered and stops being the default. If a live routing
            rule, an OLA policy or this department's own default still points at
            it, the request is refused and names them — retiring the default is
            what demotes a department out of READY.
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
            { departmentId, priorityId: retiring.id, etag: retiring.etag },
            { onSuccess: () => setRetiring(null) },
          )
        }
      />
    </RequirePermission>
  );
}
