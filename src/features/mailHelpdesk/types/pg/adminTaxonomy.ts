/**
 * Admin surface — categories, subcategories, priorities.
 *
 * The taxonomy is the **label** half of routing and only that half. There is no
 * `spoc_user_id` on a category and there must never be one: the chain is always
 * label → routing rule → person, which is what lets an owner change without
 * rewriting the taxonomy every historical ticket was classified against. Do not
 * put a person-picker on a category form.
 */

export interface CategoryRow {
  id: string;
  department_id: string;
  /** Immutable after creation — `PATCH` with `code` is a 422. Rename with `name`. */
  code: string;
  name: string;
  display_order: number;
  is_active: boolean;
  /** Computed under the chooser's own predicate, so it never promises options a dropdown lacks. */
  subcategory_count: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  /** Non-null = retired. Absent from the default list. */
  deleted_at: string | null;
  etag: string;
  /** Only on a DELETE response — how many children went with it. */
  subcategories_retired?: number;
}

export interface SubcategoryRow extends Omit<CategoryRow, "subcategory_count"> {
  category_id: string;
}

export interface TaxonomyListFilters {
  search?: string;
  includeInactive?: boolean;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface CreateCategoryBody {
  /** 2–40, `^[A-Z][A-Z0-9_]*$`, unique in the department. */
  code: string;
  name: string;
  displayOrder?: number;
  isActive?: boolean;
}

/** `code` is rejected with 422 — see `CategoryRow.code`. */
export interface UpdateCategoryBody {
  name?: string;
  displayOrder?: number;
  /** `false` deactivates; `true` on a retired row **restores** it, clearing `deleted_at`. */
  isActive?: boolean;
}

/**
 * One live rule or policy still routing on a category, returned in the 409 that
 * refuses to retire it. Render these as links — "retire these first" — never as
 * a raw error.
 */
export interface TaxonomyDependent {
  entity_type: string;
  id: string;
  version_no: number | null;
  name: string | null;
  scope: string;
}

// --- priorities ------------------------------------------------------------

/**
 * The one configuration resource with two scopes. A priority belongs to a
 * department or to the platform (`department_id IS NULL`), and a department
 * resolves against the union — which is why `includePlatform` defaults to true.
 */
export interface PriorityRow {
  id: string;
  /** `null` on a platform row. */
  department_id: string | null;
  code: string;
  name: string;
  /**
   * **Ascends with urgency**: LOW(1) < NORMAL(2) < HIGH(3). Sort DESC for "most
   * urgent first", and read the direction from `conventions.severityRank` rather
   * than assuming it — migration 0003 comments the opposite and is stale.
   */
  severity_rank: number;
  is_default: boolean;
  is_active: boolean;
  /** Writing a platform row is 403 with `details.scope = "PLATFORM"`, not 404. */
  is_platform: boolean;
  deleted_at: string | null;
  etag: string;
  /** Only on a PATCH that moved `severity_rank`. Surface it. */
  warning?: string;
  /** Only on the `/default` response. */
  is_department_default?: boolean;
  scope?: "DEPARTMENT" | "PLATFORM";
}

export interface PriorityListFilters {
  includePlatform?: boolean;
  includeInactive?: boolean;
  includeDeleted?: boolean;
  sort?: string;
}

export interface CreatePriorityBody {
  /** 2–30, `^[A-Z][A-Z0-9_]*$`. A department may define its own `HIGH` over the platform's. */
  code: string;
  name: string;
  /** 1–32767. No default — one would put every new priority at the same rank. */
  severityRank: number;
  isActive?: boolean;
}

/** `isDefault` is not a field here — it is its own verb, `POST …/default`. */
export interface UpdatePriorityBody {
  name?: string;
  severityRank?: number;
  isActive?: boolean;
}
