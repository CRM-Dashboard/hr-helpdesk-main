/**
 * Fetches the controlled vocabularies once, at bootstrap, and holds them for the
 * session.
 *
 * It sits under `<HelpdeskAuthProvider>` because the call is gated on
 * `helpdesk.department.read` — a permission that only `/auth/me` can report. An
 * `EMPLOYEE` holds none, so for them nothing is fetched and `isAvailable` is
 * false; there is no admin surface for them to render anyway.
 *
 * Fetching here rather than per screen is not premature: the whole `/admin/*`
 * router shares one 60-request-per-minute budget per user, and a configuration
 * dashboard that re-read the vocabularies on each of eleven screens would spend a
 * fifth of that budget restating a CHECK constraint.
 */
import { useMemo, type ReactNode } from "react";
import { useMetaEnums } from "../hooks/pg";
import { HELPDESK_PERMISSION, usePermissions } from "../permissions";
import {
  HelpdeskMetaContext,
  type HelpdeskMetaValue,
} from "./helpdeskMetaContext";

export function HelpdeskMetaProvider({ children }: { children: ReactNode }) {
  const { has, isReady } = usePermissions();
  const isAvailable = isReady && has(HELPDESK_PERMISSION.DEPARTMENT_READ);

  const { data, isLoading, error } = useMetaEnums();

  const value = useMemo<HelpdeskMetaValue>(() => {
    const vocabularies = data?.vocabularies ?? {};
    const conventions = data?.conventions ?? null;

    return {
      vocabularies,
      conventions,
      isLoading: isAvailable && isLoading,
      error: (error as Error) ?? null,
      isAvailable,
      // Keys and values are identical in every vocabulary, so either side builds
      // the dropdown; values are what the API accepts back.
      options: (name: string) => Object.values(vocabularies[name] ?? {}),
      // Default to the live convention (higher rank = more urgent) so a screen
      // rendered before the fetch lands is not sorted backwards.
      sortSeverityDescending:
        conventions?.severityRank?.sortForMostUrgentFirst !== "ASC",
    };
  }, [data, isLoading, error, isAvailable]);

  return (
    <HelpdeskMetaContext.Provider value={value}>
      {children}
    </HelpdeskMetaContext.Provider>
  );
}
