import axios from "axios";
import { END_POINTS, sapClientBase } from "@/services/sapClient";
import { cleanQuillHTML } from "../utils/emailUtils";
import { GraphSentDTOResponse } from "@/features/MailBox/types/sentMailType";
import { addDays, startOfDay } from "date-fns";

// Centralized Microsoft Graph helpers for helpdesk email integration

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// Configure user path: prefer explicit user id if provided, else use "me"
const GRAPH_USER_ID = (import.meta as any)?.env?.VITE_GRAPH_USER_ID;
// const GRAPH_USER_PATH = GRAPH_USER_ID ? `users/${GRAPH_USER_ID}` : "me";
// const GRAPH_USER_PATH = "users/8200e311-d6f6-4b78-886d-b6628b57def5"; // IT
// const GRAPH_USER_PATH = "users/96923c7e-2224-4a67-8a98-caf524fba537"; // HR
const GRAPH_USER_PATH = "users/b25040fb-268f-482a-9b89-98eafd2ac437"; // HR@gera.in

export type GraphMessage = {
  id: string;
  subject: string;
  body: { contentType: string; content: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  sender?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  ccRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  bccRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  createdDateTime?: string;
  hasAttachments?: boolean;
  conversationId?: string;
};

export interface SentDraftMeta {
  message_id: string;
  conversation_id?: string;
  created_date_time?: string;
  has_attachments?: boolean;
  body_preview?: string;
}

async function getAccessToken(): Promise<string> {
  // Reuse backend endpoint used elsewhere in repo
  const token = await sapClientBase.get<string>(END_POINTS.GET_TOKEN);
  return token.data as unknown as string;
}

export async function fetchMessagesByConversation(
  conversationId: string,
): Promise<GraphMessage[]> {
  const token = await getAccessToken();
  // console.log("token -->", token);

  const encodedConversationId = encodeURIComponent(conversationId);
  // const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages?$filter=conversationId eq '${encodedConversationId}'&$orderby=createdDateTime desc`;
  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages?$filter=conversationId eq '${encodedConversationId}'&$top=100`;
  // console.log("url fetchMessagesByConversation -->", url);
  // console.log("url Authorization -->", { Authorization: `Bearer ${token}` });

  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let messages: GraphMessage[] = data?.value ?? [];

  // Optional: ask backend to inline/clean HTML like legacy code does
  try {
    const formData = new FormData();
    formData.append("messageId", conversationId);
    const inline = (await sapClientBase.post<any>(
      END_POINTS.IN_LINE_EMAIL,
      formData,
    )) as any;
    const htmlMap = new Map<string, string>();
    (inline as any[])?.forEach((item: any) => {
      if (item?.id && item?.html) htmlMap.set(item.id, item.html);
    });
    messages = messages.map((m) =>
      htmlMap.has(m.id)
        ? { ...m, body: { ...m.body, content: htmlMap.get(m.id)! } }
        : m,
    );
  } catch {
    // Continue with original messages if backend processing fails
  }

  // Process embedded images (cid: references) for all messages
  try {
    messages = await Promise.all(
      messages.map(async (msg) => {
        if (msg.body?.content && msg.body.content.includes("cid:")) {
          const processedContent = await processEmbeddedImages(
            msg.id,
            msg.body.content,
          );
          return {
            ...msg,
            body: {
              ...msg.body,
              content: processedContent,
            },
          };
        }
        return msg;
      }),
    );
  } catch (error) {
    console.error("Error processing embedded images in conversation:", error);
    // Continue with unprocessed messages if image processing fails
  }

  return messages;
}

export async function fetchTicketDetails(
  ticketId: string,
): Promise<any | null> {
  // Backend returns ticket details including conversationId per legacy UI
  const formData = new FormData();
  formData.append("ticketId", ticketId);
  const res = (await sapClientBase.post<any>(
    // END_POINTS.HELPDESK_TICKET_DETAIL,
    END_POINTS.HR_TICKET_DETAIL,
    formData,
  )) as any;
  return (res as any)?.response?.[0]?.ticketdata?.[0] ?? null;
}

type Recipient = { emailAddress: { address: string; name?: string } };

function toRecipientObjects(addresses: string[]): Recipient[] {
  return (addresses || [])
    .filter(Boolean)
    .map((addr) => ({ emailAddress: { address: addr } }));
}

export async function replyToMessage(
  messageId: string,
  opts: {
    contentHtml: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    attachments?: Array<{ file: File; name?: string }>;
  },
): Promise<void> {
  const token = await getAccessToken();
  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages/${messageId}/reply`;
  const payload: any = {
    message: {
      subject: opts.subject,
      body: { contentType: "HTML", content: cleanQuillHTML(opts.contentHtml) },
      toRecipients: toRecipientObjects(opts.to || []),
      ccRecipients: toRecipientObjects(opts.cc || []),
      bccRecipients: toRecipientObjects(opts.bcc || []),
    },
  };

  if (opts.attachments && opts.attachments.length > 0) {
    payload.message.attachments = await Promise.all(
      opts.attachments.map(async (att) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.name || att.file.name,
        contentBytes: await fileToBase64(att.file),
      })),
    );
  }
  // console.log("url for reply :", url);
  // console.log("payload for reply :", payload);

  await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export async function replyAllToMessage(
  messageId: string,
  opts: {
    contentHtml: string;
    subject?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    attachments?: Array<{ file: File; name?: string }>;
  },
): Promise<void> {
  const token = await getAccessToken();
  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages/${messageId}/replyAll`;
  const payload: any = {
    message: {
      subject: opts.subject,
      body: { contentType: "HTML", content: cleanQuillHTML(opts.contentHtml) },
      toRecipients: toRecipientObjects(opts.to || []),
      ccRecipients: toRecipientObjects(opts.cc || []),
      bccRecipients: toRecipientObjects(opts.bcc || []),
    },
  };
  if (opts.attachments && opts.attachments.length > 0) {
    payload.message.attachments = await Promise.all(
      opts.attachments.map(async (att) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.name || att.file.name,
        contentBytes: await fileToBase64(att.file),
      })),
    );
  }
  await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export async function forwardMessage(
  messageId: string,
  opts: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    contentHtml?: string;
    attachments?: Array<{ file: File; name?: string }>;
  },
): Promise<void> {
  const token = await getAccessToken();
  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages/${messageId}/forward`;
  const payload: any = {
    message: {
      subject: opts.subject,
      body: {
        contentType: "HTML",
        content: cleanQuillHTML(opts.contentHtml) || "",
      },
      toRecipients: toRecipientObjects(opts.to || []),
      ccRecipients: toRecipientObjects(opts.cc || []),
      bccRecipients: toRecipientObjects(opts.bcc || []),
    },
  };
  if (opts.attachments && opts.attachments.length > 0) {
    payload.message.attachments = await Promise.all(
      opts.attachments.map(async (att) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.name || att.file.name,
        contentBytes: await fileToBase64(att.file),
      })),
    );
  }
  await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve((reader.result as string).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function sendMail(opts: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  contentHtml: string;
  attachments?: Array<{ file: File; name?: string }>;
}): Promise<void> {
  const token = await getAccessToken();
  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/sendMail`;
  const payload: any = {
    message: {
      subject: opts.subject,
      body: { contentType: "HTML", content: cleanQuillHTML(opts.contentHtml) },
      toRecipients: toRecipientObjects(opts.to || []),
      ccRecipients: toRecipientObjects(opts.cc || []),
      bccRecipients: toRecipientObjects(opts.bcc || []),
    },
    saveToSentItems: true,
  };

  if (opts.attachments && opts.attachments.length > 0) {
    payload.message.attachments = await Promise.all(
      opts.attachments.map(async (att) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.name || att.file.name,
        contentBytes: await fileToBase64(att.file),
      })),
    );
  }
  await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Create a draft message, then send it — unlike {@link sendMail} this returns
 * the created message's Graph metadata (id, conversationId, createdDateTime,
 * etc.) so callers can persist it alongside their own records.
 */
export async function createAndSendMail(opts: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  contentHtml: string;
  attachments?: Array<{ file: File; name?: string }>;
}): Promise<SentDraftMeta> {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const draftPayload: any = {
    subject: opts.subject,
    body: { contentType: "HTML", content: cleanQuillHTML(opts.contentHtml) },
    toRecipients: toRecipientObjects(opts.to || []),
    ccRecipients: toRecipientObjects(opts.cc || []),
    bccRecipients: toRecipientObjects(opts.bcc || []),
    attachments: [],
  };

  if (opts.attachments && opts.attachments.length > 0) {
    draftPayload.attachments = await Promise.all(
      opts.attachments.map(async (att) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.name || att.file.name,
        contentBytes: await fileToBase64(att.file),
      })),
    );
  }

  // 1) Create the draft so Graph assigns id/conversationId/etc.
  const draftRes = await axios.post(
    `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages`,
    draftPayload,
    { headers },
  );
  const draft = draftRes.data;

  // 2) Send the draft.
  await axios.post(
    `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages/${draft.id}/send`,
    {},
    { headers },
  );

  return {
    message_id: draft.id,
    conversation_id: draft.conversationId,
    created_date_time: draft.createdDateTime,
    has_attachments: draft.hasAttachments,
    body_preview: draft.bodyPreview,
  };
}

export async function listAttachments(messageId: string): Promise<any[]> {
  const token = await getAccessToken();
  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages/${messageId}/attachments`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data?.value ?? [];
}

export async function downloadAttachment(
  messageId: string,
  attachmentId: string,
): Promise<Blob> {
  const token = await getAccessToken();
  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages/${messageId}/attachments/${attachmentId}/$value`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "blob",
  });
  return data as Blob;
}

/**
 * Processes HTML content to replace cid: image references with inline base64 data URLs.
 * This function fetches all attachments for a message and replaces embedded images.
 */
export async function processEmbeddedImages(
  messageId: string,
  htmlContent: string,
): Promise<string> {
  try {
    // Find all cid: references in the HTML
    const cidPattern = /src=["']cid:([^"']+)["']/gi;
    const cidMatches = Array.from(htmlContent.matchAll(cidPattern));

    if (cidMatches.length === 0) {
      return htmlContent; // No embedded images found
    }

    // Fetch all attachments for this message
    const token = await getAccessToken();
    const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages/${messageId}/attachments`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const attachments = data?.value ?? [];
    let processedHtml = htmlContent;

    // Process each cid reference
    for (const match of cidMatches) {
      const cidValue = match[1]; // Extract the cid value (e.g., "image001.png@01DC4A87.B7DCE620")

      // Find the attachment with matching contentId
      const attachment = attachments.find((att: any) => {
        // contentId might have angle brackets like <image001.png@...>
        const contentId = att.contentId?.replace(/^<|>$/g, "");
        return contentId === cidValue || att.contentId === cidValue;
      });

      if (attachment && attachment.contentBytes) {
        // Determine MIME type from attachment
        const mimeType = attachment.contentType || "image/png";

        // Replace cid: reference with base64 data URL
        const dataUrl = `data:${mimeType};base64,${attachment.contentBytes}`;
        const cidRegex = new RegExp(
          `src=["']cid:${cidValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
          "gi",
        );
        processedHtml = processedHtml.replace(cidRegex, `src="${dataUrl}"`);
      }
    }

    return processedHtml;
  } catch (error) {
    console.error("Error processing embedded images:", error);
    return htmlContent; // Return original HTML if processing fails
  }
}

/**
 * Fetches all attachments for a message including inline attachments.
 * Returns attachment metadata with contentId for inline images.
 */
export async function getMessageAttachmentsWithMetadata(
  messageId: string,
): Promise<any[]> {
  const token = await getAccessToken();
  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages/${messageId}/attachments`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data?.value ?? [];
}

// Get sent Items
export async function getSentMailItems(
  startDate?: string, // yyyy-MM-dd
  endDate?: string, // yyyy-MM-dd
): Promise<GraphSentDTOResponse> {
  const token = await getAccessToken();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10); // yyyy-MM-dd

  // -------------------------------
  // START DATE → Always 00:00 AM IST
  // -------------------------------
  const startLocal = startDate
    ? parseISTStartOfDay(startDate)
    : parseISTStartOfDay(todayStr);

  // -------------------------------
  // END DATE → Next day 00:00 AM IST (exclusive)
  // -------------------------------
  const endLocal = endDate
    ? parseISTStartOfDay(
        addDays(new Date(endDate), 1).toISOString().slice(0, 10),
      )
    : parseISTStartOfDay(
        addDays(new Date(todayStr), 1).toISOString().slice(0, 10),
      );

  // Convert to correct UTC string
  const startUTC = startLocal.toISOString(); // e.g. 2025-12-08T18:30:00.000Z
  const endUTC = endLocal.toISOString();

  // -------------------------------
  // Build Filter
  // -------------------------------
  const filter =
    `$filter=sentDateTime ge ${startUTC} and sentDateTime lt ${endUTC}` +
    `&$orderby=sentDateTime desc&$top=20`;

  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/mailFolders/SentItems/messages?${filter}`;

  // -------------------------------
  // API Call
  // -------------------------------
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    mails: data?.value ?? [],
    nextLink: data["@odata.nextLink"] || null,
  };
}

export async function getSentMailItemsFromConvId(
  conversationId?: string,
): Promise<any[]> {
  const token = await getAccessToken();

  const encodedConversationId = encodeURIComponent(conversationId);
  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages?$filter=conversationId eq '${encodedConversationId}'`;

  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data?.value ?? [];
}

export async function fetchMoreSentMails(nextLink: string) {
  if (!nextLink) return { mails: [], nextLink: null };

  const token = await getAccessToken();

  const { data } = await axios.get(nextLink, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    mails: data?.value ?? [],
    nextLink: data["@odata.nextLink"] || null,
  };
}

export async function searchSentEmailsByCustomer(customerEmail: string) {
  const token = await getAccessToken();

  const encodedEmail = `"${customerEmail}"`; // search query must be wrapped in quotes

  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/mailFolders/SentItems/messages?$search=${encodeURIComponent(
    encodedEmail,
  )}&$top=20`;

  const { data } = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ConsistencyLevel: "eventual", // REQUIRED for $search
    },
  });

  return {
    mails: data?.value ?? [],
    nextLink: data["@odata.nextLink"] || null,
  };
}
// Get Inbox Mail Items
function parseISTStartOfDay(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);

  // Step 1: Create date at 00:00 IST by creating it in UTC and then shifting
  // IST = UTC + 05:30 → So UTC = IST - 05:30
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, -330, 0));

  return utcDate; // This is the correct UTC moment for IST midnight
}

export async function getInboxMailItems(
  startDate?: string, // yyyy-MM-dd
  endDate?: string, // yyyy-MM-dd
): Promise<GraphSentDTOResponse> {
  const token = await getAccessToken();

  const today = new Date();

  // --- START DATE (00:00 AM IST) ---
  const startLocal = startDate
    ? parseISTStartOfDay(startDate)
    : startOfDay(today);

  // --- END DATE (exclusive, next day 00:00 AM IST) ---
  const endLocal = endDate
    ? parseISTStartOfDay(
        addDays(new Date(endDate), 1).toISOString().slice(0, 10),
      )
    : addDays(startOfDay(today), 1);

  const startUTC = startLocal.toISOString();
  const endUTC = endLocal.toISOString();

  const filter = `$filter=receivedDateTime ge ${startUTC} and receivedDateTime lt ${endUTC}&$orderby=receivedDateTime desc&$top=20`;

  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/mailFolders/Inbox/messages?${filter}`;

  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    mails: data?.value ?? [],
    nextLink: data["@odata.nextLink"] || null,
  };
}

// Search Inbox Emails by Customer
export async function searchInboxEmailsByCustomer(customerEmail: string) {
  const token = await getAccessToken();

  const encodedEmail = `"${customerEmail}"`; // search query must be wrapped in quotes

  const url = `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/mailFolders/Inbox/messages?$search=${encodeURIComponent(
    encodedEmail,
  )}&$top=20`;

  const { data } = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ConsistencyLevel: "eventual", // REQUIRED for $search
    },
  });

  return {
    mails: data?.value ?? [],
    nextLink: data["@odata.nextLink"] || null,
  };
}

// Fetch More Inbox Mails
export async function fetchMoreInboxMails(nextLink: string) {
  if (!nextLink) return { mails: [], nextLink: null };

  const token = await getAccessToken();

  const { data } = await axios.get(nextLink, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    mails: data?.value ?? [],
    nextLink: data["@odata.nextLink"] || null,
  };
}

export async function downloadMail(messageId: string, subject: string) {
  const token = await getAccessToken();
  const encodedId = encodeURIComponent(messageId);

  // `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages?$filter=conversationId eq '${encodedId}'`,
  const res = await fetch(
    `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/messages/${encodedId}/$value`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );

  // console.log("download mail res -->", res);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ticket-email-${subject}.eml`;
  a.click();

  URL.revokeObjectURL(url);
}

export async function fetchUserForSearch(query: string) {
  const token = await getAccessToken();

  const peopleRes = await fetch(
    `${GRAPH_BASE_URL}/${GRAPH_USER_PATH}/people?$search=${query}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const usersRes = await fetch(
    `https://graph.microsoft.com/v1.0/users?$search="displayName:${query}" OR "mail:${query}"&$select=displayName,mail`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual",
      },
    },
  );

  const people = await peopleRes.json();
  const users = await usersRes.json();

  return {
    people,
    users,
  };
}
