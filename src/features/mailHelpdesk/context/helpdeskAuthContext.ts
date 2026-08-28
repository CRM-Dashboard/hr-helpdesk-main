/**
 * Session identity for the PostgreSQL helpdesk.
 *
 * Context and hook live here rather than beside the provider component so the
 * provider file exports only a component (React Fast Refresh).
 */
import { createContext, useContext } from "react";
import type {
  AuthMode,
  HelpdeskUser,
  WorkflowState,
} from "../types/pg";

export interface HelpdeskAuthValue {
  /** null until `/auth/me` resolves, or when it failed. */
  user: HelpdeskUser | null;
  /** Which identity path the backend is running. Useful in dev. */
  authMode: AuthMode | null;
  /** The department's state vocabulary. The only source is `/auth/me`. */
  workflowStates: WorkflowState[];
  /** The same states keyed by `code`, for rendering a ticket's state. */
  statesByCode: Record<string, WorkflowState>;
  /** The address currently sent as `x-user-email`. */
  identityEmail: string;

  isLoading: boolean;
  /** The failure from `/auth/me`, typed as HelpdeskApiError when it came from the API. */
  error: Error | null;
  /** True once `/auth/me` has answered with a user. */
  isAuthenticated: boolean;
  /** False when the account is attached to no department — every /tickets call 403s. */
  hasDepartment: boolean;
  /** True for the five roles the API lets write to a ticket. */
  isAgent: boolean;

  /**
   * @param code a `helpdesk.*` permission code
   * @returns whether the signed-in user holds it
   */
  hasPermission: (code: string) => boolean;

  /**
   * Swaps the acting user and drops every cached query — unread counters and
   * the workflow vocabulary are per user.
   *
   * @param email the address to send as `x-user-email`
   */
  signInAs: (email: string) => void;

  /** Re-runs `/auth/me`. */
  refresh: () => void;
}

export const HelpdeskAuthContext = createContext<HelpdeskAuthValue | null>(null);

/**
 * Reads the helpdesk session.
 *
 * @returns the identity, workflow vocabulary and permission helpers
 * @throws when called outside `<HelpdeskAuthProvider>`
 */
export const useHelpdeskAuth = (): HelpdeskAuthValue => {
  const value = useContext(HelpdeskAuthContext);
  if (!value) {
    throw new Error("useHelpdeskAuth must be used inside <HelpdeskAuthProvider>");
  }
  return value;
};
