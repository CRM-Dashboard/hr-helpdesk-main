/**
 * Blocks the agent desk until `GET /auth/me` has answered.
 *
 * Nothing below this point can render sensibly without the identity: the state
 * filter, the transition buttons and the admin menu are all driven by it.
 */
import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isHelpdeskApiError, PG_ERROR_CODE } from "@/services/pgClient";
import { useHelpdeskAuth } from "../context/helpdeskAuthContext";

/**
 * Turns a failed identity call into something a person can act on.
 *
 * @param error whatever `/auth/me` rejected with
 * @returns a heading, an explanation, and whether retrying could help
 */
function describe(error: Error): {
  title: string;
  detail: string;
  retryable: boolean;
  requestId?: string;
} {
  if (!isHelpdeskApiError(error)) {
    return {
      title: "Cannot reach the helpdesk",
      detail: error.message,
      retryable: true,
    };
  }

  const base = { requestId: error.requestId };

  switch (error.code) {
    case PG_ERROR_CODE.UNAUTHORIZED:
      return {
        ...base,
        title: "Not signed in",
        // Re-authentication is the host shell's job; retrying the same header cannot fix it.
        detail: `${error.message} The helpdesk did not accept this identity.`,
        retryable: false,
      };
    case PG_ERROR_CODE.FORBIDDEN:
      return {
        ...base,
        title: "Account cannot use the helpdesk",
        detail: error.message,
        retryable: false,
      };
    case PG_ERROR_CODE.TOO_MANY_REQUESTS:
      return {
        ...base,
        title: "Too many requests",
        detail: "Wait a moment and try again.",
        retryable: true,
      };
    default:
      return {
        ...base,
        title: "The helpdesk is unavailable",
        detail: error.message,
        retryable: true,
      };
  }
}

export function HelpdeskAuthGate({ children }: { children: ReactNode }) {
  const { isLoading, error, user, hasDepartment, identityEmail, refresh } =
    useHelpdeskAuth();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Signing in to the helpdesk…
        </div>
      </div>
    );
  }

  if (error || !user) {
    const { title, detail, retryable, requestId } = describe(
      error ?? new Error("The helpdesk returned no user."),
    );
    return (
      <div className="h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-lg border border-slate-200 bg-white p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-amber-500" />
          <h2 className="text-base font-medium text-slate-900">{title}</h2>
          <p className="mt-2 text-sm text-slate-600">{detail}</p>
          <p className="mt-3 text-xs text-slate-400">
            Identity sent: {identityEmail}
          </p>
          {requestId && (
            <p className="mt-1 text-xs text-slate-400">
              Request id: {requestId}
            </p>
          )}
          {retryable && (
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              className="mt-4 gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  // `departmentId: null` is why /auth/me is deliberately unscoped — it is the
  // one endpoint that can explain the 403 every other call would return.
  if (!hasDepartment) {
    return (
      <div className="h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-lg border border-slate-200 bg-white p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-amber-500" />
          <h2 className="text-base font-medium text-slate-900">
            No department assigned
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {user.fullName || user.email} is not attached to a helpdesk
            department, so no tickets can be listed. Ask an administrator to
            assign one.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
