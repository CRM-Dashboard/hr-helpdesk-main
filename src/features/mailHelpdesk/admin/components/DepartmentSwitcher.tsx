/**
 * The department in scope.
 *
 * A chooser for a `SUPER_ADMIN`, a label for everybody else — because for
 * everybody else it is not a choice: `scopeToDepartment` pins them to their own
 * record and answers `403 CROSS_DEPARTMENT` for any other. Rendering a disabled
 * dropdown would suggest the scope is theirs to change.
 */
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminScope } from "../context/adminScopeContext";
import { DepartmentStatusBadge } from "./DepartmentStatusBadge";

export function DepartmentSwitcher() {
  const {
    departmentId,
    department,
    departments,
    canSwitch,
    isLoading,
    setDepartmentId,
  } = useAdminScope();

  if (isLoading) {
    return (
      <div className="h-8 w-40 animate-pulse rounded-md bg-slate-100" aria-hidden />
    );
  }

  if (!canSwitch) {
    if (!department) {
      return (
        <Badge variant="outline" className="h-8 gap-1.5 px-3 font-normal">
          <Building2 size={13} />
          No department
        </Badge>
      );
    }
    return (
      <div className="flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
        <Building2 size={13} className="text-slate-500" />
        <span className="text-sm font-medium text-slate-700">
          {department.name}
        </span>
        <DepartmentStatusBadge status={department.status} />
      </div>
    );
  }

  return (
    <Select
      value={departmentId ?? undefined}
      onValueChange={setDepartmentId}
    >
      <SelectTrigger className="h-8 w-[220px] bg-white text-sm">
        <SelectValue placeholder="Choose a department" />
      </SelectTrigger>
      <SelectContent>
        {departments.map((row) => (
          <SelectItem key={row.id} value={row.id}>
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{row.code}</span>
              {row.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
