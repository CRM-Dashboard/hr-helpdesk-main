/**
 * Admin — categories, subcategories and priorities.
 *
 * Retiring is soft everywhere here: `DELETE` sets `deleted_at` and
 * `is_active = false` together and returns the row, because the two answer
 * different queries — `is_active` is what every chooser filters on, `deleted_at`
 * is what frees the code under the partial unique index.
 */
import { PG_ENDPOINT, pgPath } from "@/services/endPoints";
import { pgQuery, pgRequest } from "@/services/pgClient";
import type {
  CategoryRow,
  CreateCategoryBody,
  CreatePriorityBody,
  PriorityListFilters,
  PriorityRow,
  SubcategoryRow,
  TaxonomyListFilters,
  UpdateCategoryBody,
  UpdatePriorityBody,
} from "../../types/pg";
import { ifMatch, type AdminPage } from "./adminShared";

// --- categories ------------------------------------------------------------

/**
 * The category grid, and the source of a category dropdown.
 *
 * Both `include*` flags default to false server-side because the common caller is
 * a chooser. An admin grid that wants to see what it switched off opts in.
 *
 * @param departmentId the department
 * @param filters search, inactive/deleted opt-ins, paging
 * @returns the page of categories, each with `subcategory_count` and an `etag`
 */
export const listCategories = async (
  departmentId: string,
  filters?: TaxonomyListFilters,
): Promise<AdminPage<CategoryRow>> => {
  const { data, meta } = await pgRequest<CategoryRow[]>({
    method: "GET",
    url: `${pgPath(PG_ENDPOINT.ADMIN_CATEGORIES, { departmentId })}${pgQuery(filters)}`,
  });
  return { rows: data, meta };
};

/**
 * @param departmentId the department
 * @param body code (immutable), name, order and active flag
 * @returns the new category
 * @throws {HelpdeskApiError} 409 when the code is taken — if a **retired** row
 *   holds it, `details` carries `{ code, id, deletedAt }` so the UI can offer
 *   "restore" instead of pushing the user towards inventing `PAYROLL2`
 */
export const createCategory = async (
  departmentId: string,
  body: CreateCategoryBody,
): Promise<CategoryRow> => {
  const { data } = await pgRequest<CategoryRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_CATEGORIES, { departmentId }),
    data: body,
  });
  return data;
};

/**
 * Renames, reorders, deactivates or **restores** a category.
 *
 * @param departmentId the department
 * @param categoryId the category
 * @param body `isActive: true` on a retired row restores it; `code` is refused
 * @param etag the row's current token
 * @returns the updated row
 * @throws {HelpdeskApiError} 409 with `details.dependents` when `isActive: false`
 *   would leave a live routing rule or OLA policy scoping on it
 */
export const updateCategory = async (
  departmentId: string,
  categoryId: string,
  body: UpdateCategoryBody,
  etag: string,
): Promise<CategoryRow> => {
  const { data } = await pgRequest<CategoryRow>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.ADMIN_CATEGORY, { departmentId, categoryId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * Retires a category **and its subcategories**, in one transaction. Nothing is
 * removed and existing tickets are unaffected.
 *
 * @param departmentId the department
 * @param categoryId the category
 * @param etag the row's current token
 * @returns the retired row, carrying `subcategories_retired`
 * @throws {HelpdeskApiError} 409 with `details.dependents` — render those as
 *   links into the routing and OLA screens, not as a raw error
 */
export const retireCategory = async (
  departmentId: string,
  categoryId: string,
  etag: string,
): Promise<CategoryRow> => {
  const { data } = await pgRequest<CategoryRow>({
    method: "DELETE",
    url: pgPath(PG_ENDPOINT.ADMIN_CATEGORY, { departmentId, categoryId }),
    headers: ifMatch(etag),
  });
  return data;
};

// --- subcategories ---------------------------------------------------------

/**
 * A category's children. **Not paginated** — a bounded set a chooser renders
 * whole, so a page envelope would promise paging that never happens.
 *
 * @param departmentId the department
 * @param categoryId the parent
 * @param filters search and the inactive/deleted opt-ins
 * @returns the children
 */
export const listSubcategories = async (
  departmentId: string,
  categoryId: string,
  filters?: Omit<TaxonomyListFilters, "page" | "limit">,
): Promise<SubcategoryRow[]> => {
  const { data } = await pgRequest<SubcategoryRow[]>({
    method: "GET",
    url: `${pgPath(PG_ENDPOINT.ADMIN_SUBCATEGORIES, { departmentId, categoryId })}${pgQuery(filters)}`,
  });
  return data;
};

/**
 * Creates a subcategory. Only the create verb names the parent — a client
 * holding a subcategory id should not have to resolve its category to build a URL.
 *
 * @param departmentId the department
 * @param categoryId the parent
 * @param body same shape as a category
 * @returns the new subcategory
 */
export const createSubcategory = async (
  departmentId: string,
  categoryId: string,
  body: CreateCategoryBody,
): Promise<SubcategoryRow> => {
  const { data } = await pgRequest<SubcategoryRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_SUBCATEGORIES, { departmentId, categoryId }),
    data: body,
  });
  return data;
};

/**
 * @param departmentId the department
 * @param subcategoryId the subcategory
 * @param body `code` is refused, as on a category
 * @param etag the row's current token
 * @returns the updated row
 */
export const updateSubcategory = async (
  departmentId: string,
  subcategoryId: string,
  body: UpdateCategoryBody,
  etag: string,
): Promise<SubcategoryRow> => {
  const { data } = await pgRequest<SubcategoryRow>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.ADMIN_SUBCATEGORY, { departmentId, subcategoryId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * @param departmentId the department
 * @param subcategoryId the subcategory
 * @param etag the row's current token
 * @returns the retired row
 * @throws {HelpdeskApiError} 409 with `details.dependents`, as for a category
 */
export const retireSubcategory = async (
  departmentId: string,
  subcategoryId: string,
  etag: string,
): Promise<SubcategoryRow> => {
  const { data } = await pgRequest<SubcategoryRow>({
    method: "DELETE",
    url: pgPath(PG_ENDPOINT.ADMIN_SUBCATEGORY, { departmentId, subcategoryId }),
    headers: ifMatch(etag),
  });
  return data;
};

// --- priorities ------------------------------------------------------------

/**
 * The urgency scale. **Not paginated**, and already sorted most-urgent-first.
 *
 * `includePlatform` defaults to true server-side, and that default matters: a
 * department's usable set is its own rows plus the platform-wide ones, so a list
 * showing only its own would report no priorities on a department that works.
 *
 * @param departmentId the department
 * @param filters scope and status opt-ins
 * @returns the scale, each row flagged `is_platform`
 */
export const listPriorities = async (
  departmentId: string,
  filters?: PriorityListFilters,
): Promise<PriorityRow[]> => {
  const { data } = await pgRequest<PriorityRow[]>({
    method: "GET",
    url: `${pgPath(PG_ENDPOINT.ADMIN_PRIORITIES, { departmentId })}${pgQuery(filters)}`,
  });
  return data;
};

/**
 * Always creates a **department** priority — a platform row affects every
 * department, so it does not belong under a URL that names one.
 *
 * @param departmentId the department
 * @param body code, name and the mandatory `severityRank`
 * @returns the new priority
 * @throws {HelpdeskApiError} 409 when the code is taken, or when the rank is
 *   already held in the usable set — a tie makes the queue reshuffle between runs
 */
export const createPriority = async (
  departmentId: string,
  body: CreatePriorityBody,
): Promise<PriorityRow> => {
  const { data } = await pgRequest<PriorityRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_PRIORITIES, { departmentId }),
    data: body,
  });
  return data;
};

/**
 * Edits a department priority.
 *
 * Changing `severityRank` reorders every open ticket at that priority live —
 * nothing pins a rank — so the response carries a `warning` when it moved.
 * Surface it.
 *
 * @param departmentId the department
 * @param priorityId the priority
 * @param body name, rank, active flag; `code` and `isDefault` are refused
 * @param etag the row's current token
 * @returns the updated row, possibly with `warning`
 * @throws {HelpdeskApiError} 403 with `details.scope = "PLATFORM"` on a platform row
 */
export const updatePriority = async (
  departmentId: string,
  priorityId: string,
  body: UpdatePriorityBody,
  etag: string,
): Promise<PriorityRow> => {
  const { data } = await pgRequest<PriorityRow>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.ADMIN_PRIORITY, { departmentId, priorityId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * Makes this the department's default priority — the verb
 * `readiness.NO_DEFAULT_PRIORITY` names in its hint.
 *
 * A verb rather than `PATCH { isDefault: true }` because the incumbent must be
 * cleared in the same transaction, and **no `If-Match`** because it moves three
 * rows at once, so a token for any one of them would guard a third of the write.
 *
 * A platform priority may be chosen: the department then points at it without
 * owning it, and the response reports `scope: "PLATFORM"`.
 *
 * @param departmentId the department
 * @param priorityId the priority to make default
 * @returns the row, with `is_department_default` and `scope`
 */
export const makePriorityDefault = async (
  departmentId: string,
  priorityId: string,
): Promise<PriorityRow> => {
  const { data } = await pgRequest<PriorityRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_PRIORITY_DEFAULT, { departmentId, priorityId }),
    data: {},
  });
  return data;
};

/**
 * Retires a department priority. Soft — `deleted_at`, `is_active = false`,
 * `is_default = false`.
 *
 * @param departmentId the department
 * @param priorityId the priority
 * @param etag the row's current token
 * @returns the retired row
 * @throws {HelpdeskApiError} 403 on a platform row; 409 with `details.dependents`,
 *   which covers `departments.default_priority_id` as well as the two engines
 */
export const retirePriority = async (
  departmentId: string,
  priorityId: string,
  etag: string,
): Promise<PriorityRow> => {
  const { data } = await pgRequest<PriorityRow>({
    method: "DELETE",
    url: pgPath(PG_ENDPOINT.ADMIN_PRIORITY, { departmentId, priorityId }),
    headers: ifMatch(etag),
  });
  return data;
};
