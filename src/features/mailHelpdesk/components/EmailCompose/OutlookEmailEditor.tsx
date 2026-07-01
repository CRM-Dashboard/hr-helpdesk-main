import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactQuill, { Quill } from "react-quill";
import "react-quill/dist/quill.snow.css";
import "./OutlookEmailEditor.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SignatureManager from "./SignatureManager";
import { EmailTemplates as TemplatesPopover } from "./EmailTemplates";
import { DEFAULT_IT_TEMPLATES } from "../../constant/itSupportMailTemplates";
import {
  Send,
  Paperclip,
  Link as LinkIcon,
  Image as ImageIcon,
  X,
  Trash2,
} from "lucide-react";
import { readSavedSignatures } from "../../utils/emailUtils";
import SelectField from "@/components/SelectField";
import { status } from "../../types/helpdeskDataTypes";
import { useEmailMentionPicker } from "../../hooks";

type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
};

interface OutlookEmailEditorProps {
  content: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  attachments: Attachment[];
  onContentChange: (content: string) => void;
  onToChange: (to: string[]) => void;
  onCcChange: (cc: string[]) => void;
  onBccChange: (bcc: string[]) => void;
  onSubjectChange: (subject: string) => void;
  onAttachmentsChange: (attachments: Attachment[]) => void;
  onSend?: () => Promise<void> | void;
  onDiscard?: () => void;
  sending?: boolean;
  statusList: status[];
  selectedStatus: string;
  onStatusChange: (val: string) => void;
  allRecipientNames: string[];
}

// Register fonts/sizes for richer toolbar similar to your legacy editor
try {
  const Font = Quill.import("formats/font") as any;
  const Size = Quill.import("formats/size") as any;
  if (Font && Font.whitelist) {
    Font.whitelist = [
      "arial",
      "calibri",
      "times",
      "courier",
      "tahoma",
      "verdana",
      "trebuchet",
    ];
    Quill.register(Font, true);
  }
  if (Size && Size.whitelist) {
    Size.whitelist = [
      "8px",
      "9px",
      "10px",
      "11px",
      "12px",
      "14px",
      "16px",
      "18px",
      "20px",
      "22px",
      "24px",
      "26px",
      "28px",
      "36px",
      "48px",
      "72px",
    ];
    Quill.register(Size, true);
  }
} catch {}

// Register non-editable mention embeds for Outlook/Gmail-like mentions.
// We keep a legacy blot name ("emailMention") for back-compat with previously saved Quill deltas.
try {
  const Embed = Quill.import("blots/embed") as any;

  // Avoid double registration (HMR / multiple mounts).
  const alreadyRegisteredOld = (Quill as any).imports?.["formats/emailMention"];
  const alreadyRegisteredNew = (Quill as any).imports?.[
    "formats/emailNameMention"
  ];

  const setMentionNode = (node: HTMLElement, value: string) => {
    node.setAttribute("data-email", value);
    node.setAttribute("data-mention", value);
    node.setAttribute("contenteditable", "false");
    node.textContent = value;
    // Make sure both old and new CSS selectors style it the same.
    node.classList.add("email-mention", "email-name-mention");
  };

  const getMentionValue = (node: HTMLElement) =>
    node.getAttribute("data-mention") ||
    node.getAttribute("data-email") ||
    node.textContent ||
    "";

  class EmailNameMentionBlot extends Embed {
    static blotName = "emailNameMention";
    static tagName = "span";
    static className = "email-name-mention";

    static create(value: string) {
      const node = super.create() as HTMLElement;
      setMentionNode(node, value);
      return node;
    }

    static value(node: HTMLElement) {
      return getMentionValue(node);
    }
  }

  // Preferred new name
  if (!alreadyRegisteredNew) Quill.register(EmailNameMentionBlot, true);

  // Legacy name for old content
  if (!alreadyRegisteredOld) {
    class EmailMentionBlot extends EmailNameMentionBlot {
      static blotName = "emailMention";
      static className = "email-mention";
    }
    Quill.register(EmailMentionBlot, true);
  }
} catch {}

const OutlookEmailEditor: React.FC<OutlookEmailEditorProps> = ({
  content,
  to,
  cc,
  bcc,
  subject,
  attachments,
  onContentChange,
  onToChange,
  onCcChange,
  onBccChange,
  onSubjectChange,
  onAttachmentsChange,
  onSend,
  onDiscard,
  sending,
  statusList = [],
  selectedStatus,
  onStatusChange,
  allRecipientNames,
}) => {
  const quillRef = useRef<ReactQuill>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const [showCcBcc, setShowCcBcc] = useState(cc.length > 0 || bcc.length > 0);
  const [showSignatures, setShowSignatures] = useState(false);
  const hasAnySignature = useMemo(
    () => readSavedSignatures().length > 0,
    [showSignatures],
  );
  const {
    mention,
    selectEmail,
    close: closeMention,
    setActiveIndex: setMentionActiveIndex,
  } = useEmailMentionPicker({
    quillRef,
    containerRef: editorWrapperRef as unknown as React.RefObject<HTMLElement>,
    emails: allRecipientNames,
  });

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, 4, 5, 6, false] }],
          [
            {
              font: [
                "arial",
                "calibri",
                "times",
                "courier",
                "tahoma",
                "verdana",
                "trebuchet",
              ],
            },
          ],
          [
            {
              size: [
                "8px",
                "9px",
                "10px",
                "11px",
                "12px",
                "14px",
                "16px",
                "18px",
                "20px",
                "22px",
                "24px",
                "26px",
                "28px",
                "36px",
                "48px",
                "72px",
              ],
            },
          ],
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ script: "sub" }, { script: "super" }],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ indent: "-1" }, { indent: "+1" }],
          [{ align: [] }],
          ["link", "image", "video"],
          ["blockquote", "code-block"],
          ["clean"],
        ],
      },
      clipboard: { matchVisual: false },
    }),
    [],
  );

  const formats = [
    "header",
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "script",
    "list",
    "bullet",
    "indent",
    "align",
    "link",
    "image",
    "video",
    "blockquote",
    "code-block",
    // New embed name (preferred)
    "emailNameMention",
    // Back-compat: older saved editor deltas may still contain this embed.
    "emailMention",
  ];

  // Set cursor to start of editor on mount
  useEffect(() => {
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      // Set cursor to position 0 (start of document)
      quill.setSelection(0, 0);
      quill.focus();
    }
  }, []);

  // Add native tooltips to Quill toolbar controls
  useEffect(() => {
    // Add signature
    // handleUseSignatureClick();

    // Add native tooltips to Quill toolbar controls
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return;
    const toolbar = wrapper.querySelector(".ql-toolbar");
    if (!toolbar) return;

    const setTitle = (selector: string, title: string) => {
      toolbar.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        el.setAttribute("title", title);
        el.setAttribute("aria-label", title);
      });
    };

    // Buttons
    setTitle("button.ql-bold", "Bold");
    setTitle("button.ql-italic", "Italic");
    setTitle("button.ql-underline", "Underline");
    setTitle("button.ql-strike", "Strikethrough");
    setTitle('button.ql-list[value="ordered"]', "Numbered list");
    setTitle('button.ql-list[value="bullet"]', "Bulleted list");
    setTitle('button.ql-indent[value="+1"]', "Indent");
    setTitle('button.ql-indent[value="-1"]', "Outdent");
    setTitle("button.ql-link", "Insert link");
    setTitle("button.ql-image", "Insert image");
    setTitle("button.ql-video", "Insert video");
    setTitle("button.ql-blockquote", "Block quote");
    setTitle("button.ql-code-block", "Code block");
    setTitle("button.ql-clean", "Clear formatting");

    // Pickers (set on the label so hover works)
    setTitle(".ql-header .ql-picker-label", "Heading level");
    setTitle(".ql-font .ql-picker-label", "Font family");
    setTitle(".ql-size .ql-picker-label", "Font size");
    setTitle(".ql-align .ql-picker-label", "Text alignment");
    setTitle(".ql-color .ql-picker-label", "Text color");
    setTitle(".ql-background .ql-picker-label", "Background color");
  }, [modules]);

  const addEmailsFromInput = (
    current: string[],
    setList: (list: string[]) => void,
    raw: string,
  ) => {
    const parts = raw
      .split(/[;,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) setList([...current, ...parts]);
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      size: file.size,
      type: file.type,
      file,
    }));
    onAttachmentsChange([...attachments, ...newAttachments]);
    if (e.target) e.target.value = "";
  };

  const removeAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  const RecipientChips: React.FC<{
    label: string;
    values: string[];
    onValues: (vals: string[]) => void;
  }> = ({ label, values, onValues }) => {
    const [input, setInput] = useState("");
    return (
      <div className="flex items-start gap-2">
        <Label className="w-10 text-right pt-1.5 text-sm text-muted-foreground">
          {label}
        </Label>
        <div className="flex-1 min-h-[32px] border border-border rounded-sm px-2 py-1 bg-background">
          <div className="flex flex-wrap gap-1">
            {values.map((email, i) => (
              <span
                key={`${email}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-muted text-xs"
              >
                {email}
                <button
                  className="ml-1 hover:text-red-600"
                  onClick={() => onValues(values.filter((_, idx) => idx !== i))}
                  type="button"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              className="flex-1 min-w-[100px] bg-transparent outline-none text-sm py-0.5"
              placeholder="Enter addresses"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "," || e.key === ";") {
                  e.preventDefault();
                  addEmailsFromInput(values, onValues, input);
                  setInput("");
                }
              }}
              onBlur={() => {
                if (input.trim()) {
                  addEmailsFromInput(values, onValues, input);
                  setInput("");
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  const insertSignatureAtCursor = (html: string) => {
    try {
      if (quillRef.current) {
        const quill = quillRef.current.getEditor();
        const selection = quill.getSelection();

        // If cursor is available, use that position, otherwise insert at end
        const insertPos = selection ? selection.index : quill.getLength() - 1;

        quill.insertText(insertPos, "\n\n");
        quill.clipboard.dangerouslyPasteHTML(insertPos + 2, html);

        // Move cursor after the inserted signature
        // const newPos = insertPos + 2 + html.length;
        // quill.setSelection(newPos, 0);
        // quill.focus();
      }
    } catch {}
  };

  const insertTemplateAtCursor = (html: string) => {
    try {
      if (quillRef.current) {
        const quill = quillRef.current.getEditor();
        const selection = quill.getSelection();

        // If cursor is available, use that position, otherwise insert at beginning
        const insertPos = selection ? selection.index : 0;

        quill.clipboard.dangerouslyPasteHTML(insertPos, html);

        // Move cursor after the inserted template
        const newPos = insertPos + html.length;
        quill.setSelection(newPos, 0);
        quill.focus();
      }
    } catch {}
  };

  const handleUseSignatureClick = () => {
    const saved = readSavedSignatures();
    if (saved.length === 1) {
      insertSignatureAtCursor(saved[0].content);
    } else if (saved.length > 1) {
      setShowSignatures((s) => !s);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Compact Recipients & Subject */}
      <div className="flex-shrink-0 bg-background border-b">
        <div className="p-3 space-y-2">
          <RecipientChips label="To:" values={to} onValues={onToChange} />

          {showCcBcc || cc.length > 0 || bcc.length > 0 ? (
            <>
              <RecipientChips label="Cc:" values={cc} onValues={onCcChange} />
              <RecipientChips
                label="Bcc:"
                values={bcc}
                onValues={onBccChange}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  // className="h-6 text-xs"
                  className="h-7 px-3 text-xs font-medium text-purple-700 bg-purple-100
                   hover:bg-purple-200 border border-purple-200 rounded-md transition-colors"
                  onClick={() => setShowCcBcc(false)}
                >
                  Hide Cc/Bcc
                </Button>
              </div>
            </>
          ) : null}

          {!showCcBcc && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => setShowCcBcc(true)}
              >
                Cc/Bcc
              </Button>
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-2">
            <Label className="w-10 text-right text-sm text-muted-foreground">
              Subject:
            </Label>
            <Input
              value={subject}
              //   onChange={(e) => onSubjectChange(e.target.value)}
              onChange={() => {}}
              placeholder="Add a subject"
              className="flex-1 h-8"
              contentEditable={true}
            />
          </div>

          {/* Compact Attachment button */}
          <div className="flex-shrink-0 border-b bg-muted/30 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="w-4 h-4" /> Attach File
                </Button>
                <TemplatesPopover
                  defaultTemplates={DEFAULT_IT_TEMPLATES}
                  forceDialog={true}
                  currentSubject={subject}
                  currentContent={content}
                  onSelectTemplate={(tpl) => {
                    insertTemplateAtCursor(tpl.content);
                  }}
                  triggerVariant="default"
                  triggerSize="sm"
                  triggerClassName="bg-emerald-600 hover:bg-emerald-700 text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => setShowSignatures((s) => !s)}
                >
                  Signatures
                </Button>
              </div>
            </div>
          </div>

          {/* Compact Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1 px-2 py-1 border rounded-sm bg-muted text-xs max-w-48"
                >
                  <Paperclip className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{a.name}</span>
                  <span className="text-muted-foreground flex-shrink-0">
                    ({formatSize(a.size)})
                  </span>
                  <button
                    className="hover:text-red-600 flex-shrink-0"
                    onClick={() => removeAttachment(a.id)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
        {showSignatures && (
          <div className="px-3 py-2 border-t bg-background">
            <SignatureManager
              onSelectSignature={(html: string) => {
                insertSignatureAtCursor(html);
                setShowSignatures(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Editor - Takes remaining space */}
      <div className="flex-1 min-h-0">
        <div className="h-full relative" ref={editorWrapperRef}>
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={content}
            onChange={onContentChange}
            modules={modules}
            formats={formats}
            placeholder="Type your message..."
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
            className="h-full [&_.ql-container]:flex-1 [&_.ql-editor]:h-full [&_.ql-editor]:overflow-auto"
          />

          {mention.open && (
            <div
              className="mention-dropdown"
              style={{
                top: mention.position.top,
                left: mention.position.left,
              }}
              role="listbox"
              aria-label="Email suggestions"
              onMouseDown={(e) => {
                // Prevent editor from losing selection/focus while interacting.
                e.preventDefault();
              }}
            >
              {mention.items.length === 0 ? (
                <div className="mention-empty">No matches</div>
              ) : (
                mention.items.map((email, idx) => (
                  <div
                    key={email}
                    className={`mention-item ${
                      idx === mention.activeIndex ? "active" : ""
                    }`}
                    role="option"
                    aria-selected={idx === mention.activeIndex}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectEmail(email);
                    }}
                    onMouseEnter={() => setMentionActiveIndex(idx)}
                  >
                    {email}
                  </div>
                ))
              )}
              <div className="mention-hint">
                <span>↑↓ navigate · Enter select · Esc close</span>
                <button
                  type="button"
                  className="mention-close"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    closeMention();
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Actions */}
      <div className="flex-shrink-0 border-t bg-muted/30 px-3 py-2 sticky bottom-0">
        <div className="flex items-center justify-end gap-2">
          <div className="space-y-2 items-center w-60">
            <SelectField
              id="statusTxt"
              value={selectedStatus || ""}
              onChange={onStatusChange}
              options={statusList.map((s) => ({
                value: s.status,
                label: s.statusTxt,
              }))}
              triggerClassName="border-orange-500 focus:ring-orange-500 focus:border-orange-500"
              className="space-y-0"
            />
          </div>
          {hasAnySignature && (
            <Button
              variant="default"
              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleUseSignatureClick}
            >
              Use Signature
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={onDiscard}
            className="flex items-center gap-1"
            disabled={!!sending}
          >
            <Trash2 className="w-4 h-4" />
            Discard
          </Button>
          <Button
            variant="default"
            onClick={() => onSend?.()}
            className="flex items-center gap-1 bg-green-600 hover:bg-green-800 text-white"
            disabled={!!sending}
          >
            <Send className="w-4 h-4" />
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OutlookEmailEditor;
