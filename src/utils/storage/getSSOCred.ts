import { STORAGE } from "./storage";

/**
 * Safely retrieves SSO credentials from sessionStorage.
 * Automatically parses JSON if the stored value is JSON.
 *
 * @returns {any | null}
 */
export const getSSOCredentials = () => {
  try {
    const value = sessionStorage.getItem(STORAGE.USER_SSO_DETAIL);
    if (value === null) return null;

    try {
      // Try to parse JSON
      const val = JSON.parse(value);
      return val.email;
    } catch {
      // Return as string if parsing fails
      return value;
    }
  } catch (error) {
    console.error(`Error reading sessionStorage key:`, error);
    return null;
  }
};
