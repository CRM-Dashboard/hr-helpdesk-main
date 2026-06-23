/**
 * Types for Leave Coverage & SPOC Management.
 *
 * A SPOC can mark themselves unavailable for a date range. While unavailable,
 * the OLA for newly assigned tickets is deferred until the SPOC resumes.
 */

export interface SpocAvailability {
  /** SAP user id of the SPOC. */
  spocId: string;
  name?: string;
  /** Unavailability window (inclusive), as yyyy-MM-dd date strings. */
  fromDate: string;
  toDate: string;
  reason?: string;
  /** User id who created/last edited this record. */
  setBy?: string;
  /** True when an admin set/overrode it on behalf of the SPOC. */
  setByAdmin?: boolean;
  updatedAt?: string;
}

/**
 * An audit entry written to a ticket's history when it is assigned to a SPOC
 * who is on leave. Reason is always "Leave Coverage" per the spec.
 */
export interface LeaveCoverageEvent {
  id: string;
  ticketId: string;
  spocId: string;
  spocName?: string;
  /** The SPOC's leave window that triggered the deferral. */
  leaveFrom: string;
  leaveTo: string;
  /** Date the SPOC resumes office (OLA start), ISO timestamp. */
  resumeDate: string;
  /** OLA start = resumeDate (kept explicit for the history log). */
  olaStart: string;
  /** Communicated TAT = resumeDate + standard OLA for the category, ISO. */
  tat: string;
  reason: "Leave Coverage";
  loggedAt: string;
}
