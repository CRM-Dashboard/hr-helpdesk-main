/**
 * Presentation helpers for the PostgreSQL ticket payloads, plus the one bridge
 * back to the legacy `Ticket` shape that the Graph composer still expects.
 */
import { format, isToday, isYesterday } from "date-fns";
import type { Ticket } from "../types/ticket";
import type {
  StateCategory,
  TicketListRow,
  TicketRow,
} from "../types/pg";

/**
 * Who raised the ticket, preferring the name snapshot taken at creation.
 *
 * @param row a ticket row
 * @returns a display name, falling back to the email and then to "Unknown"
 */
export const requesterLabel = (row: TicketRow): string =>
  row.requester_name_snapshot || row.requester_email_snapshot || "Unknown";

/**
 * Tailwind classes for a state badge, keyed on the state's lifecycle category
 * rather than its code — a department may name its states anything.
 *
 * @param category OPEN / PENDING / RESOLVED / CLOSED
 * @returns the badge class string
 */
export const stateBadgeClass = (category: StateCategory | undefined): string => {
  switch (category) {
    case "OPEN":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "PENDING":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "RESOLVED":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "CLOSED":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
};

/**
 * Tailwind classes for a priority badge. `severity_rank` ascends with urgency
 * in this project, so a higher number is hotter.
 *
 * @param severityRank the row's `severity_rank`, null when no priority is set
 * @returns the badge class string
 */
export const priorityBadgeClass = (severityRank: number | null): string => {
  if (severityRank === null || severityRank === undefined) {
    return "bg-slate-100 text-slate-500 border-slate-200";
  }
  if (severityRank >= 3) return "bg-red-100 text-red-700 border-red-200";
  if (severityRank === 2) return "bg-indigo-100 text-indigo-700 border-indigo-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
};

/**
 * Compact timestamp for a list row: time today, "Yesterday", else a date.
 *
 * @param iso an ISO timestamp from the API
 * @returns a short label, or "" when the input is empty
 */
export const listTimestamp = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM dd");
};

/**
 * Full timestamp for the detail pane.
 *
 * @param iso an ISO timestamp from the API
 * @returns e.g. "26 Aug 2026, 01:12 pm", or "—" when absent
 */
export const fullTimestamp = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd MMM yyyy, hh:mm a");
};

/**
 * Adapts a new ticket row to the legacy `Ticket` interface.
 *
 * The Graph composer (`EmailCompose`, `CollaboratorEmailCompose`) is migrated in
 * a later phase and still types its props as `Ticket`. This is a display-only
 * bridge — nothing written through it reaches the new API.
 *
 * @param row a ticket row from `GET /tickets` or `GET /tickets/:id`
 * @returns a legacy-shaped ticket carrying only the fields those components read
 */
export const toLegacyTicket = (row: TicketRow): Ticket =>
  ({
    id: row.ticket_number,
    source: "email",
    receivedDate: new Date(row.created_at),
    customerName: requesterLabel(row),
    customerEmail: row.requester_email_snapshot || "",
    subject: row.subject,
    description: row.description || "",
    attachments: [],
    ticketType: "request",
    department: row.requester_dept_snapshot || "",
    priority: "" as Ticket["priority"],
    status: "" as Ticket["status"],
    slaDeadline: new Date(row.created_at),
    createdBy: row.requester_email_snapshot || "",
    assignedTo: (row as TicketListRow).assigned_to_name || "",
    tasks: [],
    collaborators: [],
    escalationLevel: 0,
    escalationHistory: [],
    unread: "",
    tracker: { ticketId: row.id, priority: "", status: "", statusTxt: "" },
  }) as Ticket;
