import React from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  ChevronUp,
  Download,
} from "lucide-react";
import {
  type GraphMessage,
  downloadAttachment,
  downloadMail,
} from "../api/graphEmail";

interface MessageCardProps {
  msg: GraphMessage;
  expanded: boolean;
  attachments: any[];
  attachmentsLoading: boolean;
  onToggleExpand: (msg: GraphMessage) => void;
  onReply: (msg: GraphMessage) => void;
  onReplyAll: (msg: GraphMessage) => void;
  onForward: (msg: GraphMessage) => void;
}

export function MessageCard({
  msg,
  expanded,
  attachments,
  attachmentsLoading,
  onToggleExpand,
  onReply,
  onReplyAll,
  onForward,
}: MessageCardProps) {
  const handleDownloadAttachment = async (attId: string, name?: string) => {
    const blob = await downloadAttachment(msg.id, attId);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name || "attachment";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <Card className="overflow-hidden mb-3">
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
              </div>
            </div>
            <div className="flex-shrink-0 flex flex-col items-start sm:items-end gap-1">
              {/* Date */}
              <div className="text-xs text-muted-foreground">
                {msg.createdDateTime
                  ? format(new Date(msg.createdDateTime), "PPp")
                  : ""}
              </div>

              {/* Download */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadMail(msg?.id, msg?.subject || "")}
                className="
    h-5 px-2
    text-xs font-medium
    text-indigo-600
    hover:text-indigo-700
    hover:bg-indigo-50
    dark:text-indigo-400
    dark:hover:text-indigo-300
    dark:hover:bg-indigo-950/40
    flex items-center gap-1
    rounded-md
    transition-colors
  "
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ACTIONS (full-width row outside header) */}
        <div className="px-4 py-2 flex flex-wrap gap-2 border-b bg-muted/30">
          <Button
            size="sm"
            onClick={() => onReply(msg)}
            className="flex items-center gap-1"
          >
            <Reply className="h-4 w-4 text-sky-600" /> Reply
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onReplyAll(msg)}
            className="flex items-center gap-1"
          >
            <ReplyAll className="h-4 w-4 text-teal-600" /> Reply All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onForward(msg)}
            className="flex items-center gap-1"
          >
            <Forward className="h-4 w-4 text-indigo-600" /> Forward
          </Button>
        </div>

        {/* BODY PREVIEW / FULL */}
        {expanded ? (
          <div className="px-4 py-3 text-sm text-foreground">
            <div className="prose prose-sm max-w-none">
              <div
                dangerouslySetInnerHTML={{
                  __html: msg.body?.content || "",
                }}
              />
            </div>
            <div className="mt-6 pt-4 border-t border-border flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggleExpand(msg)}
                className="flex items-center gap-2 font-medium"
              >
                <ChevronUp className="h-4 w-4" />
                Collapse Message
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="px-4 py-3 text-sm cursor-pointer text-foreground hover:bg-muted/30 transition-colors"
            onClick={() => onToggleExpand(msg)}
          >
            {(msg as any).bodyPreview ||
              (msg.body?.content || "")
                .replace(/<[^>]+>/g, " ")
                .slice(0, 200) +
                ((msg.body?.content || "").length > 200 ? "…" : "") ||
              "(No content)"}
          </div>
        )}

        {/* ATTACHMENTS (lazy) */}
        {expanded && msg?.hasAttachments && (
          <div className="px-4 pb-4">
            <div className="mt-1 pt-3 border-t border-border">
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                <Paperclip className="h-4 w-4" /> Attachments
              </div>
              {attachmentsLoading && (
                <div className="text-xs text-foreground">
                  Loading attachments…
                </div>
              )}
              {!attachmentsLoading && (
                <div className="flex flex-wrap gap-2">
                  {(attachments || []).map((att: any) => (
                    <Button
                      key={att.id}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleDownloadAttachment(att.id, att.name)}
                    >
                      {att.name || "attachment"}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MessageCard;
