import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Lock, Plus, Users } from "lucide-react";
import type { GraphMessage } from "../api/graphEmail";
import { useToast } from "@/hooks/use-toast";
import { useCollaborationData } from "./useCollaborationData";
import { CollaborationForm } from "./CollaborationForm";
import { CollaborationList } from "./CollaborationList";
import { CollaborationEmailEditor } from "./CollaborationEmailEditor";
import { CollaborationMailTrail } from "./CollaborationMailTrail";
import { addCollaborator } from "../api/collabApi";
import {
  CollabUser,
  CollaborationActivity,
  CollaborationFormValues,
} from "./types";

interface CollaborationSectionProps {
  ticketId: string;
  ticketSubject?: string;
  /** Original customer message used to quote context in the collaboration email. */
  sourceEmail?: GraphMessage | null;
  /** Names available to the @mention picker in the editor. */
  allRecipientNames?: string[];
}

export function CollaborationSection({
  ticketId,
  ticketSubject,
  sourceEmail,
  allRecipientNames = [],
}: CollaborationSectionProps) {
  const { toast } = useToast();
  const { activitydata, deptdata, userdata, loading, refresh } =
    useCollaborationData(ticketId);

  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState<{
    values: CollaborationFormValues;
    user: CollabUser | null;
  } | null>(null);
  const [trail, setTrail] = useState<{
    conversationId: string;
    subject?: string;
  } | null>(null);

  const handleShowTrail = (activity: CollaborationActivity) => {
    if (!activity.conversationId) return;
    setTrail({
      conversationId: activity.conversationId,
      subject: activity.activityDes || ticketSubject,
    });
  };

  const resetAll = () => {
    setShowForm(false);
    setPending(null);
  };

  const handleCompose = (
    values: CollaborationFormValues,
    user: CollabUser | null,
  ) => {
    setPending({ values, user });
  };

  const handleSaveOnly = async (
    values: CollaborationFormValues,
    user: CollabUser | null,
  ) => {
    try {
      await addCollaborator(ticketId, values, {
        colab_mode: "Note",
        assignedName: user?.name ?? "",
      });
      toast({
        title: "Collaboration added",
        description: `${user?.name || values.assigned} from ${values.dept}.`,
      });
      resetAll();
      refresh();
    } catch (e: any) {
      toast({
        title: "Failed to add collaboration",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSent = () => {
    resetAll();
    refresh();
  };

  if (trail) {
    return (
      <div className="mb-4">
        <CollaborationMailTrail
          conversationId={trail.conversationId}
          ticketSubject={trail.subject}
          title={trail.subject || "Collaboration mail trail"}
          onBack={() => setTrail(null)}
        />
      </div>
    );
  }

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/60">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b border-amber-200 bg-amber-100/70 px-4 py-2.5"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-amber-700" />
          ) : (
            <ChevronRight className="h-4 w-4 text-amber-700" />
          )}
          <Users className="h-4 w-4 text-amber-700" />
          <span className="text-sm font-semibold text-amber-900">
            Collaboration
          </span>
          <Badge
            variant="outline"
            className="h-4 border-amber-300 px-1.5 text-[10px] text-amber-700"
          >
            <Lock className="mr-1 h-2.5 w-2.5" />
            Not visible to employee
          </Badge>
        </div>
        <span className="text-xs text-amber-700">
          {activitydata.length} collaboration
          {activitydata.length === 1 ? "" : "s"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 p-4">
          {/* Actions */}
          {!showForm && !pending && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowForm(true)}
                className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100"
              >
                <Plus className="h-3.5 w-3.5" />
                New Collaboration
              </Button>
            </div>
          )}

          {/* Form */}
          {showForm && !pending && (
            <CollaborationForm
              deptData={deptdata}
              userData={userdata}
              onCompose={handleCompose}
              onSaveOnly={handleSaveOnly}
              onCancel={resetAll}
            />
          )}

          {/* Email composer */}
          {pending && (
            <CollaborationEmailEditor
              ticketId={ticketId}
              ticketSubject={ticketSubject}
              sourceEmail={sourceEmail}
              allRecipientNames={allRecipientNames}
              values={pending.values}
              user={pending.user}
              onSent={handleSent}
              onClose={resetAll}
            />
          )}

          {/* Existing activities */}
          {!showForm && !pending && (
            <>
              {loading ? (
                <p className="text-xs text-muted-foreground">
                  Loading collaborations…
                </p>
              ) : (
                <CollaborationList
                  activities={activitydata}
                  onShowTrail={handleShowTrail}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default CollaborationSection;
