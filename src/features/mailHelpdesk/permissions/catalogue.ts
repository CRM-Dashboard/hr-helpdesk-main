/**
 * The `helpdesk.*` permission vocabulary.
 *
 * `GET /auth/me` returns the codes the signed-in user **holds**; this names what
 * they mean so call sites read as intent rather than as string literals. It is a
 * convenience over the authoritative list, never a substitute for it — a code
 * missing from here is still enforced by the server, and `hasPermission` accepts
 * any string for exactly that reason.
 *
 * `GET /admin/permissions` is the live catalogue with descriptions and the
 * `is_dangerous` flag; render the permissions screen from that, not from this.
 */

export const HELPDESK_PERMISSION = {
  DEPARTMENT_READ: "helpdesk.department.read",
  DEPARTMENT_CREATE: "helpdesk.department.create",
  DEPARTMENT_WRITE: "helpdesk.department.write",
  DEPARTMENT_ACTIVATE: "helpdesk.department.activate",
  DEPARTMENT_DEACTIVATE: "helpdesk.department.deactivate",

  SETTINGS_READ: "helpdesk.settings.read",
  SETTINGS_WRITE: "helpdesk.settings.write",

  FEATURE_READ: "helpdesk.feature.read",
  FEATURE_WRITE: "helpdesk.feature.write",

  TAXONOMY_READ: "helpdesk.taxonomy.read",
  TAXONOMY_WRITE: "helpdesk.taxonomy.write",

  PRIORITY_READ: "helpdesk.priority.read",
  PRIORITY_WRITE: "helpdesk.priority.write",

  USER_READ: "helpdesk.user.read",
  USER_WRITE: "helpdesk.user.write",
  USER_OFFBOARD: "helpdesk.user.offboard",

  ROLE_READ: "helpdesk.role.read",

  ROUTING_READ: "helpdesk.routing.read",
  ROUTING_WRITE: "helpdesk.routing.write",

  OLA_READ: "helpdesk.ola.read",
  OLA_WRITE: "helpdesk.ola.write",

  WORKFLOW_READ: "helpdesk.workflow.read",
  WORKFLOW_WRITE: "helpdesk.workflow.write",
  WORKFLOW_PUBLISH: "helpdesk.workflow.publish",

  OOO_READ: "helpdesk.ooo.read",
  OOO_WRITE: "helpdesk.ooo.write",
} as const;

/**
 * A permission code. The open union is deliberate: the seed can add a code
 * before this file learns about it, and a checked call must still be expressible.
 */
export type HelpdeskPermission =
  | (typeof HELPDESK_PERMISSION)[keyof typeof HELPDESK_PERMISSION]
  | (string & {});

/**
 * The six the server flags `is_dangerous`. Each one either cannot be undone from
 * the UI that performed it or changes what other people can do, so every one of
 * them gets a confirmation step before the request is sent.
 */
export const DANGEROUS_PERMISSIONS: readonly HelpdeskPermission[] = [
  HELPDESK_PERMISSION.DEPARTMENT_CREATE,
  HELPDESK_PERMISSION.DEPARTMENT_ACTIVATE,
  HELPDESK_PERMISSION.DEPARTMENT_DEACTIVATE,
  "helpdesk.role.write",
  HELPDESK_PERMISSION.USER_OFFBOARD,
  HELPDESK_PERMISSION.WORKFLOW_PUBLISH,
];

/**
 * @param code a permission code
 * @returns whether acting on it should be confirmed first
 */
export const isDangerousPermission = (code: HelpdeskPermission): boolean =>
  DANGEROUS_PERMISSIONS.includes(code);
