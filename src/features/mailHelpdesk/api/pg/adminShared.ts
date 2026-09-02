/**
 * Shared plumbing for the admin configuration calls.
 *
 * Configuration tables have no `version` column, so `updated_at` is the
 * concurrency token, exposed as an ETag. Every mutating admin verb except the
 * out-of-office family and three deliberate exceptions requires it as `If-Match`;
 * a missing header is refused with 428 and never treated as "overwrite".
 */
import type { PgPageMeta } from "@/services/pgClient";

/**
 * Builds the `If-Match` header for a configuration write.
 *
 * The token is `extract(epoch FROM updated_at)` — a decimal string. Every
 * ETag-bearing row also carries it as an `etag` field, so read it from the row
 * rather than from the response header.
 *
 * @param etag the `etag` field of the row being written
 * @returns headers to merge into the request config
 * @throws when the row carried no token — sending the request would earn a 428
 *   round trip to learn what the caller already knew
 */
export const ifMatch = (etag: string | undefined | null): Record<string, string> => {
  if (!etag) {
    throw new Error(
      "This row carries no ETag, so it cannot be modified — re-read it first.",
    );
  }
  return { "If-Match": etag };
};

/** A paginated admin list. */
export interface AdminPage<T> {
  rows: T[];
  meta?: PgPageMeta;
}
