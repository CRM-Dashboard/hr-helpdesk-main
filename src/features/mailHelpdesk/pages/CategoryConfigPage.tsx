import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { CategoryItem } from "../types/HRCategoryType";
import {
  deleteCategoryMapping,
  fetchCategoryMappings,
  saveCategoryMapping,
} from "../api/trackerHelpdesk";
import { CategoryMappingForm } from "../components/CategoryMappingForm";

const keyOf = (category: string, subCategory: string) =>
  `${(category || "").trim().toLowerCase()}||${(subCategory || "")
    .trim()
    .toLowerCase()}`;

export function CategoryConfigPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Managers passed via router state (userid + name) become SPOC suggestions.
  const spocOptions = useMemo(() => {
    const managers = (location.state as any)?.managers;
    if (!Array.isArray(managers)) return [];
    return managers
      .filter((m: any) => m?.userid)
      .map((m: any) => ({
        value: String(m.userid),
        label: `${m.name || m.userid} (${m.userid})`,
      }));
  }, [location.state]);

  const [rows, setRows] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingRow, setEditingRow] = useState<CategoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryItem | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const list = await fetchCategoryMappings();
      setRows(list);
    } catch (error: any) {
      toast({
        title: "Failed to load category config",
        description: error?.message || "Could not fetch category mappings.",
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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.category, r.subCategory, r.spocId, r.esc1, r.esc2, r.esc3]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  // Group filtered rows by category for sectioned display.
  const grouped = useMemo(() => {
    const map = new Map<string, CategoryItem[]>();
    for (const row of filteredRows) {
      const cat = row.category || "Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(row);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredRows]);

  const distinctCategories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))),
    [rows],
  );

  // Keys in use, optionally excluding the row currently being edited.
  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (
        editingRow &&
        keyOf(r.category, r.subCategory) ===
          keyOf(editingRow.category, editingRow.subCategory)
      ) {
        continue;
      }
      set.add(keyOf(r.category, r.subCategory));
    }
    return set;
  }, [rows, editingRow]);

  const openAdd = () => {
    setEditingRow(null);
    setShowForm(true);
  };

  const openEdit = (row: CategoryItem) => {
    setEditingRow(row);
    setShowForm(true);
  };

  const handleSave = async (item: CategoryItem, isEdit: boolean) => {
    setShowForm(false);
    setIsSaving(true);

    // Optimistically update local state so the screen stays usable even if
    // the write endpoint is not yet available on the backend.
    setRows((prev) => {
      if (isEdit && editingRow) {
        const editKey = keyOf(editingRow.category, editingRow.subCategory);
        return prev.map((r) =>
          keyOf(r.category, r.subCategory) === editKey ? item : r,
        );
      }
      return [...prev, item];
    });

    try {
      await saveCategoryMapping(item, isEdit ? "UPDATE" : "CREATE");
      toast({
        title: isEdit ? "Mapping updated" : "Mapping added",
        description: `${item.category} → ${item.subCategory}`,
      });
    } catch (error: any) {
      toast({
        title: "Saved locally only",
        description:
          "The change is shown here but could not be persisted to the server (write endpoint unavailable). " +
          (error?.message || ""),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
      setEditingRow(null);
    }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    setIsSaving(true);

    const targetKey = keyOf(target.category, target.subCategory);
    setRows((prev) =>
      prev.filter((r) => keyOf(r.category, r.subCategory) !== targetKey),
    );

    try {
      await deleteCategoryMapping(target);
      toast({
        title: "Mapping deleted",
        description: `${target.category} → ${target.subCategory}`,
      });
    } catch (error: any) {
      toast({
        title: "Removed locally only",
        description:
          "The mapping was removed from view but could not be deleted on the server. " +
          (error?.message || ""),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

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
          <Settings2 size={16} className="text-slate-500" />
          <h1 className="text-sm font-semibold text-slate-800">
            Category / SPOC / OLA Configuration
          </h1>
        </div>
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
          onClick={openAdd}
          className="flex items-center gap-1.5 h-8"
        >
          <Plus size={14} />
          Add Mapping
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
            placeholder="Search category, sub category, SPOC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 pr-3 py-1.5 h-8 w-[340px] text-sm rounded-md border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filteredRows.length} mapping{filteredRows.length === 1 ? "" : "s"}
          {search ? ` (filtered from ${rows.length})` : ""}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {!isLoading && grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <Settings2 className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">
              {rows.length === 0
                ? "No category mappings configured yet."
                : "No mappings match your search."}
            </p>
            {rows.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={openAdd}
                className="mt-4 gap-1.5"
              >
                <Plus size={14} />
                Add your first mapping
              </Button>
            )}
          </div>
        )}

        {grouped.map(([category, items]) => (
          <div
            key={category}
            className="rounded-lg border border-border bg-white overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
              <h2 className="text-sm font-semibold text-slate-800">
                {category}
              </h2>
              <span className="text-xs text-muted-foreground">
                {items.length} sub categor{items.length === 1 ? "y" : "ies"}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">Sub Category</TableHead>
                  <TableHead>SPOC</TableHead>
                  <TableHead className="text-center">TAT1</TableHead>
                  <TableHead>ESC1</TableHead>
                  <TableHead className="text-center">TAT2</TableHead>
                  <TableHead>ESC2</TableHead>
                  <TableHead className="text-center">TAT3</TableHead>
                  <TableHead>ESC3</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={keyOf(row.category, row.subCategory)}>
                    <TableCell className="font-medium">
                      {row.subCategory}
                    </TableCell>
                    <TableCell>{row.spocId || "—"}</TableCell>
                    <TableCell className="text-center">
                      {row.tat1 || "—"}
                    </TableCell>
                    <TableCell>{row.esc1 || "—"}</TableCell>
                    <TableCell className="text-center">
                      {row.tat2 || "—"}
                    </TableCell>
                    <TableCell>{row.esc2 || "—"}</TableCell>
                    <TableCell className="text-center">
                      {row.tat3 || "—"}
                    </TableCell>
                    <TableCell>{row.esc3 || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => openEdit(row)}
                          aria-label="Edit mapping"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(row)}
                          aria-label="Delete mapping"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>

      {/* Add / Edit dialog */}
      {showForm && (
        <CategoryMappingForm
          initial={editingRow}
          categories={distinctCategories}
          spocOptions={spocOptions}
          existingKeys={existingKeys}
          onClose={() => {
            setShowForm(false);
            setEditingRow(null);
          }}
          onSave={handleSave}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this mapping?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="font-medium">{deleteTarget.category}</span> →{" "}
                  <span className="font-medium">
                    {deleteTarget.subCategory}
                  </span>{" "}
                  will be removed. This action cannot be undone.
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default CategoryConfigPage;
