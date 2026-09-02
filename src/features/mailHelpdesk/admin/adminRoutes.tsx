/**
 * Admin routes, mounted under the helpdesk feature's `admin/` path.
 *
 * The paths match `adminNav.ts` exactly — the menu is the route table's index, and
 * a mismatch would show a menu item that leads nowhere.
 *
 * Screens are lazy because most agents never open any of them, and the guard lives
 * inside each page (`RequirePermission`) rather than on the route: a route-level
 * guard would have to redirect, and a redirect is a worse answer than a sentence
 * saying which permission is missing.
 */
import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import type { ReactNode } from "react";
import AdminLayout from "./AdminLayout";

const AdminOverviewPage = lazy(() => import("./pages/AdminOverviewPage"));
const DepartmentsPage = lazy(() => import("./pages/DepartmentsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const FeaturesPage = lazy(() => import("./pages/FeaturesPage"));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage"));
const PrioritiesPage = lazy(() => import("./pages/PrioritiesPage"));
const RoutingRulesPage = lazy(() => import("./pages/RoutingRulesPage"));
const OlaPoliciesPage = lazy(() => import("./pages/OlaPoliciesPage"));
const WorkflowsPage = lazy(() => import("./pages/WorkflowsPage"));
const MembersPage = lazy(() => import("./pages/MembersPage"));
const RolesPage = lazy(() => import("./pages/RolesPage"));
const CoverPage = lazy(() => import("./pages/CoverPage"));

/**
 * @param node a lazily-loaded screen
 * @returns it behind a fallback sized to the content area, not the page
 */
const chunk = (node: ReactNode): ReactNode => (
  <Suspense
    fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}
  >
    {node}
  </Suspense>
);

export const adminRoutes: RouteObject[] = [
  {
    path: "admin",
    element: <AdminLayout />,
    children: [
      { index: true, element: chunk(<AdminOverviewPage />) },
      { path: "departments", element: chunk(<DepartmentsPage />) },
      { path: "settings", element: chunk(<SettingsPage />) },
      { path: "features", element: chunk(<FeaturesPage />) },
      { path: "categories", element: chunk(<CategoriesPage />) },
      { path: "priorities", element: chunk(<PrioritiesPage />) },
      { path: "routing", element: chunk(<RoutingRulesPage />) },
      { path: "ola", element: chunk(<OlaPoliciesPage />) },
      { path: "workflows", element: chunk(<WorkflowsPage />) },
      { path: "members", element: chunk(<MembersPage />) },
      { path: "roles", element: chunk(<RolesPage />) },
      { path: "out-of-office", element: chunk(<CoverPage />) },
    ],
  },
];
