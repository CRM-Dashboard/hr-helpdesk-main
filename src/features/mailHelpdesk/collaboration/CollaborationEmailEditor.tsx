import React, { useMemo, useState } from "react";
import OutlookEmailEditor from "../components/EmailCompose/OutlookEmailEditor";
import { createAndSendMail, type GraphMessage } from "../api/graphEmail";
import { buildQuotedHtml } from "../utils/threadUtils";
import { useToast } from "@/hooks/use-toast";
import { addCollaborator } from "../api/collabApi";
import { CollabUser, CollaborationFormValues } from "./types";

type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
};

interface CollaborationEmailEditorProps {
  ticketId: string;
  ticketSubject?: string;
  /** The original customer message used to quote prior context. */
  sourceEmail?: GraphMessage | null;
  allRecipientNames?: string[];
  values: CollaborationFormValues;
  user: CollabUser | null;
  onSent: () => void;
  onClose: () => void;
}

/** A short ticket-context banner prepended to the quoted original email. */
function buildTicketContextHtml(ticketId: string, ticketSubject?: string) {
  return `
    <div style="margin-top:16px;padding:8px 12px;border-left:3px solid #d97706;background:#fffbeb;color:#374151;font-size:13px;">
      <strong>Internal Collaboration</strong> — Ticket ${ticketId}${
        ticketSubject ? `: ${ticketSubject}` : ""
      }
    </div>`;
}

export function CollaborationEmailEditor({
  ticketId,
  ticketSubject,
  sourceEmail,
  allRecipientNames = [],
  values,
  user,
  onSent,
  onClose,
}: CollaborationEmailEditorProps) {
  const { toast } = useToast();

  const quotedBlock = useMemo(() => {
    const ctx = buildTicketContextHtml(ticketId, ticketSubject);
    const original = sourceEmail ? buildQuotedHtml(sourceEmail) : "";
    return ctx + original;
  }, [ticketId, ticketSubject, sourceEmail]);

  const [content, setContent] = useState<string>(`<p></p>${quotedBlock}`);
  const [to, setTo] = useState<string[]>(user?.email ? [user.email] : []);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState<string>(
    ticketSubject
      ? `[Internal] ${ticketSubject}`
      : `[Internal] Collaboration — Ticket ${ticketId}`,
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  const handleSend = async () => {
    if (to.length === 0) {
      toast({
        title: "Recipient required",
        description: "Please specify at least one recipient.",
        variant: "destructive",
      });
      return;
    }
    try {
      setSending(true);

      const meta = await createAndSendMail({
        to,
        cc,
        bcc,
        subject,
        contentHtml: content,
        attachments: attachments.map((a) => ({ file: a.file, name: a.name })),
      });

      await addCollaborator(ticketId, values, {
        message_id: meta.message_id,
        conversation_id: meta.conversation_id,
        created_date_time: meta.created_date_time,
        has_attachments: meta.has_attachments,
        body_preview: meta.body_preview,
        original_email_id: sourceEmail?.id ?? null,
        original_email_subject: sourceEmail?.subject ?? null,
      });

      toast({
        title: "Collaboration sent",
        description: `Internal note forwarded to ${
          user?.name || "collaborator"
        }.`,
      });
      onSent();
    } catch (e: any) {
      console.error("error sending collaboration email", e);
      toast({
        title: "Failed to send",
        description: e?.message || "Could not send the collaboration email.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 h-[70vh] rounded-md border border-amber-200 bg-white">
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
        onDiscard={onClose}
        sending={sending}
        statusList={[]}
        selectedStatus={status}
        onStatusChange={setStatus}
        allRecipientNames={allRecipientNames}
      />
    </div>
  );
}

export default CollaborationEmailEditor;
