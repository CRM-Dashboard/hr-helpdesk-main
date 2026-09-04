/**
 * Department features — the six capabilities.
 *
 * The save action branches on `exists`, not on `is_enabled`: a code with no row
 * has no concurrency token, so it must be created with `POST` rather than patched.
 * The API returns all six rows either way precisely so this screen can render
 * six toggles without knowing which of them exist.
 *
 * Disabling is forward-only and never deletes. A collaboration recorded while
 * `COLLABORATION` was on stays readable after it is switched off, which is why the
 * copy says "stops new" rather than "removes".
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ToggleLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminKeys,
  useCreateFeature,
  useDisableFeature,
  useFeatures,
  useUpdateFeature,
} from "../../hooks/pg";
import { Can, HELPDESK_PERMISSION, RequirePermission } from "../../permissions";
import type { FeatureCode, FeatureConfig, FeatureRow } from "../../types/pg";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { useAdminScope } from "../context/adminScopeContext";

/** What each capability actually gates, in the words of the endpoints it guards. */
const FEATURE_COPY: Record<FeatureCode, { title: string; blurb: string }> = {
  SNOOZE: {
    title: "Snooze",
    blurb:
      "Lets an agent park a ticket. Ending a snooze is deliberately ungated, so switching this off cannot trap a ticket that is already snoozed.",
  },
  COLLABORATION: {
    title: "Collaboration",
    blurb:
      "The internal cross-department thread. Reading existing threads keeps working when this is off.",
  },
  OOO_DELEGATION: {
    title: "Out-of-office delegation",
    blurb:
      "Filing leave and swapping a delegate. Activating, cancelling and reading are never gated — a department that switches this off must still be able to manage the windows it has.",
  },
  EXTERNAL_INTAKE: {
    title: "External intake",
    blurb: "", //"Accept mail from outside the organisation, optionally by domain.",
  },
  EX_EMPLOYEE_INTAKE: {
    title: "Ex-employee intake",
    blurb:
      "Accept mail from people who have been offboarded, within the window set in Settings.",
  },
  AI_CLASSIFICATION: {
    title: "AI classification",
    blurb:
      "Suggest a category on intake. Narrows the deployment-level switch — both must be on. Requires a catch-all routing rule, or a message the model cannot label would be silently unassigned.",
  },
};

/** One capability: the toggle, and its config when it has any. */
function FeatureCard({
  departmentId,
  row,
}: {
  departmentId: string;
  row: FeatureRow;
}) {
  const create = useCreateFeature();
  const update = useUpdateFeature();
  const disable = useDisableFeature();

  const code = row.feature_code;
  const copy = FEATURE_COPY[code];
  const isPending = create.isPending || update.isPending || disable.isPending;
  const error = create.error ?? update.error ?? disable.error;

  const [threshold, setThreshold] = useState(
    row.config?.confidenceThreshold !== undefined
      ? String(row.config.confidenceThreshold)
      : "",
  );
  const [model, setModel] = useState(row.config?.model ?? "");
  const [domains, setDomains] = useState(
    (row.config?.allowedDomains ?? []).join("\n"),
  );

  /**
   * The config object for this code. Every per-code schema is `.strict()`, so an
   * unknown key is rejected rather than stripped — which means only the keys this
   * code defines may be sent, and empty ones must be omitted rather than nulled.
   */
  const buildConfig = (): FeatureConfig => {
    if (code === "AI_CLASSIFICATION") {
      const config: FeatureConfig = {};
      if (threshold.trim() !== "")
        config.confidenceThreshold = Number(threshold);
      if (model.trim() !== "") config.model = model.trim();
      return config;
    }
    if (code === "EXTERNAL_INTAKE") {
      const list = domains
        .split(/[\n,]/)
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      return list.length > 0 ? { allowedDomains: list } : {};
    }
    // The other four take `{}` only.
    return {};
  };

  const toggle = (next: boolean) => {
    if (!row.exists) {
      create.mutate({
        departmentId,
        body: { featureCode: code, isEnabled: next, config: buildConfig() },
      });
      return;
    }
    if (!next) {
      disable.mutate({ departmentId, code, etag: row.etag as string });
      return;
    }
    update.mutate({
      departmentId,
      code,
      body: { isEnabled: true },
      etag: row.etag as string,
    });
  };

  const saveConfig = () => {
    if (!row.exists) {
      create.mutate({
        departmentId,
        body: {
          featureCode: code,
          isEnabled: row.is_enabled,
          config: buildConfig(),
        },
      });
      return;
    }
    // `config` replaces rather than merges, so it goes whole.
    update.mutate({
      departmentId,
      code,
      body: { config: buildConfig() },
      etag: row.etag as string,
    });
  };

  const hasConfig = code === "AI_CLASSIFICATION" || code === "EXTERNAL_INTAKE";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">
              {copy.title}
            </h3>
            <Badge
              variant="outline"
              className="h-5 px-1.5 font-mono text-[10px] text-slate-500"
            >
              {code}
            </Badge>
            {!row.exists && (
              <Badge
                variant="outline"
                className="h-5 border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-500"
              >
                not configured
              </Badge>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            {copy.blurb}
          </p>
          {row.enabled_at && (
            <p className="mt-1 text-[11px] text-slate-400">
              Enabled {new Date(row.enabled_at).toLocaleDateString()}
              {row.disabled_at &&
                ` · disabled ${new Date(row.disabled_at).toLocaleDateString()}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          )}
          <Can
            permission={HELPDESK_PERMISSION.FEATURE_WRITE}
            fallback={
              <Badge variant="outline" className="h-6">
                {row.is_enabled ? "On" : "Off"}
              </Badge>
            }
          >
            <Switch
              checked={row.is_enabled}
              onCheckedChange={toggle}
              disabled={isPending}
            />
          </Can>
        </div>
      </div>

      {hasConfig && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          {code === "AI_CLASSIFICATION" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Confidence threshold</Label>
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="0.75"
                  className="mt-1 h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Model</Label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  maxLength={60}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </div>
          )}

          {/* {code === "EXTERNAL_INTAKE" && (
            <div>
              <Label className="text-xs">Allowed domains</Label>
              <Textarea
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                placeholder={"example.com\npartner.co.in"}
                rows={3}
                className="mt-1 text-sm"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                One per line. Up to 100. Leave empty to accept any sender.
              </p>
            </div>
          )} */}

          <Can permission={HELPDESK_PERMISSION.FEATURE_WRITE}>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={saveConfig}
                disabled={isPending}
              >
                Save configuration
              </Button>
            </div>
          </Can>
        </div>
      )}

      <ApiErrorNotice error={error} className="mt-3" />
    </div>
  );
}

export default function FeaturesPage() {
  const queryClient = useQueryClient();
  const { departmentId } = useAdminScope();
  const { data, isLoading, isFetching, error } = useFeatures(departmentId);

  return (
    <RequirePermission
      permission={HELPDESK_PERMISSION.FEATURE_READ}
      title="Features"
    >
      <AdminPageHeader
        title="Features"
        icon={ToggleLeft}
        description="Six capabilities. Switching one off stops new writes and removes nothing — what earlier ones created stays readable."
        isFetching={isFetching}
        onRefresh={() =>
          departmentId &&
          queryClient.invalidateQueries({
            queryKey: adminKeys.features(departmentId),
          })
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <ApiErrorNotice error={error} />
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading features…</p>
        )}
        {departmentId &&
          (data ?? []).map((row) => (
            <FeatureCard
              key={`${row.feature_code}-${row.etag ?? "none"}`}
              departmentId={departmentId}
              row={row}
            />
          ))}
      </div>
    </RequirePermission>
  );
}
