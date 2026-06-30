/**
 * Types for the ticket Collaboration feature.
 *
 * Data is sourced from `/api/ticket/get-ticket-details`, whose response carries
 * three parallel lists: existing collaboration activities (`activitydata`), the
 * department lookup (`deptdata`) and the assignable users lookup (`userdata`).
 */

/** A single collaboration activity recorded against a ticket. */
export interface CollaborationActivity {
  ticketId: string;
  conversationId?: string;
  activityNo?: string;
  activityDes: string;
  status?: string;
  statTxt?: string;
  priority?: string;
  assigned: string;
  assignedName?: string;
  dueHrs?: number;
  dueDt?: string;
  hodDt?: string;
  dept: string;
  deptTxt?: string;
  comments?: string;
}

/** Department option for the picker (`response.deptdata`). */
export interface CollabDept {
  deptCode: string;
  deptTxt: string;
}

/** Assignable user option for the picker (`response.userdata`). */
export interface CollabUser {
  id: string;
  name: string;
  email: string;
}

/** Normalised payload returned by `fetchCollaborationData`. */
export interface CollaborationData {
  activitydata: CollaborationActivity[];
  deptdata: CollabDept[];
  userdata: CollabUser[];
}

/** Values captured by the collaboration form before composing the email. */
export interface CollaborationFormValues {
  activityDes: string;
  assigned: string;
  dept: string;
  comments: string;
}
