import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Ticket } from "../types/ticket";
import { X, Minimize2, Maximize2 } from "lucide-react";
import {
  replyToMessage,
  replyAllToMessage,
  forwardMessage,
  sendMail,
} from "../api/graphEmail";
import OutlookEmailEditor from "./EmailCompose/OutlookEmailEditor";
import { ComposeContext } from "../types/compose";
import { status } from "../types/helpdeskDataTypes";

interface EmailComposeProps {
  onClose: () => void;
  selectedTicket?: Ticket | null;
  isForwardMailType?: boolean;
  composeContext?: ComposeContext | null;
  statusList: status[];
}

export function EmailCompose({
  onClose,
  selectedTicket,
  isForwardMailType,
  composeContext,
  statusList = [],
}: EmailComposeProps) {
  const initialSubjectFromLegacy = selectedTicket
    ? isForwardMailType
      ? `FW: ${selectedTicket.subject}`
      : `Re: ${selectedTicket.subject}`
    : "";

  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [allRecipientNames, setAllRecipientNames] = useState<string[]>([]);

  // Initialize fields from composeContext or fall back to ticket-based defaults
  useEffect(() => {
    const ctx = composeContext;
    const initialTo =
      ctx?.initialTo ??
      (selectedTicket?.customerEmail ? [selectedTicket.customerEmail] : []);
    const initialCc = ctx?.initialCc ?? [];
    const initialBcc = ctx?.initialBcc ?? [];
    const initialSubject = ctx?.initialSubject ?? initialSubjectFromLegacy;
    const initialContent = ctx?.initialContentHtml ?? "";
    const initialStatus = ctx?.initialStatus ?? "";
    setTo(initialTo);
    setCc(initialCc);
    setBcc(initialBcc);
    setSubject(initialSubject);
    setContent(initialContent);
    setSelectedStatus(initialStatus);
    setAllRecipientNames(ctx?.allReciepientNames || []);
    if (ctx?.initialAttachments && ctx.initialAttachments.length > 0) {
      setAttachments(
        ctx.initialAttachments.map((att) => ({
          file: att.file,
          name: att.name || att.file.name,
        }))
      );
    }
  }, [composeContext, selectedTicket, isForwardMailType]);

  const normalizedAttachments = useMemo(
    () => attachments?.map((a: any) => ({ file: a.file, name: a.name })),
    [attachments]
  );

  const handleSend = async () => {
    try {
      if (isSending) return;
      setIsSending(true);
      const ctx = composeContext;
      if (ctx?.mode === "reply" && ctx.sourceMessageId) {
        await replyToMessage(ctx.sourceMessageId, {
          to,
          cc,
          bcc,
          subject,
          contentHtml: content || "",
          attachments: normalizedAttachments,
        });
      } else if (ctx?.mode === "replyAll" && ctx.sourceMessageId) {
        await replyAllToMessage(ctx.sourceMessageId, {
          to,
          cc,
          bcc,
          subject,
          contentHtml: content || "",
          attachments: normalizedAttachments,
        });
      } else if (ctx?.mode === "forward" && ctx.sourceMessageId) {
        // Forward requires at least one recipient
        if (to.length === 0) {
          alert(
            "Please specify at least one recipient to forward this message."
          );
          return;
        }
        await forwardMessage(ctx.sourceMessageId, {
          to,
          cc,
          bcc,
          subject,
          contentHtml: content || "",
          attachments: normalizedAttachments,
        });
      } else {
        // default to new email send
        if (to.length === 0 || !subject) return;
        await sendMail({
          to,
          cc,
          bcc,
          subject,
          contentHtml: content || "",
          attachments: normalizedAttachments,
        });
      }

      // First refresh thread (keeps EmailThread mounted), then update ticket status if changed.
      if (composeContext?.onAfterSend) {
        await composeContext.onAfterSend();
      }

      // After successful mail, update ticket status only if user changed it in composer
      const initialStatus = ctx?.initialStatus ?? "";
      const nextStatus = selectedStatus ?? "";
      if (nextStatus && nextStatus !== initialStatus) {
        try {
          await ctx?.onUpdateTicketStatus?.(nextStatus);
        } catch (e) {
          console.error("Failed to update ticket status after send:", e);
        }
      }
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
    }
  };

  const handleDiscard = () => {
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent
        className={`${
          !isMaximized ? "max-w-[95vw] h-[95vh]" : "max-w-5xl h-[85vh]"
        } p-0 overflow-hidden overflow-y-auto max-h-[90vh]`}
        // style={{
        //   overflowY: "auto",
        //   height: "600px",
        // }}
      >
        <div className="flex flex-col h-full">
          {/* Compact Header */}
          <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between px-4 py-3 border-b border-border">
            <DialogTitle className="text-lg font-semibold">
              {selectedTicket ? `Reply to ${selectedTicket.id}` : "New Email"}
            </DialogTitle>
            <div className="flex items-center gap-1 mr-8">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMaximized(!isMaximized)}
              >
                {!isMaximized ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              {/* <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button> */}
            </div>
          </DialogHeader>

          {/* Email Editor - Takes full remaining space */}
          {/* <div className="flex-1 min-h-0"> */}
          <div className="flex-1 min-h-0 overflow-y-auto">
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
              onDiscard={handleDiscard}
              sending={isSending}
              statusList={statusList}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              allRecipientNames={allRecipientNames}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
