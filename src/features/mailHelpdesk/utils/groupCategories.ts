import { Categories } from "../types";
import { HRSpocData } from "../types/hrSpocTypes";

/**
 * Transforms HR Category API response into grouped format (simple version)
 * @returns Simple object with category -> subcategory -> spocId mapping
 */
function groupHRCategories(
  apiResponse: Categories
): Record<string, Record<string, string>> {
  const grouped: Record<string, Record<string, string>> = {};

  // Single pass through the data for optimal performance
  apiResponse.Category.forEach((item) => {
    const { category, subCategory, spocId } = item;

    // Initialize category if it doesn't exist
    if (!grouped[category]) {
      grouped[category] = {};
    }

    // Add subcategory with spocId
    grouped[category][subCategory] = spocId;
  });

  return grouped;
}

// Example usage with your data
const apiData = {
  HRCategory: [
    {
      mandt: "250",
      category: "Administration",
      subCategory: "Courier Request",
      spocId: "GD1830",
      tat1: "2",
      esc1: "GD1555",
      tat2: "4",
      esc2: "GD797",
      tat3: "7",
      esc3: "GD1738",
    },
    // ... rest of your data
  ],
};

// const result = groupHRCategories(apiData);
// console.log(result);

/**
 * Alternative: If you need to include additional fields
 * @returns Full HRSpocData object with all SPOC details including TAT and escalation info
 */
export function groupCategoriesWithDetails(
  apiResponse: Categories
): HRSpocData {
  const grouped: HRSpocData = {};

  apiResponse.Category.forEach((item) => {
    const {
      category,
      subCategory,
      spocId,
      tat1,
      esc1,
      tat2,
      esc2,
      tat3,
      esc3,
    } = item;

    if (!grouped[category]) {
      grouped[category] = {};
    }

    // Store full details if needed
    grouped[category][subCategory] = {
      spocId,
      tat1,
      esc1,
      tat2,
      esc2,
      tat3,
      esc3,
    };
  });

  return grouped;
}

/**
 * Performance optimized version using reduce (functional approach)
 * @returns Simple object with category -> subcategory -> spocId mapping
 */
export const groupHRCategoriesReduce = (
  apiResponse: Categories
): Record<string, Record<string, string>> =>
  apiResponse.Category.reduce((acc, item) => {
    const { category, subCategory, spocId } = item;

    if (!acc[category]) {
      acc[category] = {};
    }

    acc[category][subCategory] = spocId;
    return acc;
  }, {} as Record<string, Record<string, string>>);

export default {
  groupHRCategories,
  groupCategoriesWithDetails,
  groupHRCategoriesReduce,
};
