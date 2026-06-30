interface Ticket {
  ticketId: string;
  createdDateTime: string; // ISO date string
  subject: string;
  sender: string;
  assigned: string;
  unread: string;
  // new fields
  externalInd: string;
  exEmployeeInd: string;
  escLevel: number;
}

interface Managers {
  userid: string;
  name: string;
}

export interface status {
  status: string;
  statTxt: string;
}

export interface TicketListData {
  new: Ticket[];
  inprocess: Ticket[];
  closed: Ticket[];
  unassigned: Ticket[];
  // new statuses
  resolved: Ticket[];
  pending: Ticket[];
  // managers
  hrManager: Managers[];
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

  assignedEmpId: string;
  assignedName: string;
  planStartDt: string; // YYYY-MM-DD
  planEndDt: string; // YYYY-MM-DD
  planDays: number;
  startDt: string; // YYYY-MM-DD
  endDt: string; // YYYY-MM-DD
  actDays: number;
  remark: string;
  erdat: string;
  uzeit: string; // hh:mm:ss

  createdDateTime: string;
  hasAttachments: string;
  bodyPreview: string;
  conversationId: string;
  sender: string;
  subject: string;

  esc1Dt: string; // YYYY-MM-DD
  esc1Time: string; // hh:mm:ss
  esc2Dt: string; // YYYY-MM-DD
  esc2Time: string; // hh:mm:ss
  esc3Dt: string; // YYYY-MM-DD
  esc3Time: string; // hh:mm:

  externalInd: string;
  exEmployeeInd: string;

  snoozeCount: number;
  snooze1: number;
  snooze2: number;
  snooze3: number;
  snooze1Rsn: string;
  snooze2Rsn: string;
  snooze3Rsn: string;

  endTime: string; // hh:mm:ss
  startTime: string; // hh:mm:ss

  escLevel: number;
  employeeId: string;
  employeeName: string;
  department: string;
}
