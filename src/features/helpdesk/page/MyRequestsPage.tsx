import React, { useMemo, useState } from "react";
import { useHelpdesk } from "../context/HelpdeskContext";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "../components/StatusBadge";
import type { HelpdeskStatus } from "../types/types";
import { useNavigate } from "react-router-dom";

export default function MyRequestsPage() {
  const navigate = useNavigate();
  const { requests } = useHelpdesk();
  // In lieu of auth, use a demo email; replace with actual user in real app
  const currentUserEmail = "testUser@gera.in";

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | HelpdeskStatus>("all");

  const myRequests = useMemo(() => {
    return requests
      .filter((r) => r.employeeEmail === currentUserEmail)
      .filter((r) => (status === "all" ? true : r.status === status))
      .filter((r) =>
        q.trim() === ""
          ? true
          : [r.title, r.description, r.category, r.subCategory]
              .join(" ")
              .toLowerCase()
              .includes(q.toLowerCase())
      );
  }, [requests, currentUserEmail, q, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <Input
          placeholder="Search my requests..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => navigate("/helpdesk/new")}>New Request</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {myRequests.map((r) => (
          <Card key={r.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{r.title}</CardTitle>
                <CardDescription>
                  {r.category} • {r.subCategory}
                </CardDescription>
              </div>
              <StatusBadge status={r.status} />
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {r.description}
              </p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>
                  Created: {new Date(r.createdAt).toLocaleDateString()}
                </span>
                <span>
                  Updated: {new Date(r.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {myRequests.length === 0 && (
        <div className="text-sm text-muted-foreground">
          No requests match your filters.
        </div>
      )}
    </div>
  );
}
