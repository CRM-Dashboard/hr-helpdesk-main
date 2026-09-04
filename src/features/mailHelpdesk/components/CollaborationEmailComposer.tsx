/**
 * The collaboration seed mail.
 *
 * This component owns the Graph send and nothing else: it hands the sent mail's
 * metadata back and the caller decides whether that becomes a `POST` (opening a
 * collaboration) or a `PATCH` (binding a thread to one that already exists).
 *
 * The split matters because the two steps can fail independently. Once the mail
 * is out it must never be sent twice, so a failed report keeps this composer
 * mounted with the captured metadata and offers a retry of the report alone.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  createAndSendMail,
  type GraphMessage,
  type SentDraftMeta,
} from "../api/graphEmail";
import OutlookEmailEditor from "./EmailCompose/OutlookEmailEditor";
import {
  buildCollaborationSeedHtml,
  buildCollaborationSubject,
} from "../utils/collaborationMail";
import { uniqueEmails } from "../utils/threadUtils";

type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
};

interface CollaborationEmailComposerProps {
  ticketNumber: string;
  ticketSubject?: string;
  /** What is being asked. Opens the body and is not editable from here. */
  purpose: string;
  /** Who to write to. Anyone without an address is dropped by the caller. */
  recipients: Array<{ name: string; email: string }>;
  /** Always copied — inbound replies route through it. */
  supportEmail: string;
  /** The customer's own message, quoted so the collaborator needs no second screen. */
  sourceEmail?: GraphMessage | null;
  allRecipientNames?: string[];
  /** Called once the mail is out, with the keys the API wants. */
  onSent: (meta: SentDraftMeta) => void;
  onCancel: () => void;
  /** True while the caller's POST/PATCH is in flight. */
  reporting?: boolean;
  /** Set when that call failed — the mail is already out and must not be resent. */
  reportError?: string | null;
  onRetryReport?: () => void;
}

export function CollaborationEmailComposer({
  ticketNumber,
  ticketSubject,
  purpose,
  recipients,
  supportEmail,
  sourceEmail,
  allRecipientNames = [],
  onSent,
  onCancel,
  reporting = false,
  reportError = null,
  onRetryReport,
}: CollaborationEmailComposerProps) {
  const { toast } = useToast();

  const initialBody = useMemo(
    () =>
      buildCollaborationSeedHtml({
        purpose,
        ticketNumber,
        ticketSubject,
        sourceEmail,
      }),
    [purpose, ticketNumber, ticketSubject, sourceEmail],
  );

  const [to, setTo] = useState<string[]>(() =>
    uniqueEmails(recipients.map((row) => row.email)),
  );
  const [cc, setCc] = useState<string[]>([supportEmail]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState(() =>
    buildCollaborationSubject(ticketNumber, ticketSubject),
  );
  const [content, setContent] = useState(initialBody);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  /** Latched once the mail is out, so the button can never fire a second one. */
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState("");

  const handleSend = async () => {
    if (sent || sending) return;
    if (to.length === 0) {
      toast({
        title: "Recipient required",
        description: "Add at least one person to ask.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSending(true);
      const meta = await createAndSendMail({
        to,
        // Re-added even if the chip was deleted: without it the collaborator's
        // reply never reaches intake and becomes a new junk ticket.
        cc: uniqueEmails([...cc, supportEmail]),
        bcc,
        subject,
        contentHtml: content,
        attachments: attachments.map((a) => ({ file: a.file, name: a.name })),
      });
      setSent(true);
      onSent(meta);
    } catch (error) {
      toast({
        title: "The mail could not be sent",
        description:
          error instanceof Error
            ? error.message
            : "Microsoft Graph rejected the message.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      {reportError && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              The mail was sent but the collaboration was not recorded
            </p>
            <p className="mt-0.5">{reportError}</p>
            <p className="mt-0.5 text-xs">
              Until it is recorded, a reply to that mail has no route back to
              this ticket. Retrying reports the mail already sent — it does not
              send another. Closing this now discards the link to that thread.
            </p>
            {onRetryReport && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={reporting}
                onClick={onRetryReport}
              >
                {reporting && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Retry recording
              </Button>
            )}
          </div>
        </div>
      )}

      {sent ? (
        /* The mail is gone; the editor is dead weight and a second send must
           never be possible, so only what happened to it is shown. */
        <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm">
          {!reportError && (
            <p className="flex items-center gap-2 text-muted-foreground">
              {reporting && <Loader2 className="h-4 w-4 animate-spin" />}
              Mail sent — recording the collaboration…
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">{subject}</span> — sent to{" "}
            {to.join(", ")}
            {`, copying ${supportEmail}`}.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">{supportEmail}</span> is always
            copied: inbound replies route through the support mailbox back onto
            this collaboration.
          </p>

          <div className="h-[70vh] rounded-md border border-amber-200 bg-white">
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
              onDiscard={onCancel}
              sending={sending}
              allRecipientNames={allRecipientNames}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default CollaborationEmailComposer;
