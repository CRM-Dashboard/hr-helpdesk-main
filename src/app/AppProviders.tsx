import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactNode } from "react";
import { HelpdeskProvider } from "@/features/helpdesk/context/HelpdeskContext";
import { NotificationProvider } from "@/context/notifications/NotificationProvider";
import { SocketProvider } from "@/context/sockets/socketProvider";
import { HelpdeskAuthProvider } from "@/features/mailHelpdesk/context/HelpdeskAuthProvider";
import { isHelpdeskApiError, PG_ERROR_CODE } from "@/services/pgClient";

/**
 * Decides whether a failed query is worth trying again.
 *
 * A 403 never becomes a 200 by repeating it, a 404 is an answer, and a 422 is a
 * bad request — only transport faults, rate limits and outages are retryable.
 *
 * @param failureCount how many attempts have already failed
 * @param error the rejection from the query function
 * @returns whether react-query should retry
 */
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= 2) return false;
  if (!isHelpdeskApiError(error)) return failureCount < 1;
  if (error.status === 0) return true; // network / timeout
  if (error.code === PG_ERROR_CODE.TOO_MANY_REQUESTS) return true;
  return error.status >= 500;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Never auto-retry a write: a 409 means someone else got there first.
      retry: false,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <HelpdeskAuthProvider>
          <HelpdeskProvider>
            <NotificationProvider>
              <SocketProvider>
                <Toaster />
                <Sonner />
                {children}
              </SocketProvider>
            </NotificationProvider>
          </HelpdeskProvider>
        </HelpdeskAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
