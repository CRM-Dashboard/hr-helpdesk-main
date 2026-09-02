/**
 * Categories and subcategories.
 *
 * The taxonomy is the **label** half of routing and only that half — there is no
 * owner on this screen, and there must not be. "Route Payroll questions to Priya"
 * is a routing rule whose scope is this category, which is what lets one
 * subcategory route to different people at different priorities and lets an owner
 * change without rewriting the taxonomy every historical ticket was classified
 * against.
 */
import { Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ListTree,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useCategories,
  useCreateCategory,
  useCreateSubcategory,
  useRetireCategory,
  useRetireSubcategory,
  useSubcategories,
  useUpdateCategory,
  useUpdateSubcategory,
} from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION, RequirePermission } from "../../permissions";
import type { CategoryRow, SubcategoryRow } from "../../types/pg";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TaxonomyFormDialog } from "../components/TaxonomyFormDialog";
import { useAdminScope } from "../context/adminScopeContext";

/** A retired row reads differently from a merely inactive one — say which. */
function StatusCell({ row }: { row: { is_active: boolean; deleted_at: string | null } }) {
  if (row.deleted_at) {
    return (
      <Badge variant="outline" className="h-5 border-slate-200 bg-slate-100 px-1.5 text-[10px] text-slate-500">
        retired
      </Badge>
    );
  }
  if (!row.is_active) {
    return (
      <Badge variant="outline" className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700">
        inactive
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="h-5 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] text-emerald-700">
      active
    </Badge>
  );
}

/** The children of one expanded category. */
function SubcategoryRows({
  departmentId,
  category,
  includeInactive,
  includeDeleted,
}: {
  departmentId: string;
  category: CategoryRow;
  includeInactive: boolean;
  includeDeleted: boolean;
}) {
  const { data, isLoading } = useSubcategories(departmentId, category.id, {
    includeInactive: includeInactive || undefined,
    includeDeleted: includeDeleted || undefined,
  });

  const create = useCreateSubcategory();
  const update = useUpdateSubcategory();
  const retire = useRetireSubcategory();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubcategoryRow | null>(null);
  const [retiring, setRetiring] = useState<SubcategoryRow | null>(null);

  return (
    <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
      <TableCell colSpan={6} className="py-3">
        <div className="pl-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">
              Subcategories of {category.name}
            </p>
            <Can permission={HELPDESK_PERMISSION.TAXONOMY_WRITE}>
              <Button
                size="sm"
                variant="outline"
                className="h-7 bg-white"
                onClick={() => {
                  setEditing(null);
                  create.reset();
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </Can>
          </div>

          {isLoading && (
            <p className="py-2 text-xs text-muted-foreground">Loading…</p>
          )}

          {!isLoading && (data ?? []).length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">
              None. A ticket in this category will carry no subcategory.
            </p>
          )}

          <div className="space-y-1">
            {(data ?? []).map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-3 rounded border border-slate-200 bg-white px-3 py-1.5"
              >
                <span className="font-mono text-xs text-slate-500">{sub.code}</span>
                <span className="flex-1 text-sm">{sub.name}</span>
                <span className="text-xs text-slate-400">#{sub.display_order}</span>
                <StatusCell row={sub} />
                <Can permission={HELPDESK_PERMISSION.TAXONOMY_WRITE}>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        setEditing(sub);
                        update.reset();
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    {!sub.deleted_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => {
                          retire.reset();
                          setRetiring(sub);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </Can>
              </div>
            ))}
          </div>
        </div>

        <TaxonomyFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          kind="Subcategory"
          record={editing}
          isPending={create.isPending || update.isPending}
          error={create.error ?? update.error}
          onCreate={(body) =>
            create.mutate(
              { departmentId, categoryId: category.id, body },
              { onSuccess: () => setFormOpen(false) },
            )
          }
          onUpdate={(body) =>
            editing &&
            update.mutate(
              {
                departmentId,
                subcategoryId: editing.id,
                body,
                etag: editing.etag,
              },
              { onSuccess: () => setFormOpen(false) },
            )
          }
        />

        <ConfirmDialog
          open={Boolean(retiring)}
          onOpenChange={(open) => !open && setRetiring(null)}
          title={`Retire ${retiring?.name ?? ""}?`}
          description={
            <p>
              It stops being offered in any chooser. Nothing is removed and
              existing tickets are unaffected. It can be restored by editing it
              and switching Active back on.
            </p>
          }
          confirmLabel="Retire"
          destructive
          isPending={retire.isPending}
          error={retire.error}
          onConfirm={() =>
            retiring &&
            retire.mutate(
              {
                departmentId,
                subcategoryId: retiring.id,
                etag: retiring.etag,
              },
              { onSuccess: () => setRetiring(null) },
            )
          }
        />
      </TableCell>
    </TableRow>
  );
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const { departmentId } = useAdminScope();

  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filters = {
    search: search.trim() || undefined,
    includeInactive: includeInactive || undefined,
    includeDeleted: includeDeleted || undefined,
    limit: 100,
  };

  const { data, isLoading, isFetching, error } = useCategories(
    departmentId,
    filters,
  );

  const create = useCreateCategory();
  const update = useUpdateCategory();
  const retire = useRetireCategory();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [retiring, setRetiring] = useState<CategoryRow | null>(null);

  const rows = data?.rows ?? [];

  return (
    <RequirePermission
      permission={HELPDESK_PERMISSION.TAXONOMY_READ}
      title="Categories"
    >
      <AdminPageHeader
        title="Categories"
        icon={ListTree}
        description="The labels tickets are classified against. Who a label routes to is a routing rule, not a field here."
        isFetching={isFetching}
        onRefresh={() =>
          departmentId &&
          queryClient.invalidateQueries({
            queryKey: adminKeys.categoryLists(departmentId),
          })
        }
        actions={
          <Can permission={HELPDESK_PERMISSION.TAXONOMY_WRITE}>
            <Button
              size="sm"
              className="h-8"
              onClick={() => {
                setEditing(null);
                create.reset();
                setFormOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New category
            </Button>
          </Can>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or name"
            className="h-8 w-64 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            className={`h-8 ${includeInactive ? "border-blue-200 bg-blue-50 text-blue-700" : "bg-white"}`}
            onClick={() => setIncludeInactive((v) => !v)}
          >
            Show inactive
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={`h-8 ${includeDeleted ? "border-blue-200 bg-blue-50 text-blue-700" : "bg-white"}`}
            onClick={() => setIncludeDeleted((v) => !v)}
          >
            Show retired
          </Button>
        </div>

        <ApiErrorNotice error={error} />

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-32">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-20">Order</TableHead>
                <TableHead className="w-32">Subcategories</TableHead>
                <TableHead className="w-40">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    Loading categories…
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    No categories. If `requireCategory` is on in Settings, tickets
                    cannot be raised until one exists.
                  </TableCell>
                </TableRow>
              )}

              {rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow>
                    <TableCell className="py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() =>
                          setExpanded((id) => (id === row.id ? null : row.id))
                        }
                      >
                        {expanded === row.id ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-xs text-slate-400">
                      #{row.display_order}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.subcategory_count}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusCell row={row} />
                        <Can permission={HELPDESK_PERMISSION.TAXONOMY_WRITE}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setEditing(row);
                              update.reset();
                              setFormOpen(true);
                            }}
                          >
                            {row.deleted_at ? (
                              <RotateCcw className="h-3 w-3" />
                            ) : (
                              <Pencil className="h-3 w-3" />
                            )}
                          </Button>
                          {!row.deleted_at && (
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
                          )}
                        </Can>
                      </div>
                    </TableCell>
                  </TableRow>

                  {expanded === row.id && departmentId && (
                    <SubcategoryRows
                      key={`${row.id}-subs`}
                      departmentId={departmentId}
                      category={row}
                      includeInactive={includeInactive}
                      includeDeleted={includeDeleted}
                    />
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <TaxonomyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        kind="Category"
        record={editing}
        isPending={create.isPending || update.isPending}
        error={create.error ?? update.error}
        onCreate={(body) =>
          departmentId &&
          create.mutate(
            { departmentId, body },
            { onSuccess: () => setFormOpen(false) },
          )
        }
        onUpdate={(body) =>
          departmentId &&
          editing &&
          update.mutate(
            { departmentId, categoryId: editing.id, body, etag: editing.etag },
            { onSuccess: () => setFormOpen(false) },
          )
        }
      />

      <ConfirmDialog
        open={Boolean(retiring)}
        onOpenChange={(open) => !open && setRetiring(null)}
        title={`Retire ${retiring?.name ?? ""}?`}
        description={
          <>
            <p>
              Its {retiring?.subcategory_count ?? 0} subcategor
              {retiring?.subcategory_count === 1 ? "y is" : "ies are"} retired with
              it, in the same transaction — a child whose parent is gone is
              unreachable through any chooser but still nameable by a routing rule.
            </p>
            <p>
              Nothing is removed and existing tickets are unaffected. If a live
              routing rule or OLA policy still scopes on it, the request is refused
              and names them.
            </p>
          </>
        }
        confirmLabel="Retire category"
        destructive
        isPending={retire.isPending}
        error={retire.error}
        onConfirm={() =>
          departmentId &&
          retiring &&
          retire.mutate(
            { departmentId, categoryId: retiring.id, etag: retiring.etag },
            { onSuccess: () => setRetiring(null) },
          )
        }
      />
    </RequirePermission>
  );
}
