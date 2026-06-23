/**
 * Groups category data by escalation hierarchy
 * Handles multiple escalation users (esc1)
 * @param {Object} data - The data object containing department category array
 * @returns {Array} Array of grouped data, one object per escalation user
 */
function groupByEscalation(data: any) {
  const Categories = data.Category || [];

  // Group by escalation user (esc1)
  const escalationGroups = {};

  Categories.forEach((item) => {
    const esc = item.esc1;
    if (esc && esc.trim() !== "") {
      if (!escalationGroups[esc]) {
        escalationGroups[esc] = new Set();
      }
      if (item.spocId && item.spocId.trim() !== "") {
        escalationGroups[esc].add(item.spocId);
      }
    }
  });

  // Convert to desired output format
  return Object.entries(escalationGroups).map(([userId, teamSet]) => ({
    userId: userId,
    team: Array.from(teamSet as Set<string>), //.sort(),
  }));
}

/**
 * Alternative: Returns a single object with all escalation users
 * @param {Object} data - The data object containing ITCategory array
 * @returns {Object} Object with escalation users as keys
 */
function groupByEscalationMap(data: any) {
  const Categories = data.Category || [];

  const result = {};

  Categories.forEach((item) => {
    const esc = item.esc1;
    if (esc && esc.trim() !== "") {
      if (!result[esc]) {
        result[esc] = new Set();
      }
      if (item.spocId && item.spocId.trim() !== "") {
        result[esc].add(item.spocId);
      }
    }
  });

  // Convert Sets to sorted arrays
  Object.keys(result).forEach((key) => {
    result[key] = Array.from(result[key]).sort();
  });

  return result;
}

/**
 * Enhanced version with detailed breakdown per escalation user
 * @param {Object} data - The data object containing ITCategory array
 * @returns {Array} Array with detailed breakdown per escalation user
 */
function groupByEscalationDetailed(data: any) {
  const Categories = data.Category || [];

  // Group by escalation user
  const escalationGroups = {};

  Categories.forEach((item) => {
    const esc = item.esc1;
    if (esc && esc.trim() !== "") {
      if (!escalationGroups[esc]) {
        escalationGroups[esc] = {
          spocs: new Set(),
          categories: [],
        };
      }

      if (item.spocId && item.spocId.trim() !== "") {
        escalationGroups[esc].spocs.add(item.spocId);
        escalationGroups[esc].categories.push({
          spocId: item.spocId,
          category: item.category,
          subCategory: item.subCategory,
          tat: item.tat1,
        });
      }
    }
  });

  // Convert to output format
  return Object.entries(escalationGroups).map(([userId, data]) => ({
    userId: userId,
    team: Array.from((data as any).spocs as Set<string>).sort(),
    teamBreakdown: groupCategoriesBySpoc((data as any).categories),
  }));
}

/**
 * Helper function to group categories by SPOC
 */
function groupCategoriesBySpoc(categories) {
  return categories.reduce((acc, item) => {
    if (!acc[item.spocId]) {
      acc[item.spocId] = [];
    }
    acc[item.spocId].push({
      category: item.category,
      subCategory: item.subCategory,
      tat: item.tat,
    });
    return acc;
  }, {});
}

// Example usage with the new data:
const jsonData = {
  ITCategory: [
    // ... your data here (with HAKIMK and MANISHP as esc1)
  ],
};

// Returns array of groups
// const result = groupByEscalation(jsonData);
// console.log(result);
/* Output:
[
  { userId: "HAKIMK", team: ["SANDIPD", "SHRIKANT", "SUDHIRB", "SUMITK", "VISHALJ"] },
  { userId: "MANISHP", team: ["VISHALJ"] }
]
*/

// Returns map object
// const resultMap = groupByEscalationMap(jsonData);
// console.log(resultMap);
/* Output:
{
  "HAKIMK": ["SANDIPD", "SHRIKANT", "SUDHIRB", "SUMITK", "VISHALJ"],
  "MANISHP": ["VISHALJ"]
}
*/

// Returns detailed breakdown
// const detailedResult = groupByEscalationDetailed(jsonData);
// console.log(detailedResult);

function getAccessibleManagers(
  Managers: any, //ITManager[],
  accessRules: any, //AccessRule[],
  loggedInUserId: string
) {
  // 1. Find the rule for the logged-in user
  const userRule = accessRules.find((rule) => rule.userId === loggedInUserId);

  // If no rule exists → return all (or empty depending on your policy)
  if (!userRule) return [];

  // 2. Filter managers based on team
  return Managers.filter((manager) => userRule.team.includes(manager.userid));
}

export {
  groupByEscalation,
  groupByEscalationMap,
  groupByEscalationDetailed,
  getAccessibleManagers,
};
