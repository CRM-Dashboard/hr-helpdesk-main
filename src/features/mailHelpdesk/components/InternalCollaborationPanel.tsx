import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Users,
  Lock,
  Send,
  UserPlus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { InternalNote, TicketCollaborator } from "../types/collaboration";

interface InternalCollaborationPanelProps {
  collaborators: TicketCollaborator[];
  notes: InternalNote[];
  onAddCollaborator: () => void;
  onAddNote: (content: string) => void;
}

export function InternalCollaborationPanel({
  collaborators,
  notes,
  onAddCollaborator,
  onAddNote,
}: InternalCollaborationPanelProps) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");

  const submitNote = () => {
    const content = draft.trim();
    if (!content) return;
    onAddNote(content);
    setDraft("");
  };

  const sortedNotes = [...notes].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-100/70 border-b border-amber-200"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-amber-700" />
          ) : (
            <ChevronRight className="h-4 w-4 text-amber-700" />
          )}
          <Users className="h-4 w-4 text-amber-700" />
          <span className="text-sm font-semibold text-amber-900">
            Internal Collaboration
          </span>
          <Badge
            variant="outline"
            className="text-[10px] h-4 px-1.5 border-amber-300 text-amber-700"
          >
            <Lock className="h-2.5 w-2.5 mr-1" />
            Not visible to employee
          </Badge>
        </div>
        <span className="text-xs text-amber-700">
          {collaborators.length} collaborator
          {collaborators.length === 1 ? "" : "s"} · {notes.length} note
          {notes.length === 1 ? "" : "s"}
        </span>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {/* Collaborators */}
          <div className="flex items-center gap-2 flex-wrap">
            {collaborators.map((c) => (
              <Badge
                key={c.id}
                variant="secondary"
                className="bg-white border border-amber-200 text-amber-900"
              >
                {c.name}
              </Badge>
            ))}
            {collaborators.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No collaborators yet.
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddCollaborator}
              className="h-7 gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {/* Notes sub-thread */}
          <div className="space-y-2">
            {sortedNotes.map((n) => (
              <div
                key={n.id}
                className="rounded-md border border-amber-200 bg-white px-3 py-2"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-amber-900">
                    {n.authorName}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(n.createdAt), "dd MMM, hh:mm a")}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {n.content}
                </p>
              </div>
            ))}
          </div>

          {/* Add note */}
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  submitNote();
                }
              }}
              placeholder="Add an internal note… (⌘/Ctrl + Enter to post)"
              className="flex-1 px-3 py-2 border border-amber-200 rounded-md bg-white resize-none text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
            />
            <Button
              type="button"
              onClick={submitNote}
              disabled={!draft.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              <Send className="h-4 w-4" />
              Post
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default InternalCollaborationPanel;
