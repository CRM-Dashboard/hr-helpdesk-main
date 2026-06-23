import React from "react";
import { Badge } from "@/components/ui/badge";
import type { HelpdeskStatus } from "../types/types";

export function StatusBadge({ status }: { status: HelpdeskStatus }) {
  const label =
    status === "in_progress"
      ? "In Progress"
      : status.charAt(0).toUpperCase() + status.slice(1);

  const variant =
    status === "resolved"
      ? "secondary"
      : status === "closed"
      ? "outline"
      : status === "rejected"
      ? "destructive"
      : status === "in_progress"
      ? "default"
      : "default";

  return <Badge variant={variant as any}>{label}</Badge>;
}
