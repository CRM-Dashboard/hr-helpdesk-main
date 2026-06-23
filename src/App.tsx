import { Suspense } from "react";
import { RouterProvider } from "react-router-dom";
import { AppProviders } from "@/app/AppProviders";
import { router } from "@/app/router";

const App = () => (
  <AppProviders>
    <Suspense fallback={<div className="p-4">Loading…</div>}>
      <RouterProvider router={router} />
    </Suspense>
  </AppProviders>
);

export default App;
