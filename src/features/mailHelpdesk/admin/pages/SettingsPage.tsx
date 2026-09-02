/**
 * Department settings — the behavioural switches that always exist.
 *
 * Only changed fields are sent. That is not tidiness: the coherence rules run
 * against the **merged** row, so a body carrying values that happen to match the
 * stored ones is indistinguishable from an edit in the audit trail, and a
 * needlessly wide body widens what a 422 can refuse.
 */
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { isHelpdeskApiError, PG_ERROR_CODE } from "@/services/pgClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useHelpdeskMeta } from "../../context/helpdeskMetaContext";
import {
  adminKeys,
  useCreateDepartmentSettings,
  useDepartmentSettings,
  useUpdateDepartmentSettings,
} from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION, RequirePermission } from "../../permissions";
import type { DepartmentSettingsRow, UpdateSettingsBody } from "../../types/pg";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { useAdminScope } from "../context/adminScopeContext";

const schema = z
  .object({
    ticketNumberFormat: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine((v) => v.includes("{SEQ}"), {
        message: "Must contain {SEQ}, or every ticket in a period gets one number",
      })
      .refine(
        (v) =>
          (v.match(/\{[^}]*\}/g) ?? []).every((token) =>
            ["{DEPT}", "{YYYY}", "{YY}", "{MM}", "{SEQ}"].includes(token),
          ),
        { message: "Only {DEPT} {YYYY} {YY} {MM} {SEQ} are substituted" },
      ),
    ticketNumberReset: z.string(),
    requireCategory: z.boolean(),
    requireSubcategory: z.boolean(),
    assignmentStrategy: z.string(),
    autoAssignOnCreate: z.boolean(),
    /** Empty string means uncapped — a real setting, so it maps to null, not undefined. */
    maxOpenTicketsPerUser: z.string(),
    olaStartTrigger: z.string(),
    autoCloseDays: z.coerce.number().int().positive(),
    autoCloseWarningDays: z.coerce.number().int().min(0),
    reopenWindowDays: z.coerce.number().int().min(0),
    reopenWithinWindowAction: z.string(),
    exEmployeeWindowDays: z.coerce.number().int().min(0),
    oooActivationPolicy: z.string(),
    oooExpiryPolicy: z.string(),
    maxDelegationDepth: z.coerce.number().int().positive(),
    snoozeMaxWorkingMinutes: z.coerce.number().int().positive(),
    snoozeMaxCount: z.coerce.number().int().positive(),
    attachmentMaxMb: z.coerce.number().int().positive(),
  })
  // The server enforces this against the merged row; checking here too saves a
  // round trip on the mistake people actually make.
  .refine((v) => v.autoCloseWarningDays < v.autoCloseDays, {
    path: ["autoCloseWarningDays"],
    message: "A warning after the close is not a warning — keep it below auto-close days",
  });

type FormValues = z.infer<typeof schema>;

/**
 * @param row the stored settings
 * @returns the form's view of them, with the uncapped null rendered as ""
 */
const toForm = (row: DepartmentSettingsRow): FormValues => ({
  ticketNumberFormat: row.ticket_number_format,
  ticketNumberReset: row.ticket_number_reset,
  requireCategory: row.require_category,
  requireSubcategory: row.require_subcategory,
  assignmentStrategy: row.assignment_strategy,
  autoAssignOnCreate: row.auto_assign_on_create,
  maxOpenTicketsPerUser:
    row.max_open_tickets_per_user === null
      ? ""
      : String(row.max_open_tickets_per_user),
  olaStartTrigger: row.ola_start_trigger,
  autoCloseDays: row.auto_close_days,
  autoCloseWarningDays: row.auto_close_warning_days,
  reopenWindowDays: row.reopen_window_days,
  reopenWithinWindowAction: row.reopen_within_window_action,
  exEmployeeWindowDays: row.ex_employee_window_days,
  oooActivationPolicy: row.ooo_activation_policy,
  oooExpiryPolicy: row.ooo_expiry_policy,
  maxDelegationDepth: row.max_delegation_depth,
  snoozeMaxWorkingMinutes: row.snooze_max_working_minutes,
  snoozeMaxCount: row.snooze_max_count,
  attachmentMaxMb: row.attachment_max_mb,
});

/**
 * Reduces the form to the fields that actually moved.
 *
 * @param values what is on screen
 * @param baseline what the form was seeded with
 * @returns the PATCH body, camelCase
 */
const changedFields = (
  values: FormValues,
  baseline: FormValues,
): UpdateSettingsBody => {
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(values) as Array<keyof FormValues>) {
    if (values[key] === baseline[key]) continue;
    if (key === "maxOpenTicketsPerUser") {
      const raw = values.maxOpenTicketsPerUser.trim();
      body[key] = raw === "" ? null : Number(raw);
      continue;
    }
    body[key] = values[key];
  }
  return body as UpdateSettingsBody;
};

/** One labelled switch. */
function ToggleField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm text-slate-700">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function SettingsForm({
  departmentId,
  row,
}: {
  departmentId: string;
  row: DepartmentSettingsRow;
}) {
  const { options } = useHelpdeskMeta();
  const update = useUpdateDepartmentSettings();

  const baseline = useMemo(() => toForm(row), [row]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: baseline,
  });

  // The response is the authority on what was stored, and a fresh etag arrives
  // with it — re-seed rather than leaving the form ahead of the server.
  useEffect(() => form.reset(baseline), [baseline]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (values: FormValues) => {
    const body = changedFields(values, baseline);
    if (Object.keys(body).length === 0) return;
    update.mutate({ departmentId, body, etag: row.etag });
  };

  const enumField = (
    name: keyof FormValues,
    label: string,
    vocabulary: string,
    hint?: string,
  ) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select
        value={String(form.watch(name))}
        onValueChange={(v) => form.setValue(name, v as never, { shouldDirty: true })}
      >
        <SelectTrigger className="mt-1 h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options(vocabulary).map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  const numberField = (
    name: keyof FormValues,
    label: string,
    hint?: string,
    placeholder?: string,
  ) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        {...form.register(name)}
        placeholder={placeholder}
        className="mt-1 h-8 text-sm"
      />
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      {form.formState.errors[name] && (
        <p className="mt-1 text-xs text-destructive">
          {form.formState.errors[name]?.message as string}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-6" noValidate>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">
          Ticket numbering
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Format</Label>
            <Input
              {...form.register("ticketNumberFormat")}
              className="mt-1 h-8 font-mono text-sm"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              <span className="font-mono">
                {"{DEPT} {YYYY} {YY} {MM} {SEQ}"}
              </span>{" "}
              are substituted. Anything else is rejected.
            </p>
            {form.formState.errors.ticketNumberFormat && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.ticketNumberFormat.message}
              </p>
            )}
          </div>
          {enumField("ticketNumberReset", "Sequence reset", "ticketNumberReset")}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">
          Classification and assignment
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {enumField(
            "assignmentStrategy",
            "Assignment strategy",
            "assignmentStrategy",
            "Auto-routing on create runs only under RULE_BASED.",
          )}
          {enumField(
            "olaStartTrigger",
            "OLA clock starts",
            "olaStartTrigger",
          )}
          {numberField(
            "maxOpenTicketsPerUser",
            "Max open tickets per person",
            "Leave empty for uncapped — that is a setting, not an absent value.",
            "Uncapped",
          )}
        </div>

        <div className="mt-2 divide-y divide-slate-100">
          <ToggleField
            label="Require a category"
            hint="Applies to POST /tickets, not to email intake."
            checked={form.watch("requireCategory")}
            onChange={(v) =>
              form.setValue("requireCategory", v, { shouldDirty: true })
            }
          />
          <ToggleField
            label="Require a subcategory"
            checked={form.watch("requireSubcategory")}
            onChange={(v) =>
              form.setValue("requireSubcategory", v, { shouldDirty: true })
            }
          />
          <ToggleField
            label="Route the ticket at creation"
            checked={form.watch("autoAssignOnCreate")}
            onChange={(v) =>
              form.setValue("autoAssignOnCreate", v, { shouldDirty: true })
            }
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">
          Closing and reopening
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {numberField(
            "autoCloseDays",
            "Auto-close after",
            "Working days from resolution.",
          )}
          {numberField(
            "autoCloseWarningDays",
            "Warn before closing",
            "Must be strictly less than auto-close days.",
          )}
          {numberField("reopenWindowDays", "Reopen window (days)")}
          {enumField(
            "reopenWithinWindowAction",
            "Reopening within the window",
            "reopenAction",
          )}
          {numberField(
            "exEmployeeWindowDays",
            "Ex-employee intake window (days)",
            "How long after offboarding a former employee's mail is still accepted.",
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">
          Cover, snooze and attachments
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {enumField(
            "oooActivationPolicy",
            "When leave starts",
            "oooActivationPolicy",
          )}
          {enumField("oooExpiryPolicy", "When leave ends", "oooExpiryPolicy")}
          {numberField(
            "maxDelegationDepth",
            "Max delegation depth",
            "How far a cover chain may be walked before it is abandoned.",
          )}
          {numberField(
            "snoozeMaxWorkingMinutes",
            "Longest snooze (working minutes)",
          )}
          {numberField(
            "snoozeMaxCount",
            "Snoozes per ticket",
            "Over the ticket's whole life, not per state.",
          )}
          {numberField(
            "attachmentMaxMb",
            "Attachment limit (MB)",
            "Stored, but no attachment endpoint reads it yet.",
          )}
        </div>
      </section>

      <ApiErrorNotice error={update.error} />

      <Can permission={HELPDESK_PERMISSION.SETTINGS_WRITE}>
        <div className="flex justify-end gap-2 pb-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => form.reset(baseline)}
            disabled={!form.formState.isDirty}
          >
            Discard
          </Button>
          <Button
            type="submit"
            size="sm"
            className="h-8"
            disabled={!form.formState.isDirty || update.isPending}
          >
            {update.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            Save settings
          </Button>
        </div>
      </Can>
    </form>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { departmentId } = useAdminScope();
  const { data, isLoading, isFetching, error } = useDepartmentSettings(departmentId);
  const createDefaults = useCreateDepartmentSettings();

  // A 404 here is a recoverable state, not a failure: the row predates this API.
  const isMissing =
    isHelpdeskApiError(error) && error.code === PG_ERROR_CODE.NOT_FOUND;

  return (
    <RequirePermission
      permission={HELPDESK_PERMISSION.SETTINGS_READ}
      title="Department settings"
    >
      <AdminPageHeader
        title="Settings"
        icon={SlidersHorizontal}
        description="Ticket numbering, assignment, auto-close, reopen, cover and snooze limits."
        isFetching={isFetching}
        onRefresh={() =>
          departmentId &&
          queryClient.invalidateQueries({
            queryKey: adminKeys.settings(departmentId),
          })
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        )}

        {isMissing && departmentId && (
          <div className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">
              This department has no settings row
            </p>
            <p className="mt-1 text-sm text-amber-800">
              It was created before this API existed. Creating the row from schema
              defaults also clears the SETTINGS_MISSING readiness check.
            </p>
            <ApiErrorNotice error={createDefaults.error} className="mt-3" />
            <Can permission={HELPDESK_PERMISSION.SETTINGS_WRITE}>
              <Button
                size="sm"
                className="mt-3 h-8"
                disabled={createDefaults.isPending}
                onClick={() => createDefaults.mutate(departmentId)}
              >
                {createDefaults.isPending
                  ? "Creating…"
                  : "Create settings from defaults"}
              </Button>
            </Can>
          </div>
        )}

        {!isMissing && error && <ApiErrorNotice error={error} />}

        {data && departmentId && (
          <SettingsForm key={data.etag} departmentId={departmentId} row={data} />
        )}
      </div>
    </RequirePermission>
  );
}
