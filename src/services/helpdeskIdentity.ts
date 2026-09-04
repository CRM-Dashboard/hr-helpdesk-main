/**
 * Identity handoff for the PostgreSQL helpdesk API.
 *
 * The API issues no tokens and has no `POST /auth/login`: identity is
 * established per request from a header, and which header depends on the
 * server's `HELPDESK_AUTH_MODE`.
 *
 *   header mode -> `x-user-email: <address>`   (interim, non-production)
 *   jwt mode    -> `Authorization: Bearer <t>` (token comes from the host shell)
 *
 * A Bearer header always wins server-side, so `pgClient` sends the token when
 * one is present and falls back to the email header otherwise.
 */

/** Header name the backend reads in `header` auth mode. */
export const HELPDESK_EMAIL_HEADER = "x-user-email";

/**
 * INTERIM: the acting user is hardcoded until the host shell hands us a real
 * identity. Override per environment with `VITE_HELPDESK_USER_EMAIL`, or at
 * runtime with `setHelpdeskIdentityEmail()`.
 */
const DEFAULT_IDENTITY_EMAIL = "dev.superadmin@gera.in"; // "samrat.guha@gera.in"; // "manish.pandey@gera.in"; //

let identityEmail: string =
  import.meta.env.VITE_HELPDESK_USER_EMAIL || DEFAULT_IDENTITY_EMAIL;

/** In memory only — never sessionStorage. Empty until the host shell sets it. */
let accessToken: string | null = null;

/** @returns the email address sent as `x-user-email`. */
export const getHelpdeskIdentityEmail = (): string => identityEmail;

/**
 * Swaps the acting user. Callers must invalidate every cached query
 * afterwards — unread counters and the workflow vocabulary are per user.
 *
 * @param email a single trimmed address; the API rejects anything else with 401
 */
export const setHelpdeskIdentityEmail = (email: string): void => {
  identityEmail = email.trim();
};

/** @returns the bearer token for `jwt` auth mode, or null in header mode. */
export const getHelpdeskAccessToken = (): string | null => accessToken;

/**
 * Stores the host application's token for `jwt` auth mode.
 *
 * @param token the JWT, or null to fall back to header mode
 */
export const setHelpdeskAccessToken = (token: string | null): void => {
  accessToken = token;
};
