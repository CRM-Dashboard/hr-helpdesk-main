/**
 * Categories, subcategories and priorities.
 *
 * Retiring anything here can be refused with a 409 naming live routing rules and
 * OLA policies that still scope on it, so every write invalidates those two
 * subtrees as well — the dependency list a user was just shown must not go stale
 * behind a screen they navigate to next.
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  createCategory,
  createPriority,
  createSubcategory,
  listCategories,
  listPriorities,
  listSubcategories,
  makePriorityDefault,
  retireCategory,
  retirePriority,
  retireSubcategory,
  updateCategory,
  updatePriority,
  updateSubcategory,
  type AdminPage,
} from "../../api/pg";
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
import { adminKeys } from "./queryKeys";

/**
 * Invalidates the taxonomy and everything that scopes on it.
 *
 * @param queryClient the client from `useQueryClient`
 * @param departmentId the department that was written
 */
const invalidateTaxonomy = (
  queryClient: ReturnType<typeof useQueryClient>,
  departmentId: string,
): void => {
  queryClient.invalidateQueries({ queryKey: adminKeys.categoryLists(departmentId) });
  queryClient.invalidateQueries({
    queryKey: adminKeys.subcategoryLists(departmentId),
  });
  queryClient.invalidateQueries({ queryKey: adminKeys.priorityLists(departmentId) });
  // Both engines scope on these ids, and readiness counts active categories.
  queryClient.invalidateQueries({
    queryKey: adminKeys.routingRuleLists(departmentId),
  });
  queryClient.invalidateQueries({ queryKey: adminKeys.olaPolicyLists(departmentId) });
  queryClient.invalidateQueries({ queryKey: adminKeys.readiness(departmentId) });
};

// --- categories ------------------------------------------------------------

/**
 * @param departmentId the department
 * @param filters search, the inactive/deleted opt-ins, paging
 * @param enabled skip until the screen is open
 * @returns the page of categories
 */
export const useCategories = (
  departmentId: string | null | undefined,
  filters?: TaxonomyListFilters,
  enabled = true,
): UseQueryResult<AdminPage<CategoryRow>, Error> =>
  useQuery({
    queryKey: adminKeys.categories(departmentId ?? "", filters),
    queryFn: () => listCategories(departmentId as string, filters),
    enabled: enabled && Boolean(departmentId),
    placeholderData: keepPreviousData,
  });

/**
 * A category's children. Not paginated — the API returns the bounded set whole.
 *
 * @param departmentId the department
 * @param categoryId the parent, or null while no row is expanded
 * @param filters search and the inactive/deleted opt-ins
 * @returns the children; the query idles while `categoryId` is empty
 */
export const useSubcategories = (
  departmentId: string | null | undefined,
  categoryId: string | null | undefined,
  filters?: Omit<TaxonomyListFilters, "page" | "limit">,
): UseQueryResult<SubcategoryRow[], Error> =>
  useQuery({
    queryKey: adminKeys.subcategories(departmentId ?? "", categoryId ?? "", filters),
    queryFn: () =>
      listSubcategories(departmentId as string, categoryId as string, filters),
    enabled: Boolean(departmentId) && Boolean(categoryId),
  });

/**
 * @returns a mutation taking `{ departmentId, body }`; a 409 whose `details`
 *   names a retired row means the code is held by something switched off —
 *   offer to restore it rather than pushing the user towards `PAYROLL2`
 */
export const useCreateCategory = (): UseMutationResult<
  CategoryRow,
  Error,
  { departmentId: string; body: CreateCategoryBody }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, body }) => createCategory(departmentId, body),
    onSuccess: (_row, { departmentId }) =>
      invalidateTaxonomy(queryClient, departmentId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, categoryId, body, etag }`.
 *   `isActive: true` on a retired row restores it; `isActive: false` runs the
 *   same dependency guard as retiring
 */
export const useUpdateCategory = (): UseMutationResult<
  CategoryRow,
  Error,
  {
    departmentId: string;
    categoryId: string;
    body: UpdateCategoryBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, categoryId, body, etag }) =>
      updateCategory(departmentId, categoryId, body, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateTaxonomy(queryClient, departmentId),
  });
};

/**
 * Retires a category and its subcategories together.
 *
 * @returns a mutation taking `{ departmentId, categoryId, etag }`; the result
 *   carries `subcategories_retired`, and a 409 carries `details.dependents`
 */
export const useRetireCategory = (): UseMutationResult<
  CategoryRow,
  Error,
  { departmentId: string; categoryId: string; etag: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, categoryId, etag }) =>
      retireCategory(departmentId, categoryId, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateTaxonomy(queryClient, departmentId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, categoryId, body }` — the create
 *   verb is the only one that names the parent
 */
export const useCreateSubcategory = (): UseMutationResult<
  SubcategoryRow,
  Error,
  { departmentId: string; categoryId: string; body: CreateCategoryBody }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, categoryId, body }) =>
      createSubcategory(departmentId, categoryId, body),
    onSuccess: (_row, { departmentId }) =>
      invalidateTaxonomy(queryClient, departmentId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, subcategoryId, body, etag }`
 */
export const useUpdateSubcategory = (): UseMutationResult<
  SubcategoryRow,
  Error,
  {
    departmentId: string;
    subcategoryId: string;
    body: UpdateCategoryBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, subcategoryId, body, etag }) =>
      updateSubcategory(departmentId, subcategoryId, body, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateTaxonomy(queryClient, departmentId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, subcategoryId, etag }`
 */
export const useRetireSubcategory = (): UseMutationResult<
  SubcategoryRow,
  Error,
  { departmentId: string; subcategoryId: string; etag: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, subcategoryId, etag }) =>
      retireSubcategory(departmentId, subcategoryId, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateTaxonomy(queryClient, departmentId),
  });
};

// --- priorities ------------------------------------------------------------

/**
 * The urgency scale — the department's own rows plus the platform-wide ones,
 * already sorted most-urgent-first.
 *
 * @param departmentId the department
 * @param filters scope and status opt-ins
 * @param enabled skip until the screen is open
 * @returns the scale, each row flagged `is_platform`
 */
export const usePriorities = (
  departmentId: string | null | undefined,
  filters?: PriorityListFilters,
  enabled = true,
): UseQueryResult<PriorityRow[], Error> =>
  useQuery({
    queryKey: adminKeys.priorities(departmentId ?? "", filters),
    queryFn: () => listPriorities(departmentId as string, filters),
    enabled: enabled && Boolean(departmentId),
  });

/**
 * @returns a mutation taking `{ departmentId, body }`; a 409 means the code or
 *   the severity rank is already held — `details.heldBy` names the incumbent
 */
export const useCreatePriority = (): UseMutationResult<
  PriorityRow,
  Error,
  { departmentId: string; body: CreatePriorityBody }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, body }) => createPriority(departmentId, body),
    onSuccess: (_row, { departmentId }) =>
      invalidateTaxonomy(queryClient, departmentId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, priorityId, body, etag }`; when the
 *   rank moved the result carries a `warning` about live queue reordering — show it
 */
export const useUpdatePriority = (): UseMutationResult<
  PriorityRow,
  Error,
  {
    departmentId: string;
    priorityId: string;
    body: UpdatePriorityBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, priorityId, body, etag }) =>
      updatePriority(departmentId, priorityId, body, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateTaxonomy(queryClient, departmentId),
  });
};

/**
 * Makes a priority the department's default — the verb that clears
 * `NO_DEFAULT_PRIORITY`.
 *
 * @returns a mutation taking `{ departmentId, priorityId }`; no ETag, because it
 *   moves three rows and a token for one would guard a third of the write
 */
export const useMakePriorityDefault = (): UseMutationResult<
  PriorityRow,
  Error,
  { departmentId: string; priorityId: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, priorityId }) =>
      makePriorityDefault(departmentId, priorityId),
    onSuccess: (_row, { departmentId }) => {
      invalidateTaxonomy(queryClient, departmentId);
      // It also writes departments.default_priority_id.
      queryClient.invalidateQueries({
        queryKey: adminKeys.departmentDetail(departmentId),
      });
    },
  });
};

/**
 * @returns a mutation taking `{ departmentId, priorityId, etag }`; 403 on a
 *   platform row, and 409 with `details.dependents` — which includes the
 *   department itself when this is its default
 */
export const useRetirePriority = (): UseMutationResult<
  PriorityRow,
  Error,
  { departmentId: string; priorityId: string; etag: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, priorityId, etag }) =>
      retirePriority(departmentId, priorityId, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateTaxonomy(queryClient, departmentId),
  });
};
