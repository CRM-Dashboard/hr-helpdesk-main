/**
 * The admin landing screen.
 *
 * A card per screen the signed-in user can actually open, built from the same
 * permission-filtered menu as the sidebar. Landing on a fixed first screen would
 * mean a `MANAGER` — who holds every read permission but not
 * `helpdesk.department.write` — sometimes arriving at a refusal instead of a page.
 *
 * The readiness summary is here rather than on every screen because it is the one
 * number that says whether the department works at all, and because it costs one
 * request of a 60-per-minute budget.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDepartmentReadiness } from "../../hooks/pg";
import {
  HELPDESK_PERMISSION,
  usePermissions,
} from "../../permissions";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { DepartmentStatusBadge } from "../components/DepartmentStatusBadge";
import { useAdminScope } from "../context/adminScopeContext";
import { visibleNav } from "../adminNav";

export default function AdminOverviewPage() {
  const { any, has } = usePermissions();
  const { department, departmentId } = useAdminScope();
  const sections = visibleNav(any);

  const readiness = useDepartmentReadiness(
    departmentId,
    has(HELPDESK_PERMISSION.DEPARTMENT_READ),
  );

  return (
    <>
      <AdminPageHeader
        title="Administration"
        description="Helpdesk configuration for the department in scope. Every screen here is gated on a permission your account holds."
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {department && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-800">
                    {department.name}
                  </h2>
                  <DepartmentStatusBadge status={department.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {department.support_email ?? "No support mailbox set"}
                </p>
              </div>

              {readiness.data && (
                <div className="flex items-center gap-2">
                  {readiness.data.ready ? (
                    <Badge
                      variant="outline"
                      className="h-6 gap-1.5 border-emerald-200 bg-emerald-50 px-2 text-emerald-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Ready to run
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="h-6 gap-1.5 border-destructive/30 bg-destructive/5 px-2 text-destructive"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {readiness.data.blocking} blocking check
                      {readiness.data.blocking === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {readiness.data.warnings > 0 && (
                    <Badge
                      variant="outline"
                      className="h-6 border-amber-200 bg-amber-50 px-2 text-amber-700"
                    >
                      {readiness.data.warnings} warning
                      {readiness.data.warnings === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <ApiErrorNotice error={readiness.error} className="mt-3" />
          </div>
        )}

        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {section.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {section.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <item.icon size={15} className="text-slate-500" />
                    <p className="text-sm font-medium text-slate-800">
                      {item.label}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
