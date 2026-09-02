/**
 * Which department the admin area is operating on.
 *
 * Every `/admin/departments/:departmentId/*` route runs `scopeToDepartment`: a
 * `SUPER_ADMIN` may name any department, and anybody else naming one other than
 * their own gets `403 CROSS_DEPARTMENT`. So the selector exists for exactly one
 * role, and for everyone else the scope is a fact rather than a choice — which is
 * why this holds `canSwitch` and not just a setter.
 *
 * Context and hook live here rather than beside the provider so the provider file
 * exports only a component (React Fast Refresh).
 */
import { createContext, useContext } from "react";
import type { DepartmentRow } from "../../types/pg";

export interface AdminScopeValue {
  /** The department every scoped call on this screen should name. */
  departmentId: string | null;
  /** Its row, once the list resolves. Null while loading or when none is selected. */
  department: DepartmentRow | null;
  /** Every department the caller may see — one row for anyone but a SUPER_ADMIN. */
  departments: DepartmentRow[];

  /** True only for a SUPER_ADMIN. Render the switcher from this, not from a count. */
  canSwitch: boolean;
  isLoading: boolean;
  error: Error | null;

  /**
   * Points the admin area at another department.
   *
   * @param departmentId the department to operate on
   */
  setDepartmentId: (departmentId: string) => void;
}

export const AdminScopeContext = createContext<AdminScopeValue | null>(null);

/**
 * Reads the department the admin area is scoped to.
 *
 * @returns the scope, the department list and the switcher
 * @throws when called outside `<AdminScopeProvider>`
 */
export const useAdminScope = (): AdminScopeValue => {
  const value = useContext(AdminScopeContext);
  if (!value) {
    throw new Error("useAdminScope must be used inside <AdminScopeProvider>");
  }
  return value;
};
