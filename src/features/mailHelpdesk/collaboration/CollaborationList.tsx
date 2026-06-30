import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Mail, User } from "lucide-react";
import { CollaborationActivity } from "./types";

interface CollaborationListProps {
  activities: CollaborationActivity[];
  /** Open the email trail screen for a collaboration that was sent by email. */
  onShowTrail?: (activity: CollaborationActivity) => void;
}

export function CollaborationList({
  activities,
  onShowTrail,
}: CollaborationListProps) {
  if (!activities || activities.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No collaborations yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((a, i) => (
        <div
          key={a.activityNo || `${a.ticketId}-${i}`}
          className="rounded-md border border-amber-200 bg-white px-3 py-2"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {a.activityDes || "Untitled activity"}
            </span>
            {/* <div className="flex items-center gap-1.5">
              {a.priority && (
                <Badge variant="outline" className="text-[10px]">
                  {a.priority}
                </Badge>
              )}
              {a.statTxt && (
                <Badge variant="secondary" className="text-[10px]">
                  {a.statTxt}
                </Badge>
              )}
            </div> */}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {a.assignedName || a.assigned}
            </span>
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {a.deptTxt || a.dept}
            </span>
            {a.dueDt && <span>Due: {a.dueDt}</span>}
          </div>

          {a.comments && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-foreground">
              {a.comments}
            </p>
          )}

          {a.conversationId && onShowTrail && (
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onShowTrail(a)}
                className="h-7 gap-1.5 border-amber-300 px-2 text-xs text-amber-800 hover:bg-amber-100"
              >
                <Mail className="h-3.5 w-3.5" />
                Show trail mail
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default CollaborationList;
