// utils/localStorageHelper.js

/**
 * Safely sets an item in localStorage.
 * Automatically stringifies non-string values.
 *
 * @param {string} key
 * @param {any} value
 */
export const setItem = (key: string, value: any) => {
  try {
    const serializedValue =
      typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, serializedValue);
  } catch (error) {
    console.error(`Error setting localStorage key "${key}":`, error);
  }
};

/**
 * Safely retrieves an item from localStorage.
 * Automatically parses JSON if the stored value is JSON.
 *
 * @param {string} key
 * @returns {any | null}
 */
export const getItem = (key: string) => {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return null;

    try {
      // Try to parse JSON
      return JSON.parse(value);
    } catch {
      // Return as string if parsing fails
      return value;
    }
  } catch (error) {
    console.error(`Error reading localStorage key "${key}":`, error);
    return null;
  }
};

/**
 * Removes an item from localStorage.
 *
 * @param {string} key
 */
export const removeItem = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing localStorage key "${key}":`, error);
  }
};

/**
 * Clears all items from localStorage.
 * Use cautiously.
 */
export const clearStorage = () => {
  try {
    localStorage.clear();
  } catch (error) {
    console.error("Error clearing localStorage:", error);
  }
};
