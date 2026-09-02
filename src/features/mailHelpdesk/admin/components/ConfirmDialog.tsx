/**
 * The confirmation step in front of a dangerous verb.
 *
 * Six permissions are flagged `is_dangerous` server-side, and the acts behind
 * them either cannot be undone from the screen that performed them or change what
 * other people can do. This is the step the API documentation asks for in front
 * of each.
 */
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiErrorNotice } from "./ApiErrorNotice";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Renders the confirm button in destructive tone. */
  destructive?: boolean;
  isPending?: boolean;
  /** Shown in place of a toast, so a 409's `details` stays on screen. */
  error?: unknown;
  onConfirm: () => void;
  /** Extra fields — an acknowledgement count, a reason. */
  children?: ReactNode;
  confirmDisabled?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  isPending = false,
  error,
  onConfirm,
  children,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {description}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {children && <div className="space-y-3">{children}</div>}

        {/* Kept inside the dialog: a refusal here carries the numbers and codes
            the user needs to answer it, and closing would throw those away. */}
        <ApiErrorNotice error={error} />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || confirmDisabled}
            onClick={(event) => {
              // The dialog closes itself on action; keep it open so a refusal
              // is readable and the user can correct and retry.
              event.preventDefault();
              onConfirm();
            }}
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
