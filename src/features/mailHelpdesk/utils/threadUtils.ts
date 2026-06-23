import { format } from "date-fns";
import type { GraphMessage } from "../api/graphEmail";

/** Escape literal % so it survives downstream encoding. */
export function sanitizeText(text: string): string {
  return (text ?? "").replace(/%/g, "%25");
}

/**
 * Build a Date from a SAP date + time pair, treating the zero-sentinels
 * ("0000-00-00" / "00:00:00") and invalid values as null.
 */
export function getEscalationDateTime(
  date?: string,
  time?: string,
): Date | null {
  if (!date || !time || date === "0000-00-00" || time === "00:00:00")
    return null;
  const dateTime = new Date(`${date}T${time}`);
  return isNaN(dateTime.getTime()) ? null : dateTime;
}

/** De-duplicate a list of email addresses case-insensitively, preserving order. */
export function uniqueEmails(emails: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of emails) {
    if (!e) continue;
    const lower = e.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(e);
    }
  }
  return result;
}

/** Reply subject: keep an existing "Re:" or prefix one (falling back to the ticket subject). */
export function makeReplySubject(msgSub: string, fallback?: string): string {
  if (msgSub?.includes("Re:")) return msgSub;
  return `Re: ${msgSub || fallback || ""}`;
}

/** Forward subject: keep an existing FW/Fwd/Fw or prefix "FW:". */
export function makeForwardSubject(msgSub: string, fallback?: string): string {
  const sub = msgSub || fallback || "";
  const hasFw = /^fw[d]?:/i.test(sub.trim());
  return hasFw ? sub : `FW: ${sub}`;
}

/**
 * Build the quoted-original HTML block appended to replies/forwards.
 * Normalizes full HTML documents down to body inner-HTML so injected mail
 * doesn't break DOM parsing or merge the header with the first body line.
 */
export function buildQuotedHtml(
  msg: GraphMessage,
  processedBodyHtml?: string,
): string {
  const sentStr = msg.createdDateTime
    ? format(new Date(msg.createdDateTime), "PPp")
    : "";
  const fromVal =
    msg.from?.emailAddress?.name ||
    msg.sender?.emailAddress?.name ||
    msg.from?.emailAddress?.address ||
    "";
  const toVal = (msg.toRecipients || [])
    .map((r) => r.emailAddress?.address || "")
    .filter(Boolean)
    .join(", ");

  const ccVal = (msg.ccRecipients || [])
    .map((r) => r.emailAddress?.address || "")
    .filter(Boolean)
    .join(", ");

  const bccVal = (msg.bccRecipients || [])
    .map((r) => r.emailAddress?.address || "")
    .filter(Boolean)
    .join(", ");

  const subjVal = msg.subject || "";
  const rawBodyHtml = processedBodyHtml || msg.body?.content || "";

  const normalizeInjectedHtml = (html: string) => {
    if (!html) return "";
    let out = String(html).trim();

    const bodyMatch = out.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch?.[1]) out = bodyMatch[1];

    out = out
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<html[^>]*>/gi, "")
      .replace(/<\/html>/gi, "");

    out = out
      .replace(/^\s*<meta[^>]*\/?>\s*/gi, "")
      .replace(/^\s*<link[^>]*\/?>\s*/gi, "");

    return out.trim();
  };

  const bodyHtml = normalizeInjectedHtml(rawBodyHtml);

  const MAX_LEN = 15000;
  const trimmed =
    bodyHtml.length > MAX_LEN ? bodyHtml.slice(0, MAX_LEN) + "…" : bodyHtml;

  const header = [
    "<br/>",
    "---------------------------------",
    `From: ${fromVal}`,
    sentStr ? `Sent: ${sentStr}` : "",
    `To: ${toVal}`,
    ccVal ? `Cc: ${ccVal}` : "",
    bccVal ? `Bcc: ${bccVal}` : "",
    `Subject: ${subjVal}`,
  ]
    .filter(Boolean)
    .join("<br/>");

  return (
    `<p></p>` +
    `<div style="margin-top:12px;border-top:1px solid #ddd;padding-top:10px;color:#333;font-size:12px">` +
    `${header}` +
    `<br/><br/>` +
    `<div style="font-size:inherit;color:inherit">` +
    `${trimmed}` +
    `</div>` +
    `</div>`
  );
}
