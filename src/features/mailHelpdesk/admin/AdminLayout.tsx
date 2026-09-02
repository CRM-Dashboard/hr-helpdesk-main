/**
 * The admin area shell: a permission-filtered menu beside the screen in view.
 *
 * The menu is built from `/auth/me`'s permission array, so it shows exactly the
 * screens that would load. The area itself is gated on holding *any* helpdesk
 * permission — an `EMPLOYEE` holds none and is refused from all 91 admin routes,
 * so there is nothing here to show them.
 */
import { NavLink, Outlet } from "react-router-dom";
import { ArrowLeft, ShieldAlert, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePermissions } from "../permissions";
import { AdminScopeProvider } from "./context/AdminScopeProvider";
import { visibleNav } from "./adminNav";

function AdminShell() {
  const navigate = useNavigate();
  const { any, isReady, isEmpty } = usePermissions();
  const sections = visibleNav(any);

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking your access…
      </div>
    );
  }

  if (isEmpty || sections.length === 0) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <div className="flex h-[52px] items-center gap-3 border-b border-slate-200 bg-white px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="flex h-8 items-center gap-1.5 px-2 text-slate-600"
          >
            <ArrowLeft size={16} />
            Back to the desk
          </Button>
        </div>
        <div className="p-6">
          <div className="flex max-w-xl items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">There is no administration here for you</p>
              <p className="mt-0.5">
                Helpdesk configuration is permission-gated, and your account holds
                none of the <span className="font-mono text-xs">helpdesk.*</span>{" "}
                permissions. Ask a department administrator if you need access.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="mb-2 flex h-7 w-full justify-start gap-1.5 px-2 text-slate-600"
          >
            <ArrowLeft size={14} />
            Back to the desk
          </Button>
          <p className="px-2 text-sm font-semibold text-slate-800">
            Administration
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {sections.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "bg-slate-100 font-medium text-slate-900"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`
                    }
                  >
                    <item.icon size={15} className="flex-shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <AdminScopeProvider>
      <AdminShell />
    </AdminScopeProvider>
  );
}
