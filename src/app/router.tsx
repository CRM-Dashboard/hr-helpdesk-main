import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import RootLayout from "@/app/layout/RootLayout";
import LoginContainer from "@/features/auth/login/page/LoginContainer";
import MailBoxInterface from "@/features/MailBox/pages/MailBoxInterface";

const NotFound = lazy(() => import("@/pages/NotFound"));

const HelpdeskModule = lazy(
  () => import("@/features/mailHelpdesk/pages/Index"),
);

export const router = createBrowserRouter(
  [
    {
      // Root layout provides the main page container
      element: <RootLayout />,
      children: [
        { index: true, element: <LoginContainer /> },
        // {
        //   index: true,
        //   element: (
        //     <Suspense fallback={<div className="p-4">Loading helpdesk…</div>}>
        //       <HelpdeskModule />
        //     </Suspense>
        //   ),
        // },
        {
          path: "dashboard/*",
          element: (
            <Suspense fallback={<div className="p-4">Loading helpdesk…</div>}>
              <HelpdeskModule />
            </Suspense>
          ),
        },
        {
          path: "mail-box",
          element: <MailBoxInterface />,
        },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  {
    // Use Vite's BASE_URL so dev ("/") and prod subpaths (e.g. "/hr-tracker/") both work
    basename: "/hr-helpdesk",
  },
);
