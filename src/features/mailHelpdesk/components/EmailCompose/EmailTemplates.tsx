import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  category: string;
}

interface EmailTemplatesProps {
  onSelectTemplate: (template: EmailTemplate) => void;
  onSaveTemplate?: (template: Partial<EmailTemplate>) => void;
  currentSubject: string;
  currentContent: string;
  defaultTemplates?: EmailTemplate[];
  categories?: string[];
  forceDialog?: boolean;
  triggerVariant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "ghost"
    | "link";
  triggerClassName?: string;
  triggerSize?: "default" | "sm" | "lg" | "icon";
}

export function EmailTemplates({
  onSelectTemplate,
  onSaveTemplate,
  currentSubject,
  currentContent,
  defaultTemplates = [],
  categories,
  forceDialog,
  triggerVariant = "outline",
  triggerClassName,
  triggerSize = "default",
}: EmailTemplatesProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(defaultTemplates);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filteredTemplates = templates.filter((template) => {
    // Filter by search query
    if (searchQuery) {
      return (
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.subject.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return true;
  });

  const userTemplates = templates.filter(
    (template) =>
      !defaultTemplates.some(
        (defaultTemplate) => defaultTemplate.id === template.id
      )
  );

  const handleSelect = (template: EmailTemplate) => {
    onSelectTemplate(template);
    setOpen(false);
  };

  const ContentBody = (
    <div className="p-2 pb-0">
      <div className="space-y-2">
        {/* <h4 className="font-medium text-sm">Choose Template</h4> */}

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  const ListsBody = (
    <Tabs defaultValue="all" className="mt-2">
      <TabsContent value="all" className="mt-0">
        <ScrollArea className={`${forceDialog ? "h-[60vh]" : "h-72"} px-4`}>
          <div className="space-y-1 py-2">
            {filteredTemplates.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">
                No templates match your search
              </p>
            ) : (
              filteredTemplates.map((template) => (
                <Button
                  key={template.id}
                  variant="ghost"
                  className="w-full justify-between text-left text-sm"
                  onClick={() => handleSelect(template)}
                >
                  <span className="truncate">{template.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {template.category}
                  </span>
                </Button>
              ))
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="user" className="mt-0">
        <ScrollArea className={`${forceDialog ? "h-[60vh]" : "h-72"} px-4`}>
          <div className="space-y-1 py-2">
            {userTemplates.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">
                You haven't saved any templates yet
              </p>
            ) : (
              userTemplates.map((template) => (
                <Button
                  key={template.id}
                  variant="ghost"
                  className="w-full justify-start text-left text-sm"
                  onClick={() => handleSelect(template)}
                >
                  {template.name}
                </Button>
              ))
            )}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="flex">
      {forceDialog ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant={triggerVariant}
              size={triggerSize}
              className={triggerClassName}
              type="button"
              onClick={() => setOpen(true)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Templates
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] w-[620px] max-h-[90vh] p-2 overflow">
            <DialogHeader className="px-4 pt-4 pb-0">
              <DialogTitle className="text-base">Templates</DialogTitle>
            </DialogHeader>
            {ContentBody}
            {ListsBody}
          </DialogContent>
        </Dialog>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={triggerVariant}
              size={triggerSize}
              className={triggerClassName}
              type="button"
              onClick={() => setOpen((o) => !o)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Templates
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(95vw,700px)] max-h-[70vh] p-0 overflow">
            {ContentBody}
            {ListsBody}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
