import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  downloadAttachment,
  fetchMessagesByConversation,
  listAttachments,
  type GraphMessage,
} from "../api/graphEmail.ts";
import { ComposeContext } from "../types/compose.ts";
import type { TicketListRow } from "../types/pg";
import { useCollaborations, useTicket, useTicketTimeline } from "../hooks/pg";
import { useHelpdeskAuth } from "../context/helpdeskAuthContext.ts";
import { extractUniqueParticipantNames } from "../utils/emailUtils.ts";
import {
  buildQuotedHtml,
  makeForwardSubject,
  makeReplySubject,
  uniqueEmails,
} from "../utils/threadUtils.ts";
import { HELPDESK_ADDRESS } from "../utils/collaborationMail.ts";
import { MessageCard } from "./MessageCard.tsx";
import { TicketActivityFeed } from "./TicketActivityFeed.tsx";
import { TicketCollaborations } from "./TicketCollaborations.tsx";
import { TicketHeader } from "./TicketHeader.tsx";

interface EmailThreadProps {
  /** Ticket uuid from `GET /tickets`. */
  ticketId: string;
  /** The list row that was clicked, for the joined display fields. */
  listRow?: TicketListRow;
  onCompose: (ctx: ComposeContext) => void;
}

export function EmailThread({
  ticketId,
  listRow,
  onCompose,
}: EmailThreadProps) {
  const { statesByCode, isAgent } = useHelpdeskAuth();

  const {
    data: detail,
    isLoading: detailLoading,
    error: detailError,
  } = useTicket(ticketId);
  const { data: timeline, isLoading: timelineLoading } =
    useTicketTimeline(ticketId);
  // All four collaboration routes are agent-only, so a requester never asks.
  const { data: collaborations, isLoading: collaborationsLoading } =
    useCollaborations(ticketId, isAgent);

  // The customer mail thread still comes from Graph — the server-side thread
  // endpoint is a later phase. It is best-effort: a ticket raised in the portal
  // has no conversation, and Graph needs a token this session may not hold.
  const [messages, setMessages] = useState<GraphMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [mailUnavailable, setMailUnavailable] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<
    Record<string, unknown[]>
  >({});
  const [attachmentsLoading, setAttachmentsLoading] = useState<
    Record<string, boolean>
  >({});
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const messagesReqIdRef = useRef(0);
  const conversationId = detail?.ticket.conversation_id ?? null;

  useEffect(() => {
    setMessages([]);
    setExpandedIds([]);
    setAttachmentsByMessage({});
    setAttachmentsLoading({});
    setMailUnavailable(false);

    if (!conversationId) return;
    const reqId = ++messagesReqIdRef.current;

    (async () => {
      try {
        setMessagesLoading(true);
        const msgs = await fetchMessagesByConversation(conversationId);
        if (messagesReqIdRef.current !== reqId) return;
        setMessages(msgs);
      } catch {
        if (messagesReqIdRef.current !== reqId) return;
        setMailUnavailable(true);
      } finally {
        if (messagesReqIdRef.current === reqId) setMessagesLoading(false);
      }
    })();
  }, [conversationId]);

  const refreshMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      setMessages(await fetchMessagesByConversation(conversationId));
    } catch {
      setMailUnavailable(true);
    }
  }, [conversationId]);

  const sortedMessages = useMemo(() => {
    const copy = [...messages];
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

  const ensureAttachmentsLoaded = useCallback(
    async (message: GraphMessage) => {
      if (!message?.id || !message.hasAttachments) return;
      if (attachmentsByMessage[message.id]) return;
      try {
        setAttachmentsLoading((prev) => ({ ...prev, [message.id]: true }));
        const list = await listAttachments(message.id);
        setAttachmentsByMessage((prev) => ({ ...prev, [message.id]: list }));
      } catch {
        // A missing attachment list must not break the thread.
      } finally {
        setAttachmentsLoading((prev) => ({ ...prev, [message.id]: false }));
      }
    },
    [attachmentsByMessage],
  );

  const toggleExpand = useCallback(
    (msg: GraphMessage) => {
      setExpandedIds((prev) =>
        prev.includes(msg.id)
          ? prev.filter((x) => x !== msg.id)
          : [...prev, msg.id],
      );
      if (msg.hasAttachments) ensureAttachmentsLoaded(msg);
    },
    [ensureAttachmentsLoaded],
  );

  const subject = detail?.ticket.subject ?? listRow?.subject ?? "";

  /**
   * The latest customer message, quoted into a collaboration mail so the
   * collaborator needs no second screen. Taken by timestamp, not by position —
   * the list's order follows the reader's sort toggle.
   */
  const newestMessage = useMemo(
    () =>
      messages.reduce<GraphMessage | null>((latest, msg) => {
        if (!latest) return msg;
        const at = msg.createdDateTime
          ? new Date(msg.createdDateTime).getTime()
          : 0;
        const best = latest.createdDateTime
          ? new Date(latest.createdDateTime).getTime()
          : 0;
        return at > best ? msg : latest;
      }, null),
    [messages],
  );

  const handleReply = useCallback(
    (msg: GraphMessage) => {
      const to = (
        msg.from?.emailAddress?.address ? [msg.from.emailAddress.address] : []
      ).filter((email) => email.toLowerCase() !== HELPDESK_ADDRESS);

      onCompose({
        mode: "reply",
        sourceMessageId: msg.id,
        initialTo: to,
        initialSubject: makeReplySubject(msg.subject, subject),
        initialContentHtml: buildQuotedHtml(msg),
        allReciepientNames: extractUniqueParticipantNames(msg),
        ticketId,
        // Status no longer travels with the mail: a state change is a workflow
        // transition, and the buttons in the header are the only way to make one.
        onAfterSend: refreshMessages,
      });
    },
    [onCompose, refreshMessages, subject, ticketId],
  );

  const handleReplyAll = useCallback(
    (msg: GraphMessage) => {
      const toList = (msg.toRecipients || []).map(
        (r) => r.emailAddress.address,
      );
      const ccList = (msg.ccRecipients || []).map(
        (r) => r.emailAddress.address,
      );

      onCompose({
        mode: "replyAll",
        sourceMessageId: msg.id,
        initialTo: uniqueEmails([
          ...toList,
          msg.from?.emailAddress?.address,
        ]).filter((email) => email.toLowerCase() !== HELPDESK_ADDRESS),
        initialCc: uniqueEmails(ccList).filter(
          (email) => email.toLowerCase() !== HELPDESK_ADDRESS,
        ),
        initialSubject: makeReplySubject(msg.subject, subject),
        initialContentHtml: buildQuotedHtml(msg),
        allReciepientNames: extractUniqueParticipantNames(msg),
        ticketId,
        onAfterSend: refreshMessages,
      });
    },
    [onCompose, refreshMessages, subject, ticketId],
  );

  const handleForward = useCallback(
    async (msg: GraphMessage) => {
      let initialAttachments: Array<{ file: File; name?: string }> = [];
      try {
        const meta = await listAttachments(msg.id);
        const regularFiles = (Array.isArray(meta) ? meta : []).filter(
          (att: { isInline?: boolean; contentId?: string }) =>
            !att?.isInline && !att?.contentId,
        );
        const downloads = await Promise.all(
          regularFiles.map(
            async (att: {
              id: string;
              name?: string;
              contentType?: string;
            }) => {
              try {
                const blob = await downloadAttachment(msg.id, att.id);
                const filename = att?.name || "attachment";
                return {
                  file: new File([blob], filename, {
                    type:
                      att?.contentType ||
                      blob.type ||
                      "application/octet-stream",
                  }),
                  name: filename,
                };
              } catch {
                return null;
              }
            },
          ),
        );
        initialAttachments = downloads.filter(Boolean) as Array<{
          file: File;
          name?: string;
        }>;
      } catch {
        // Ignore preload failures; the agent can still send.
      }

      onCompose({
        mode: "forward",
        sourceMessageId: msg.id,
        initialTo: [],
        initialSubject: makeForwardSubject(msg.subject, subject),
        initialContentHtml: "",
        initialAttachments,
        allReciepientNames: extractUniqueParticipantNames(msg),
        ticketId,
        onAfterSend: refreshMessages,
      });
    },
    [onCompose, refreshMessages, subject, ticketId],
  );

  if (detailLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading ticket…
        </div>
      </div>
    );
  }

  if (detailError || !detail) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <AlertTriangle className="h-7 w-7 mx-auto mb-2 text-amber-500" />
          <p className="text-sm text-muted-foreground">
            {detailError?.message ?? "This ticket could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  const activityCount = timeline?.activity.length ?? 0;
  const collaborationCount = collaborations?.length ?? 0;

  return (
    // One scroll box for the whole pane: the header scrolls away with the
    // content, which is most of the vertical space back on a laptop screen.
    // EmailInterface keys this component by ticket id, so opening another
    // ticket remounts it and the scroll starts at the top again.
    <div className="flex-1 min-h-0 overflow-y-auto bg-background">
      <TicketHeader
        detail={detail}
        statesByCode={statesByCode}
        listRow={listRow}
      />

      <Tabs defaultValue="conversation">
        {/* Sticky, so the tabs and the sort toggle stay reachable once the
            header has scrolled past. Opaque enough to hide what passes under. */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-border bg-background/90 backdrop-blur-xl">
          <TabsList className="h-8">
            <TabsTrigger value="conversation" className="text-xs">
              Conversation
              {sortedMessages.length > 0 && ` (${sortedMessages.length})`}
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">
              Activity{activityCount > 0 && ` (${activityCount})`}
            </TabsTrigger>
            {isAgent && (
              <TabsTrigger value="collaboration" className="text-xs">
                Collaboration
                {collaborationCount > 0 && ` (${collaborationCount})`}
              </TabsTrigger>
            )}
          </TabsList>

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() =>
              setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
            }
          >
            {sortDirection === "asc" ? "Oldest first" : "Newest first"}
          </Button>
        </div>

        <TabsContent value="conversation" className="p-6 mt-0">
          {messagesLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading conversation…
            </div>
          )}

          {!messagesLoading && mailUnavailable && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                The mail thread could not be loaded. It is still served by
                Microsoft Graph and moves to the helpdesk API in a later phase.
              </span>
            </div>
          )}

          {!messagesLoading &&
            !mailUnavailable &&
            sortedMessages.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {conversationId
                  ? "No messages on this conversation."
                  : "This ticket has no email conversation."}
              </div>
            )}

          {sortedMessages.map((msg) => (
            <MessageCard
              key={msg.id}
              msg={msg}
              expanded={expandedIds.includes(msg.id)}
              attachments={attachmentsByMessage[msg.id] || []}
              attachmentsLoading={!!attachmentsLoading[msg.id]}
              onToggleExpand={toggleExpand}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
            />
          ))}
        </TabsContent>

        <TabsContent value="activity" className="p-6 mt-0">
          <TicketActivityFeed
            ticketId={ticketId}
            timeline={timeline}
            isLoading={timelineLoading}
            canWriteNotes={isAgent}
          />
        </TabsContent>

        {isAgent && (
          <TabsContent value="collaboration" className="p-6 mt-0">
            <TicketCollaborations
              ticketId={ticketId}
              ticketDepartmentId={detail.ticket.department_id}
              ticketNumber={detail.ticket.ticket_number}
              ticketSubject={subject}
              sourceEmail={newestMessage}
              collaborations={collaborations ?? []}
              isLoading={collaborationsLoading}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default EmailThread;
