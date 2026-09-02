/**
 * Renders a failed admin call the way the API intends it to be read.
 *
 * `message` on a 4xx is written to be shown to a user, so it is shown. What
 * matters more is `details`: this API answers several refusals by naming exactly
 * what is in the way — the failed readiness checks behind a refused activation,
 * the live rules still routing on a category you tried to retire, the real
 * open-ticket count behind a mismatched acknowledgement. Those are the answer to
 * the question the user is actually asking, and dropping them leaves a dead end.
 */
import { AlertTriangle } from "lucide-react";
import {
  HelpdeskApiError,
  PG_ERROR_CODE,
  isHelpdeskApiError,
} from "@/services/pgClient";

/** The `details` shapes this API returns that are worth rendering specifically. */
interface KnownDetails {
  /** Failed readiness check codes, from a refused `activate`. */
  blocking?: string[];
  /** Live rules and policies blocking a retire. */
  dependents?: Array<{
    entity_type: string;
    id: string;
    version_no: number | null;
    name: string | null;
    scope: string;
  }>;
  /** The real count, from a refused deactivate or offboard. */
  openTickets?: number;
  acknowledged?: number;
  /** Legal source statuses, from a lifecycle refusal. */
  allowedFrom?: string[];
  /** Permissions the caller lacks, from a 403. */
  required?: string[] | string;
  /** Clocks running against an OLA policy whose ladder was edited. */
  liveInstances?: number;
  /** Tickets pinning a published workflow version. */
  ticketCount?: number;
  /** Failed workflow validation codes, from a refused publish. */
  failed?: string[];
  /** Per-field messages from a 422. */
  [key: string]: unknown;
}

/**
 * @param error anything a mutation or query rejected with
 * @returns the typed `details` object, or null when there is none
 */
const detailsOf = (error: HelpdeskApiError): KnownDetails | null => {
  const details = error.details;
  return details && typeof details === "object" ? (details as KnownDetails) : null;
};

interface ApiErrorNoticeProps {
  error: unknown;
  /** Prefix for the headline, e.g. "This department could not go live". */
  title?: string;
  className?: string;
}

export function ApiErrorNotice({ error, title, className }: ApiErrorNoticeProps) {
  if (!error) return null;

  if (!isHelpdeskApiError(error)) {
    return (
      <div
        className={`rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive ${className ?? ""}`}
      >
        {(error as Error)?.message ?? "Something went wrong."}
      </div>
    );
  }

  const details = detailsOf(error);
  const isStale = error.code === PG_ERROR_CODE.CONCURRENT_MODIFICATION;
  const needsPrecondition = error.code === PG_ERROR_CODE.PRECONDITION_REQUIRED;

  return (
    <div
      className={`rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive ${className ?? ""}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="min-w-0 space-y-2">
          {title && <p className="font-medium">{title}</p>}
          <p>{error.message}</p>

          {/* A stale token is not a failure to explain — it is a reload to offer. */}
          {isStale && (
            <p className="text-xs">
              Someone else changed this while the form was open. Reload the
              record and re-apply your edit.
            </p>
          )}

          {needsPrecondition && (
            <p className="text-xs">
              This record was loaded without its concurrency token. Reload the
              screen before saving.
            </p>
          )}

          {details?.blocking && details.blocking.length > 0 && (
            <div>
              <p className="text-xs font-medium">Blocking checks</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {details.blocking.map((code) => (
                  <li key={code} className="font-mono">
                    {code}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {details?.failed && details.failed.length > 0 && (
            <div>
              <p className="text-xs font-medium">Failed validation</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {details.failed.map((code) => (
                  <li key={code} className="font-mono">
                    {code}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {details?.dependents && details.dependents.length > 0 && (
            <div>
              <p className="text-xs font-medium">Retire these first</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {details.dependents.map((dep) => (
                  <li key={`${dep.entity_type}-${dep.id}`}>
                    <span className="font-medium">
                      {dep.name ?? dep.entity_type}
                    </span>
                    {dep.version_no !== null && ` v${dep.version_no}`}
                    <span className="text-destructive/70">
                      {" "}
                      — scoped on {dep.scope}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {typeof details?.openTickets === "number" && (
            <p className="text-xs">
              The live count is <strong>{details.openTickets}</strong>
              {typeof details.acknowledged === "number" &&
                ` — this request acknowledged ${details.acknowledged}`}
              . Confirm that number to continue.
            </p>
          )}

          {details?.allowedFrom && (
            <p className="text-xs">
              Allowed from: {(details.allowedFrom as string[]).join(", ")}
            </p>
          )}

          {typeof details?.liveInstances === "number" && (
            <p className="text-xs">
              {details.liveInstances} clock(s) are running against this policy.
              Supersede it instead — the ladder is cloned onto the new version.
            </p>
          )}

          {typeof details?.ticketCount === "number" && (
            <p className="text-xs">
              {details.ticketCount} ticket(s) pin this version. Create a new
              version, edit that, then publish.
            </p>
          )}

          {details?.required && (
            <p className="text-xs">
              Requires:{" "}
              <span className="font-mono">
                {Array.isArray(details.required)
                  ? details.required.join(", ")
                  : details.required}
              </span>
            </p>
          )}

          {/* Ties the failure to the server's log line — quote it in a bug report. */}
          {error.requestId && (
            <p className="text-xs text-destructive/60">
              Request {error.requestId}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
