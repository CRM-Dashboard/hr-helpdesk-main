/**
 * Establishes the helpdesk session on mount.
 *
 * The API has no login endpoint: identity is a request header, and `GET
 * /auth/me` is what confirms the handoff worked and hands back the role, the
 * permissions and the department's workflow vocabulary.
 */
import { useMemo, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getHelpdeskIdentityEmail,
  setHelpdeskIdentityEmail,
} from "@/services/helpdeskIdentity";
import { useMe } from "../hooks/pg";
import { helpdeskKeys } from "../hooks/pg/queryKeys";
import { AGENT_ROLES, type WorkflowState } from "../types/pg";
import {
  HelpdeskAuthContext,
  type HelpdeskAuthValue,
} from "./helpdeskAuthContext";

export function HelpdeskAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useMe();

  const value = useMemo<HelpdeskAuthValue>(() => {
    const user = data?.user ?? null;
    const workflowStates = data?.workflowStates ?? [];
    const statesByCode = workflowStates.reduce<Record<string, WorkflowState>>(
      (acc, state) => {
        acc[state.code] = state;
        return acc;
      },
      {},
    );
    const permissions = new Set(user?.permissions ?? []);

    return {
      user,
      authMode: data?.authMode ?? null,
      workflowStates,
      statesByCode,
      identityEmail: getHelpdeskIdentityEmail(),
      isLoading,
      error: (error as Error) ?? null,
      isAuthenticated: Boolean(user),
      hasDepartment: Boolean(user?.departmentId),
      isAgent: Boolean(user && AGENT_ROLES.includes(user.roleCode)),
      hasPermission: (code: string) => permissions.has(code),
      signInAs: (email: string) => {
        setHelpdeskIdentityEmail(email);
        // Unread counters and the state vocabulary are per user — drop it all.
        queryClient.removeQueries({ queryKey: helpdeskKeys.all });
      },
      refresh: () => {
        void refetch();
      },
    };
  }, [data, isLoading, error, refetch, queryClient]);

  return (
    <HelpdeskAuthContext.Provider value={value}>
      {children}
    </HelpdeskAuthContext.Provider>
  );
}
