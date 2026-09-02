/**
 * Departments, readiness, settings and features.
 *
 * Every write here re-evaluates readiness server-side, and a DRAFT department can
 * be promoted or demoted by a configuration change it never mentioned — so each
 * mutation invalidates the readiness query rather than trusting the status it
 * last read.
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
  activateDepartment,
  createDepartment,
  createDepartmentSettings,
  createFeature,
  deactivateDepartment,
  disableFeature,
  getDepartment,
  getDepartmentReadiness,
  getDepartmentSettings,
  listDepartments,
  listFeatures,
  updateDepartment,
  updateDepartmentSettings,
  updateFeature,
  type AdminPage,
} from "../../api/pg";
import type {
  CreateDepartmentBody,
  CreateFeatureBody,
  DeactivateDepartmentBody,
  DepartmentListFilters,
  DepartmentRow,
  DepartmentSettingsRow,
  FeatureCode,
  FeatureRow,
  ReadinessResponse,
  UpdateDepartmentBody,
  UpdateFeatureBody,
  UpdateSettingsBody,
} from "../../types/pg";
import { adminKeys } from "./queryKeys";

/**
 * The department list. One row for a single-department admin — render a header
 * from it rather than a chooser — and every department for a SUPER_ADMIN.
 *
 * @param filters status, search and paging
 * @param enabled skip until the permission is known
 * @returns the page of departments, each carrying its own `etag`
 */
export const useDepartments = (
  filters?: DepartmentListFilters,
  enabled = true,
): UseQueryResult<AdminPage<DepartmentRow>, Error> =>
  useQuery({
    queryKey: adminKeys.departments(filters),
    queryFn: () => listDepartments(filters),
    enabled,
    placeholderData: keepPreviousData,
  });

/**
 * @param departmentId the department, or null while nothing is selected
 * @param enabled hold the request back until a screen actually needs the row —
 *   the whole `/admin/*` router shares one 60-request-a-minute budget per user
 * @returns the row and the `etag` every write to it needs
 */
export const useDepartment = (
  departmentId: string | null | undefined,
  enabled = true,
): UseQueryResult<DepartmentRow, Error> =>
  useQuery({
    queryKey: adminKeys.departmentDetail(departmentId ?? ""),
    queryFn: () => getDepartment(departmentId as string),
    enabled: Boolean(departmentId) && enabled,
  });

/**
 * The go-live checklist.
 *
 * Never poll it: it is one of the 60 admin requests a minute, and it changes only
 * when something else on this screen wrote. Call it on entering the go-live step
 * and after each save — both of which the mutations below do for you.
 *
 * @param departmentId the department
 * @param enabled skip until the checklist is on screen
 * @returns every check, passed and failed
 */
export const useDepartmentReadiness = (
  departmentId: string | null | undefined,
  enabled = true,
): UseQueryResult<ReadinessResponse, Error> =>
  useQuery({
    queryKey: adminKeys.readiness(departmentId ?? ""),
    queryFn: () => getDepartmentReadiness(departmentId as string),
    enabled: enabled && Boolean(departmentId),
  });

/**
 * Invalidates what a department-level write can have moved.
 *
 * @param queryClient the client from `useQueryClient`
 * @param departmentId the department that was written
 */
const invalidateDepartment = (
  queryClient: ReturnType<typeof useQueryClient>,
  departmentId: string,
): void => {
  queryClient.invalidateQueries({
    queryKey: adminKeys.department(departmentId),
  });
  // `status` may have moved DRAFT ⇄ READY on its own, and the list shows it.
  queryClient.invalidateQueries({ queryKey: adminKeys.departmentLists() });
};

/**
 * Creates a department. Lands in DRAFT with a settings row already in place.
 *
 * @returns a mutation taking the create body; follow it with the readiness call
 *   to render the rest of the onboarding checklist
 */
export const useCreateDepartment = (): UseMutationResult<
  DepartmentRow,
  Error,
  CreateDepartmentBody
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDepartment,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.departmentLists() }),
  });
};

/**
 * Edits a department.
 *
 * @returns a mutation taking `{ departmentId, body, etag }`; a 409
 *   CONCURRENT_MODIFICATION means someone else wrote first — refetch and re-apply
 */
export const useUpdateDepartment = (): UseMutationResult<
  DepartmentRow,
  Error,
  { departmentId: string; body: UpdateDepartmentBody; etag: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, body, etag }) =>
      updateDepartment(departmentId, body, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateDepartment(queryClient, departmentId),
  });
};

/**
 * Takes a department live.
 *
 * @returns a mutation taking `{ departmentId, etag }`; on a 409 read
 *   `details.blocking` — the failed check codes — and show those rather than the
 *   message
 */
export const useActivateDepartment = (): UseMutationResult<
  DepartmentRow,
  Error,
  { departmentId: string; etag: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, etag }) =>
      activateDepartment(departmentId, etag),
    onSettled: (_row, _err, { departmentId }) =>
      invalidateDepartment(queryClient, departmentId),
  });
};

/**
 * Takes a department out of service. Touches no ticket.
 *
 * @returns a mutation taking `{ departmentId, body, etag }`; on a count mismatch
 *   the 409 carries the real `details.openTickets` — show it and resend that number
 */
export const useDeactivateDepartment = (): UseMutationResult<
  DepartmentRow,
  Error,
  { departmentId: string; body: DeactivateDepartmentBody; etag: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, body, etag }) =>
      deactivateDepartment(departmentId, body, etag),
    onSettled: (_row, _err, { departmentId }) =>
      invalidateDepartment(queryClient, departmentId),
  });
};

// --- settings --------------------------------------------------------------

/**
 * @param departmentId the department
 * @param enabled skip until the settings screen is open
 * @returns the settings row; a 404 means the row predates this API — offer
 *   `useCreateDepartmentSettings` rather than surfacing the error
 */
export const useDepartmentSettings = (
  departmentId: string | null | undefined,
  enabled = true,
): UseQueryResult<DepartmentSettingsRow, Error> =>
  useQuery({
    queryKey: adminKeys.settings(departmentId ?? ""),
    queryFn: () => getDepartmentSettings(departmentId as string),
    enabled: enabled && Boolean(departmentId),
    retry: false,
  });

/**
 * Creates the settings row from schema defaults. Recovery path only.
 *
 * @returns a mutation taking the department id
 */
export const useCreateDepartmentSettings = (): UseMutationResult<
  DepartmentSettingsRow,
  Error,
  string
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDepartmentSettings,
    onSuccess: (_row, departmentId) =>
      invalidateDepartment(queryClient, departmentId),
  });
};

/**
 * Saves settings.
 *
 * @returns a mutation taking `{ departmentId, body, etag }`. Send only changed
 *   fields — the coherence rules run against the merged row, so an unmentioned
 *   stored value can still refuse the write
 */
export const useUpdateDepartmentSettings = (): UseMutationResult<
  DepartmentSettingsRow,
  Error,
  { departmentId: string; body: UpdateSettingsBody; etag: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, body, etag }) =>
      updateDepartmentSettings(departmentId, body, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateDepartment(queryClient, departmentId),
  });
};

// --- features --------------------------------------------------------------

/**
 * All six capabilities, including the ones with no row.
 *
 * @param departmentId the department
 * @param enabled skip until the features screen is open
 * @returns six rows; branch the save action on `exists`, not on `is_enabled`
 */
export const useFeatures = (
  departmentId: string | null | undefined,
  enabled = true,
): UseQueryResult<FeatureRow[], Error> =>
  useQuery({
    queryKey: adminKeys.features(departmentId ?? ""),
    queryFn: () => listFeatures(departmentId as string),
    enabled: enabled && Boolean(departmentId),
  });

/**
 * Configures a capability that has no row yet.
 *
 * @returns a mutation taking `{ departmentId, body }`
 */
export const useCreateFeature = (): UseMutationResult<
  FeatureRow,
  Error,
  { departmentId: string; body: CreateFeatureBody }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, body }) => createFeature(departmentId, body),
    onSuccess: (_row, { departmentId }) =>
      invalidateDepartment(queryClient, departmentId),
  });
};

/**
 * Changes an existing capability.
 *
 * @returns a mutation taking `{ departmentId, code, body, etag }`. `config`
 *   replaces rather than merges, so send it whole
 */
export const useUpdateFeature = (): UseMutationResult<
  FeatureRow,
  Error,
  {
    departmentId: string;
    code: FeatureCode;
    body: UpdateFeatureBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, code, body, etag }) =>
      updateFeature(departmentId, code, body, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateDepartment(queryClient, departmentId),
  });
};

/**
 * Disables a capability. The row stays and its history stays readable.
 *
 * @returns a mutation taking `{ departmentId, code, etag }`
 */
export const useDisableFeature = (): UseMutationResult<
  FeatureRow,
  Error,
  { departmentId: string; code: FeatureCode; etag: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, code, etag }) =>
      disableFeature(departmentId, code, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateDepartment(queryClient, departmentId),
  });
};
