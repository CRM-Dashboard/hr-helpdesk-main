/**
 * Resolves the department the admin area operates on, once, when the area mounts.
 *
 * `GET /admin/departments` answers this for both roles at once: a `SUPER_ADMIN`
 * gets every department and a chooser, anybody else gets exactly their own and a
 * header. That is why the list is fetched even for a single-department admin —
 * it is one request that replaces a chooser, not a request made to build one.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useHelpdeskAuth } from "../../context/helpdeskAuthContext";
import { useDepartments } from "../../hooks/pg";
import { HELPDESK_PERMISSION, usePermissions } from "../../permissions";
import { AdminScopeContext, type AdminScopeValue } from "./adminScopeContext";

export function AdminScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useHelpdeskAuth();
  const { has } = usePermissions();
  const canRead = has(HELPDESK_PERMISSION.DEPARTMENT_READ);
  const canSwitch = user?.roleCode === "SUPER_ADMIN";

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error } = useDepartments(
    { limit: 200, sort: "code:asc" },
    canRead,
  );
  const departments = useMemo(() => data?.rows ?? [], [data]);

  // Default the scope: the caller's own department when they have one, otherwise
  // the first row a SUPER_ADMIN can see. Left alone once the user has chosen.
  useEffect(() => {
    if (selectedId) return;
    if (user?.departmentId) {
      setSelectedId(user.departmentId);
      return;
    }
    if (departments.length > 0) setSelectedId(departments[0].id);
  }, [selectedId, user?.departmentId, departments]);

  const value = useMemo<AdminScopeValue>(
    () => ({
      departmentId: selectedId,
      department: departments.find((row) => row.id === selectedId) ?? null,
      departments,
      canSwitch,
      isLoading: canRead && isLoading,
      error: (error as Error) ?? null,
      setDepartmentId: setSelectedId,
    }),
    [selectedId, departments, canSwitch, canRead, isLoading, error],
  );

  return (
    <AdminScopeContext.Provider value={value}>
      {children}
    </AdminScopeContext.Provider>
  );
}
