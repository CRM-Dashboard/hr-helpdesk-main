/**
 * Out of office, department-wide.
 *
 * Same six verbs and same service as the self-service surface in `outOfOffice.ts`,
 * with two deltas that matter to a caller: whose leave it is comes from a `userId`
 * body field, and **there is no ownership check** — any record in the department is
 * reachable, which is what makes cancelling cover for somebody who has already
 * left possible at all.
 *
 * This is the one admin resource with **no concurrency token anywhere**: the table
 * carries `created_at` only, so never send `If-Match` and never expect one back.
 */
import { PG_ENDPOINT, pgPath } from "@/services/endPoints";
import { pgQuery, pgRequest } from "@/services/pgClient";
import type {
  ActivateOutOfOfficeResult,
  AdminCreateOutOfOfficePayload,
  AdminOutOfOfficeFilters,
  CancelOutOfOfficePayload,
  CancelOutOfOfficeResult,
  CreateOutOfOfficeResult,
  OutOfOfficeListRow,
  OutOfOfficeRecord,
  ReplaceOutOfOfficePayload,
  ReplaceOutOfOfficeResult,
} from "../../types/pg";
import type { AdminPage } from "./adminShared";

/**
 * Every cover arrangement in the department — the view that answers "who is away
 * next week". Cancelled rows are excluded unless asked for.
 *
 * @param departmentId the department
 * @param filters `userId`, `delegateId`, `activeOnly`, `includeCancelled`, paging
 * @returns the page of rows, each with a server-computed `status`
 */
export const listDepartmentOutOfOffice = async (
  departmentId: string,
  filters?: AdminOutOfOfficeFilters,
): Promise<AdminPage<OutOfOfficeListRow>> => {
  const { data, meta } = await pgRequest<OutOfOfficeListRow[]>({
    method: "GET",
    url: `${pgPath(PG_ENDPOINT.ADMIN_OOO, { departmentId })}${pgQuery(filters)}`,
  });
  return { rows: data, meta };
};

/**
 * Files leave for somebody else.
 *
 * @param departmentId the department
 * @param payload the self-service body plus the required `userId`
 * @returns the record, how many tickets moved now, and an advisory `warning` when
 *   the chosen delegate is themselves away
 * @throws {HelpdeskApiError} 403 FEATURE_DISABLED when `OOO_DELEGATION` is off
 */
export const createDepartmentOutOfOffice = async (
  departmentId: string,
  payload: AdminCreateOutOfOfficePayload,
): Promise<CreateOutOfOfficeResult> => {
  const { data } = await pgRequest<CreateOutOfOfficeResult>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_OOO, { departmentId }),
    data: payload,
  });
  return data;
};

/**
 * @param departmentId the department
 * @param id the record
 * @returns the record, with both people's eligibility resolved
 */
export const getDepartmentOutOfOffice = async (
  departmentId: string,
  id: string,
): Promise<OutOfOfficeRecord> => {
  const { data } = await pgRequest<OutOfOfficeRecord>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_OOO_DETAIL, { departmentId, id }),
  });
  return data;
};

/**
 * Turns a MANUAL window on. Not feature-gated: a department that switches
 * `OOO_DELEGATION` off must still be able to run the windows it already has.
 *
 * @param departmentId the department
 * @param id the record
 * @returns the record and the sweep count
 */
export const activateDepartmentOutOfOffice = async (
  departmentId: string,
  id: string,
): Promise<ActivateOutOfOfficeResult> => {
  const { data } = await pgRequest<ActivateOutOfOfficeResult>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_OOO_ACTIVATE, { departmentId, id }),
    data: {},
  });
  return data;
};

/**
 * Ends a window early. This is how cover is cancelled for someone who has left.
 *
 * @param departmentId the department
 * @param id the record
 * @param payload `mode` decides whether delegated tickets come home
 * @returns the record, the revert count, and the mode actually applied — read it
 *   rather than assuming the RETURNED default
 */
export const cancelDepartmentOutOfOffice = async (
  departmentId: string,
  id: string,
  payload?: CancelOutOfOfficePayload,
): Promise<CancelOutOfOfficeResult> => {
  const { data } = await pgRequest<CancelOutOfOfficeResult>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_OOO_CANCEL, { departmentId, id }),
    data: payload ?? {},
  });
  return data;
};

/**
 * Swaps the delegate. This is the edit verb — there is no PATCH.
 *
 * @param departmentId the department
 * @param id the record being handed over
 * @param payload the new delegate, plus anything to override
 * @returns the **successor**, with a new id, and the id it replaced
 */
export const replaceDepartmentOutOfOffice = async (
  departmentId: string,
  id: string,
  payload: ReplaceOutOfOfficePayload,
): Promise<ReplaceOutOfOfficeResult> => {
  const { data } = await pgRequest<ReplaceOutOfOfficeResult>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_OOO_REPLACE, { departmentId, id }),
    data: payload,
  });
  return data;
};
