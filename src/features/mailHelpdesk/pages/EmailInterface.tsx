import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarOff,
  Home,
  Mail,
  RefreshCw,
  Search,
  Settings2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/NotificationBell.tsx";
import { SyncDot } from "@/components/SyncDot.tsx";

import EmailList from "../components/EmailList.tsx";
import EmailThread from "../components/EmailThread.tsx";
import { EmailCompose } from "../components/EmailCompose.tsx";
import { ComposeContext } from "../types/compose.ts";
import type { TicketListFilters, TicketListRow } from "../types/pg";
import {
  flattenTicketPages,
  helpdeskKeys,
  useInfiniteTickets,
  useMarkTicketRead,
  useTicketCounts,
} from "../hooks/pg";
import { useHelpdeskAuth } from "../context/helpdeskAuthContext.ts";
import { usePermissions } from "../permissions";
import { toLegacyTicket } from "../utils/pgTicket.ts";

const PAGE_SIZE = 25;
const ALL_STATES = "__all__";

/** Which slice of the department queue to show. */
type Scope = "all" | "mine" | "unassigned";

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "last_activity_at:desc", label: "Recent activity" },
  { value: "ticket_number:asc", label: "Ticket number" },
] as const;

export function EmailInterface() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, workflowStates } = useHelpdeskAuth();
  // Drives the Administration button. Permissions, not the role code — the
  // seeded grants make the two look interchangeable and they are not.
  const { codes: adminPermissions } = usePermissions();

  // --- filters. One object drives both the list and the counts. -----------
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stateCode, setStateCode] = useState<string>(ALL_STATES);
  const [scope, setScope] = useState<Scope>("mine");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sort, setSort] = useState<string>(SORT_OPTIONS[0].value);

  const [selectedRow, setSelectedRow] = useState<TicketListRow | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext | null>(
    null,
  );

  const [nowTs, setNowTs] = useState(() => Date.now());
  const lastRefreshedAtRef = useRef<number | null>(null);

  // Debounce the search box: `search` is a server round trip per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // `page` is owned by the infinite query, so it is deliberately absent here.
  const filters = useMemo<TicketListFilters>(
    () => ({
      limit: PAGE_SIZE,
      sort: sort as TicketListFilters["sort"],
      search: search || undefined,
      state: stateCode === ALL_STATES ? undefined : stateCode,
      assignedToUserId: scope === "mine" ? user?.id : undefined,
      unassigned: scope === "unassigned" ? true : undefined,
      unreadOnly: unreadOnly || undefined,
    }),
    [sort, search, stateCode, scope, unreadOnly, user?.id],
  );

  // The counts endpoint ignores paging and sorting, so leaving them out keeps
  // one cache entry per filter set rather than one per page size or order.
  const countFilters = useMemo<TicketListFilters>(() => {
    const { limit: _limit, sort: _sort, ...rest } = filters;
    return rest;
  }, [filters]);

  const {
    data: ticketPages,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteTickets(filters);
  const { data: counts } = useTicketCounts(countFilters);
  const markRead = useMarkTicketRead();

  const rows = useMemo(() => flattenTicketPages(ticketPages), [ticketPages]);
  const total = ticketPages?.pages[0]?.meta?.total;

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Scrolling back to the top belongs to the filter set, not to any one field.
  const resetToken = useMemo(() => JSON.stringify(filters), [filters]);

  // Prefer the freshly fetched row for the open ticket: a transition changes
  // its state and assignee, and the header reads those from the list join.
  const selectedListRow = useMemo(
    () =>
      selectedRow
        ? (rows.find((row) => row.id === selectedRow.id) ?? selectedRow)
        : null,
    [rows, selectedRow],
  );

  useEffect(() => {
    if (!isFetching) {
      lastRefreshedAtRef.current = Date.now();
      setNowTs(Date.now());
    }
  }, [isFetching]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Could not load tickets",
      description: error.message,
      variant: "destructive",
    });
  }, [error, toast]);

  const lastRefreshedLabel = useMemo(() => {
    const at = lastRefreshedAtRef.current;
    if (!at) return "Not refreshed yet";
    const diffSec = Math.floor(Math.max(0, nowTs - at) / 1000);
    if (diffSec < 15) return "Last refreshed just now";
    if (diffSec < 60) return `Last refreshed ${diffSec} sec ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Last refreshed ${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `Last refreshed ${diffHr} hr ago`;
    return `Last refreshed ${Math.floor(diffHr / 24)} d ago`;
  }, [nowTs]);

  /**
   * Opens a ticket, and clears this user's unread markers only when they
   * actually had some. Reading is something the person did, so the client says
   * when — never on a prefetch.
   *
   * @param row the list row that was clicked
   */
  const handleTicketSelect = useCallback(
    (row: TicketListRow) => {
      setSelectedRow(row);
      if (row.has_unread) markRead.mutate(row.id);
    },
    [markRead],
  );

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: helpdeskKeys.tickets() });
  }, [queryClient]);

  const handleClearFilters = useCallback(() => {
    setSearchInput("");
    setStateCode(ALL_STATES);
    setScope("all");
    setUnreadOnly(false);
    setSort(SORT_OPTIONS[0].value);
    setSelectedRow(null);
  }, []);

  const openComposerWithContext = useCallback((ctx: ComposeContext) => {
    setComposeContext(ctx);
    setShowCompose(true);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Fixed Header */}
      <div className="flex items-center gap-2 px-4 h-[52px] bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Button
            onClick={() =>
              (window.location.href =
                "https://hostappgera-dev.azurewebsites.net/projects")
            }
            className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium bg-[#1e3a5f] hover:bg-[#16304f] text-[#e6f1fb] border-0 shadow-none"
          >
            <Home size={14} />
            Projects
          </Button>

          <div className="w-px h-5 bg-slate-200" />

          <Button
            variant="outline"
            onClick={() => navigate("/mail-box")}
            className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 shadow-none"
          >
            <Mail size={14} className="text-indigo-600" />
            Mailbox
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate("/dashboard/out-of-office")}
            className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 shadow-none"
          >
            <CalendarOff size={14} className="text-rose-600" />
            Out of office
          </Button>

          {/* Shown only to someone who holds at least one helpdesk permission.
              An EMPLOYEE holds none and is refused from every admin route. */}
          {adminPermissions.length > 0 && (
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard/admin")}
              className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100 shadow-none"
            >
              <Settings2 size={14} className="text-slate-600" />
              Administration
            </Button>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            {user?.fullName || user?.email}
            {user?.roleCode && (
              <span className="ml-1.5 text-slate-400">{user.roleCode}</span>
            )}
          </div>

          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-500 whitespace-nowrap"
            title={
              lastRefreshedAtRef.current
                ? new Date(lastRefreshedAtRef.current).toLocaleString()
                : ""
            }
          >
            <SyncDot isRefreshing={isFetching} elapsed={0} />
            {lastRefreshedLabel}
          </div>

          <button
            className="relative flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
            aria-label="Notifications"
          >
            <NotificationBell />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-border bg-muted/30 flex-shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search subject or ticket number…"
              value={searchInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearchInput(e.target.value)
              }
              maxLength={200}
              className="pl-7 pr-3 py-1.5 h-8 w-64 text-sm rounded-md border border-slate-200 bg-white text-slate-900 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors min-w-[300px]"
            />
          </div>

          <div className="w-px h-4 bg-slate-200" />

          {/* Every state the department defines, with its own count — including
              the zero ones, which must render as "Resolved (0)", not vanish. */}
          <Select value={stateCode} onValueChange={setStateCode}>
            <SelectTrigger className="w-[210px] h-8 bg-white">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL_STATES}>
                All states{counts ? ` (${counts.total})` : ""}
              </SelectItem>
              {workflowStates.map((state) => (
                <SelectItem key={state.code} value={state.code}>
                  {state.name}
                  {counts ? ` (${counts.byState[state.code] ?? 0})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <SelectTrigger className="w-[170px] h-8 bg-white">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tickets</SelectItem>
              <SelectItem value="mine">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[170px] h-8 bg-white">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setUnreadOnly((v) => !v)}
            className={`h-8 ${
              unreadOnly
                ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                : "bg-white"
            }`}
          >
            Unread{counts ? ` (${counts.unread})` : ""}
          </Button>

          <div className="w-px h-4 bg-slate-200" />

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex items-center gap-2 h-8 bg-white"
          >
            <RefreshCw
              className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
            />
            {isFetching ? "Loading..." : "Refresh"}
          </Button>

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

        {/* The list loads as it scrolls, so this is a readout, not a control. */}
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {total === undefined ? "—" : `${rows.length} of ${total} loaded`}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        <div className="w-80 border-r border-border bg-muted/20 flex flex-col">
          <EmailList
            rows={rows}
            selectedTicketId={selectedRow?.id ?? null}
            onTicketSelect={handleTicketSelect}
            // Fetching the next page must not read as "the list is reloading".
            isLoading={isFetching && !isFetchingNextPage}
            total={total}
            hasMore={hasNextPage}
            isLoadingMore={isFetchingNextPage}
            onLoadMore={handleLoadMore}
            resetToken={resetToken}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {selectedListRow ? (
            <EmailThread
              key={selectedListRow.id}
              ticketId={selectedListRow.id}
              listRow={selectedListRow}
              onCompose={openComposerWithContext}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-2xl">📧</span>
                </div>
                <h3 className="text-lg font-medium mb-2">No ticket selected</h3>
                <p className="text-sm">
                  Select a ticket from the list to view it
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCompose && (
        <EmailCompose
          onClose={() => setShowCompose(false)}
          selectedTicket={
            selectedListRow ? toLegacyTicket(selectedListRow) : null
          }
          isForwardMailType={composeContext?.mode === "forward"}
          composeContext={composeContext}
          // Status moves through the workflow now, so the composer offers none.
          statusList={[]}
        />
      )}
    </div>
  );
}
