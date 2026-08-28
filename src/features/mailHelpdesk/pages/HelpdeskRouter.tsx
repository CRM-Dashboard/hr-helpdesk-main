import { Outlet } from "react-router-dom";
import { HelpdeskAuthGate } from "../components/HelpdeskAuthGate";

export default function HelpdeskRouter() {
  return (
    <HelpdeskAuthGate>
      <Outlet />
    </HelpdeskAuthGate>
  );
}
