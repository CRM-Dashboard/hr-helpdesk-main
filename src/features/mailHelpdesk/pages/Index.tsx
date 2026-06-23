import { Suspense } from "react";
import { RouteObject, useRoutes, Navigate } from "react-router-dom";
import HelpdeskRouter from "./HelpdeskRouter";
import { EmailInterface } from "./EmailInterface";
import CategoryConfigPage from "./CategoryConfigPage";
import SpocAvailabilityPage from "./SpocAvailabilityPage";
// import TicketDetailsPage from "@/features/helpdesk/pages/TicketDetailsPage";
// import ComposePage from "@/features/helpdesk/pages/ComposePage";

const routes: RouteObject[] = [
  {
    path: "",
    element: <HelpdeskRouter />,
    children: [
      { index: true, element: <EmailInterface /> },
      { path: "admin/category-config", element: <CategoryConfigPage /> },
      { path: "admin/spoc-availability", element: <SpocAvailabilityPage /> },
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
