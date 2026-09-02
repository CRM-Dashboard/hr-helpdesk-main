/**
 * Client for the PostgreSQL-backed helpdesk API (`/api/helpdesk`).
 *
 * One place attaches identity, one place unwraps the envelope, one place turns
 * a failure into a typed `HelpdeskApiError`. Callers get `data` / `meta` and
 * never see the transport.
 */
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import {
  HELPDESK_EMAIL_HEADER,
  getHelpdeskAccessToken,
  getHelpdeskIdentityEmail,
} from "./helpdeskIdentity";

export const PG_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

/** Success envelope. `meta` is present only on the paginated endpoints. */
export interface PgEnvelope<T> {
  success: true;
  message: string;
  data: T;
  meta?: PgPageMeta;
}

/** Error envelope. `code` is what to branch on — never `message`. */
export interface PgErrorEnvelope {
  success: false;
  message: string;
  code?: string;
  details?: unknown;
}

export interface PgPageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** What every call in `api/pg/*` returns. */
export interface PgResult<T> {
  data: T;
  meta?: PgPageMeta;
  /** Correlates the server's audit rows — quote it in any bug report. */
  requestId?: string;
  /** Concurrency token for the admin configuration endpoints. */
  etag?: string;
}

/** `code` values the API actually raises. Branch on these, never on `message`. */
export const PG_ERROR_CODE = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  FEATURE_DISABLED: "FEATURE_DISABLED",
  CROSS_DEPARTMENT: "CROSS_DEPARTMENT",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  CONCURRENT_MODIFICATION: "CONCURRENT_MODIFICATION",
  ILLEGAL_TRANSITION: "ILLEGAL_TRANSITION",
  COLLABORATION_THREAD_TAKEN: "COLLABORATION_THREAD_TAKEN",
  COLLABORATION_THREAD_BOUND: "COLLABORATION_THREAD_BOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PRECONDITION_REQUIRED: "PRECONDITION_REQUIRED",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type PgErrorCode =
  (typeof PG_ERROR_CODE)[keyof typeof PG_ERROR_CODE] | (string & {});

/**
 * A failed helpdesk call. `message` on a 4xx is written for a user — show it.
 * On a 500 show a generic message plus `requestId`.
 */
export class HelpdeskApiError extends Error {
  readonly status: number;
  readonly code?: PgErrorCode;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(init: {
    status: number;
    message: string;
    code?: string;
    details?: unknown;
    requestId?: string;
  }) {
    super(init.message);
    this.name = "HelpdeskApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
  }

  /** True when the server refused a state change because someone else wrote first. */
  get isStale(): boolean {
    return this.code === PG_ERROR_CODE.CONCURRENT_MODIFICATION;
  }
}

export const isHelpdeskApiError = (e: unknown): e is HelpdeskApiError =>
  e instanceof HelpdeskApiError;

/**
 * Pulls the `{ field: messages }` map out of a 422 so it can be bound to a form.
 *
 * @param error anything thrown by a `pg*` call
 * @returns field name -> first message, or null when this is not a 422
 */
export const getFieldErrors = (
  error: unknown,
): Record<string, string> | null => {
  if (!isHelpdeskApiError(error)) return null;
  if (error.code !== PG_ERROR_CODE.VALIDATION_ERROR) return null;
  const details = error.details;
  if (!details || typeof details !== "object") return null;

  const fields: Record<string, string> = {};
  for (const [field, messages] of Object.entries(
    details as Record<string, unknown>,
  )) {
    fields[field] = Array.isArray(messages)
      ? String(messages[0])
      : String(messages);
  }
  return fields;
};

export const pgClient = axios.create({
  baseURL: PG_BASE_URL,
  headers: { Accept: "application/json" },
  // The API authenticates on a header and sets `credentials: false` in CORS.
  withCredentials: false,
});

// --- authentication interceptor -------------------------------------------
pgClient.interceptors.request.use((config) => {
  const token = getHelpdeskAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  } else {
    config.headers.set(HELPDESK_EMAIL_HEADER, getHelpdeskIdentityEmail());
  }
  return config;
});

// --- error interceptor ----------------------------------------------------
pgClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<PgErrorEnvelope>) => Promise.reject(toHelpdeskError(error)),
);

/**
 * Maps an axios failure onto the API's error envelope.
 *
 * @param error the rejection axios produced
 * @returns a typed error carrying `status`, `code`, `details` and `requestId`
 */
function toHelpdeskError(error: AxiosError<PgErrorEnvelope>): HelpdeskApiError {
  const response = error.response;
  const requestId = headerOf(response, "x-request-id");

  if (!response) {
    return new HelpdeskApiError({
      status: 0,
      message:
        error.code === "ECONNABORTED"
          ? "The helpdesk did not respond in time."
          : "Cannot reach the helpdesk service.",
      code: PG_ERROR_CODE.SERVICE_UNAVAILABLE,
      requestId,
    });
  }

  const payload = response.data;
  return new HelpdeskApiError({
    status: response.status,
    message: payload?.message || `HTTP ${response.status}`,
    code: payload?.code,
    details: payload?.details,
    requestId,
  });
}

/**
 * Reads a response header case-insensitively.
 *
 * @param response the axios response, possibly absent on a network failure
 * @param name header name
 * @returns the header value, or undefined
 */
function headerOf(
  response: AxiosResponse | undefined,
  name: string,
): string | undefined {
  const raw = response?.headers?.[name] ?? response?.headers?.[name.toLowerCase()];
  return raw === undefined || raw === null ? undefined : String(raw);
}

/**
 * Issues one request and unwraps the envelope.
 *
 * @param config axios config; `url` must be a full path from PG_ENDPOINT
 * @returns `data`, plus `meta` on paginated endpoints and the correlation ids
 * @throws {HelpdeskApiError} on any non-2xx, or when the envelope says failure
 */
export async function pgRequest<T>(
  config: AxiosRequestConfig,
): Promise<PgResult<T>> {
  const response = await pgClient.request<PgEnvelope<T>>(config);
  const requestId = headerOf(response, "x-request-id");
  const etag = headerOf(response, "etag");
  const payload = response.data;

  if (!payload?.success) {
    throw new HelpdeskApiError({
      status: response.status,
      message:
        (payload as unknown as PgErrorEnvelope)?.message ||
        "The helpdesk returned an unexpected response.",
      code: (payload as unknown as PgErrorEnvelope)?.code,
      details: (payload as unknown as PgErrorEnvelope)?.details,
      requestId,
    });
  }

  return { data: payload.data, meta: payload.meta, requestId, etag };
}

/**
 * Builds a query string. Repeats the key for array values
 * (`?state=NEW&state=IN_PROGRESS`) and keeps `false`, which the API reads as a
 * real filter value rather than an absent one.
 *
 * Takes a plain `object` rather than `Record<string, unknown>` so a typed filter
 * interface can be passed directly — an interface has no index signature, and
 * requiring one would mean a cast at every call site.
 *
 * @param params filter object; `undefined`, `null` and `""` entries are dropped
 * @returns "?a=1&b=2", or "" when nothing survives
 */
export const pgQuery = (params?: object): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      value
        .filter((v) => v !== undefined && v !== null && v !== "")
        .forEach((v) => search.append(key, String(v)));
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
};

export default pgClient;
