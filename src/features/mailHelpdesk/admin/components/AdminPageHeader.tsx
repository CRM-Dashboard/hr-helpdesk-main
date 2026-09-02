/**
 * The bar every admin screen sits under: title, the department in scope, and the
 * actions that screen offers.
 */
import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DepartmentSwitcher } from "./DepartmentSwitcher";

interface AdminPageHeaderProps {
  title: string;
  icon?: LucideIcon;
  /** One line under the title. Keep it to what the screen actually does. */
  description?: string;
  /** True while the screen's own query is in flight. */
  isFetching?: boolean;
  onRefresh?: () => void;
  /** Buttons for this screen — Create, Publish, and so on. */
  actions?: ReactNode;
  /** Hide the scope selector on the cross-department screens. */
  showScope?: boolean;
}

export function AdminPageHeader({
  title,
  icon: Icon,
  description,
  isFetching = false,
  onRefresh,
  actions,
  showScope = true,
}: AdminPageHeaderProps) {
  return (
    <div className="border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={18} className="text-slate-500" />}
            <h1 className="text-base font-semibold text-slate-800">{title}</h1>
            {isFetching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
            )}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showScope && <DepartmentSwitcher />}
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-white"
              onClick={onRefresh}
              disabled={isFetching}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}
