import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactNode } from "react";
import { HelpdeskProvider } from "@/features/helpdesk/context/HelpdeskContext";
import { NotificationProvider } from "@/context/notifications/NotificationProvider";
import { SocketProvider } from "@/context/sockets/socketProvider";

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <HelpdeskProvider>
          <NotificationProvider>
            <SocketProvider>
              <Toaster />
              <Sonner />
              {children}
            </SocketProvider>
          </NotificationProvider>
        </HelpdeskProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
