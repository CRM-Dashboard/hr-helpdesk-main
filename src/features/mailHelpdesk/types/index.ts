/**
 * Central export file for all mailHelpdesk types
 * This makes it easier to import multiple types in other files
 */

// HR SPOC and Category types
export type { SpocDetails, HRSpocData } from "./hrSpocTypes";
export { isSpocDetails } from "./hrSpocTypes";
export type { CategoryItem, HRCategories, Categories } from "./HRCategoryType";

// Re-export other types as they're added
// export type { Ticket } from './ticket';
// export type { TicketDetailData } from './helpdeskDataTypes';
