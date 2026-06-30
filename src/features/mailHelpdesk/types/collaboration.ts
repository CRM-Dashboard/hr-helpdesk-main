/**
 * Types for Snooze (BRD 7.9) and Collaborator (BRD 7.10) features.
 */

/** A single snooze action recorded against a ticket (audit trail). */
export interface SnoozeRecord {
  id: string;
  ticketId: string;
  /** SAP user id of the SPOC who snoozed. */
  snoozedById: string;
  snoozedByName?: string;
  reason: string;
  /** Working hours requested (<= 24 per BRD). */
  hours: number;
  /** ISO timestamp when the snooze was applied. */
  snoozedAt: string;
  /** ISO timestamp the OLA resumes (snooze end). */
  until: string;
}

/** An internal collaborator added to a ticket. SPOC remains the OLA owner. */
export interface TicketCollaborator {
  id: string;
  ticketId: string;
  /** SAP user id. */
  userId: string;
  name: string;
  addedById?: string;
  addedAt: string;
}
