/**
 * The helpdesk admin area.
 *
 * `adminRoutes` mounts under the helpdesk feature's `admin/` path. Every screen is
 * lazy so the configuration surface — eleven screens, most of which most agents
 * never open — is not in the bundle the ticket desk loads.
 */
export { default as AdminLayout } from "./AdminLayout";
export { adminRoutes } from "./adminRoutes";
export { ADMIN_NAV, visibleNav } from "./adminNav";
export { useAdminScope } from "./context/adminScopeContext";
export { AdminScopeProvider } from "./context/AdminScopeProvider";
