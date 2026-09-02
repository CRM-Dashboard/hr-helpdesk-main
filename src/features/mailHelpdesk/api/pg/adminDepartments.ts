/**
 * Admin — meta vocabularies, departments, settings and features.
 *
 * The whole `/admin/*` router shares one 60-request-per-minute budget per user,
 * GETs included. Fetch `/admin/meta/enums` once at bootstrap; load everything
 * else when its screen opens.
 */
import { PG_ENDPOINT, pgPath } from "@/services/endPoints";
import { pgQuery, pgRequest } from "@/services/pgClient";
import type {
  CreateDepartmentBody,
  CreateFeatureBody,
  DeactivateDepartmentBody,
  DepartmentListFilters,
  DepartmentRow,
  DepartmentSettingsRow,
  FeatureCode,
  FeatureRow,
  MetaEnumsResponse,
  ReadinessResponse,
  UpdateDepartmentBody,
  UpdateFeatureBody,
  UpdateSettingsBody,
} from "../../types/pg";
import { ifMatch, type AdminPage } from "./adminShared";

// --- meta ------------------------------------------------------------------

/**
 * Every controlled vocabulary the admin UI needs, plus `conventions` — facts a
 * CHECK constraint cannot express, today the `severityRank` sort direction.
 *
 * Use this instead of hardcoding enum lists: a widened CHECK then reaches the UI
 * with no frontend deploy.
 *
 * @returns the vocabularies and conventions
 * @throws {HelpdeskApiError} 403 without `helpdesk.department.read`
 */
export const getMetaEnums = async (): Promise<MetaEnumsResponse> => {
  const { data } = await pgRequest<MetaEnumsResponse>({
    method: "GET",
    url: PG_ENDPOINT.ADMIN_META_ENUMS,
  });
  return data;
};

// --- departments -----------------------------------------------------------

/**
 * Lists departments. DRAFT, READY, ACTIVE and INACTIVE all come back — lifecycle
 * decides whether a department is operational, not whether it may be seen.
 *
 * A `SUPER_ADMIN` sees every department; anyone else sees exactly their own, so
 * this doubles as the department switcher and as the single-row header source.
 *
 * @param filters status, search and paging
 * @returns the page of rows, each carrying its own `etag`
 */
export const listDepartments = async (
  filters?: DepartmentListFilters,
): Promise<AdminPage<DepartmentRow>> => {
  const { data, meta } = await pgRequest<DepartmentRow[]>({
    method: "GET",
    url: `${PG_ENDPOINT.ADMIN_DEPARTMENTS}${pgQuery(filters)}`,
  });
  return { rows: data, meta };
};

/**
 * @param departmentId the department to read
 * @returns the row, with the `etag` needed to modify it
 */
export const getDepartment = async (
  departmentId: string,
): Promise<DepartmentRow> => {
  const { data } = await pgRequest<DepartmentRow>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_DEPARTMENT, { departmentId }),
  });
  return data;
};

/**
 * Creates a department. Always lands in `DRAFT`, and creates its settings row in
 * the same transaction — which is what lets every later PATCH assume a row.
 *
 * @param body code, name and optional mailbox / parent
 * @returns the new department
 * @throws {HelpdeskApiError} 409 CONFLICT when the code is taken
 */
export const createDepartment = async (
  body: CreateDepartmentBody,
): Promise<DepartmentRow> => {
  const { data } = await pgRequest<DepartmentRow>({
    method: "POST",
    url: PG_ENDPOINT.ADMIN_DEPARTMENTS,
    data: body,
  });
  return data;
};

/**
 * Edits a department. Readiness is re-evaluated afterwards and a DRAFT ⇄ READY
 * move may happen on its own, so re-read readiness after this returns.
 *
 * @param departmentId the department
 * @param body only the changed fields; `code` and `status` are refused with 422
 * @param etag the row's current token
 * @returns the updated row with a fresh `etag`
 * @throws {HelpdeskApiError} 409 CONCURRENT_MODIFICATION when the token is stale
 */
export const updateDepartment = async (
  departmentId: string,
  body: UpdateDepartmentBody,
  etag: string,
): Promise<DepartmentRow> => {
  const { data } = await pgRequest<DepartmentRow>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.ADMIN_DEPARTMENT, { departmentId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * The go-live checklist. Always 200 — "not ready" is the answer, not an error.
 *
 * @param departmentId the department
 * @returns every check, passed and failed, so the UI renders a checklist
 */
export const getDepartmentReadiness = async (
  departmentId: string,
): Promise<ReadinessResponse> => {
  const { data } = await pgRequest<ReadinessResponse>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_DEPARTMENT_READINESS, { departmentId }),
  });
  return data;
};

/**
 * Takes a department live. Readiness is re-checked inside the transaction rather
 * than trusting the stored status.
 *
 * @param departmentId the department
 * @param etag the row's current token
 * @returns the row, now ACTIVE
 * @throws {HelpdeskApiError} 409 CONFLICT carrying `details.blocking` — the list
 *   of failed checks, which is the answer the user is actually asking for
 */
export const activateDepartment = async (
  departmentId: string,
  etag: string,
): Promise<DepartmentRow> => {
  const { data } = await pgRequest<DepartmentRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_DEPARTMENT_ACTIVATE, { departmentId }),
    data: {},
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * Takes a department out of service. Touches no ticket: existing work stays
 * workable and OLA clocks keep running.
 *
 * @param departmentId the department
 * @param body `acknowledgeOpenTickets` must equal the live count
 * @param etag the row's current token
 * @returns the row, now INACTIVE, with `deactivation_reason` echoed back
 * @throws {HelpdeskApiError} 409 CONFLICT on a count mismatch, carrying the real
 *   number in `details.openTickets` — show it and let the administrator confirm
 */
export const deactivateDepartment = async (
  departmentId: string,
  body: DeactivateDepartmentBody,
  etag: string,
): Promise<DepartmentRow> => {
  const { data } = await pgRequest<DepartmentRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_DEPARTMENT_DEACTIVATE, { departmentId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

// --- settings --------------------------------------------------------------

/**
 * @param departmentId the department
 * @returns the behavioural settings row, with its `etag`
 * @throws {HelpdeskApiError} 404 when the row predates this API — offer
 *   `createDepartmentSettings` rather than surfacing the error
 */
export const getDepartmentSettings = async (
  departmentId: string,
): Promise<DepartmentSettingsRow> => {
  const { data } = await pgRequest<DepartmentSettingsRow>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_SETTINGS, { departmentId }),
  });
  return data;
};

/**
 * Creates the settings row from schema defaults. Recovery path only — a
 * department created through this API already has one.
 *
 * @param departmentId the department
 * @returns the new settings row
 */
export const createDepartmentSettings = async (
  departmentId: string,
): Promise<DepartmentSettingsRow> => {
  const { data } = await pgRequest<DepartmentSettingsRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_SETTINGS, { departmentId }),
    data: {},
  });
  return data;
};

/**
 * Changes settings. The coherence rules run against the **merged** row, so
 * `{ autoCloseWarningDays: 5 }` alone can be refused for disagreeing with a
 * stored `autoCloseDays` the body never mentioned.
 *
 * @param departmentId the department
 * @param body only the changed fields
 * @param etag the row's current token
 * @returns the full settings row with a fresh `etag`
 */
export const updateDepartmentSettings = async (
  departmentId: string,
  body: UpdateSettingsBody,
  etag: string,
): Promise<DepartmentSettingsRow> => {
  const { data } = await pgRequest<DepartmentSettingsRow>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.ADMIN_SETTINGS, { departmentId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

// --- features --------------------------------------------------------------

/**
 * Every feature row **plus the codes that have none**, so all six toggles render
 * regardless of how many rows exist.
 *
 * @param departmentId the department
 * @returns six rows; branch the save action on `exists`
 */
export const listFeatures = async (
  departmentId: string,
): Promise<FeatureRow[]> => {
  const { data } = await pgRequest<FeatureRow[]>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_FEATURES, { departmentId }),
  });
  return data;
};

/**
 * Configures a capability that has no row yet — the `exists: false` branch.
 *
 * @param departmentId the department
 * @param body the code, whether to switch it on, and its per-code config
 * @returns the new feature row
 * @throws {HelpdeskApiError} 409 when already configured (use `updateFeature`),
 *   or when enabling `AI_CLASSIFICATION` with no catch-all routing rule
 */
export const createFeature = async (
  departmentId: string,
  body: CreateFeatureBody,
): Promise<FeatureRow> => {
  const { data } = await pgRequest<FeatureRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_FEATURES, { departmentId }),
    data: body,
  });
  return data;
};

/**
 * Changes an existing feature row.
 *
 * @param departmentId the department
 * @param code which capability
 * @param body `config` **replaces** the stored object — send it whole
 * @param etag the row's current token
 * @returns the updated row
 */
export const updateFeature = async (
  departmentId: string,
  code: FeatureCode,
  body: UpdateFeatureBody,
  etag: string,
): Promise<FeatureRow> => {
  const { data } = await pgRequest<FeatureRow>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.ADMIN_FEATURE, { departmentId, code }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * Disables a capability. **Never deletes** — disabling is forward-only, so
 * records created while it was on stay readable.
 *
 * @param departmentId the department
 * @param code which capability
 * @param etag the row's current token
 * @returns the row, now disabled, with `disabled_at` stamped
 */
export const disableFeature = async (
  departmentId: string,
  code: FeatureCode,
  etag: string,
): Promise<FeatureRow> => {
  const { data } = await pgRequest<FeatureRow>({
    method: "DELETE",
    url: pgPath(PG_ENDPOINT.ADMIN_FEATURE, { departmentId, code }),
    headers: ifMatch(etag),
  });
  return data;
};
