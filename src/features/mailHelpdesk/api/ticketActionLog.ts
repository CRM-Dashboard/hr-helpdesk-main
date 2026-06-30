import {
  appendAuthToFormData,
  END_POINTS,
  getAuthCredentials,
  sapClientBase,
} from "@/services/sapClient";

/**
 * Ticket Action Log (system audit trail).
 *
 * Every meaningful mutation a SPOC performs against a ticket is mirrored to the
 * ticket-action endpoints so the activity can be aggregated into a dashboard
 * (who did what, when, and the before/after in `REMARK`). The backend stamps
 * `ERDAT`/`ERZZT`/`ERNAM`/`MANDT` server-side; the client only supplies the
 * business fields below.
 *
 * Endpoints:
 *  - GET  END_POINTS.GET_TICKET_ACTIONS  (payload: userName, passWord, ticketId)
 *  - POST END_POINTS.POST_TICKET_ACTIONS (payload: userName, passWord, data[])
 */

/** Canonical action codes. Keep these stable — the dashboard groups by them. */
export const TICKET_ACTION = {
  ASSIGNMENT: "ASSIGNMENT",
  REASSIGNMENT: "REASSIGNMENT",
  STATUS_CHANGE: "STATUS_CHANGE",
  TICKET_UPDATE: "TICKET_UPDATE",
  SNOOZE: "SNOOZE",
  COLLABORATION: "COLLABORATION",
} as const;

export type TicketActionCode =
  (typeof TICKET_ACTION)[keyof typeof TICKET_ACTION];

/** A persisted action record as returned by GET_TICKET_ACTIONS. */
export interface TicketActionLog {
  MANDT: string;
  TICKET_ID: string;
  /** Server date stamp, e.g. "2026-06-30". */
  ERDAT: string;
  /** Server time stamp, e.g. "12:46:27". */
  ERZZT: string;
  /** Acting user, e.g. "MANISHP". */
  ERNAM: string;
  STATUS: string;
  STATUS_TXT: string;
  ACTION: string;
  REMARK: string;
}

/** The client-supplied fields when writing an action record. */
export interface TicketActionInput {
  ticketId: string | number;
  action: TicketActionCode | string;
  remark: string;
  /** Optional status snapshot at the time of the action. */
  status?: string;
  statusTxt?: string;
}

/** Shape posted to POST_TICKET_ACTIONS (uppercase keys per API contract). */
interface TicketActionPayload {
  TICKET_ID: string;
  STATUS: string;
  STATUS_TXT: string;
  ACTION: string;
  REMARK: string;
}

function toPayload(input: TicketActionInput): TicketActionPayload {
  return {
    TICKET_ID: String(input.ticketId ?? ""),
    STATUS: input.status ?? "",
    STATUS_TXT: input.statusTxt ?? "",
    ACTION: input.action,
    REMARK: input.remark ?? "",
  };
}

/**
 * Fetch the full action log for a ticket, newest first. Powers the per-ticket
 * activity feed and the system dashboard.
 */
export async function fetchTicketActions(
  ticketId: string | number,
): Promise<TicketActionLog[]> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("ticketId", String(ticketId));

  const response = await sapClientBase.post<any>(
    END_POINTS.GET_TICKET_ACTIONS,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );

  const data = response?.data;
  const list: TicketActionLog[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.response)
      ? data.response
      : [];

  // Newest first by date + time.
  return [...list].sort((a, b) => {
    const aKey = `${a.ERDAT ?? ""} ${a.ERZZT ?? ""}`;
    const bKey = `${b.ERDAT ?? ""} ${b.ERZZT ?? ""}`;
    return bKey.localeCompare(aKey);
  });
}

/**
 * Persist one or more action records. Accepts a single input or an array and
 * sends them as one batch under `data`.
 */
export async function postTicketActions(
  input: TicketActionInput | TicketActionInput[],
): Promise<any> {
  const records = (Array.isArray(input) ? input : [input]).map(toPayload);

  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("data", JSON.stringify(records));

  const response = await sapClientBase.post<any>(
    END_POINTS.POST_TICKET_ACTIONS,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response?.data;
}

/**
 * Fire-and-forget audit write. Never throws — a failed audit log must not break
 * the primary user action that triggered it. Errors are logged for diagnostics.
 */
export function logTicketAction(input: TicketActionInput): void {
  if (!input?.ticketId) {
    console.warn("logTicketAction skipped: missing ticketId", input);
    return;
  }
  postTicketActions(input).catch((e) => {
    console.error("Failed to write ticket action log:", input.action, e);
  });
}

/** Current acting user (uppercased to match server ERNAM convention). */
export function getActingUser(): string {
  return (getAuthCredentials()?.userName ?? "").toUpperCase();
}
