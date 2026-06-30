import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Mail, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollabDept, CollabUser, CollaborationFormValues } from "./types";

const collaborationSchema = z.object({
  activityDes: z.string().min(5, {
    message: "Activity description must be at least 5 characters.",
  }),
  assigned: z.string().min(1, { message: "Please select a user." }),
  dept: z.string().min(1, { message: "Department is required." }),
  comments: z.string().optional().or(z.literal("")),
});

interface CollaborationFormProps {
  deptData: CollabDept[];
  userData: CollabUser[];
  /** Fired when the user clicks "New Email" on a fully-filled form. */
  onCompose: (values: CollaborationFormValues, user: CollabUser | null) => void;
  /** Fired to persist the collaboration without sending an email. */
  onSaveOnly?: (
    values: CollaborationFormValues,
    user: CollabUser | null,
  ) => void;
  onCancel: () => void;
}

export function CollaborationForm({
  deptData,
  userData,
  onCompose,
  onSaveOnly,
  onCancel,
}: CollaborationFormProps) {
  const form = useForm<CollaborationFormValues>({
    resolver: zodResolver(collaborationSchema),
    mode: "onChange",
    defaultValues: {
      activityDes: "",
      assigned: "",
      dept: "",
      comments: "",
    },
  });

  const resolveUser = (values: CollaborationFormValues) =>
    userData.find((u) => u.id === values.assigned) ?? null;

  const handleCompose = form.handleSubmit((values) =>
    onCompose(values, resolveUser(values)),
  );

  const handleSaveOnly = form.handleSubmit((values) =>
    onSaveOnly?.(values, resolveUser(values)),
  );

  const isValid = form.formState.isValid;

  return (
    <div className="rounded-md border border-amber-200 bg-white p-4">
      <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber-900">
        <UserPlus className="h-4 w-4" />
        New Collaboration
      </h4>

      <Form {...form}>
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          {/* Activity Description */}
          <FormField
            control={form.control}
            name="activityDes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Activity Description</FormLabel>
                <FormControl>
                  <Input placeholder="Describe the activity…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Assigned To */}
          <FormField
            control={form.control}
            name="assigned"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Assigned To</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "w-full justify-between font-normal",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        {field.value
                          ? userData.find((u) => u.id === field.value)?.name ||
                            field.value
                          : "Select user"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Search user…" />
                      <CommandEmpty>No user found.</CommandEmpty>
                      <CommandGroup className="max-h-56 overflow-y-auto">
                        {userData.map((user) => (
                          <CommandItem
                            key={user.id}
                            value={`${user.name} ${user.id}`}
                            onSelect={() => field.onChange(user.id)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                field.value === user.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="text-sm">{user.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {user.email}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Department */}
          <FormField
            control={form.control}
            name="dept"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {deptData.map((dept) => (
                      <SelectItem key={dept.deptCode} value={dept.deptCode}>
                        {dept.deptTxt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Comments */}
          <FormField
            control={form.control}
            name="comments"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Comments</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Add any relevant comments…"
                    className="min-h-[80px]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            {/* {onSaveOnly && (
              <Button
                type="button"
                variant="outline"
                disabled={!isValid}
                onClick={handleSaveOnly}
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                Save
              </Button>
            )} */}
            <Button
              type="button"
              disabled={!isValid}
              onClick={handleCompose}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              <Mail className="mr-1.5 h-4 w-4" />
              New Email
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default CollaborationForm;
