import { Suspense } from "react";
import { RouteObject, useRoutes, Navigate } from "react-router-dom";
import HelpdeskRouter from "./HelpdeskRouter";
import { EmailInterface } from "./EmailInterface";
import CategoryConfigPage from "./CategoryConfigPage";
import SpocAvailabilityPage from "./SpocAvailabilityPage";
import OutOfOfficePage from "./OutOfOfficePage";
import { adminRoutes } from "../admin";
// import TicketDetailsPage from "@/features/helpdesk/pages/TicketDetailsPage";
// import ComposePage from "@/features/helpdesk/pages/ComposePage";

const routes: RouteObject[] = [
  {
    path: "",
    element: <HelpdeskRouter />,
    children: [
      { index: true, element: <EmailInterface /> },

      // Self-service: always the signed-in agent's own leave. It moved off
      // `admin/` when the real admin area landed there — managing somebody
      // else's cover is `admin/out-of-office`, a different endpoint with a
      // different permission.
      { path: "out-of-office", element: <OutOfOfficePage /> },

      // The permission-gated configuration surface.
      ...adminRoutes,

      // SAP-era screens. Not linked from the new admin menu; they stay mounted
      // until the SAP endpoints come down.
      { path: "legacy/category-config", element: <CategoryConfigPage /> },
      { path: "legacy/spoc-availability", element: <SpocAvailabilityPage /> },

      // { path: "thread/:id", element: <TicketDetailsPage /> },
      // { path: "compose", element: <ComposePage /> },
      { path: "*", element: <Navigate to="/dashboard" replace /> },
    ],
  },
];

const Index = () => {
  return (
    <Suspense fallback={<div className="p-4">Loading helpdesk…</div>}>
      {useRoutes(routes)}
    </Suspense>
  );
};

export default Index;
