/**
 * The admin menu, defined once and filtered by permission.
 *
 * Each entry names the permission its screen's **read** endpoint requires, so the
 * menu and the server agree by construction: an item is shown exactly when the
 * screen behind it would load. Driving this from `roleCode` instead would offer
 * a `DEPT_HEAD` the workflow editor and let them discover the 403 inside it.
 */
import {
  Building2,
  GitBranch,
  KeyRound,
  ListTree,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  ToggleLeft,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HELPDESK_PERMISSION, type HelpdeskPermission } from "../permissions";

export interface AdminNavItem {
  /** Path relative to the admin area root. */
  to: string;
  label: string;
  icon: LucideIcon;
  /** Held any-of, matching the server's `requirePermission`. */
  permission: HelpdeskPermission | HelpdeskPermission[];
  /** One line under the label on the overview screen. */
  description: string;
}

export interface AdminNavSection {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavSection[] = [
  {
    title: "Department",
    items: [
      {
        to: "departments",
        label: "Departments",
        icon: Building2,
        permission: HELPDESK_PERMISSION.DEPARTMENT_READ,
        description:
          "Lifecycle, defaults and the go-live checklist for each department.",
      },
      {
        to: "settings",
        label: "Settings",
        icon: SlidersHorizontal,
        permission: HELPDESK_PERMISSION.SETTINGS_READ,
        description:
          "Ticket numbering, assignment, auto-close, snooze and delegation limits.",
      },
      {
        to: "features",
        label: "Features",
        icon: ToggleLeft,
        permission: HELPDESK_PERMISSION.FEATURE_READ,
        description:
          "The six capabilities. Disabling one is forward-only — history stays readable.",
      },
    ],
  },
  {
    title: "Classification",
    items: [
      {
        to: "categories",
        label: "Categories",
        icon: ListTree,
        permission: HELPDESK_PERMISSION.TAXONOMY_READ,
        description:
          "The labels tickets are classified against, and their subcategories.",
      },
      {
        to: "priorities",
        label: "Priorities",
        icon: Timer,
        permission: HELPDESK_PERMISSION.PRIORITY_READ,
        description:
          "The urgency scale, including the platform-wide rows this department shares.",
      },
    ],
  },
  {
    title: "Work distribution",
    items: [
      {
        to: "routing",
        label: "Routing rules",
        icon: Route,
        permission: HELPDESK_PERMISSION.ROUTING_READ,
        description:
          "Who a ticket lands on, in the order the engine scans. Preview before you save.",
      },
      {
        to: "ola",
        label: "OLA policies",
        icon: Timer,
        permission: HELPDESK_PERMISSION.OLA_READ,
        description: "Response and resolution clocks, and the escalation ladder.",
      },
      {
        to: "workflows",
        label: "Workflows",
        icon: GitBranch,
        permission: HELPDESK_PERMISSION.WORKFLOW_READ,
        description:
          "States and transitions. Edited as a draft, then published as a version.",
      },
    ],
  },
  {
    title: "People",
    items: [
      {
        to: "members",
        label: "Members",
        icon: Users,
        permission: HELPDESK_PERMISSION.USER_READ,
        description:
          "Activate people so tickets can land on them. There is no Create User.",
      },
      {
        to: "roles",
        label: "Roles & permissions",
        icon: KeyRound,
        permission: HELPDESK_PERMISSION.ROLE_READ,
        description: "What each role may do. Read-only — the catalogue is seeded.",
      },
      {
        to: "out-of-office",
        label: "Cover & leave",
        icon: ShieldCheck,
        permission: [
          HELPDESK_PERMISSION.OOO_READ,
          HELPDESK_PERMISSION.OOO_WRITE,
        ],
        description: "Who is away in this department, and who is covering them.",
      },
    ],
  },
];

/**
 * Flattens the menu to the items a permission set can open.
 *
 * @param canAny predicate matching the server's any-of `requirePermission`
 * @returns the visible sections, with empty ones dropped
 */
export const visibleNav = (
  canAny: (...codes: HelpdeskPermission[]) => boolean,
): AdminNavSection[] =>
  ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      canAny(
        ...(Array.isArray(item.permission) ? item.permission : [item.permission]),
      ),
    ),
  })).filter((section) => section.items.length > 0);
