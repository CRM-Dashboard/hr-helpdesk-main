import React, { useMemo } from "react";
import { format, isPast } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Edit, AlarmClock, Clock, Tag, Layers } from "lucide-react";
import { Ticket } from "../types/ticket";
import { TicketDetailData } from "../types/helpdeskDataTypes";
import { SnoozeRecord } from "../types/collaboration";
import { getPriorityColor, getStatusColor } from "../utils/utils";
import { getEscalationDateTime } from "../utils/threadUtils";

interface TicketHeaderProps {
  ticket: Ticket;
  detail: TicketDetailData | null;
  assignedToName: string | null;
  activeSnooze: SnoozeRecord | null;
  onOpenAssign: () => void;
  onOpenEdit: () => void;
  onOpenSnooze: () => void;
}

export function TicketHeader({
  ticket,
  detail,
  assignedToName,
  activeSnooze,
  onOpenAssign,
  onOpenEdit,
  onOpenSnooze,
}: TicketHeaderProps) {
  const formattedReceivedDate = useMemo(
    () => format(ticket.receivedDate, "PPp"),
    [ticket.receivedDate],
  );

  const esc1DateTime = getEscalationDateTime(detail?.esc1Dt, detail?.esc1Time);
  const esc2DateTime = getEscalationDateTime(detail?.esc2Dt, detail?.esc2Time);
  const esc3DateTime = getEscalationDateTime(detail?.esc3Dt, detail?.esc3Time);

  // Only show escalations that have passed (are overdue)
  const showEsc1 = esc1DateTime && isPast(esc1DateTime);
  const showEsc2 = esc2DateTime && isPast(esc2DateTime);
  const showEsc3 = esc3DateTime && isPast(esc3DateTime);

  return (
    <div className="p-6 border-b border-border bg-card">
      <div className="flex items-start justify-between mb-0">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-xs font-semibold ${getStatusColor(
                  detail?.statusTxt || "Open",
                )}`}
              >
                {detail?.statusTxt || "Open"}
              </Badge>
              <Badge
                variant={
                  ticket.priority === "urgent" ? "destructive" : "secondary"
                }
                className={`text-xs ${getPriorityColor(detail?.priority)}`}
              >
                {detail?.priority ||
                  ticket?.tracker?.priority.toUpperCase() ||
                  "Priority not set"}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={onOpenAssign}
                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <User className="h-4 w-4" />
                  <span>
                    {assignedToName ? assignedToName : "Assigned to Memeber"}
                  </span>
                </Button>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={onOpenEdit}
                className="flex items-center gap-1 bg-slate-600 hover:bg-slate-700 text-white"
              >
                <Edit className="w-3 h-3" />
                <span>{"Edit Ticket Details"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSnooze}
                className={`flex items-center gap-1 ${
                  activeSnooze
                    ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : ""
                }`}
              >
                <AlarmClock className="w-3.5 h-3.5" />
                <span>{activeSnooze ? "Snoozed" : "Snooze"}</span>
              </Button>
            </div>
          </div>

          <h1 className="text-xl font-semibold mb-2">
            {detail?.subject || ticket.subject || "(Subject Not Provided)"}
          </h1>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              <span>{ticket.customerName}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{formattedReceivedDate}</span>
            </div>
            <div className="flex items-center gap-1">
              <Tag className="h-4 w-4" />
              <span>Category : {detail?.category || "Not set"}</span>
            </div>
            <div className="flex items-center gap-1">
              <Layers className="h-4 w-4" />
              <span>Sub-category : {detail?.subCategory || "Not set"}</span>
            </div>
          </div>

          <div className="mt-2">
            <p>
              Description :
              <span className="text-sm text-muted-foreground">
                {" "}
                {detail?.ticketDesc || ""}
              </span>
            </p>
          </div>

          {(showEsc1 || showEsc2 || showEsc3) && (
            <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
              {showEsc1 && (
                <div
                  className={`flex items-center gap-2 ${
                    esc1DateTime && esc1DateTime < new Date()
                      ? "text-orange-500 font-medium"
                      : ""
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  <span>
                    Escalation 1:{" "}
                    {esc1DateTime &&
                      format(esc1DateTime, "dd MMM yyyy, hh:mm a")}
                  </span>
                </div>
              )}

              {showEsc2 && (
                <div
                  className={`flex items-center gap-2 ${
                    esc2DateTime && esc2DateTime < new Date()
                      ? "text-amber-600 font-medium"
                      : ""
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  <span>
                    Escalation 2:{" "}
                    {esc2DateTime &&
                      format(esc2DateTime, "dd MMM yyyy, hh:mm a")}
                  </span>
                </div>
              )}

              {showEsc3 && (
                <div
                  className={`flex items-center gap-2 ${
                    esc3DateTime && esc3DateTime < new Date()
                      ? "text-red-600 font-medium"
                      : ""
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  <span>
                    Escalation 3:{" "}
                    {esc3DateTime &&
                      format(esc3DateTime, "dd MMM yyyy, hh:mm a")}
                  </span>
                </div>
              )}
            </div>
          )}

          {activeSnooze && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlarmClock className="h-4 w-4 flex-shrink-0" />
              <span>
                OLA paused (snoozed) until{" "}
                <span className="font-medium">
                  {format(new Date(activeSnooze.until), "dd MMM yyyy, hh:mm a")}
                </span>
                {activeSnooze.reason ? ` — ${activeSnooze.reason}` : ""}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TicketHeader;
