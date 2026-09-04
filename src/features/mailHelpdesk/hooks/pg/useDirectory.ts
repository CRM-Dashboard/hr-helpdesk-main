/**
 * Directory reads for the collaboration participant picker.
 *
 * Kept out of the `adminKeys` subtree deliberately: those keys hang off a
 * department id so switching department cannot show the previous one's cache,
 * whereas these two reads are cross-department by design and have no department
 * to hang from.
 *
 * Both are read-only and nothing invalidates them, so they are given a long
 * `staleTime` — a roster does not move while a dialog is open, and re-fetching it
 * on every reopen is a request nobody needed.
 */
import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  listDirectoryDepartments,
  listDirectoryUsers,
  type AdminPage,
} from "../../api/pg";
import type {
  DirectoryDepartmentFilters,
  DirectoryDepartmentRow,
  DirectoryUserFilters,
  DirectoryUserRow,
} from "../../types/pg";
import { helpdeskKeys } from "./queryKeys";

/** A roster is stable enough that re-reading it per dialog open is waste. */
const DIRECTORY_STALE_MS = 5 * 60 * 1000;

/**
 * Every department a collaborator could be invited from — the caller's own
 * first, whatever the sort.
 *
 * Unlike `useDepartments`, this needs no admin permission and cannot answer
 * `CROSS_DEPARTMENT`.
 *
 * @param filters search, status, paging and sort
 * @param enabled hold the request back until the picker is actually open
 * @returns the page of departments, each with `invitable_user_count`
 */
export const useDirectoryDepartments = (
  filters?: DirectoryDepartmentFilters,
  enabled = true,
): UseQueryResult<AdminPage<DirectoryDepartmentRow>, Error> =>
  useQuery({
    queryKey: helpdeskKeys.directoryDepartments(filters),
    queryFn: () => listDirectoryDepartments(filters),
    enabled,
    staleTime: DIRECTORY_STALE_MS,
    placeholderData: keepPreviousData,
  });

/**
 * People who can be invited onto a collaboration, in any department.
 *
 * Every row that comes back is already active, undeleted and a real employee —
 * the server applies those three unconditionally — so there is no status
 * filtering left to do here.
 *
 * @param filters `departmentId` (omit it to search every department), search,
 *   roleCode, paging and sort
 * @param enabled hold the request back until the picker is actually open
 * @returns the page of people, their department joined in; a `departmentId` that
 *   does not exist is a 404 rather than an empty page
 */
export const useDirectoryUsers = (
  filters?: DirectoryUserFilters,
  enabled = true,
): UseQueryResult<AdminPage<DirectoryUserRow>, Error> =>
  useQuery({
    queryKey: helpdeskKeys.directoryUsers(filters),
    queryFn: () => listDirectoryUsers(filters),
    enabled,
    staleTime: DIRECTORY_STALE_MS,
    placeholderData: keepPreviousData,
  });
