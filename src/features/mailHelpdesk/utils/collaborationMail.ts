/**
 * Prefill for the collaboration seed mail.
 *
 * The backend sends no collaboration mail: the frontend creates the thread
 * through Graph and then reports its two keys. The support mailbox must be
 * CC'd, because `conversationId` is computed per mailbox — when the CC'd copy
 * arrives, intake matches `seedInternetMessageId` and writes the support
 * mailbox's own `conversation_id` itself, so no reply can be stranded.
 */
import type { GraphMessage } from "../api/graphEmail";
import type { DepartmentRow } from "../types/pg";
import { buildQuotedHtml } from "./threadUtils";

/**
 * INTERIM: the fallback support mailbox, for a department with no
 * `support_email` or an agent without `helpdesk.department.read`. Override per
 * environment with `VITE_HELPDESK_SUPPORT_EMAIL`.
 */
export const HELPDESK_ADDRESS = "hr@gera.in";

/**
 * The address every collaboration mail must copy for inbound replies to route.
 *
 * @param department the ticket's own department, when its row was readable
 * @returns the department's mailbox, else the configured fallback
 */
export const resolveSupportMailbox = (
  department?: Pick<DepartmentRow, "support_email"> | null,
): string =>
  department?.support_email ||
  import.meta.env.VITE_HELPDESK_SUPPORT_EMAIL ||
  HELPDESK_ADDRESS;

/**
 * @param ticketNumber the human ticket reference, kept in the subject so a
 *   reply that misses the seed match can still be traced by hand
 * @param ticketSubject the ticket's subject
 * @returns the seed mail's subject
 */
export const buildCollaborationSubject = (
  ticketNumber: string,
  ticketSubject?: string,
): string =>
  ticketSubject
    ? `[Internal] ${ticketNumber} — ${ticketSubject}`
    : `[Internal] Collaboration — ${ticketNumber}`;

/** Escapes text destined for the mail's HTML body. */
const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The seed mail body: what is being asked, a banner naming the ticket, and the
 * customer's own message quoted so the collaborator needs no second screen.
 *
 * @param options the purpose text, ticket identity, and the message to quote
 * @returns HTML for the editor to open with
 */
export const buildCollaborationSeedHtml = (options: {
  purpose: string;
  ticketNumber: string;
  ticketSubject?: string;
  sourceEmail?: GraphMessage | null;
}): string => {
  const { purpose, ticketNumber, ticketSubject, sourceEmail } = options;

  const ask = purpose.trim()
    ? `<p>${escapeHtml(purpose.trim()).replace(/\n/g, "<br>")}</p>`
    : "<p></p>";

  const banner = `
    <div style="margin-top:16px;padding:8px 12px;border-left:3px solid #d97706;background:#fffbeb;color:#374151;font-size:13px;">
      <strong>Internal Collaboration</strong> — Ticket ${escapeHtml(ticketNumber)}${
        ticketSubject ? `: ${escapeHtml(ticketSubject)}` : ""
      }
    </div>`;

  return `${ask}${banner}${sourceEmail ? buildQuotedHtml(sourceEmail) : ""}`;
};
