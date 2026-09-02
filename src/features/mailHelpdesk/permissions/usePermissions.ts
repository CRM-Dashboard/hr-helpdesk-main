/**
 * The permission check every admin screen branches on.
 *
 * Reads the array `GET /auth/me` returned — which the backend calls the
 * authoritative source — rather than inferring anything from `roleCode`. The
 * seeded grants make the two look interchangeable and they are not: a role's
 * grant set is data, and a deployment that regrants `DEPT_HEAD` would silently
 * break every `roleCode === "DEPT_HEAD"` branch in the UI while `/auth/me` kept
 * telling the truth.
 *
 * `any` mirrors the server: `requirePermission(a, b)` is any-of, not all-of.
 */
import { useMemo } from "react";
import { useHelpdeskAuth } from "../context/helpdeskAuthContext";
import type { HelpdeskPermission } from "./catalogue";

export interface PermissionSet {
  /** Every code the signed-in user holds. Empty for an `EMPLOYEE`. */
  codes: string[];
  /** True once `/auth/me` has answered — checks before that are all false. */
  isReady: boolean;

  /** @returns whether the user holds this exact code. */
  has: (code: HelpdeskPermission) => boolean;
  /** @returns whether the user holds **at least one**, matching `requirePermission`. */
  any: (...codes: HelpdeskPermission[]) => boolean;
  /** @returns whether the user holds **all** of them. */
  all: (...codes: HelpdeskPermission[]) => boolean;
  /** True when the user holds no helpdesk permission at all — no admin area to show. */
  isEmpty: boolean;
}

/**
 * @returns the signed-in user's permission set and the predicates over it
 */
export const usePermissions = (): PermissionSet => {
  const { user, isLoading } = useHelpdeskAuth();

  return useMemo(() => {
    const codes = user?.permissions ?? [];
    const held = new Set(codes);
    const has = (code: HelpdeskPermission) => held.has(code);

    return {
      codes,
      isReady: !isLoading && Boolean(user),
      has,
      any: (...wanted: HelpdeskPermission[]) => wanted.some(has),
      all: (...wanted: HelpdeskPermission[]) => wanted.every(has),
      isEmpty: codes.length === 0,
    };
  }, [user, isLoading]);
};
