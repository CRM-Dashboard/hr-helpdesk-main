export interface Ticket {
  id: string;
  source: "email" | "web" | "phone";
  receivedDate: Date;
  customerName: string;
  customerEmail: string;
  subject: string;
  description: string;
  attachments?: string[];
  ticketType: "complaint" | "query" | "request" | "other";
  department: string;
  category?: string;
  subcategory?: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in-progress" | "resolved" | "closed";
  slaDeadline: Date;
  assignedTo?: string;
  createdBy: string;
  tasks: Task[];
  collaborators: Collaborator[];
  escalationLevel: number;
  escalationHistory: EscalationRecord[];
  tracker: any;
  unread: string;
  externalInd?: string;
  exEmployeeInd?: string;
  escLevel?: number;
}

export interface Task {
  id: string;
  ticketId: string;
  title: string;
  description: string;
  assignedTo: string;
  deadline: Date;
  status: "not-started" | "in-progress" | "completed";
  priority: "low" | "medium" | "high";
  remarks?: string;
  attachments?: string[];
  createdBy: string;
  createdDate: Date;
}

export interface Collaborator {
  id: string;
  ticketId: string;
  type: "internal" | "external";
  department?: string;
  name: string;
  email: string;
  assignedBy: string;
  messageHistory: Message[];
  status: "open" | "responded" | "closed";
  assignedDate: Date;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  attachments?: string[];
  timestamp: Date;
  isRead: boolean;
}

export interface EscalationRecord {
  id: string;
  ticketId: string;
  level: number;
  escalatedTo: string;
  escalatedBy: string;
  reason: string;
  timestamp: Date;
  action: string;
  resolved: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role:
    | "customer"
    | "agent"
    | "collaborator"
    | "team-lead"
    | "manager"
    | "admin";
  department?: string;
  isActive: boolean;
}
