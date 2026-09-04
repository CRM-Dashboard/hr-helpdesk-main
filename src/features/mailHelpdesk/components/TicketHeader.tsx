import { Badge } from "@/components/ui/badge";
import {
  AlarmClock,
  Clock,
  Layers,
  PauseCircle,
  Tag,
  TriangleAlert,
  User,
} from "lucide-react";
import type { OlaInstance, TicketDetail, WorkflowState } from "../types/pg";
import {
  fullTimestamp,
  priorityBadgeClass,
  requesterLabel,
  stateBadgeClass,
} from "../utils/pgTicket";
import { TicketAssignmentControl } from "./TicketAssignmentControl";
import { TicketSnoozeControl } from "./TicketSnoozeControl";
import { TicketTransitions } from "./TicketTransitions";
import type { StateCategory } from "../../mailHelpdesk/types/pg/identity";

interface TicketHeaderProps {
  detail: TicketDetail;
  /** From `/auth/me` — the only source of state names and categories. */
  statesByCode: Record<string, WorkflowState>;
  /** Joined display fields the list row carries but the raw ticket row does not. */
  listRow?: {
    state_code?: string;
    state_name?: string;
    priority_name?: string | null;
    severity_rank?: number | null;
    category_name?: string | null;
    assigned_to_name?: string | null;
    state_category?: StateCategory;
  };
}

/**
 * One OLA clock, rendered as a chip.
 *
 * @param instance a `ticket_ola_instances` row
 * @returns the chip, or null when the clock has been stopped
 */
function OlaChip({ instance }: { instance: OlaInstance }) {
  if (instance.is_stopped) return null;

  const tone = instance.is_breached
    ? "border-red-200 bg-red-50 text-red-700"
    : instance.is_paused
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${tone}`}
    >
      {instance.is_paused ? (
        <PauseCircle className="h-3.5 w-3.5" />
      ) : (
        <AlarmClock className="h-3.5 w-3.5" />
      )}
      <span className="font-medium">{instance.target_type}</span>
      <span>
        {instance.is_breached
          ? `breached ${fullTimestamp(instance.due_at)}`
          : instance.is_paused
            ? `paused${instance.pause_reason ? ` (${instance.pause_reason.toLowerCase()})` : ""}`
            : `due ${fullTimestamp(instance.due_at)}`}
      </span>
      {instance.requires_intervention && (
        <span
          className="flex items-center gap-1 font-medium text-red-700"
          title="The scheduler gave up on this clock — an administrator must clear it"
        >
          <TriangleAlert className="h-3.5 w-3.5" />
          needs attention
        </span>
      )}
    </div>
  );
}

export function TicketHeader({
  detail,
  statesByCode,
  listRow,
}: TicketHeaderProps) {
  const { ticket, availableTransitions, ola } = detail;

  // The detail payload carries `state_id`, not `state_code`. The list row knows
  // the code; otherwise fall back to the state the open status interval names.
  const stateCode = listRow?.state_code;
  const state = stateCode ? statesByCode[stateCode] : undefined;
  const stateName = state?.name ?? listRow?.state_name ?? "—";

  return (
    <div className="p-6 border-b border-border bg-card">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={`text-xs font-semibold border ${stateBadgeClass(state?.category)}`}
          >
            {stateName}
          </Badge>

          <Badge
            variant="secondary"
            className={`text-xs border ${priorityBadgeClass(listRow?.severity_rank ?? null)}`}
          >
            {listRow?.priority_name || "Priority not set"}
          </Badge>

          <Badge variant="outline" className="text-xs border-dashed">
            {ticket.ticket_number}
          </Badge>

          {ticket.is_ola_breached && (
            <Badge className="text-xs bg-red-600 text-white border-0">
              OLA breached
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <TicketAssignmentControl
            ticketId={ticket.id}
            departmentId={ticket.department_id}
            ticketVersion={ticket.version}
            assignedToUserId={ticket.assigned_to_user_id}
            assignedToName={listRow?.assigned_to_name}
            isClosed={Boolean(ticket.closed_at)}
          />
          <TicketSnoozeControl
            ticketId={ticket.id}
            isClosed={
              Boolean(ticket.closed_at) ||
              Boolean(listRow?.state_category === "PENDING")
            }
          />
          <TicketTransitions
            ticketId={ticket.id}
            ticketVersion={ticket.version}
            transitions={availableTransitions}
          />
        </div>
      </div>

      <h1 className="text-xl font-semibold mb-2">
        {ticket.subject || "(Subject not provided)"}
      </h1>

      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1">
          <User className="h-4 w-4" />
          <span>{requesterLabel(ticket)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span>{fullTimestamp(ticket.created_at)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Tag className="h-4 w-4" />
          <span>Category : {listRow?.category_name || "Not set"}</span>
        </div>
        <div className="flex items-center gap-1">
          <User className="h-4 w-4" />
          <span>Assigned : {listRow?.assigned_to_name || "Unassigned"}</span>
        </div>
        {ticket.requester_dept_snapshot && (
          <div className="flex items-center gap-1">
            <Layers className="h-4 w-4" />
            <span>Department : {ticket.requester_dept_snapshot}</span>
          </div>
        )}
      </div>

      {ticket.description && (
        <div className="mt-2 text-sm">
          <span className="text-foreground">Description : </span>
          {/* <span className="text-muted-foreground">{ticket.description}</span> */}
        </div>
      )}

      {ola.instances.length > 0 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {ola.instances.map((instance) => (
            <OlaChip key={instance.id} instance={instance} />
          ))}
        </div>
      )}
    </div>
  );
}

export default TicketHeader;
