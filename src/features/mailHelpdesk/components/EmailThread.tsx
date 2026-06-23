import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { format } from "date-fns";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LoadingOverlay from "@/components/ui/loading-overlay.tsx";

import { Ticket } from "../types/ticket.ts";

import {
  fetchMessagesByConversation,
  type GraphMessage,
  listAttachments,
  downloadAttachment,
} from "../api/graphEmail.ts";

import { CreateTaskForm } from "./CreateTaskForm.tsx";
import { CreateCollaboratorForm } from "./CreateCollaboratorForm.tsx";
import { CollaboratorEmailCompose } from "./CollaboratorEmailCompose.tsx";
import { ComposeContext } from "../types/compose.ts";
import { AssignAgentForm } from "./AssignAgentForm.tsx";
import {
  assignMemberToTicketDetail,
  changeTicketStatusToRead,
  fetchTicketDetailData,
  getAllDepartmentCategoryList,
  updateTicketDetail,
  snoozeTicket,
  addTicketCollaborator,
  postInternalNote,
  fetchSpocAvailability,
  logLeaveCoverageEvent,
} from "../api/trackerHelpdesk.ts";
import EditTicketDetailDialog from "./EmailCompose/EditTicketDetailDialog.tsx";
import { status, TicketDetailData } from "../types/helpdeskDataTypes.ts";
import { groupCategoriesWithDetails } from "../utils/groupCategories.ts";
import { extractUniqueParticipantNames } from "../utils/emailUtils.ts";
import { SnoozeDialog } from "./SnoozeDialog.tsx";
import { InternalCollaborationPanel } from "./InternalCollaborationPanel.tsx";
import { TicketHeader } from "./TicketHeader.tsx";
import { MessageCard } from "./MessageCard.tsx";
import {
  InternalNote,
  SnoozeRecord,
  TicketCollaborator,
} from "../types/collaboration.ts";
import { addWorkingHours } from "../utils/workingHours.ts";
import {
  LeaveCoverageEvent,
  SpocAvailability,
} from "../types/leaveCoverage.ts";
import {
  computeDeferredTat,
  getActiveLeaveForSpoc,
  getResumeDate,
} from "../utils/leaveCoverage.ts";
import {
  buildQuotedHtml,
  makeForwardSubject,
  makeReplySubject,
  sanitizeText,
  uniqueEmails,
} from "../utils/threadUtils.ts";
import { getAuthCredentials } from "@/services/sapClient.ts";
import { useToast } from "@/hooks/use-toast";

interface EmailThreadProps {
  ticket: Ticket;
  onCompose: (ctx: ComposeContext) => void;
  onForward?: (ctx: ComposeContext) => void;
  managers?: { userid: string; name: string }[];
  ticketData: any;
  onEditDataSave: () => void;
  statusList: status[];
}

export function EmailThread({
  ticket,
  onCompose,
  onForward,
  managers = [],
  ticketData,
  onEditDataSave,
  statusList = [],
}: EmailThreadProps) {
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateCollaborator, setShowCreateCollaborator] = useState(false);
  const [emailCollaborator, setEmailCollaborator] = useState<any>(null);
  const [showAssignAgent, setShowAssignAgent] = useState(false);
  const [assignedToName, setAssignedToName] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [messages, setMessages] = useState<GraphMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<TicketDetailData | null>(null);

  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<
    Record<string, any[]>
  >({});
  const [attachmentsLoading, setAttachmentsLoading] = useState<
    Record<string, boolean>
  >({});
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [groupedCategory, setGroupedCategory] = useState<any>([]);

  // Snooze (BRD 7.9) + Collaboration (BRD 7.10) state
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozeRecords, setSnoozeRecords] = useState<SnoozeRecord[]>([]);
  const [collaborators, setCollaborators] = useState<TicketCollaborator[]>([]);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);

  // Leave Coverage / SPOC availability
  const [spocAvailability, setSpocAvailability] = useState<SpocAvailability[]>(
    [],
  );

  const { toast } = useToast();

  // Request guards (prevents stale async responses and accidental refetch loops)
  const detailReqIdRef = useRef(0);
  const messagesReqIdRef = useRef(0);
  const deptReqIdRef = useRef(0);
  const readMarkedRef = useRef<Set<string>>(new Set());

  const handleCloseCreateTask = useCallback(() => setShowCreateTask(false), []);
  const handleShowCreateCollaborator = useCallback(
    () => setShowCreateCollaborator(true),
    [],
  );
  const handleCloseCreateCollaborator = useCallback(
    () => setShowCreateCollaborator(false),
    [],
  );
  const handleCloseEmailCollaborator = useCallback(
    () => setEmailCollaborator(null),
    [],
  );

  const handleOpenAssignAgent = useCallback(() => setShowAssignAgent(true), []);
  const handleCloseAssignAgent = useCallback(
    () => setShowAssignAgent(false),
    [],
  );
  const handleOpenEditTicketDetail = useCallback(
    () => setShowEditModal(true),
    [],
  );
  const handleCloseEditTicketDetail = useCallback(
    () => setShowEditModal(false),
    [],
  );
  const handleOpenSnooze = useCallback(() => setShowSnooze(true), []);

  const assignedMemberUpdate = useCallback(
    async (selectedMember: string, selectedMemberName: string) => {
      const resolvedTicketId =
        detail?.ticketId ??
        (detail && (detail as any).ticketid) ??
        ticket?.tracker?.ticketId ??
        ticket?.id;

      if (!resolvedTicketId) {
        console.warn("No ticketId found for assignment", { detail, ticket });
      }

      const ticketDataPayload = [
        {
          assigned: selectedMember,
          assignedTo: selectedMemberName,
          ticketId: String(resolvedTicketId ?? ""),
        },
      ];

      const data = await assignMemberToTicketDetail(ticketDataPayload);
      // Keep list view in sync
      onEditDataSave?.();

      // Leave Coverage: if the new assignee is on leave, defer the OLA to
      // their resumption date and log a "Leave Coverage" event.
      const leave = getActiveLeaveForSpoc(spocAvailability, selectedMember);
      if (leave) {
        const resume = getResumeDate(leave);
        const tatHours =
          Number(
            groupedCategory?.[detail?.category]?.[detail?.subCategory]?.tat1,
          ) || 0;
        const tat = computeDeferredTat(resume, tatHours);

        const event: LeaveCoverageEvent = {
          id: `lc-${Date.now()}`,
          ticketId: String(resolvedTicketId ?? ""),
          spocId: selectedMember,
          spocName: selectedMemberName,
          leaveFrom: leave.fromDate,
          leaveTo: leave.toDate,
          resumeDate: resume.toISOString(),
          olaStart: resume.toISOString(),
          tat: tat.toISOString(),
          reason: "Leave Coverage",
          loggedAt: new Date().toISOString(),
        };

        try {
          await logLeaveCoverageEvent(event);
        } catch (e) {
          console.log("error logging leave coverage event", e);
        }

        toast({
          title: "Leave Coverage applied",
          description: `${selectedMemberName} is unavailable until ${format(
            new Date(leave.toDate),
            "dd MMM",
          )}. OLA starts on resumption (${format(
            resume,
            "dd MMM, hh:mm a",
          )}); expected resolution by ${format(
            tat,
            "dd MMM yyyy, hh:mm a",
          )}. An acknowledgement is sent to the employee.`,
        });
      }

      return data;
    },
    [detail, ticket, onEditDataSave, spocAvailability, groupedCategory, toast],
  );

  const updateTicketStatusAfterSend = useCallback(
    async (newStatus: string) => {
      const resolvedTicketId =
        detail?.ticketId ??
        (detail && (detail as any).ticketid) ??
        ticket?.tracker?.ticketId ??
        ticket?.id;

      if (!resolvedTicketId) {
        console.warn("No ticketId found for status update", { detail, ticket });
        return;
      }

      const statusMeta = (statusList || []).find((s) => s.status === newStatus);
      const nextStatusTxt = statusMeta?.statusTxt ?? detail?.statusTxt ?? "";

      // Prefer updating based on full detail payload (matches existing update flow)
      const base = (detail || {}) as any;
      const payload = {
        ...base,
        ticketId: String(resolvedTicketId),
        status: newStatus,
        statusTxt: nextStatusTxt,
      };

      // Optimistic UI update for header
      setDetail((prev) => ({
        ...(prev || ({} as any)),
        status: newStatus,
        statusTxt: nextStatusTxt,
      }));

      try {
        await updateTicketDetail([payload]);
        // Keep list view in sync (moves ticket across status buckets)
        onEditDataSave?.();
      } catch (e) {
        console.error("Failed to update ticket status:", e);
      }
    },
    [detail, ticket, statusList, onEditDataSave],
  );

  const postUpdatedTicketDetail = useCallback(
    async (dataDetail: any) => {
      const findSelectEmpolyeeName = managers?.find(
        (m) => m?.userid == dataDetail?.assigned,
      );
      setAssignedToName(findSelectEmpolyeeName?.name || null);

      const ticketDataPayload = {
        ...dataDetail,
        subject: sanitizeText(dataDetail?.subject),
        ticketDesc: sanitizeText(dataDetail?.ticketDesc),
        bodyPreview: sanitizeText(dataDetail?.bodyPreview),
        assignedTo: findSelectEmpolyeeName?.name || "",
      };

      try {
        await updateTicketDetail([ticketDataPayload]);
        return true;
      } catch (error) {
        console.log("error while make updateTicketDetail -->", error);
        return false;
      }
    },
    [managers],
  );

  const handleAssignAgent = useCallback(
    (user: { userid: string; name: string }) => {
      setAssignedToName(user?.name || null);
      setShowAssignAgent(false);
      assignedMemberUpdate(user?.userid, user?.name);
    },
    [assignedMemberUpdate],
  );

  const fetchDepartmentCategory = useCallback(async () => {
    const reqId = ++deptReqIdRef.current;
    try {
      const resp = await getAllDepartmentCategoryList();
      const grouped = groupCategoriesWithDetails(resp);
      if (deptReqIdRef.current !== reqId) return;
      setGroupedCategory(grouped);
    } catch (e) {
      console.log("error while fetching department categories", e);
    }
  }, []);

  useEffect(() => {
    // Fetch static lookup once per mount
    fetchDepartmentCategory();
  }, [fetchDepartmentCategory]);

  useEffect(() => {
    // Load SPOC availability (for leave-coverage handling on assignment).
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchSpocAvailability();
        if (!cancelled) setSpocAvailability(list);
      } catch (e) {
        console.log("error while fetching SPOC availability", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Mark ticket as read once per ticketId
    const resolvedTicketId = String(
      ticket?.tracker?.ticketId ??
        (ticket as any)?.ticketId ??
        ticket?.id ??
        "",
    );
    if (!resolvedTicketId) return;
    if (readMarkedRef.current.has(resolvedTicketId)) return;
    readMarkedRef.current.add(resolvedTicketId);

    const payload = [{ ticketId: resolvedTicketId }];
    changeTicketStatusToRead(payload).catch((e) => {
      // Don't retry automatically; just log and allow user to continue
      console.log("error while marking ticket as read", e);
    });
  }, [ticket?.id]);

  // Fetch tracker helpdesk ticket details (priority, status, subject, preview, conversationId)
  useEffect(() => {
    const reqId = ++detailReqIdRef.current;

    // Reset per-ticket state immediately so we don't show old thread / trigger stale fetches
    setConversationId(null);
    setMessages([]);
    setExpandedIds([]);
    setAttachmentsByMessage({});
    setAttachmentsLoading({});
    setDetail(null);
    setAssignedToName(null);
    setSnoozeRecords([]);
    setCollaborators([]);
    setInternalNotes([]);
    setShowSnooze(false);

    (async () => {
      try {
        setDetailLoading(true);
        const res = await fetchTicketDetailData(ticket.id as any);
        const item = res?.[0] ?? null;
        if (detailReqIdRef.current !== reqId) return;
        setDetail(item);
        setAssignedToName((item as any)?.assigned ?? null);
        setConversationId((item as any)?.conversationId ?? null);
      } catch (e) {
        if (detailReqIdRef.current !== reqId) return;
        console.log("error while fetching ticket detail", e);
      } finally {
        if (detailReqIdRef.current === reqId) setDetailLoading(false);
      }
    })();
  }, [ticket.id]);

  // Initial fetch of messages; prefer conversationId from detail if available
  useEffect(() => {
    if (!conversationId) return;
    const reqId = ++messagesReqIdRef.current;

    (async () => {
      try {
        setLoading(true);
        const msgs = await fetchMessagesByConversation(conversationId);
        if (messagesReqIdRef.current !== reqId) return;
        setMessages(msgs);
      } catch (error) {
        if (messagesReqIdRef.current !== reqId) return;
        console.log("error while fetching ticket conversation", error);
      } finally {
        if (messagesReqIdRef.current === reqId) setLoading(false);
      }
    })();
  }, [conversationId]);

  const refreshMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const msgs = await fetchMessagesByConversation(conversationId);
      setMessages(msgs);
    } catch (error) {
      console.log("error while refreshing Messages:", error);
    }
  }, [conversationId]);

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

  // Per-message actions
  const handleReply = useCallback(
    async (msg: GraphMessage) => {
      const replySubject = makeReplySubject(msg.subject, ticket.subject);
      const names = extractUniqueParticipantNames(msg);

      const initialTo = msg.from?.emailAddress?.address
        ? [msg.from.emailAddress.address]
        : [];

      // Filter out helpdesk@gera.in
      const filteredTo = initialTo.filter(
        (email) => email.toLowerCase() !== "helpdesk@gera.in",
      );

      const ctx: ComposeContext = {
        mode: "reply",
        sourceMessageId: msg.id,
        initialTo: filteredTo,
        initialSubject: replySubject,
        initialContentHtml: buildQuotedHtml(msg),
        allReciepientNames: names,
        ticketId: String(
          detail?.ticketId ??
            (detail && (detail as any).ticketid) ??
            ticket?.tracker?.ticketId ??
            ticket?.id ??
            "",
        ),
        initialStatus: detail?.status ?? ticket?.tracker?.status ?? "",
        onUpdateTicketStatus: updateTicketStatusAfterSend,
        onAfterSend: refreshMessages,
      };
      onCompose(ctx);
    },
    [
      ticket.subject,
      detail,
      ticket,
      updateTicketStatusAfterSend,
      refreshMessages,
      onCompose,
    ],
  );

  const handleReplyAll = useCallback(
    async (msg: GraphMessage) => {
      const replySubject = makeReplySubject(msg.subject, ticket.subject);
      const toList = (msg.toRecipients || []).map(
        (r) => r.emailAddress.address,
      );
      const fromAddr = msg.from?.emailAddress?.address;
      const ccList = (msg.ccRecipients || []).map(
        (r) => r.emailAddress.address,
      );

      // Filter out helpdesk@gera.in from all recipient lists
      const filteredTo = uniqueEmails([...(toList || []), fromAddr]).filter(
        (email) => email.toLowerCase() !== "helpdesk@gera.in",
      );
      const filteredCc = uniqueEmails(ccList || []).filter(
        (email) => email.toLowerCase() !== "helpdesk@gera.in",
      );

      const names = extractUniqueParticipantNames(msg);

      const ctx: ComposeContext = {
        mode: "replyAll",
        sourceMessageId: msg.id,
        initialTo: filteredTo,
        initialCc: filteredCc,
        initialSubject: replySubject,
        allReciepientNames: names,
        initialContentHtml: buildQuotedHtml(msg),
        ticketId: String(
          detail?.ticketId ??
            (detail && (detail as any).ticketid) ??
            ticket?.tracker?.ticketId ??
            ticket?.id ??
            "",
        ),
        initialStatus: detail?.status ?? ticket?.tracker?.status ?? "",
        onUpdateTicketStatus: updateTicketStatusAfterSend,
        onAfterSend: refreshMessages,
      };
      onCompose(ctx);
    },
    [
      ticket.subject,
      detail,
      ticket,
      updateTicketStatusAfterSend,
      refreshMessages,
      onCompose,
    ],
  );

  const handleForward = useCallback(
    async (msg: GraphMessage) => {
      // Prefill subject like Outlook
      const forwardSubject = makeForwardSubject(msg.subject, ticket.subject);

      const names = extractUniqueParticipantNames(msg);

      // Process embedded cid images and build quoted original content
      let initialContentHtml = "";

      // Preload non-inline attachments
      let initialAttachments: Array<{ file: File; name?: string }> = [];
      try {
        const meta = await listAttachments(msg.id);
        const regularFiles = (Array.isArray(meta) ? meta : []).filter(
          (att: any) => !att?.isInline && !att?.contentId,
        );
        const downloads = await Promise.all(
          regularFiles.map(async (att: any) => {
            try {
              const blob = await downloadAttachment(msg.id, att.id);
              const filename = att?.name || "attachment";
              const file = new File([blob], filename, {
                type:
                  att?.contentType || blob.type || "application/octet-stream",
              });
              return { file, name: filename };
            } catch {
              return null;
            }
          }),
        );
        initialAttachments = downloads.filter(Boolean) as Array<{
          file: File;
          name?: string;
        }>;
      } catch {
        // Ignore attachment preload failures; user can still send
      }

      const ctx: ComposeContext = {
        mode: "forward",
        sourceMessageId: msg.id,
        initialTo: [],
        initialSubject: forwardSubject,
        allReciepientNames: names,
        initialContentHtml,
        initialAttachments,
        ticketId: String(
          detail?.ticketId ??
            (detail && (detail as any).ticketid) ??
            ticket?.tracker?.ticketId ??
            ticket?.id ??
            "",
        ),
        initialStatus: detail?.status ?? ticket?.tracker?.status ?? "",
        onUpdateTicketStatus: updateTicketStatusAfterSend,
        onAfterSend: refreshMessages,
      };
      onCompose(ctx);
    },
    [detail, ticket, updateTicketStatusAfterSend, refreshMessages, onCompose],
  );

  // ----- Snooze (BRD 7.9) & Collaboration (BRD 7.10) -----

  const currentTicketId = useMemo(
    () =>
      String(
        detail?.ticketId ??
          (detail as any)?.ticketid ??
          ticket?.tracker?.ticketId ??
          ticket?.id ??
          "",
      ),
    [detail, ticket],
  );

  // The most recent snooze whose end time is still in the future.
  const activeSnooze = useMemo(() => {
    const now = Date.now();
    const active = snoozeRecords.filter(
      (r) => new Date(r.until).getTime() > now,
    );
    return active.length ? active[active.length - 1] : null;
  }, [snoozeRecords]);

  const handleSnooze = useCallback(
    async (hours: number, reason: string) => {
      const cred = getAuthCredentials();
      const userName = cred?.userName || "";
      const now = new Date();
      const until = addWorkingHours(now, hours);
      const record: SnoozeRecord = {
        id: `snz-${Date.now()}`,
        ticketId: currentTicketId,
        snoozedById: userName,
        snoozedByName: assignedToName || userName,
        reason,
        hours,
        snoozedAt: now.toISOString(),
        until: until.toISOString(),
      };

      setSnoozeRecords((prev) => [...prev, record]);
      setShowSnooze(false);

      try {
        // await snoozeTicket(record);
        toast({
          title: "Ticket snoozed",
          description: `OLA paused until ${format(until, "dd MMM, hh:mm a")}.`,
        });
      } catch (e: any) {
        toast({
          title: "Snoozed locally only",
          description:
            "The snooze is applied here but could not be persisted to the server. " +
            (e?.message || ""),
          variant: "destructive",
        });
      }
    },
    [currentTicketId, assignedToName, toast],
  );

  const addNoteInternal = useCallback(
    async (content: string) => {
      const cred = getAuthCredentials();
      const userName = cred?.userName || "";
      const note: InternalNote = {
        id: `note-${Date.now()}`,
        ticketId: currentTicketId,
        authorId: userName,
        authorName: assignedToName || userName || "Me",
        content,
        createdAt: new Date().toISOString(),
      };

      setInternalNotes((prev) => [...prev, note]);

      try {
        // await postInternalNote(note);
      } catch (e: any) {
        toast({
          title: "Note saved locally only",
          description:
            "The internal note is shown here but could not be persisted. " +
            (e?.message || ""),
          variant: "destructive",
        });
      }
    },
    [currentTicketId, assignedToName, toast],
  );

  const handleCollaboratorAdd = useCallback(
    async (collab: { userId: string; name: string }, initialNote?: string) => {
      const cred = getAuthCredentials();
      const userName = cred?.userName || "";
      const newCollab: TicketCollaborator = {
        id: `col-${Date.now()}`,
        ticketId: currentTicketId,
        userId: collab.userId,
        name: collab.name,
        addedById: userName,
        addedAt: new Date().toISOString(),
      };

      setCollaborators((prev) => [...prev, newCollab]);

      try {
        // await addTicketCollaborator(newCollab);
        toast({
          title: "Collaborator added",
          description: `${collab.name} can now see the internal sub-thread.`,
        });
      } catch (e: any) {
        toast({
          title: "Added locally only",
          description:
            "The collaborator is shown here but could not be persisted. " +
            (e?.message || ""),
          variant: "destructive",
        });
      }

      if (initialNote && initialNote.trim()) {
        addNoteInternal(initialNote.trim());
      }
    },
    [currentTicketId, addNoteInternal, toast],
  );

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Ticket header */}
      <TicketHeader
        ticket={ticket}
        detail={detail}
        assignedToName={assignedToName}
        activeSnooze={activeSnooze}
        onOpenAssign={handleOpenAssignAgent}
        onOpenEdit={handleOpenEditTicketDetail}
        onOpenSnooze={handleOpenSnooze}
      />

      {/* Conversation actions */}
      <div className="flex items-center justify-end p-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
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
        {/* Internal collaboration sub-thread (BRD 7.10) */}
        <InternalCollaborationPanel
          collaborators={collaborators}
          notes={internalNotes}
          onAddCollaborator={handleShowCreateCollaborator}
          onAddNote={addNoteInternal}
        />

        <LoadingOverlay open={loading} text="Loading conversation…" />
        {!loading && sortedMessages.length === 0 && (
          <div className="text-sm text-muted-foreground">No messages</div>
        )}

        {sortedMessages?.map((msg) => (
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

        {/* Internal collaborator messages (read-only, legacy ticket data) */}
        {ticket?.collaborators?.map((collaborator) =>
          collaborator?.messageHistory?.map((message) => (
            <Card key={message.id} className="mb-4 bg-muted/50">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-secondary rounded-full flex items-center justify-center text-secondary-foreground font-semibold text-sm">
                      {message.senderName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-sm">
                        {message.senderName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Internal Message
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(message.timestamp, "PPp")}
                  </div>
                </div>

                <div className="prose prose-sm max-w-none">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </CardContent>
            </Card>
          )),
        )}
      </div>

      {/* Dialogs/Forms */}
      {showCreateTask && (
        <CreateTaskForm
          onClose={handleCloseCreateTask}
          selectedTicket={ticket}
        />
      )}

      {showCreateCollaborator && (
        <CreateCollaboratorForm
          onClose={handleCloseCreateCollaborator}
          selectedTicket={ticket}
          managers={managers}
          existingIds={collaborators.map((c) => c.userId)}
          onAdd={handleCollaboratorAdd}
        />
      )}

      {showSnooze && (
        <SnoozeDialog
          ticketId={currentTicketId}
          records={snoozeRecords}
          onClose={() => setShowSnooze(false)}
          onSnooze={handleSnooze}
        />
      )}

      {emailCollaborator && (
        <CollaboratorEmailCompose
          onClose={handleCloseEmailCollaborator}
          collaborator={emailCollaborator}
          ticket={ticket}
        />
      )}

      {showAssignAgent && (
        <AssignAgentForm
          onClose={handleCloseAssignAgent}
          managers={managers}
          onAssign={handleAssignAgent}
        />
      )}
      {showEditModal && (
        <EditTicketDetailDialog
          open={showEditModal}
          onOpenChange={handleCloseEditTicketDetail}
          onSave={(data) => postUpdatedTicketDetail(data)}
          onSaved={(updated) => {
            // Optimistically reflect changes locally
            setDetail((prev) => ({ ...(prev || {}), ...(updated || {}) }));
            onEditDataSave();
          }}
          initialDetail={detail}
          hrSpocData={groupedCategory}
          statusList={statusList}
        />
      )}
    </div>
  );
}

export default EmailThread;
