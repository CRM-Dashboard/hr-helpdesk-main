/**
 * Create or edit a category or a subcategory — the two have identical bodies,
 * identical validation and identical semantics, so they share one form.
 *
 * `code` is present on create and absent on edit, and that is a correctness rule
 * rather than tidiness: the code is the label the classifier puts in its prompt
 * and what every seed and integration matches on, so changing it would silently
 * re-mean every historical ticket carrying the id while the training examples
 * went on teaching the old label. Rename with `name`; retire with the row action.
 */
import { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Switch } from "@/components/ui/switch";
import type { CreateCategoryBody, UpdateCategoryBody } from "../../types/pg";
import { ApiErrorNotice } from "./ApiErrorNotice";

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "At least 2 characters")
    .max(40)
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Upper-case letters, digits and underscores, starting with a letter",
    ),
  name: z.string().trim().min(1, "Required").max(150),
  displayOrder: z.coerce.number().int().min(0).max(32767),
  isActive: z.boolean(),
});

const editSchema = createSchema.omit({ code: true });

/**
 * Declared rather than derived with `z.infer`.
 *
 * This project compiles with `strictNullChecks: false`, under which zod's
 * required-key inference (`undefined extends T[k]`) is always true — so every
 * `z.infer` field comes out optional, and the result cannot satisfy a request
 * body whose fields are genuinely required. The schema still validates; this is
 * only the shape the form is bound to.
 */
interface CreateValues {
  code: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export interface TaxonomyRecord {
  code: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

interface TaxonomyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Category" or "Subcategory" — used in the copy only. */
  kind: string;
  /** The row being edited, or null to create. */
  record?: TaxonomyRecord | null;
  isPending: boolean;
  error: unknown;
  onCreate: (body: CreateCategoryBody) => void;
  onUpdate: (body: UpdateCategoryBody) => void;
}

export function TaxonomyFormDialog({
  open,
  onOpenChange,
  kind,
  record,
  isPending,
  error,
  onCreate,
  onUpdate,
}: TaxonomyFormDialogProps) {
  const isEdit = Boolean(record);

  const form = useForm<CreateValues>({
    // One form, two schemas: `code` is validated only on the create path, since
    // on edit the field is read-only and never sent. The cast keeps the form's
    // value type single — narrowing it per mode would fork every field binding.
    resolver: zodResolver(
      isEdit ? editSchema : createSchema,
    ) as Resolver<CreateValues>,
    defaultValues: { code: "", name: "", displayOrder: 0, isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      code: record?.code ?? "",
      name: record?.name ?? "",
      // Defaults to 0 so `code` is the tiebreaker; without an order, unordered
      // rows come back in physical order, which changes on every update.
      displayOrder: record?.display_order ?? 0,
      isActive: record?.is_active ?? true,
    });
  }, [open, record]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (values: CreateValues) => {
    if (isEdit) {
      onUpdate({
        name: values.name,
        displayOrder: values.displayOrder,
        isActive: values.isActive,
      });
      return;
    }
    onCreate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit ${kind.toLowerCase()}` : `New ${kind.toLowerCase()}`}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "The code cannot change — it is what classification and every integration match on."
              : "The code is permanent. Choose it as carefully as the name."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
          <div>
            <Label className="text-xs">Code</Label>
            <Input
              {...form.register("code")}
              disabled={isEdit}
              placeholder="PAYROLL"
              className="mt-1 h-8 font-mono text-sm uppercase"
              autoComplete="off"
            />
            {form.formState.errors.code && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.code.message}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Name</Label>
            <Input
              {...form.register("name")}
              placeholder="Payroll"
              className="mt-1 h-8 text-sm"
            />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Display order</Label>
            <Input
              type="number"
              {...form.register("displayOrder")}
              className="mt-1 h-8 text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">Active</Label>
            <Switch
              checked={form.watch("isActive")}
              onCheckedChange={(v) =>
                form.setValue("isActive", v, { shouldDirty: true })
              }
            />
          </div>

          <ApiErrorNotice error={error} />

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
            <Button type="submit" size="sm" className="h-8" disabled={isPending}>
              {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
