/**
 * Conditional rendering by permission.
 *
 * `<Can permission={…}>` hides; `<RequirePermission>` explains. Use the first for
 * a control the user simply should not see (a Delete button), and the second for
 * a whole screen, where a blank page reads as a bug rather than as an answer.
 */
import type { ReactNode } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import type { HelpdeskPermission } from "./catalogue";
import { usePermissions } from "./usePermissions";

interface CanProps {
  /** A single code, or several — held any-of, matching `requirePermission`. */
  permission: HelpdeskPermission | HelpdeskPermission[];
  /** Require every code instead of any one of them. */
  requireAll?: boolean;
  /** Rendered when the check fails. Nothing, by default. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders `children` only when the signed-in user holds the permission.
 *
 * Renders `fallback` while `/auth/me` is still in flight, so a control never
 * flashes into view and then disappears.
 */
export function Can({
  permission,
  requireAll = false,
  fallback = null,
  children,
}: CanProps) {
  const { any, all, isReady } = usePermissions();
  const codes = Array.isArray(permission) ? permission : [permission];
  const granted = requireAll ? all(...codes) : any(...codes);

  if (!isReady || !granted) return <>{fallback}</>;
  return <>{children}</>;
}

interface RequirePermissionProps extends CanProps {
  /** Named in the refusal, e.g. "Routing rules". */
  title?: string;
}

/**
 * Screen-level guard. Waits for `/auth/me`, then either renders the screen or
 * says plainly which permission is missing — the same answer the server would
 * give, without spending one of the 60 admin requests a minute to hear it.
 */
export function RequirePermission({
  permission,
  requireAll = false,
  title,
  fallback,
  children,
}: RequirePermissionProps) {
  const { any, all, isReady } = usePermissions();
  const codes = Array.isArray(permission) ? permission : [permission];
  const granted = requireAll ? all(...codes) : any(...codes);

  if (!isReady) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking your access…
      </div>
    );
  }

  if (!granted) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-medium">
              {title ? `${title} is not yours to open` : "You cannot open this"}
            </p>
            <p className="mt-0.5">
              This screen needs {requireAll ? "all of" : "one of"}{" "}
              <span className="font-mono text-xs">{codes.join(", ")}</span>, and
              your account holds {requireAll ? "only some" : "none"} of{" "}
              {codes.length > 1 ? "them" : "it"}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
