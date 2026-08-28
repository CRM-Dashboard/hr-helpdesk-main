/** Identity queries against the PostgreSQL helpdesk API. */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getHealth, getMe } from "../../api/pg";
import type { HealthResponse, MeResponse } from "../../types/pg";
import { helpdeskKeys } from "./queryKeys";

/**
 * Establishes and caches the caller's identity. The workflow vocabulary it
 * carries is session-lived — it changes only when an administrator publishes a
 * new workflow version — so it is not refetched on window focus.
 *
 * @returns the standard query result over the `/auth/me` payload
 */
export const useMe = (): UseQueryResult<MeResponse, Error> =>
  useQuery({
    queryKey: helpdeskKeys.me(),
    queryFn: getMe,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

/**
 * Anonymous boot probe. Disabled by default — enable it only for a status
 * widget, and never poll it hard: it counts against the global rate limit.
 *
 * @param enabled whether to run the probe
 * @returns the standard query result over the `/health` payload
 */
export const useHelpdeskHealth = (
  enabled = false,
): UseQueryResult<HealthResponse, Error> =>
  useQuery({
    queryKey: [...helpdeskKeys.all, "health"],
    queryFn: getHealth,
    enabled,
    staleTime: 60_000,
  });
