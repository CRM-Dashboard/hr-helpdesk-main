import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Ticket } from "../types/ticket";
import { Users, MessageSquare, Search, AlertCircle } from "lucide-react";

interface Manager {
  userid: string;
  name: string;
}

interface CreateCollaboratorFormProps {
  onClose: () => void;
  selectedTicket?: Ticket | null;
  /** Internal team members available to collaborate. */
  managers?: Manager[];
  /** Ids already collaborating (excluded from the picker). */
  existingIds?: string[];
  /**
   * Called when a collaborator is added. `initialNote` is an optional internal
   * note to seed the collaboration sub-thread.
   */
  onAdd?: (
    collaborator: { userId: string; name: string },
    initialNote?: string,
  ) => void;
}

export function CreateCollaboratorForm({
  onClose,
  selectedTicket,
  managers = [],
  existingIds = [],
  onAdd,
}: CreateCollaboratorFormProps) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const existing = useMemo(
    () => new Set(existingIds.map((id) => String(id).toUpperCase())),
    [existingIds],
  );

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (managers || [])
      .filter((m) => m?.userid && !existing.has(String(m.userid).toUpperCase()))
      .filter(
        (m) =>
          !q ||
          m.name?.toLowerCase().includes(q) ||
          m.userid?.toLowerCase().includes(q),
      );
  }, [managers, existing, search]);

  const selected = useMemo(
    () => managers.find((m) => m.userid === selectedUserId) || null,
    [managers, selectedUserId],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      setError("Please select a collaborator.");
      return;
    }
    onAdd?.({ userId: selected.userid, name: selected.name }, message.trim());
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Add Internal Collaborator
          </DialogTitle>
        </DialogHeader>

        {selectedTicket && (
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">#{selectedTicket.id}</Badge>
            <span className="font-medium truncate">
              {selectedTicket.subject}
            </span>
          </div>
        )}

        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Collaborators join an internal sub-thread only. The assigned SPOC
          remains the OLA owner.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Select team member *
            </label>
            <div className="relative mb-2">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or id…"
                className="w-full pl-8 pr-3 py-2 border border-border rounded-md bg-background text-sm"
              />
            </div>

            <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
              {options.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full py-4 text-center">
                  No team members available.
                </p>
              )}
              {options.map((user) => (
                <button
                  key={user.userid}
                  type="button"
                  onClick={() => {
                    setSelectedUserId(user.userid);
                    setError(null);
                  }}
                  className={`flex items-center gap-3 p-2.5 border rounded-lg transition-colors text-left ${
                    selectedUserId === user.userid
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-semibold flex-shrink-0">
                    {user.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {user.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {user.userid}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              Internal note (optional)
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background resize-none"
              placeholder="Describe what help you need from this collaborator (internal only)…"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedUserId}>
              Add Collaborator
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateCollaboratorForm;
