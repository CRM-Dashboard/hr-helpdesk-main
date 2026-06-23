import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserCheck } from "lucide-react";

interface Manager {
  userid: string;
  name: string;
}

interface AssignAgentFormProps {
  onClose: () => void;
  managers: Manager[];
  onAssign: (manager: Manager) => void;
}

export function AssignAgentForm({
  onClose,
  managers,
  onAssign,
}: AssignAgentFormProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  //   const sortedManagers = useMemo(() => {
  //     return [...(managers || [])].sort((a, b) => a.name.localeCompare(b.name));
  //   }, [managers]);

  const selectedManager = useMemo(() => {
    return managers.find((m) => m.userid === selectedUserId) || null;
  }, [managers, selectedUserId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedManager) {
      onAssign(selectedManager);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <UserCheck className="h-5 w-5" /> Assign to Member
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Assign to Team Member *</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {managers.map((user) => (
                <button
                  key={user.userid}
                  type="button"
                  onClick={() => setSelectedUserId(user.userid)}
                  className={`flex items-center gap-3 p-3 border rounded-lg transition-colors text-left ${
                    selectedUserId === user.userid
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-semibold">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{user.name}</div>
                    {/* <div className="text-xs text-muted-foreground">
                      {user.department} • {user.role}
                    </div> */}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedUserId}>
              Assign
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
