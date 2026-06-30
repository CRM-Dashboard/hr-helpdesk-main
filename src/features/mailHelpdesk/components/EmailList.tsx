import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Ticket } from "../types/ticket";
import { format } from "date-fns";
import { Users, Circle, Mail } from "lucide-react";

interface EmailListProps {
  tickets: Ticket[];
  selectedTicket: Ticket | null;
  onTicketSelect: (ticket: Ticket) => void;
}

function EmailList({
  tickets,
  selectedTicket,
  onTicketSelect,
}: EmailListProps) {
  // console.log("tickets Emaillist -->", tickets);

  const sortedTickets = useMemo(() => {
    if (!tickets) return [];

    const unreadTickets = tickets
      .filter((ticket) => ticket.unread && ticket.unread !== "0")
      .sort((a, b) => b.receivedDate.getTime() - a.receivedDate.getTime());

    const readTickets = tickets
      .filter((ticket) => !ticket.unread || ticket.unread === "0")
      .sort((a, b) => b.receivedDate.getTime() - a.receivedDate.getTime());

    return [...unreadTickets, ...readTickets];
  }, [tickets]);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background to-muted/20">
      {/* Modern Header */}
      <div className="sticky top-0 z-10 backdrop-blur-xl bg-background/80 border-b border-border/50 shadow-sm">
        <div className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Mail className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-base tracking-tight">Inbox</h2>
                <p className="text-xs text-muted-foreground">
                  {tickets?.length || 0} conversations
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ticket List */}
      <div className="p-1.5">
        {sortedTickets?.map((ticket) => {
          const isSelected = selectedTicket?.id === ticket?.id;
          const isUnread = ticket?.unread && ticket.unread !== "0";

          return (
            <div
              key={ticket.id}
              onClick={() => onTicketSelect(ticket)}
              className={`group relative mb-1.5 rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.01] ${
                isSelected
                  ? "bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 shadow-lg shadow-blue-500/10 border-2 border-blue-200 dark:border-blue-800"
                  : isUnread
                    ? "bg-white dark:bg-slate-900 shadow-md hover:shadow-xl border-2 border-blue-200 dark:border-blue-900"
                    : "bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 border border-border/50 hover:border-border hover:shadow-md"
              }`}
            >
              {/* Unread Indicator */}
              {isUnread && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-gradient-to-b from-blue-500 to-purple-600 rounded-r-full shadow-lg shadow-blue-500/50" />
              )}

              <div className="p-2.5 pl-3.5">
                {/* Header Row */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Avatar */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shadow-sm ${
                        isUnread
                          ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
                          : "bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {ticket.customerName.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-sm truncate ${
                            isUnread
                              ? "font-bold text-foreground"
                              : "font-medium text-foreground/80"
                          }`}
                        >
                          {ticket.customerName}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1.5 font-medium border-dashed"
                        >
                          #{ticket.id}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <span className="text-xs font-medium text-muted-foreground flex-shrink-0 ml-2">
                    {format(ticket.receivedDate, "MMM dd")}
                  </span>
                </div>

                {/* Subject */}
                <div
                  className={`text-sm truncate mb-2 ml-9 ${
                    isUnread
                      ? "font-semibold text-foreground"
                      : "font-normal text-muted-foreground"
                  }`}
                >
                  {ticket.subject}
                </div>

                {/* Footer Badges */}
                <div className="flex items-center gap-1.5 ml-9 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="text-xs h-5 px-2 rounded-lg font-medium shadow-sm flex items-center
    bg-blue-100 text-blue-700 border border-blue-200"
                  >
                    <Users className="w-3 h-3 mr-1 text-blue-600" />
                    {ticket.assignedTo || "Unassigned"}
                  </Badge>

                  {ticket?.unread && ticket.unread !== "0" && (
                    <Badge className="text-xs h-5 px-2 rounded-lg font-bold bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-lg shadow-red-500/30 border-0">
                      <Circle className="w-2 h-2 mr-1 fill-current" />
                      {ticket.unread} new
                    </Badge>
                  )}

                  {/* External / Internal */}
                  <Badge
                    variant="secondary"
                    className={`text-xs h-5 px-2 rounded-lg font-medium shadow-sm border ${
                      ticket?.externalInd
                        ? "bg-amber-100 text-amber-700 border-amber-200"
                        : "bg-emerald-100 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    {ticket?.externalInd ? "External" : "Internal"}
                  </Badge>

                  {/* Ex-Employee */}
                  {ticket?.exEmployeeInd && (
                    <Badge
                      variant="secondary"
                      className="text-xs h-5 px-2 rounded-lg font-medium shadow-sm border bg-purple-100 text-purple-700 border-purple-200"
                    >
                      Ex-Employee
                    </Badge>
                  )}

                  {/* OLA Breached */}
                  {ticket?.escLevel !== 0 && (
                    <Badge className="text-xs h-5 px-2 rounded-lg font-bold bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-lg shadow-red-500/30 border-0">
                      OLA Breached
                    </Badge>
                  )}
                </div>
              </div>

              {/* Hover Effect Overlay */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-200 pointer-events-none" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default EmailList;
