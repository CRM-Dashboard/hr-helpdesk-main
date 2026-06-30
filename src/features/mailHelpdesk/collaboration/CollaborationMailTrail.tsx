import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import LoadingOverlay from "@/components/ui/loading-overlay.tsx";
import { useToast } from "@/hooks/use-toast";

import { MessageCard } from "../components/MessageCard";
import OutlookEmailEditor from "../components/EmailCompose/OutlookEmailEditor";
import {
  fetchMessagesByConversation,
  listAttachments,
  downloadAttachment,
  replyToMessage,
  replyAllToMessage,
  forwardMessage,
  type GraphMessage,
} from "../api/graphEmail";
import { extractUniqueParticipantNames } from "../utils/emailUtils";
import {
  buildQuotedHtml,
  makeForwardSubject,
  makeReplySubject,
  uniqueEmails,
} from "../utils/threadUtils";

type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
};

type ComposeMode = "reply" | "replyAll" | "forward";

interface ComposeState {
  mode: ComposeMode;
  msg: GraphMessage;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  content: string;
  names: string[];
}

interface CollaborationMailTrailProps {
  conversationId: string;
  /** Subject of the collaboration activity, used as a subject fallback. */
  ticketSubject?: string;
  /** Heading shown above the trail. */
  title?: string;
  onBack: () => void;
}

/** Helpdesk inbox address that should never be carried into reply recipients. */
export const HELPDESK_ADDRESS = "hr@gera.in";

/**
 * A standalone "trail mail" screen for a collaboration's email conversation.
 * Renders the same {@link MessageCard} list as the main ticket thread and lets
 * the user reply / reply-all / forward inline against the Graph conversation.
 */
export function CollaborationMailTrail({
  conversationId,
  ticketSubject,
  title = "Collaboration mail trail",
  onBack,
}: CollaborationMailTrailProps) {
  const { toast } = useToast();

  const [messages, setMessages] = useState<GraphMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<
    Record<string, any[]>
  >({});
  const [attachmentsLoading, setAttachmentsLoading] = useState<
    Record<string, boolean>
  >({});

  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      setLoading(true);
      const msgs = await fetchMessagesByConversation(conversationId);
      setMessages(msgs);
    } catch (e) {
      console.log("error while fetching collaboration mail trail", e);
      toast({
        title: "Failed to load mail trail",
        description: "Could not load the collaboration conversation.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [conversationId, toast]);

  useEffect(() => {
    setExpandedIds([]);
    setAttachmentsByMessage({});
    setAttachmentsLoading({});
    setCompose(null);
    loadMessages();
  }, [loadMessages]);

  const sortedMessages = useMemo(() => {
    const copy = [...(messages || [])];
    copy.sort((a, b) => {
      const aTime = a.createdDateTime
        ? new Date(a.createdDateTime).getTime()
        : 0;
      const bTime = b.createdDateTime
        ? new Date(b.createdDateTime).getTime()
        : 0;
      return aTime - bTime;
    });
    return copy;
  }, [messages]);

  const ensureAttachmentsLoaded = useCallback(
    async (message: GraphMessage) => {
      if (!message?.id || !message.hasAttachments) return;
      if (attachmentsByMessage[message.id]) return;
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
      if (msg.hasAttachments) ensureAttachmentsLoaded(msg);
    },
    [ensureAttachmentsLoaded],
  );

  const openCompose = useCallback((state: ComposeState) => {
    setCompose(state);
    setTo(state.to);
    setCc(state.cc);
    setBcc(state.bcc);
    setSubject(state.subject);
    setContent(state.content);
    setAttachments([]);
  }, []);

  const handleReply = useCallback(
    (msg: GraphMessage) => {
      const fromAddr = msg.from?.emailAddress?.address;
      const initialTo = (fromAddr ? [fromAddr] : []).filter(
        (email) => email.toLowerCase() !== HELPDESK_ADDRESS,
      );
      openCompose({
        mode: "reply",
        msg,
        to: initialTo,
        cc: [],
        bcc: [],
        subject: makeReplySubject(msg.subject, ticketSubject),
        content: `<p></p>${buildQuotedHtml(msg)}`,
        names: extractUniqueParticipantNames(msg),
      });
    },
    [openCompose, ticketSubject],
  );

  const handleReplyAll = useCallback(
    (msg: GraphMessage) => {
      const toList = (msg.toRecipients || []).map(
        (r) => r.emailAddress.address,
      );
      const fromAddr = msg.from?.emailAddress?.address;
      const ccList = (msg.ccRecipients || []).map(
        (r) => r.emailAddress.address,
      );
      const filteredTo = uniqueEmails([...(toList || []), fromAddr]).filter(
        (email) => email.toLowerCase() !== HELPDESK_ADDRESS,
      );
      const filteredCc = uniqueEmails(ccList || []).filter(
        (email) => email.toLowerCase() !== HELPDESK_ADDRESS,
      );
      openCompose({
        mode: "replyAll",
        msg,
        to: filteredTo,
        cc: filteredCc,
        bcc: [],
        subject: makeReplySubject(msg.subject, ticketSubject),
        content: `<p></p>${buildQuotedHtml(msg)}`,
        names: extractUniqueParticipantNames(msg),
      });
    },
    [openCompose, ticketSubject],
  );

  const handleForward = useCallback(
    (msg: GraphMessage) => {
      openCompose({
        mode: "forward",
        msg,
        to: [],
        cc: [],
        bcc: [],
        subject: makeForwardSubject(msg.subject, ticketSubject),
        content: `<p></p>${buildQuotedHtml(msg)}`,
        names: extractUniqueParticipantNames(msg),
      });
    },
    [openCompose, ticketSubject],
  );

  const closeCompose = useCallback(() => setCompose(null), []);

  const handleSend = useCallback(async () => {
    if (!compose) return;
    if (compose.mode === "forward" && to.length === 0) {
      toast({
        title: "Recipient required",
        description: "Please specify at least one recipient to forward to.",
        variant: "destructive",
      });
      return;
    }
    const opts = {
      contentHtml: content,
      subject,
      to,
      cc,
      bcc,
      attachments: attachments.map((a) => ({ file: a.file, name: a.name })),
    };
    try {
      setSending(true);
      if (compose.mode === "reply") {
        await replyToMessage(compose.msg.id, opts);
      } else if (compose.mode === "replyAll") {
        await replyAllToMessage(compose.msg.id, opts);
      } else {
        await forwardMessage(compose.msg.id, { ...opts, to });
      }
      toast({
        title: "Message sent",
        description: "Your reply has been sent on the collaboration trail.",
      });
      setCompose(null);
      await loadMessages();
    } catch (e: any) {
      console.error("error sending collaboration trail reply", e);
      toast({
        title: "Failed to send",
        description: e?.message || "Could not send the message.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }, [
    compose,
    to,
    cc,
    bcc,
    subject,
    content,
    attachments,
    loadMessages,
    toast,
  ]);

  return (
    <div className="flex flex-col rounded-lg border border-amber-200 bg-white">
      {/* Header with back navigation */}
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100/70 px-4 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-7 gap-1.5 px-2 text-amber-800 hover:bg-amber-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="text-sm font-semibold text-amber-900">{title}</span>
      </div>

      {compose ? (
        <div className="h-[70vh]">
          <OutlookEmailEditor
            content={content}
            to={to}
            cc={cc}
            bcc={bcc}
            subject={subject}
            attachments={attachments}
            onContentChange={setContent}
            onToChange={setTo}
            onCcChange={setCc}
            onBccChange={setBcc}
            onSubjectChange={setSubject}
            onAttachmentsChange={setAttachments}
            onSend={handleSend}
            onDiscard={closeCompose}
            sending={sending}
            statusList={[]}
            selectedStatus=""
            onStatusChange={() => {}}
            allRecipientNames={compose.names}
          />
        </div>
      ) : (
        <div className="relative max-h-[70vh] overflow-y-auto p-4">
          <LoadingOverlay open={loading} text="Loading mail trail…" />
          {!loading && sortedMessages.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No messages found for this collaboration.
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
        </div>
      )}
    </div>
  );
}

export default CollaborationMailTrail;
