/**
 * Interface for SPOC (Single Point of Contact) details
 */
export interface SpocDetails {
  spocId: string;
  tat1: string; // Turn Around Time 1
  esc1: string; // Escalation Level 1
  tat2: string; // Turn Around Time 2
  esc2: string; // Escalation Level 2
  tat3: string; // Turn Around Time 3
  esc3: string; // Escalation Level 3
}

/**
 * Interface for HR SPOC data structure
 * Organized as: Category -> SubCategory -> SPOC Details
 */
export interface HRSpocData {
  [category: string]: {
    [subCategory: string]: SpocDetails;
  };
}

/**
 * Type guard to check if a value is SpocDetails
 */
export function isSpocDetails(value: any): value is SpocDetails {
  return (
    value &&
    typeof value === "object" &&
    "spocId" in value &&
    typeof value.spocId === "string"
  );
}
