import { format } from "date-fns";
import { useEffect, useRef } from "react";
import { RefreshCw, Users } from "lucide-react";
import { ticketDetailMailBox } from "../mail-api/api-mail";
import { Badge } from "@/components/ui/badge";

interface EmailListProps {
  tickets: any[];
  selectedTicket: any | null;
  onTicketSelect: (ticket: any) => void;
  onScrollToBottom?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  mailType?: "sent" | "inbox";
  ticketDetailData?: ticketDetailMailBox[];
}

function MailBoxList({
  tickets,
  selectedTicket,
  onTicketSelect,
  onScrollToBottom,
  isLoadingMore = false,
  hasMore = false,
  mailType = "sent",
  ticketDetailData,
}: EmailListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !onScrollToBottom || !hasMore) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Trigger when user scrolls within 100px of the bottom
      if (scrollHeight - scrollTop - clientHeight < 100 && !isLoadingMore) {
        onScrollToBottom();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [onScrollToBottom, hasMore, isLoadingMore]);

  const conversationMap = new Map(
    Array.isArray(ticketDetailData)
      ? ticketDetailData.map((item) => [item?.CONVERSATION_ID, item])
      : [],
  );

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border flex-shrink-0">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          {mailType === "sent" ? "Sent Mail" : "Inbox"} (
          {tickets?.length || "0"})
        </h2>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="divide-y divide-border">
          {tickets && tickets.length > 0 ? (
            <>
              {tickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket?.id;
                const isUnread = ticket?.isRead === false;
                const ticketDetail = conversationMap.get(ticket.conversationId);
                const assignedUser =
                  ticketDetail?.ASSIGNED ||
                  ticketDetail?.ASSIGNED_TO ||
                  "Not Assigned";

                return (
                  <div
                    key={ticket.id}
                    onClick={() => onTicketSelect(ticket)}
                    className={`p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                      isSelected
                        ? "bg-primary/10 border-r-2 border-primary"
                        : isUnread
                          ? "bg-blue-50/50 border-l-2 border-blue-400"
                          : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2 gap-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span
                              className={`text-sm truncate ${
                                isUnread ? "font-semibold" : "font-medium"
                              }`}
                            >
                              {mailType === "inbox"
                                ? ticket.sender?.emailAddress?.name ||
                                  "Unknown Sender"
                                : ticket.toRecipients
                                    .map(
                                      (r) =>
                                        r?.emailAddress?.name ||
                                        "To: Name Not Found",
                                    )
                                    .join(", ")}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
                            {ticket.receivedDateTime
                              ? format(
                                  ticket.receivedDateTime,
                                  "MMM dd, hh:mm a",
                                )
                              : ""}
                          </span>
                        </div>

                        {/* Subject */}
                        <div
                          className={`text-sm truncate ${
                            isUnread
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {ticket.subject || "(No subject)"}
                        </div>

                        {/* Assigned */}
                        <div className="flex items-center mt-1 flex-wrap">
                          <Badge
                            variant="secondary"
                            className="text-xs h-5 px-2 rounded-lg font-medium shadow-sm flex items-center
    bg-blue-100 text-blue-700 border border-blue-200"
                          >
                            <Users className="w-3 h-3 mr-1 text-blue-600" />
                            {assignedUser || "Unassigned"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {isLoadingMore && (
                <div className="p-4 text-center">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-xs text-muted-foreground mt-2">
                    Loading more...
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center">
              <div className="text-muted-foreground">
                <p className="text-sm">No emails found</p>
                <p className="text-xs mt-1">
                  Try refreshing or adjusting your filters
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MailBoxList;
