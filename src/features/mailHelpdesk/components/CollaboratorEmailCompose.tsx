import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collaborator, Ticket } from "../types/ticket";
import {
  X,
  Send,
  Mail,
  Paperclip,
  Bold,
  Italic,
  Underline,
  List,
  Link,
} from "lucide-react";

interface CollaboratorEmailComposeProps {
  onClose: () => void;
  collaborator: Collaborator;
  ticket: Ticket;
}

export function CollaboratorEmailCompose({
  onClose,
  collaborator,
  ticket,
}: CollaboratorEmailComposeProps) {
  const [formData, setFormData] = useState({
    subject: `Re: ${ticket.subject} [${ticket.id}]`,
    message: "",
    attachments: [] as File[],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Sending email to collaborator:", {
      collaborator,
      ...formData,
    });
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFormData((prev) => ({
        ...prev,
        attachments: [...prev.attachments, ...newFiles],
      }));
    }
  };

  const removeAttachment = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Collaborator
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="p-4 bg-muted/50 rounded-lg mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-semibold">
              {collaborator.name.charAt(0)}
            </div>
            <div>
              <div className="font-medium text-sm">{collaborator.name}</div>
              <div className="text-xs text-muted-foreground">
                {collaborator.email}
              </div>
            </div>
            <Badge
              variant={
                collaborator.type === "internal" ? "default" : "secondary"
              }
              className="text-xs"
            >
              {collaborator.type}
            </Badge>
            {collaborator.department && (
              <Badge variant="outline" className="text-xs">
                {collaborator.department}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{ticket.id}</Badge>
            <span className="text-sm">{ticket.subject}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Subject *</label>
            <input
              type="text"
              required
              value={formData.subject}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, subject: e.target.value }))
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Message *</label>

            <div className="flex items-center gap-1 p-2 border border-border rounded-t-md bg-muted/30">
              <Button type="button" variant="ghost" size="sm">
                <Bold className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm">
                <Italic className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm">
                <Underline className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button type="button" variant="ghost" size="sm">
                <List className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm">
                <Link className="h-4 w-4" />
              </Button>
            </div>

            <textarea
              rows={12}
              required
              value={formData.message}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, message: e.target.value }))
              }
              className="w-full px-3 py-2 border border-border rounded-b-md bg-background resize-none"
              placeholder={`Hi ${collaborator.name},\n\nI need your assistance with ticket ${ticket.id} - ${ticket.subject}.\n\n[Describe what help you need and any relevant details]\n\nBest regards`}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Attachments</label>
              <div>
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    document.getElementById("file-upload")?.click()
                  }
                  className="flex items-center gap-2"
                >
                  <Paperclip className="h-4 w-4" />
                  Attach Files
                </Button>
              </div>
            </div>

            {formData.attachments.length > 0 && (
              <div className="space-y-2">
                {formData.attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 border border-border rounded-md"
                  >
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachment(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Email will be sent immediately and logged in ticket history
            </div>

            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className="flex items-center gap-2">
                <Send className="h-4 w-4" />
                Send Email
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
