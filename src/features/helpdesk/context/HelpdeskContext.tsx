import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type {
  HelpdeskRequest,
  CreateHelpdeskRequestInput,
  UpdateHelpdeskRequestInput,
  HelpdeskNote,
  BulkAction,
  HelpdeskStatus,
} from "../types/types";

type HelpdeskContextValue = {
  requests: HelpdeskRequest[];
  addRequest: (input: CreateHelpdeskRequestInput) => HelpdeskRequest;
  updateRequest: (
    id: string,
    input: UpdateHelpdeskRequestInput
  ) => HelpdeskRequest | undefined;
  addNote: (
    id: string,
    note: Omit<HelpdeskNote, "id" | "createdAt"> & { createdAt?: string }
  ) => HelpdeskRequest | undefined;
  bulkUpdate: (ids: string[], action: BulkAction) => void;
};

const HelpdeskContext = createContext<HelpdeskContextValue | undefined>(
  undefined
);

function generateId(prefix = "req") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function seedRequests(): HelpdeskRequest[] {
  const base: Omit<
    HelpdeskRequest,
    "id" | "createdAt" | "updatedAt" | "history"
  >[] = [
    {
      employeeEmail: "testUser@gera.in",
      employeeName: "Test User",
      category: "HR Operations",
      subCategory: "HR Letters",
      title: "Employment verification letter",
      description: "Need verification letter for bank loan.",
      status: "pending",
      assigneeEmail: "pranali.khandge@gera.in",
      assigneeName: "Pranali Khandge",
    },
    {
      employeeEmail: "jane.doe@gera.in",
      employeeName: "Jane Doe",
      category: "Finance",
      subCategory: "Salary Tax Related",
      title: "Form 16 copy request",
      description: "Please share Form 16 for FY 2023-24.",
      status: "in_progress",
      assigneeEmail: "rakesh.yadav@gera.in",
      assigneeName: "Rakesh Yadav",
    },
  ];
  return base.map((r) => ({
    id: generateId(),
    ...r,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    history: [
      {
        id: generateId("note"),
        authorEmail: r.employeeEmail,
        authorName: r.employeeName,
        createdAt: nowIso(),
        type: "comment",
        message: r.description,
      },
    ],
  }));
}

export function HelpdeskProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<HelpdeskRequest[]>(() =>
    seedRequests()
  );

  const addRequest = useCallback(
    (input: CreateHelpdeskRequestInput): HelpdeskRequest => {
      const req: HelpdeskRequest = {
        id: generateId(),
        employeeEmail: input.employeeEmail,
        employeeName: input.employeeName,
        category: input.category,
        subCategory: input.subCategory,
        title: input.title,
        description: input.description,
        status: "pending",
        assigneeEmail: input.assigneeEmail,
        assigneeName: input.assigneeName,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        history: [],
      };
      setRequests((prev) => [req, ...prev]);
      return req;
    },
    []
  );

  const addNote = useCallback(
    (
      id: string,
      note: Omit<HelpdeskNote, "id" | "createdAt"> & { createdAt?: string }
    ) => {
      const createdAt = note.createdAt ?? nowIso();
      let updated: HelpdeskRequest | undefined;
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const newNote: HelpdeskNote = {
            id: generateId("note"),
            createdAt,
            ...note,
          };
          updated = {
            ...r,
            updatedAt: createdAt,
            history: [newNote, ...r.history],
          };
          return updated;
        })
      );
      return updated;
    },
    []
  );

  const updateRequest = useCallback(
    (id: string, input: UpdateHelpdeskRequestInput) => {
      let updated: HelpdeskRequest | undefined;
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const next: HelpdeskRequest = {
            ...r,
            ...input,
            updatedAt: nowIso(),
          } as HelpdeskRequest;
          // compute resolution time if closure supplied
          if (next.closureDateTime) {
            const end = new Date(next.closureDateTime).getTime();
            const start = new Date(next.createdAt).getTime();
            if (!Number.isNaN(end) && !Number.isNaN(start)) {
              next.resolutionMs = Math.max(0, end - start);
            }
          }
          if (input.addNote) {
            const newNote: HelpdeskNote = {
              id: generateId("note"),
              createdAt: input.addNote.createdAt ?? nowIso(),
              authorEmail: input.addNote.authorEmail,
              authorName: input.addNote.authorName,
              message: input.addNote.message,
              type: input.addNote.type,
            };
            next.history = [newNote, ...next.history];
          }
          updated = next;
          return next;
        })
      );
      return updated;
    },
    []
  );

  const bulkUpdate = useCallback((ids: string[], action: BulkAction) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (!ids.includes(r.id)) return r;
        const next: HelpdeskRequest = { ...r };
        if (action.type === "resolve") next.status = "resolved";
        if (action.type === "close") next.status = "closed";
        if (action.type === "reject") next.status = "rejected";
        if (action.type === "assign") {
          next.assigneeEmail = action.assigneeEmail;
          next.assigneeName = action.assigneeName ?? next.assigneeName;
        }
        next.updatedAt = nowIso();
        return next;
      })
    );
  }, []);

  const value = useMemo<HelpdeskContextValue>(
    () => ({ requests, addRequest, updateRequest, addNote, bulkUpdate }),
    [requests, addRequest, updateRequest, addNote, bulkUpdate]
  );

  return (
    <HelpdeskContext.Provider value={value}>
      {children}
    </HelpdeskContext.Provider>
  );
}

export function useHelpdesk() {
  const ctx = useContext(HelpdeskContext);
  if (!ctx) throw new Error("useHelpdesk must be used within HelpdeskProvider");
  return ctx;
}
