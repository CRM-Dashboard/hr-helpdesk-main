import { toast } from "sonner";

// Generic groupBy function
export function groupBy<T, K extends keyof T>(
  array: T[],
  key: K
): Record<string, T[]> {
  return array?.reduce((result, item) => {
    const groupKey = String(item[key]);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

/**
 * Common reusable date validation
 *
 * @param start - start date (string, e.g. "2025-08-28")
 * @param end - end date (string)
 * @param label - optional custom label for error message
 * @returns boolean (true if valid, false if invalid)
 */
export const validateDateRange = (
  start: string,
  end: string,
  label: string = "Date"
): boolean => {
  if (!start || !end) return true; // skip if either is empty

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (endDate < startDate) {
    toast.error(`${label} End Date cannot be earlier than ${label} Start Date`);
    return false;
  }

  return true;
};

/**
 * Common string capitalize function
 *
 * @param value - text to captalized (string, e.g. "all")
 * @returns string (capitalize string)
 */
export const capitalize = (value: string) => {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};
