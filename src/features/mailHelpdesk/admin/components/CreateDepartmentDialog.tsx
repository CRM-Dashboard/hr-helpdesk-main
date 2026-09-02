/**
 * Step one of onboarding a department.
 *
 * A department always lands in `DRAFT`, and its settings row is created in the
 * same transaction — which is what lets every later configuration write assume a
 * row exists and therefore always have a concurrency token.
 */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { useCreateDepartment } from "../../hooks/pg";
import { ApiErrorNotice } from "./ApiErrorNotice";

/** Mirrors the server's rules so the round trip is spent on real conflicts. */
const schema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "At least 2 characters")
    .max(30, "At most 30 characters")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Upper-case letters, digits and underscores, starting with a letter",
    ),
  name: z.string().trim().min(1, "Required").max(150),
  supportEmail: z.union([z.string().trim().email().max(255), z.literal("")]),
});

type FormValues = z.infer<typeof schema>;

interface CreateDepartmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDepartmentDialog({
  open,
  onOpenChange,
}: CreateDepartmentDialogProps) {
  const create = useCreateDepartment();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "", name: "", supportEmail: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({ code: "", name: "", supportEmail: "" });
      create.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (values: FormValues) =>
    create.mutate(
      {
        code: values.code,
        name: values.name,
        supportEmail: values.supportEmail === "" ? null : values.supportEmail,
      },
      { onSuccess: () => onOpenChange(false) },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New department</DialogTitle>
          <DialogDescription>
            It lands as a draft. The readiness checklist then names what is still
            needed before it can go live.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(submit)}
          className="space-y-4"
          noValidate
        >
          <div>
            <Label className="text-xs" htmlFor="new-dept-code">
              Code
            </Label>
            <Input
              id="new-dept-code"
              {...form.register("code")}
              placeholder="FINANCE"
              className="mt-1 h-8 font-mono text-sm uppercase"
              autoComplete="off"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Immutable, and rendered into every ticket number as{" "}
              <span className="font-mono">{"{DEPT}"}</span>.
            </p>
            {form.formState.errors.code && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.code.message}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs" htmlFor="new-dept-name">
              Name
            </Label>
            <Input
              id="new-dept-name"
              {...form.register("name")}
              placeholder="Finance"
              className="mt-1 h-8 text-sm"
            />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs" htmlFor="new-dept-email">
              Support mailbox (optional)
            </Label>
            <Input
              id="new-dept-email"
              type="email"
              {...form.register("supportEmail")}
              placeholder="finance.support@gera.in"
              className="mt-1 h-8 text-sm"
            />
            {form.formState.errors.supportEmail && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.supportEmail.message}
              </p>
            )}
          </div>

          <ApiErrorNotice error={create.error} />

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
              disabled={create.isPending}
            >
              {create.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
