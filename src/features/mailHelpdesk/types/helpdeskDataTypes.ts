interface Ticket {
  ticketId: string;
  createdDateTime: string; // ISO date string
  subject: string;
  sender: string;
  assigned: string;
  unread: string;
}

interface Managers {
  userid: string; // empid: string;
  name: string;
}

export interface status {
  status: string;
  statusTxt: string;
}

export interface TicketListData {
  open: Ticket[];
  inProcess: Ticket[];
  closed: Ticket[];
  unassigned: Ticket[];
  // new statuses
  workCompleted: Ticket[];
  pendingOnSap: Ticket[];
  awaiting3rdParty: Ticket[];
  pendingReviewApproval: Ticket[];
  reopen: Ticket[];
  // managers
  manager: Managers[];
  //
  status: status[];
}

export interface TicketDetailData {
  ticketId: string;
  id: string;
  ticketDesc: string;
  category: string;
  subCategory: string;
  status: string;
  statusTxt: string;
  priority: string;
  //
  assigned: string;
  assignedTo: string;
  //
  planStartDt: string;
  planEndDt: string;
  planDays: number;
  startDt: string;
  endDt: string;
  actDays: number;
  remark: string;
  erdat: string;
  uzeit: string;
  createdDateTime: string;
  hasAttachments: string;
  bodyPreview: string;
  conversationId: string;
  sender: string;
  subject: string;
  esc1Dt: string;
  esc1Time: string;
  esc2Dt: string;
  esc2Time: string;
  esc3Dt: string;
  esc3Time: string;
  //
  transportId: string;
}
