import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button";
import LoadingOverlay from "@/components/ui/loading-overlay.tsx";

import { Paperclip, Reply, ReplyAll, Forward, User } from "lucide-react";

import { GraphSentMessage } from "../types/sentMailType.ts";
import {
  fetchMessagesByConversation,
  type GraphMessage,
  listAttachments,
  downloadAttachment,
} from "@/features/mailHelpdesk/api/graphEmail.ts";
import { AssignAgentForm } from "@/features/mailHelpdesk/components/AssignAgentForm.tsx";
import { assignMemberToTicketDetail } from "@/features/mailHelpdesk/api/trackerHelpdesk.ts";
import { ticketDetailMailBox } from "../mail-api/api-mail.ts";
import { useToast } from "@/hooks/use-toast.ts";

interface EmailThreadProps {
  ticket: GraphSentMessage | any;
  onReply?: (message: GraphMessage) => void;
  onReplyAll?: (message: GraphMessage) => void;
  onForward?: (message: GraphMessage) => void;
  isMailActionVisible?: boolean;
  managers?: { userid: string; name: string }[];
  selectedTicketDetail?: ticketDetailMailBox;
  onRefetchTicketDetails?: () => void;
}

function MailBoxThread({
  ticket,
  onReply,
  onReplyAll,
  onForward,
  isMailActionVisible = false,
  managers,
  selectedTicketDetail,
  onRefetchTicketDetails,
}: EmailThreadProps) {
  const { toast } = useToast();

  const [messages, setMessages] = useState<GraphMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<
    Record<string, any[]>
  >({});
  const [attachmentsLoading, setAttachmentsLoading] = useState<
    Record<string, boolean>
  >({});
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // member assignment modal flag
  const [showAssignAgent, setShowAssignAgent] = useState(false);

  // Function to refresh messages
  const refreshMessages = useCallback(async () => {
    if (!ticket?.conversationId) return;

    try {
      setLoading(true);
      const msgs = await fetchMessagesByConversation(ticket.conversationId);
      setMessages(msgs);
    } catch (error) {
      console.log("error while refreshing messages", error);
    } finally {
      setLoading(false);
    }
  }, [ticket?.conversationId]);

  // Initial fetch of messages; prefer conversationId from detail if available
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);

        if (ticket?.conversationId) {
          setConversationId(ticket?.conversationId);
          const msgs = await fetchMessagesByConversation(
            ticket?.conversationId,
          );
          if (!cancelled) setMessages(msgs);
        }
      } catch (error) {
        console.log("error while fetching ticket conversation", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket?.id]); // , conversationId

  const sortedMessages = useMemo(() => {
    const copy = [...(messages || [])];
    copy.sort((a, b) => {
      const aTime = a.createdDateTime
        ? new Date(a.createdDateTime).getTime()
        : 0;
      const bTime = b.createdDateTime
        ? new Date(b.createdDateTime).getTime()
        : 0;
      return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
    });
    return copy;
  }, [messages, sortDirection]);

  // Lazy attachment loader per message
  const ensureAttachmentsLoaded = useCallback(
    async (message: GraphMessage) => {
      if (!message?.id || !message.hasAttachments) return;
      if (attachmentsByMessage[message.id]) return; // already loaded
      try {
        setAttachmentsLoading((prev) => ({ ...prev, [message.id]: true }));
        const list = await listAttachments(message.id);
        setAttachmentsByMessage((prev) => ({
          ...prev,
          [message.id]: list as any[],
        }));
      } catch (error) {
        console.log("Attachment loading error -->", error);
      } finally {
        setAttachmentsLoading((prev) => ({ ...prev, [message.id]: false }));
      }
    },
    [attachmentsByMessage],
  );

  const toggleExpand = useCallback(
    async (msg: GraphMessage) => {
      setExpandedIds((prev) =>
        prev.includes(msg.id)
          ? prev.filter((x) => x !== msg.id)
          : [...prev, msg.id],
      );
      if (msg.hasAttachments) {
        ensureAttachmentsLoaded(msg);
      }
    },
    [ensureAttachmentsLoaded],
  );

  const handleOpenAssignAgent = useCallback(() => setShowAssignAgent(true), []);
  const handleCloseAssignAgent = useCallback(
    () => setShowAssignAgent(false),
    [],
  );

  const assignedMemberUpdate = useCallback(
    async (user: { userid: string; name: string }) => {
      if (!selectedTicketDetail?.TICKET_ID) {
        toast({
          title: "Assignment Failed",
          description:
            "This ticket can't be assigned because the ticket ID has not been generated yet.",
          variant: "destructive",
        });
        return;
      }

      const ticketData = [
        {
          assigned: user?.userid,
          assignedTo: user?.name,
          ticketId: selectedTicketDetail?.TICKET_ID,
        },
      ];
      // console.log("ticketData updated -->", ticketData);

      const data = await assignMemberToTicketDetail(ticketData);
      handleCloseAssignAgent();
      onRefetchTicketDetails?.();
      return data;
    },
    [selectedTicketDetail, handleCloseAssignAgent, onRefetchTicketDetails],
  );

  // if (loading) {
  //   return <FullLoading />;
  // }

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Conversation actions */}
      <LoadingOverlay open={loading} text="Loading conversation…" />
      <div className="flex items-center justify-end p-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleOpenAssignAgent}
              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <User className="h-4 w-4" />
              <span>
                {selectedTicketDetail?.ASSIGNED
                  ? selectedTicketDetail?.ASSIGNED
                  : "Assign to Member"}
              </span>
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">Sort</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
            }
          >
            {sortDirection === "asc" ? "Oldest first" : "Newest first"}
          </Button>
        </div>
      </div>

      {/* Messages list (Outlook-like) */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* <LoadingOverlay open={loading} text="Loading conversation…" /> */}
        {!loading && sortedMessages.length === 0 && (
          <div className="text-sm text-muted-foreground">No messages</div>
        )}

        {sortedMessages?.map((msg) => (
          <Card key={msg.id} className="overflow-hidden mb-3">
            <CardContent className="p-0">
              {/* HEADER (responsive) */}
              <div className="px-4 py-2 bg-muted/50 border-b">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-foreground">
                      {msg.from?.emailAddress?.name ||
                        msg.sender?.emailAddress?.name ||
                        msg.from?.emailAddress?.address}
                    </div>
                    <div className="text-xs text-foreground break-words">
                      <span className="font-medium">To:</span>{" "}
                      {(msg.toRecipients || [])
                        .map((r) => r.emailAddress.address)
                        .join(", ")}
                      {msg.ccRecipients && msg.ccRecipients.length > 0 ? (
                        <>
                          {" "}
                          | <span className="font-medium">Cc:</span>{" "}
                          {msg.ccRecipients
                            .map((r) => r.emailAddress.address)
                            .join(", ")}
                        </>
                      ) : null}
                      {msg.bccRecipients && msg.bccRecipients.length > 0 ? (
                        <>
                          {" "}
                          | <span className="font-medium">Bcc:</span>{" "}
                          {msg.bccRecipients
                            .map((r) => r.emailAddress.address)
                            .join(", ")}
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-start sm:items-end gap-2">
                    <div className="text-xs text-foreground">
                      {msg.createdDateTime
                        ? format(new Date(msg.createdDateTime), "PPp")
                        : ""}
                    </div>
                  </div>
                </div>
              </div>

              {isMailActionVisible ? (
                <div className="px-4 py-2 flex flex-wrap gap-2 border-b bg-muted/30">
                  <Button
                    size="sm"
                    onClick={() => onReply?.(msg)}
                    disabled={!onReply}
                    className="flex items-center gap-1"
                  >
                    <Reply className="h-4 w-4 text-sky-600" /> Reply
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReplyAll?.(msg)}
                    disabled={!onReplyAll}
                    className="flex items-center gap-1"
                  >
                    <ReplyAll className="h-4 w-4 text-teal-600" /> Reply All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onForward?.(msg)}
                    disabled={!onForward}
                    className="flex items-center gap-1"
                  >
                    <Forward className="h-4 w-4 text-indigo-600" /> Forward
                  </Button>
                </div>
              ) : null}

              {/* BODY PREVIEW / FULL */}
              <div
                className="px-4 py-3 text-sm cursor-pointer text-foreground"
                onClick={() => toggleExpand(msg)}
              >
                {expandedIds.includes(msg.id) ? (
                  <div className="prose prose-sm max-w-none">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: msg.body?.content || "",
                      }}
                    />
                  </div>
                ) : (
                  <>
                    {(msg as any).bodyPreview ||
                      (msg.body?.content || "")
                        .replace(/<[^>]+>/g, " ")
                        .slice(0, 200) +
                        ((msg.body?.content || "").length > 200 ? "…" : "") ||
                      "(No content)"}
                  </>
                )}
              </div>

              {/* ATTACHMENTS (lazy) */}
              {expandedIds.includes(msg?.id) && msg?.hasAttachments && (
                <div className="px-4 pb-4">
                  <div className="mt-1 pt-3 border-t border-border">
                    <div className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Paperclip className="h-4 w-4" /> Attachments
                    </div>
                    {attachmentsLoading[msg.id] && (
                      <div className="text-xs text-foreground">
                        Loading attachments…
                      </div>
                    )}
                    {!attachmentsLoading[msg.id] && (
                      <div className="flex flex-wrap gap-2">
                        {(attachmentsByMessage[msg.id] || []).map(
                          (att: any) => (
                            <Button
                              key={att.id}
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={async () => {
                                const blob = await downloadAttachment(
                                  msg.id,
                                  att.id,
                                );
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = att.name || "attachment";
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                window.URL.revokeObjectURL(url);
                              }}
                            >
                              {att.name || "attachment"}
                            </Button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Inline actions are placed in header above for responsive layout */}
            </CardContent>
          </Card>
        ))}
      </div>
      {showAssignAgent && (
        <AssignAgentForm
          onClose={handleCloseAssignAgent}
          managers={managers}
          onAssign={assignedMemberUpdate}
        />
      )}
    </div>
  );
}

export default MailBoxThread;
