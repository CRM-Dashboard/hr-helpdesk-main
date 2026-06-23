export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface ComposeContext {
  mode: ComposeMode;
  // For reply/replyAll/forward this must be provided
  sourceMessageId?: string;
  // Initial field values for the composer UI
  initialTo?: string[];
  initialCc?: string[];
  initialBcc?: string[];
  initialSubject?: string;
  initialContentHtml?: string;
  // Optionally preload recipient names (for mention picker)
  allReciepientNames?: string[];
  // Optional ticket metadata for post-send actions (e.g. update ticket status)
  ticketId?: string;
  initialStatus?: string;
  // Optional attachments to preload in composer
  initialAttachments?: Array<{ file: File; name?: string }>;
  // Optional callback invoked after successful send so callers can refresh
  onAfterSend?: () => void | Promise<void>;
  // Optional callback invoked after successful send when user changed ticket status in composer
  onUpdateTicketStatus?: (newStatus: string) => void | Promise<void>;
}
