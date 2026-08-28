/**
 * Identity against the PostgreSQL helpdesk API.
 *
 * There is no `POST /auth/login`, no refresh grant and no logout: the module
 * issues no tokens. "Logging in" is establishing the identity header and
 * confirming it with `GET /auth/me`.
 */
import { PG_ENDPOINT } from "@/services/endPoints";
import { pgRequest } from "@/services/pgClient";
import type { HealthResponse, MeResponse } from "../../types/pg";

/**
 * Who am I, according to the helpdesk? Call once on mount.
 *
 * Returns the role, department, permission list and the department's workflow
 * state vocabulary — the only place `workflowStates` is published. Cache it.
 *
 * @returns the identity payload
 * @throws {HelpdeskApiError} 401 when the identity header is missing or unknown,
 *   403 when the account is not ACTIVE
 */
export const getMe = async (): Promise<MeResponse> => {
  const { data } = await pgRequest<MeResponse>({
    method: "GET",
    url: PG_ENDPOINT.ME,
  });
  return data;
};

/**
 * Anonymous liveness plus schema check. Optional boot probe — do not poll it,
 * it counts against the global rate limit.
 *
 * @returns database name, schema, table count and latency
 */
export const getHealth = async (): Promise<HealthResponse> => {
  const { data } = await pgRequest<HealthResponse>({
    method: "GET",
    url: PG_ENDPOINT.HEALTH,
  });
  return data;
};
