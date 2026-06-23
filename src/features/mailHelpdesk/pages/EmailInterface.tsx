import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import EmailList from "../components/EmailList.tsx";
import { EmailCompose } from "../components/EmailCompose.tsx";
import { CreateTicketForm } from "../components/CreateTicketForm.tsx";
import { CreateCollaboratorForm } from "../components/CreateCollaboratorForm.tsx";
import { Ticket } from "../types/ticket.ts";
import {
  Search,
  RefreshCw,
  Mail,
  Home,
  X,
  Settings,
  CalendarOff,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

import EmailThread from "../components/EmailThread.tsx";
import { ComposeContext } from "../types/compose.ts";
import {
  fetchHelpdeskEmailListData,
  getAllDepartmentCategoryList,
} from "../api/trackerHelpdesk.ts";
import { capitalize } from "@/utils/generics/genericFunc.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketListData } from "../types/helpdeskDataTypes.ts";
import LoadingOverlay from "@/components/ui/loading-overlay.tsx";
import {
  getAccessibleManagers,
  groupByEscalation,
} from "@/utils/module/groupCategory/groupEscalationCategory.ts";
import { getAuthCredentials } from "@/services/sapClient.ts";
import { NotificationBell } from "@/components/NotificationBell.tsx";
import { SyncDot } from "@/components/SyncDot.tsx";

export function EmailInterface() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [ticketData, setTicketData] = useState<TicketListData>({
    open: [],
    inProcess: [],
    closed: [],
    awaiting3rdParty: [],
    pendingOnSap: [],
    pendingReviewApproval: [],
    reopen: [],
    manager: [],
    status: [],
    workCompleted: [],
    unassigned: [],
  });
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showComposeFw, setShowComposeFw] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext | null>(
    null,
  );
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [showCreateCollaborator, setShowCreateCollaborator] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDynamic, setFilterDynamic] = useState("open");
  const intialAssigneeName = "Select member";
  const [filterByAssignee, setFilterByAssignee] = useState(intialAssigneeName);

  const [isLoading, setIsLoading] = useState(false);
  const [isEmailListLoading, setIsEmailListLoading] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const lastRefreshedAtRef = useRef<number | null>(null);

  const [visibleManagers, setVisibleManagers] = useState<any[]>([]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const lastRefreshedLabel = useMemo(() => {
    const lastRefreshedAt = lastRefreshedAtRef.current;
    if (!lastRefreshedAt) return "Not refreshed yet";
    const diffMs = Math.max(0, nowTs - lastRefreshedAt);
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 15) return "Last refreshed just now";
    if (diffSec < 60) return `Last refreshed ${diffSec} sec ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Last refreshed ${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `Last refreshed ${diffHr} hr ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `Last refreshed ${diffDay} d ago`;
  }, [nowTs]);

  // console.log("deparmentCategoryList -->", deparmentCategoryList);
  // console.log("filterByAssignee -->", filterByAssignee);

  const refreshAllData = async (selectedUserId?: string) => {
    setSelectedTicket(null);
    setIsLoading(true);
    setIsEmailListLoading(true);
    const { userName } = getAuthCredentials();
    try {
      const [ticketsResp, allDepartmentCategory] = await Promise.all([
        fetchHelpdeskEmailListData(
          selectedUserId ? selectedUserId : userName.toUpperCase(),
        ), //  "HAKIMK"
        getAllDepartmentCategoryList(),
      ]);
      const groupsRaw: any =
        (Array.isArray(ticketsResp) ? ticketsResp[0] : ticketsResp) || {};
      const groups: TicketListData = {
        open: Array.isArray(groupsRaw.open) ? groupsRaw.open : [],
        inProcess: Array.isArray(groupsRaw.inProcess)
          ? groupsRaw.inProcess
          : [],

        pendingOnSap: Array.isArray(groupsRaw.pendingOnSap)
          ? groupsRaw.pendingOnSap
          : [],
        awaiting3rdParty: Array.isArray(groupsRaw.awaiting3rdParty)
          ? groupsRaw.awaiting3rdParty
          : [],
        pendingReviewApproval: Array.isArray(groupsRaw.pendingReviewApproval)
          ? groupsRaw.pendingReviewApproval
          : [],
        workCompleted: Array.isArray(groupsRaw.workCompleted)
          ? groupsRaw.workCompleted
          : [],
        reopen: Array.isArray(groupsRaw.reopen) ? groupsRaw.reopen : [],
        unassigned: Array.isArray(groupsRaw.unassigned)
          ? groupsRaw.unassigned
          : [],

        closed: Array.isArray(groupsRaw.closed) ? groupsRaw.closed : [],

        manager: Array.isArray(groupsRaw.manager) ? groupsRaw.manager : [],
        status: Array.isArray(groupsRaw.status) ? groupsRaw.status : [],
      };
      const result = groupByEscalation(allDepartmentCategory);
      // console.log("groupByEscalation -->", result);
      // console.log("groupsRaw.manager -->", groupsRaw.manager);

      const resultOfVisbibleManagers = getAccessibleManagers(
        groupsRaw.manager, // itManager,
        result, //accessRules,
        userName.toUpperCase(), //  "HAKIMK" //
      );

      // console.log("resultOfVisbibleManagers -->", resultOfVisbibleManagers);

      // Add the logged-in user to the visible managers list if not empty
      let finalVisibleManagers = [...resultOfVisbibleManagers];
      if (resultOfVisbibleManagers.length > 0) {
        const loggedInUserData = groupsRaw.manager.find(
          (m: any) => String(m.userid).toUpperCase() === userName.toUpperCase(), // "HAKIMK" //
        );

        finalVisibleManagers.push(loggedInUserData);
      }

      setVisibleManagers(finalVisibleManagers);
      setTicketData(groups);
      lastRefreshedAtRef.current = Date.now();
      setNowTs(Date.now()); // update label immediately after refresh
      toast({
        title: "Data Refreshed",
        description: ``,
      });
    } catch (error) {
      console.log("error while refreshing data in parallel -->", error);
      const errorMessage = error?.message || "Failed to load mail request data";
      toast({
        title: "Error Loading Data",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsEmailListLoading(false);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  const EXCLUDED_FIELDS = ["manager", "status"];

  const filterKeys = useMemo(() => {
    if (!ticketData || typeof ticketData !== "object") return [];

    return Object.keys(ticketData)
      .filter((k) => Array.isArray(ticketData[k]))
      .filter((k) => !EXCLUDED_FIELDS.includes(k));
  }, [ticketData]);

  // Calculate ticket counts for each category
  const ticketCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filterKeys.forEach((key) => {
      counts[key] = Array.isArray(ticketData[key]) ? ticketData[key].length : 0;
    });
    // Calculate total for "all"
    counts.all = filterKeys.reduce(
      (total, key) =>
        total + (Array.isArray(ticketData[key]) ? ticketData[key].length : 0),
      0,
    );
    return counts;
  }, [ticketData, filterKeys]);

  const selectedItems = useMemo(() => {
    if (filterDynamic === "all") {
      // Deduplicate rows across groups by ticketId when showing "all"
      const uniqueById = new Map<string, any>();
      const noIdRows: any[] = [];
      for (const key of filterKeys) {
        const list = Array.isArray(ticketData[key]) ? ticketData[key] : [];
        for (const row of list) {
          const id = row?.ticketId ? String(row.ticketId) : "";
          if (id) {
            if (!uniqueById.has(id)) uniqueById.set(id, row);
          } else {
            noIdRows.push(row);
          }
        }
      }
      return [...Array.from(uniqueById.values()), ...noIdRows];
    }
    if (!filterDynamic) return [] as any[];
    const arr = ticketData?.[filterDynamic];
    return Array.isArray(arr) ? arr : [];
  }, [ticketData, filterDynamic, filterKeys]);

  // console.log("selectedItems -->", selectedItems);

  const assigneeOptions = useMemo(() => {
    const { userName } = getAuthCredentials();
    const managers = Array.isArray(ticketData?.manager)
      ? ticketData.manager
      : [];

    // Filter managers based on visibleManagers
    let filteredManagers = managers;

    if (Array.isArray(visibleManagers) && visibleManagers.length > 0) {
      // If visibleManagers has data, filter to show only those managers
      const visibleUserIds = new Set(
        visibleManagers.map((m) => String(m.userid).toUpperCase()),
      );
      filteredManagers = managers.filter((m: any) =>
        visibleUserIds.has(String(m.userid).toUpperCase()),
      );
    } else if (visibleManagers.length === 0) {
      // If visibleManagers is empty, show only the logged-in user
      filteredManagers = managers.filter(
        (m: any) => String(m.userid).toUpperCase() === userName.toUpperCase(), // "HAKIMK"
      );
    }

    // De-duplicate by userid just in case
    const seen = new Set<string>();
    const opts = filteredManagers
      .filter((m: any) => {
        if (!m?.userid) return false;
        const id = String(m.userid);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((m: any) => ({
        value: String(m.userid),
        label: String(m.name || m.userid),
      }));
    return [
      { value: intialAssigneeName, label: intialAssigneeName },
      // { value: "unassigned", label: "Unassigned" },
      ...opts,
    ];
  }, [ticketData, visibleManagers]);

  // Ensure selected assignee stays valid when options change
  useEffect(() => {
    const exists = assigneeOptions.some((o) => o.value === filterByAssignee);
    if (!exists) {
      setFilterByAssignee(intialAssigneeName);
    }
  }, [assigneeOptions, filterByAssignee, intialAssigneeName]);

  // Auto-select logged-in user by default if they exist in options
  useEffect(() => {
    if (filterByAssignee === intialAssigneeName && assigneeOptions.length > 1) {
      const { userName } = getAuthCredentials();
      const loggedInUserOption = assigneeOptions.find(
        (opt) => String(opt.value).toUpperCase() === userName.toUpperCase(), // "HAKIMK"
      );

      if (loggedInUserOption) {
        setFilterByAssignee(loggedInUserOption.value);
      }
    }
  }, [assigneeOptions, filterByAssignee, intialAssigneeName]);

  const ticketsForList = useMemo(() => {
    // Map raw API list items directly to the Ticket shape consumed by
    // EmailList/EmailThread. Per-ticket details (status, priority, category,
    // description) are loaded on demand from the ticket-detail API inside
    // EmailThread, so they are left empty here instead of being fabricated.
    const toTicket = (it: any): Ticket => {
      const created = it?.createdDateTime
        ? new Date(it.createdDateTime)
        : new Date();
      return {
        id: it?.ticketId,
        source: "email",
        receivedDate: created,
        customerName: it?.sender,
        customerEmail: it?.sender,
        subject: it?.subject,
        description: "",
        attachments: [],
        ticketType: "request",
        department: "",
        priority: "" as Ticket["priority"],
        status: "" as Ticket["status"],
        slaDeadline: created,
        createdBy: it?.sender,
        assignedTo: it?.assigned || "",
        tasks: [],
        collaborators: [],
        escalationLevel: 0,
        escalationHistory: [],
        unread: it?.unread || "",
        tracker: {
          ticketId: it?.ticketId ?? "",
          priority: "",
          status: "",
          statusTxt: "",
        },
      } as Ticket;
    };
    const byAssignee = (it: any) => {
      if (filterByAssignee === intialAssigneeName) return true;
      if (filterByAssignee === "unassigned")
        return !(it?.assigned && String(it.assigned).trim());
      const assigned = (it?.assigned || "").toString();
      // Show both matching assigned tickets AND unassigned tickets
      return (
        assigned.toUpperCase() === filterByAssignee.toUpperCase() ||
        !assigned.trim()
      );
    };
    return (selectedItems || []).filter(byAssignee).map(toTicket);
  }, [selectedItems, filterByAssignee]);

  // console.log("ticketsForList -->", ticketsForList);

  const filteredTickets = useMemo(() => {
    const searchLower = searchQuery?.toLowerCase();
    return ticketsForList?.filter((ticket) => {
      const matchesSearch =
        ticket?.subject?.toLowerCase().includes(searchLower) ||
        ticket?.customerName?.toLowerCase().includes(searchLower) ||
        ticket?.customerEmail?.toLowerCase().includes(searchLower) ||
        ticket?.id?.toLowerCase().includes(searchLower);
      return matchesSearch;
    });
  }, [searchQuery, ticketsForList]);

  // Memoize callbacks to prevent unnecessary re-renders
  const handleSendMailType = useCallback((mailType: "Reply" | string) => {
    if (mailType === "Reply") {
      setShowCompose(true);
      setShowComposeFw(false);
    } else {
      setShowCompose(true);
      setShowComposeFw(true);
    }
  }, []);

  const openComposerWithContext = useCallback((ctx: ComposeContext) => {
    setComposeContext(ctx);
    setShowCompose(true);
    setShowComposeFw(ctx.mode === "forward");
  }, []);

  const handleNavigateBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleTicketSelect = useCallback((ticket: Ticket) => {
    setSelectedTicket(ticket);
  }, []);

  const handleCloseCompose = useCallback(() => {
    setShowCompose(false);
  }, []);

  const handleCloseCreateTicket = useCallback(() => {
    setShowCreateTicket(false);
  }, []);

  const handleCloseCreateCollaborator = useCallback(() => {
    setShowCreateCollaborator(false);
  }, []);

  const handleShowCreateTicket = useCallback(() => {
    setShowCreateTicket(true);
  }, []);

  const handleShowCreateCollaborator = useCallback(() => {
    setShowCreateCollaborator(true);
  }, []);

  const handleReply = useCallback(() => {
    handleSendMailType("Reply");
  }, [handleSendMailType]);

  const handleForward = useCallback(() => {
    handleSendMailType("Forward");
  }, [handleSendMailType]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [],
  );

  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedTicket(null);
      setFilterDynamic(e.target.value);
    },
    [],
  );

  const handleAssignedByFilterChange = useCallback(
    async (val: string) => {
      setSelectedTicket(null);
      setFilterByAssignee(val);

      // Only call API if a specific user is selected (not "Select member" or "unassigned")
      if (val !== intialAssigneeName && val !== "unassigned") {
        setIsEmailListLoading(true);
        try {
          const [ticketsResp] = await Promise.all([
            fetchHelpdeskEmailListData(val),
          ]);
          const groupsRaw: any =
            (Array.isArray(ticketsResp) ? ticketsResp[0] : ticketsResp) || {};
          const groups: TicketListData = {
            open: Array.isArray(groupsRaw.open) ? groupsRaw.open : [],
            inProcess: Array.isArray(groupsRaw.inProcess)
              ? groupsRaw.inProcess
              : [],

            pendingOnSap: Array.isArray(groupsRaw.pendingOnSap)
              ? groupsRaw.pendingOnSap
              : [],
            awaiting3rdParty: Array.isArray(groupsRaw.awaiting3rdParty)
              ? groupsRaw.awaiting3rdParty
              : [],
            pendingReviewApproval: Array.isArray(
              groupsRaw.pendingReviewApproval,
            )
              ? groupsRaw.pendingReviewApproval
              : [],
            workCompleted: Array.isArray(groupsRaw.workCompleted)
              ? groupsRaw.workCompleted
              : [],
            reopen: Array.isArray(groupsRaw.reopen) ? groupsRaw.reopen : [],
            unassigned: Array.isArray(groupsRaw.unassigned)
              ? groupsRaw.unassigned
              : [],

            closed: Array.isArray(groupsRaw.closed) ? groupsRaw.closed : [],

            manager: Array.isArray(groupsRaw.manager) ? groupsRaw.manager : [],
            status: Array.isArray(groupsRaw.status) ? groupsRaw.status : [],
          };
          setTicketData(groups);
          lastRefreshedAtRef.current = Date.now();
          setNowTs(Date.now()); // update label immediately after refresh
        } catch (error) {
          console.log("error while fetching data for assignee -->", error);
          toast({
            title: "Error Loading Data",
            description:
              error?.message || "Failed to load data for selected assignee",
            variant: "destructive",
          });
        } finally {
          setIsEmailListLoading(false);
        }
      }
    },
    [toast],
  );

  const handleClearFilters = useCallback(() => {
    setSelectedTicket(null);
    setSearchQuery("");
    setFilterDynamic("open");
    setFilterByAssignee(intialAssigneeName);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background">
      <LoadingOverlay open={isEmailListLoading} />
      {/* Fixed Header */}
      <div className="flex items-center gap-2 px-4 h-[52px] bg-white border-b border-slate-200">
        {/* Left: navigation actions */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() =>
              (window.location.href = "https://gerahub.com/projects")
            }
            className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium bg-[#1e3a5f] hover:bg-[#16304f] text-[#e6f1fb] border-0 shadow-none"
          >
            <Home size={14} />
            Projects
          </Button>

          <div className="w-px h-5 bg-slate-200" />

          <Button
            variant="outline"
            onClick={() =>
              navigate("/mail-box", {
                state: { managers: ticketData?.manager || [] },
              })
            }
            className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 shadow-none"
          >
            <Mail size={14} className="text-indigo-600" />
            Mailbox
          </Button>

          {/* <Button
            variant="outline"
            onClick={() =>
              navigate("/dashboard/admin/category-config", {
                state: { managers: ticketData?.manager || [] },
              })
            }
            className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100 shadow-none"
          >
            <Settings size={14} className="text-slate-600" />
            Config
          </Button> */}

          <Button
            variant="outline"
            onClick={() =>
              navigate("/dashboard/admin/spoc-availability", {
                state: { managers: ticketData?.manager || [] },
              })
            }
            className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 shadow-none"
          >
            <CalendarOff size={14} className="text-rose-600" />
            Availability
          </Button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: system status */}
        <div className="flex items-center gap-3">
          {/* Refresh timestamp chip */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-500 whitespace-nowrap"
            title={
              lastRefreshedAtRef.current
                ? new Date(lastRefreshedAtRef.current).toLocaleString()
                : ""
            }
          >
            <SyncDot isRefreshing={isLoading} elapsed={0} />
            {lastRefreshedLabel}
          </div>

          {/* Notification bell */}
          <button
            className="relative flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
            aria-label="Notifications"
          >
            <NotificationBell />
          </button>
        </div>
      </div>

      {/* Fixed Filter Bar */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-border bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search tickets…"
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-7 pr-3 py-1.5 h-8 w-64 text-sm rounded-md border border-slate-200 bg-white text-slate-900 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors min-w-[300px]"
            />
          </div>

          <div className="w-px h-4 bg-slate-200" />

          <select
            value={filterDynamic}
            onChange={handleFilterChange}
            className="px-2 py-1 h-8 text-sm border border-border rounded-md bg-white"
          >
            {filterKeys.map((k) => (
              <option key={k} value={k}>
                {capitalize(k)} - {ticketCounts[k] || 0}
              </option>
            ))}
            <option value="all">
              {capitalize("all")} - {ticketCounts.all || 0}
            </option>
          </select>
          {/* <Button variant="ghost" size="sm">
            <Filter className="h-4 w-4" />
          </Button> */}
          <div className="w-px h-4 bg-slate-200" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshAllData(filterByAssignee)}
            disabled={isLoading}
            className="flex items-center gap-2 h-8 bg-white"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
            {isLoading ? "Loading..." : "Refresh Data"}
          </Button>

          <div className="w-px h-4 bg-slate-200" />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="flex items-center gap-1.5 h-8 px-3 text-sm text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 shadow-none"
          >
            <X size={12} />
            Clear filters
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={filterByAssignee}
            onValueChange={handleAssignedByFilterChange}
          >
            <SelectTrigger className="w-[240px] h-8 bg-white">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {assigneeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Content Area with Independent Scrolling */}
      <div className="flex-1 flex min-h-0">
        {/* EmailList - Independently Scrollable */}
        <div className="w-80 border-r border-border bg-muted/20 flex flex-col">
          <EmailList
            tickets={filteredTickets}
            selectedTicket={selectedTicket}
            onTicketSelect={handleTicketSelect}
          />
        </div>

        {/* EmailThread - Independently Scrollable */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {selectedTicket ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <EmailThread
                ticket={selectedTicket}
                onCompose={openComposerWithContext}
                onForward={openComposerWithContext}
                managers={ticketData?.manager || []}
                ticketData={ticketData}
                onEditDataSave={() => refreshAllData(filterByAssignee)}
                statusList={ticketData?.status || []}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-2xl">📧</span>
                </div>
                <h3 className="text-lg font-medium mb-2">No ticket selected</h3>
                <p className="text-sm">
                  Select a ticket from the list to view the email thread
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCompose && (
        <EmailCompose
          onClose={handleCloseCompose}
          selectedTicket={selectedTicket}
          isForwardMailType={showComposeFw}
          composeContext={composeContext}
          statusList={ticketData?.status || []}
        />
      )}

      {showCreateTicket && (
        <CreateTicketForm onClose={handleCloseCreateTicket} />
      )}

      {showCreateCollaborator && (
        <CreateCollaboratorForm
          onClose={handleCloseCreateCollaborator}
          selectedTicket={selectedTicket}
        />
      )}
    </div>
  );
}
