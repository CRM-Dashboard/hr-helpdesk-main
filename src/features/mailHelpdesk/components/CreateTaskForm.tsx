import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
// import { mockUsers } from "../data/mockData";
import { Ticket } from "../types/ticket";
import {
  X,
  CheckSquare,
  Calendar,
  User,
  AlertCircle,
  FileText,
} from "lucide-react";

interface CreateTaskFormProps {
  onClose: () => void;
  selectedTicket?: Ticket | null;
}

export function CreateTaskForm({
  onClose,
  selectedTicket,
}: CreateTaskFormProps) {
  const [formData, setFormData] = useState({
    ticketId: selectedTicket?.id || "",
    title: "",
    description: "",
    assignedTo: "",
    deadline: "",
    priority: "medium",
    remarks: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Creating task:", formData);
    onClose();
  };

  const handleUserSelect = (userId: string) => {
    setFormData((prev) => ({ ...prev, assignedTo: userId }));
  };

  const getDefaultDeadline = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 16);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Create New Task
          </DialogTitle>
          {/* <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button> */}
        </DialogHeader>

        {selectedTicket && (
          <div className="p-4 bg-muted/50 rounded-lg mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">{selectedTicket.id}</Badge>
              <span className="text-sm font-medium">
                {selectedTicket.subject}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Customer: {selectedTicket.customerName} • Priority:{" "}
              {selectedTicket.priority.toUpperCase()}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Task Details
            </h3>

            <div>
              <label className="block text-sm font-medium mb-2">
                Task Title *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Enter a clear, actionable task title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description *
              </label>
              <textarea
                rows={4}
                required
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-border rounded-md bg-background resize-none"
                placeholder="Provide detailed instructions for completing this task..."
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <User className="h-5 w-5" />
              Assignment & Priority
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Priority *
                </label>
                <select
                  required
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      priority: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Deadline *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.deadline || getDefaultDeadline()}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      deadline: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Assign to Team Member *</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* {mockUsers
                .filter((user) => user.role !== "customer")
                .map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleUserSelect(user.id)}
                    className={`flex items-center gap-3 p-3 border rounded-lg transition-colors text-left ${
                      formData.assignedTo === user.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-semibold">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{user.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {user.department} • {user.role}
                      </div>
                    </div>
                  </button>
                ))} */}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Additional Notes
            </h3>

            <div>
              <label className="block text-sm font-medium mb-2">
                Remarks (Optional)
              </label>
              <textarea
                rows={3}
                value={formData.remarks}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, remarks: e.target.value }))
                }
                className="w-full px-3 py-2 border border-border rounded-md bg-background resize-none"
                placeholder="Any additional context, dependencies, or special instructions..."
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Assigned user will receive an email notification
            </div>

            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex items-center gap-2"
                disabled={!formData.assignedTo}
              >
                <CheckSquare className="h-4 w-4" />
                Create Task
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
