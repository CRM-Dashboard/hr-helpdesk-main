/**
 * Date utility functions to handle timezone-safe date operations
 */

/**
 * Parse a date string (YYYY-MM-DD) without timezone issues
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date object in local timezone or undefined if invalid
 */
export const parseDateSafe = (dateStr: string): Date | undefined => {
  if (!dateStr || dateStr === "0000-00-00") return undefined;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

/**
 * Format a Date object to YYYY-MM-DD string without timezone issues
 * @param date - Date object to format
 * @returns Date string in YYYY-MM-DD format
 */
export const formatDateForAPI = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Get current date in YYYY-MM-DD format (local timezone)
 * @returns Current date string in YYYY-MM-DD format
 */
export const getCurrentDateString = (): string => {
  const now = new Date();
  return formatDateForAPI(now);
};

/**
 * Format a date string for display using locale-specific format
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Formatted date string for display
 */
export const formatDateForDisplay = (dateString: string): string => {
  try {
    const date = parseDateSafe(dateString);
    if (!date) return dateString;
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
};
