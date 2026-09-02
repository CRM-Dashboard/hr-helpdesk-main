/**
 * A department's lifecycle status.
 *
 * All four are shown wherever departments are listed: lifecycle decides whether a
 * department is *operational*, not whether an administrator may *see* it.
 */
import { Badge } from "@/components/ui/badge";
import type { DepartmentStatus } from "../../types/pg";

const TONE: Record<DepartmentStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-100 text-slate-600",
  // READY is not live yet — it means the blocking checks pass and Activate will work.
  READY: "border-blue-200 bg-blue-50 text-blue-700",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  INACTIVE: "border-amber-200 bg-amber-50 text-amber-700",
};

export function DepartmentStatusBadge({ status }: { status: DepartmentStatus }) {
  return (
    <Badge
      variant="outline"
      className={`h-5 px-1.5 text-[10px] font-medium ${TONE[status] ?? TONE.DRAFT}`}
    >
      {status}
    </Badge>
  );
}
