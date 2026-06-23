import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";
import { CategoryItem } from "../types/HRCategoryType";

interface CategoryMappingFormProps {
  /** Existing item when editing; null/undefined when adding a new mapping. */
  initial?: CategoryItem | null;
  /** Distinct category names for the autocomplete datalist. */
  categories?: string[];
  /** Optional SPOC/escalation user options (userid + name) for autocomplete. */
  spocOptions?: { value: string; label: string }[];
  /**
   * Set of "category||subCategory" keys already in use, for duplicate
   * detection. When editing, the current row's own key should be excluded
   * by the caller.
   */
  existingKeys: Set<string>;
  onClose: () => void;
  onSave: (item: CategoryItem, isEdit: boolean) => void;
}

const EMPTY: CategoryItem = {
  mandt: "",
  category: "",
  subCategory: "",
  spocId: "",
  tat1: "",
  esc1: "",
  tat2: "",
  esc2: "",
  tat3: "",
  esc3: "",
};

const keyOf = (category: string, subCategory: string) =>
  `${category.trim().toLowerCase()}||${subCategory.trim().toLowerCase()}`;

export function CategoryMappingForm({
  initial,
  categories = [],
  spocOptions = [],
  existingKeys,
  onClose,
  onSave,
}: CategoryMappingFormProps) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState<CategoryItem>(initial ? { ...initial } : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const distinctCategories = useMemo(
    () => Array.from(new Set(categories.filter(Boolean))).sort(),
    [categories],
  );

  const set = (field: keyof CategoryItem, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (!form.category.trim()) next.category = "Category is required";
    if (!form.subCategory.trim()) next.subCategory = "Sub category is required";
    if (!form.spocId.trim()) next.spocId = "SPOC is required";

    // TAT fields must be non-negative numbers when provided.
    (["tat1", "tat2", "tat3"] as const).forEach((f) => {
      const v = String(form[f] ?? "").trim();
      if (v && (isNaN(Number(v)) || Number(v) < 0)) {
        next[f] = "Must be a non-negative number";
      }
    });

    // Duplicate category + subCategory (ignored when unchanged on edit).
    if (form.category.trim() && form.subCategory.trim()) {
      if (existingKeys.has(keyOf(form.category, form.subCategory))) {
        next.subCategory = "This category + sub category already exists";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave(
      {
        ...form,
        category: form.category.trim(),
        subCategory: form.subCategory.trim(),
        spocId: form.spocId.trim(),
      },
      isEdit,
    );
  };

  const fieldClass = (field: string) =>
    `w-full px-3 py-2 border rounded-md bg-background ${
      errors[field] ? "border-destructive" : "border-border"
    }`;

  const renderError = (field: string) =>
    errors[field] ? (
      <p className="mt-1 text-xs text-destructive">{errors[field]}</p>
    ) : null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEdit ? "Edit Category Mapping" : "Add Category Mapping"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Category + Sub Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Category *
              </label>
              <input
                type="text"
                list="category-suggestions"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className={fieldClass("category")}
                placeholder="e.g. Administration"
              />
              <datalist id="category-suggestions">
                {distinctCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {renderError("category")}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Sub Category *
              </label>
              <input
                type="text"
                value={form.subCategory}
                onChange={(e) => set("subCategory", e.target.value)}
                className={fieldClass("subCategory")}
                placeholder="e.g. Courier Request"
              />
              {renderError("subCategory")}
            </div>
          </div>

          {/* SPOC */}
          <div>
            <label className="block text-sm font-medium mb-1.5">SPOC *</label>
            <input
              type="text"
              list="spoc-suggestions"
              value={form.spocId}
              onChange={(e) => set("spocId", e.target.value)}
              className={fieldClass("spocId")}
              placeholder="SPOC user id (e.g. GD1830)"
            />
            <datalist id="spoc-suggestions">
              {spocOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </datalist>
            {renderError("spocId")}
          </div>

          {/* OLA / Escalation matrix */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              OLA &amp; Escalation Matrix
            </h3>

            {([1, 2, 3] as const).map((level) => {
              const tatField = `tat${level}` as keyof CategoryItem;
              const escField = `esc${level}` as keyof CategoryItem;
              return (
                <div
                  key={level}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start"
                >
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      TAT{level} (hours)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={String(form[tatField] ?? "")}
                      onChange={(e) => set(tatField, e.target.value)}
                      className={fieldClass(`tat${level}`)}
                      placeholder="e.g. 16"
                    />
                    {renderError(`tat${level}`)}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      ESC{level} (escalate to)
                    </label>
                    <input
                      type="text"
                      list="spoc-suggestions"
                      value={String(form[escField] ?? "")}
                      onChange={(e) => set(escField, e.target.value)}
                      className={fieldClass(`esc${level}`)}
                      placeholder="Escalation user id"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {Object.keys(errors).length > 0 && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Please fix the highlighted fields.
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {isEdit ? "Save Changes" : "Add Mapping"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CategoryMappingForm;
