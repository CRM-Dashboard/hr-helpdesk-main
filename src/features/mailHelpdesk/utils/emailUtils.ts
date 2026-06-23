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
 * Cleans HTML content from React Quill editor by removing empty paragraphs
 * and unnecessary whitespace while preserving all valid content.
 *
 * @param html - Raw HTML string from Quill editor
 * @returns Cleaned HTML string
 */
export function cleanQuillHTML(html) {
  return (
    html
      // remove <p><br></p>
      // .replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/gi, "")
      // remove <p><span>&nbsp;</span></p>
      .replace(/<p>\s*(<span[^>]*>)?(&nbsp;|\s)*(<\/span>)?\s*<\/p>/gi, "")
      // remove completely empty paragraphs
      // .replace(/<p>\s*<\/p>/gi, "")
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
