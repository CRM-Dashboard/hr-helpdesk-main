type SavedSignature = {
  id: string;
  name: string;
  content: string;
};

export const readSavedSignatures = (): SavedSignature[] => {
  try {
    const raw = localStorage.getItem("emailSignatures");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Normalizes Quill HTML for consistent Outlook/Gmail rendering.
 *
 * Root cause of spacing mismatch:
 * Quill uses <p><br></p> as a visual blank line (full line-height spacer).
 * Deleting those and using margin-bottom instead creates a mismatch because:
 *   - margin-bottom:12px is much smaller than the full blank line the user saw
 *   - Outlook's Word engine adds its OWN margin on top of any inline margin-bottom,
 *     making gaps inconsistently large in Outlook and missing in other clients
 *
 * Fix:
 * - Convert empty <p><br></p> to <br> so the blank line is preserved exactly
 * - Force margin:0 on all <p> tags so Outlook cannot add extra spacing
 * - The <br> provides the blank line; the margin:0 prevents Outlook from doubling it
 */
export function cleanQuillHTML(html: string): string {
  if (!html) return "";

  return (
    html
      // Convert empty paragraphs to <br> to preserve the blank lines the user typed.
      // Empty paragraph forms: <p><br></p>, <p></p>, <p>&nbsp;</p>, <p><span>&nbsp;</span></p>
      .replace(
        /<p[^>]*>\s*(<span[^>]*>)?\s*(<br\s*\/?>|&nbsp;|\s)*\s*(<\/span>)?\s*<\/p>/gi,
        "<br>",
      )
      // Force margin:0 on every <p> so Outlook's Word engine cannot add its own spacing
      .replace(/<p(\s[^>]*)?>/gi, (_m, attrs = "") => {
        const marginRule = `margin:0;`;
        if (/style\s*=/i.test(attrs)) {
          return `<p${attrs.replace(
            /style\s*=\s*(["'])/i,
            `style=$1${marginRule}`,
          )}>`;
        }
        return `<p${attrs} style="${marginRule}">`;
      })
      .trim()
  );
}

/**
 * Extracts unique recipient names from the given message object across To, Cc, and Bcc fields.
 *
 * @param message - The message object containing recipient fields
 * @returns Array of unique recipient names
 */
export function extractUniqueParticipantNames(message: any) {
  const uniqueMap = new Map(); // key = email, value = name

  // 1 Add sender / from
  const sender = message.from?.emailAddress;
  if (sender?.address) {
    const email = sender.address.toLowerCase().trim();
    const name = sender.name?.trim() || email;
    uniqueMap.set(email, name);
  }

  // 2️ Add recipients
  const recipientFields = [
    message.toRecipients,
    message.ccRecipients,
    message.bccRecipients,
  ];

  recipientFields.forEach((recipients) => {
    if (!Array.isArray(recipients)) return;

    recipients.forEach(({ emailAddress }) => {
      if (!emailAddress?.address) return;

      const email = emailAddress.address.toLowerCase().trim();
      const name = emailAddress.name?.trim() || email;

      if (!uniqueMap.has(email)) {
        uniqueMap.set(email, name);
      }
    });
  });

  return Array.from(uniqueMap.values());
}
