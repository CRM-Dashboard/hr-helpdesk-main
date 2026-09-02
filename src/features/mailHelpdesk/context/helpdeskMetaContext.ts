/**
 * The controlled vocabularies, resolved once per session.
 *
 * `GET /admin/meta/enums` is served from the same module that mirrors the
 * database CHECK constraints, so a widened constraint reaches the UI without a
 * frontend deploy. Building a dropdown from a hardcoded list instead is how a
 * form quietly stops offering a value the database has accepted for months.
 *
 * Context and hook live here rather than beside the provider so the provider file
 * exports only a component (React Fast Refresh).
 */
import { createContext, useContext } from "react";
import type { MetaConventions, Vocabulary } from "../types/pg";

export interface HelpdeskMetaValue {
  /** Every vocabulary, keyed by name. Empty until the fetch resolves. */
  vocabularies: Record<string, Vocabulary>;
  /** Facts a CHECK constraint cannot express — today, the severity sort direction. */
  conventions: MetaConventions | null;

  isLoading: boolean;
  error: Error | null;
  /** False when the user lacks `helpdesk.department.read`, so nothing was fetched. */
  isAvailable: boolean;

  /**
   * @param name a vocabulary name, e.g. `"featureCode"`
   * @returns its values as a list, or `[]` when the vocabulary is not loaded
   */
  options: (name: string) => string[];

  /**
   * Whether a priority list should be sorted descending for "most urgent first".
   * Read from `conventions`, never assumed: guessing wrong ranks the calmest
   * ticket as the most urgent one, and the stale migration comment says the
   * opposite of the live seed.
   */
  sortSeverityDescending: boolean;
}

export const HelpdeskMetaContext = createContext<HelpdeskMetaValue | null>(null);

/**
 * Reads the session's controlled vocabularies.
 *
 * @returns the vocabularies, the conventions and the `options` helper
 * @throws when called outside `<HelpdeskMetaProvider>`
 */
export const useHelpdeskMeta = (): HelpdeskMetaValue => {
  const value = useContext(HelpdeskMetaContext);
  if (!value) {
    throw new Error("useHelpdeskMeta must be used inside <HelpdeskMetaProvider>");
  }
  return value;
};
