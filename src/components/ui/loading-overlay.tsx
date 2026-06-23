import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type LoadingOverlayProps = {
  open: boolean;
  text?: string;
  className?: string;
};

export function LoadingOverlay({
  open,
  text = "Processing...",
  className,
}: LoadingOverlayProps) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-sm",
        className
      )}
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="flex items-center gap-3 rounded-md border bg-background px-8 py-8 shadow-lg">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm text-foreground">{text}</span>
      </div>
    </div>
  );
}

export default LoadingOverlay;
