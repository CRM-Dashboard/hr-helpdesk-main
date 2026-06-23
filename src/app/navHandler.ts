import { useNavigate } from "react-router-dom";

export type AppView =
  | "dashboard"
  | "travel-request"
  | "claim-request"
  | "approvals"
  | "helpdesk"
  | "mail-helpdesk";

// Returns a stable handler to switch views via programmatic navigation
export function useNavHandler() {
  const navigate = useNavigate();
  return (view: AppView) => {
    if (view === "dashboard") navigate("/dashboard");
    if (view === "travel-request") navigate("/travel-request");
    if (view === "claim-request") navigate("/claim-request");
    if (view === "approvals") navigate("/approvals");
    if (view === "helpdesk") navigate("/helpdesk");
    if (view === "mail-helpdesk") navigate("/mail-helpdesk");
  };
}
