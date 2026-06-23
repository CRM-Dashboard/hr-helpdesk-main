export type HelpdeskStatus =
  | "new"
  | "pending"
  | "in_progress"
  | "resolved"
  | "closed"
  | "rejected";

export type HelpdeskNoteType = "comment" | "status_change" | "assignment";

export interface HelpdeskNote {
  id: string;
  authorEmail: string;
  authorName?: string;
  createdAt: string; // ISO
  type: HelpdeskNoteType;
  message: string;
}

export interface HelpdeskRequest {
  id: string;
  employeeEmail: string;
  employeeName?: string;
  category: string;
  subCategory: string;
  title: string;
  description: string;
  status: HelpdeskStatus;
  assigneeEmail?: string;
  assigneeName?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  // Power Automate parity fields
  responseSummary?: string;
  closureDateTime?: string; // ISO end datetime
  resolutionMs?: number; // computed: closureDateTime - createdAt
  history: HelpdeskNote[];
}

export type CreateHelpdeskRequestInput = {
  employeeEmail: string;
  employeeName?: string;
  category: string;
  subCategory: string;
  title: string;
  description: string;
  assigneeEmail?: string;
  assigneeName?: string;
};

export type UpdateHelpdeskRequestInput = Partial<
  Omit<HelpdeskRequest, "id" | "createdAt" | "history" | "updatedAt">
> & {
  addNote?: Omit<HelpdeskNote, "id" | "createdAt"> & { createdAt?: string };
};

export type BulkAction =
  | { type: "resolve" }
  | { type: "close" }
  | { type: "reject" }
  | { type: "assign"; assigneeEmail: string; assigneeName?: string };
