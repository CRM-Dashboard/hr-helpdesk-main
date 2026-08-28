/**
 * Presentation helpers for out-of-office records.
 *
 * `status` is derived from five timestamps and is deliberately not stored. The
 * list endpoint computes it; the detail read and every write response do not —
 * so a screen that shows both has to derive it, and this is the one copy of
 * that rule.
 */
import type {
  OooActivationPolicy,
  OooExpiryPolicy,
  OooStatus,
  OutOfOfficeRow,
} from "../types/pg";

/** The five timestamps `deriveOooStatus` reads. Both read shapes satisfy this. */
type StatusFields = Pick<
  OutOfOfficeRow,
  | "starts_at"
  | "ends_at"
  | "applied_at"
  | "reverted_at"
  | "cancelled_at"
  | "activation_policy"
>;

/**
 * Resolves the status of a record. First match wins — the same order the server
 * uses on the list endpoint.
 *
 * @param row any out-of-office record
 * @param now the moment to judge against; injectable so a list does not shift
 *   under itself while it renders
 * @returns the derived status
 */
export const deriveOooStatus = (
  row: StatusFields,
  now: Date = new Date(),
): OooStatus => {
  if (row.cancelled_at) return "CANCELLED";
  if (row.reverted_at) return "ENDED";
  const time = now.getTime();
  // The window has passed but the scheduler has not settled it yet (≤ 10 min,
  // and never at all when the server runs with jobs disabled).
  if (new Date(row.ends_at).getTime() <= time) return "EXPIRING";
  if (new Date(row.starts_at).getTime() > time) return "SCHEDULED";
  // Filed but inert: MANUAL is invisible to routing until someone activates it.
  if (row.activation_policy === "MANUAL" && !row.applied_at) {
    return "AWAITING_ACTIVATION";
  }
  return "ACTIVE";
};

/** Tailwind classes for a status badge. */
export const oooStatusClass = (status: OooStatus): string => {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "SCHEDULED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "AWAITING_ACTIVATION":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "EXPIRING":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "ENDED":
      return "border-slate-200 bg-slate-50 text-slate-600";
    case "CANCELLED":
      return "border-slate-200 bg-slate-50 text-slate-500";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
};

/** Human wording for a status badge. */
export const oooStatusLabel = (status: OooStatus): string => {
  switch (status) {
    case "AWAITING_ACTIVATION":
      return "Awaiting activation";
    case "EXPIRING":
      return "Ending";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
};

/**
 * What the status means for the person's work — the sentence a card shows under
 * the badge, so nobody has to infer that `AWAITING_ACTIVATION` does nothing.
 *
 * @param status the derived status
 * @returns one sentence, in plain words
 */
export const oooStatusExplanation = (status: OooStatus): string => {
  switch (status) {
    case "ACTIVE":
      return "Routing is following this now.";
    case "SCHEDULED":
      return "Filed for the future. Nothing has moved yet.";
    case "AWAITING_ACTIVATION":
      return "Filed but inert — it does nothing until you activate it.";
    case "EXPIRING":
      return "The window has passed; the server has not settled it yet.";
    case "ENDED":
      return "Ran its course. The expiry policy has been applied.";
    case "CANCELLED":
      return "Ended early.";
    default:
      return "";
  }
};

/** What each activation policy does, for the form's helper text. */
export const ACTIVATION_POLICY_LABEL: Record<OooActivationPolicy, string> = {
  NEW_TICKETS_ONLY: "New tickets go to the delegate",
  ALL_ACTIVE_TICKETS: "New tickets, plus everything already open",
  MANUAL: "Nothing happens until I activate it",
};

/** What each expiry policy does when the window ends. */
export const EXPIRY_POLICY_LABEL: Record<OooExpiryPolicy, string> = {
  KEEP_DELEGATE: "The delegate keeps what they picked up",
  RETURN_TO_OWNER: "Open tickets come back to me",
};
