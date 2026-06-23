import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import {
  Search,
  RefreshCw,
  User,
  X,
  Send,
  Inbox,
  ArrowLeft,
} from "lucide-react";

import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import { Button } from "@/components/ui/button.tsx";
import LoadingOverlay from "@/components/ui/loading-overlay.tsx";
import {
  fetchMoreSentMails,
  getSentMailItems,
  searchSentEmailsByCustomer,
  getInboxMailItems,
  searchInboxEmailsByCustomer,
  fetchMoreInboxMails,
} from "@/features/mailHelpdesk/api/graphEmail.ts";
import { GraphSentMessage } from "../types/sentMailType.ts";
import { DateRangeFilter } from "@/components/DateRangeFilter.tsx";
import MailBoxThread from "../components/MailBoxThread.tsx";
import MailBoxList from "../components/MailBoxList.tsx";
import {
  getAllTicketDetail,
  ticketDetailMailBox,
} from "../mail-api/api-mail.ts";

function MailBoxInterface() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const customerSearchInputRef = useRef<HTMLInputElement>(null);

  const location = useLocation();
  const managers = location.state?.managers || [];

  const [mailType, setMailType] = useState<"sent" | "inbox">("sent");
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [sentMailList, setSendMailList] = useState<GraphSentMessage[] | null>(
    [],
  );
  const [nextLink, setNextLink] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isCustomerSearchActive, setIsCustomerSearchActive] = useState(false);
  const [selectedCustomerEmail, setSelectedCustomerEmail] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isEmailListLoading, setIsEmailListLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCustomerSearching, setIsCustomerSearching] = useState(false);

  // Date range state - initialized to today's date
  const [startDate, setStartDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [endDate, setEndDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd"),
  );

  // state for storing ticket details
  const [ticketDetailData, setTicketDetailData] = useState<
    ticketDetailMailBox[]
  >([]);
  const [selectedTicketDetail, setSelectedTicketDetail] =
    useState<ticketDetailMailBox | null>(null);

  const refreshAllData = async (start?: string, end?: string) => {
    setIsLoading(true);
    setIsEmailListLoading(true);
    try {
      // Use provided dates or fall back to state dates
      const effectiveStartDate = start || startDate;
      const effectiveEndDate = end || endDate;

      const response =
        mailType === "sent"
          ? await getSentMailItems(effectiveStartDate, effectiveEndDate)
          : await getInboxMailItems(effectiveStartDate, effectiveEndDate);

      const mails = response?.mails || [];
      setSendMailList(mails);
      setNextLink(response?.nextLink || null);
      fetchAllTicketDetails(mails, false);
      toast({
        title: "Data Refreshed",
        description: `Loaded ${
          mailType === "sent" ? "sent" : "inbox"
        } emails from ${format(
          new Date(effectiveStartDate),
          "MMM dd, yyyy",
        )} to ${format(new Date(effectiveEndDate), "MMM dd, yyyy")}`,
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

  const fetchAllTicketDetails = async (
    mails: GraphSentMessage[],
    append = false,
  ) => {
    if (!mails || mails.length === 0) return;
    const conversationIds = mails.map((m) => ({
      conversation_id: m.conversationId,
    }));
    try {
      const resp = await getAllTicketDetail(conversationIds);
      setTicketDetailData((prev: any[]) =>
        append ? [...(prev || []), ...(resp || [])] : resp,
      );
    } catch (error) {
      console.log("error while fetching ticket data -->", error);
      const errorMessage =
        error?.message || "Failed to load ticket detail data";
      toast({
        title: "Error loading ticket data",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    refreshAllData();
  }, [mailType]);

  const filteredTickets = useMemo(() => {
    if (!sentMailList || sentMailList.length === 0) {
      return [];
    }
    const searchLower = searchQuery?.toLowerCase();
    return sentMailList?.filter((ticket) => {
      const matchesSearch = ticket?.subject
        ?.toLowerCase()
        .includes(searchLower);
      return matchesSearch;
    });
  }, [searchQuery, sentMailList]);

  const handleNavigateBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleTicketSelect = useCallback(
    (ticket: any) => {
      if (!Array.isArray(ticketDetailData)) {
        console.error("ticketDetailData is not an array", ticketDetailData);
        setSelectedTicket(ticket);
        setSelectedTicketDetail(null);
        return;
      }

      const matchedTicket = ticketDetailData.find(
        (item) =>
          item.CONVERSATION_ID?.trim() === ticket.conversationId?.trim(),
      );
      // console.log("Matched Ticket:", matchedTicket);
      setSelectedTicketDetail(matchedTicket || null);
      setSelectedTicket(ticket);
    },
    [ticketDetailData],
  );

  // Keep selectedTicketDetail in sync when ticketDetailData is refreshed (e.g. after re-assignment)
  useEffect(() => {
    if (!selectedTicket || !Array.isArray(ticketDetailData)) return;
    const matchedTicket = ticketDetailData.find(
      (item) =>
        item.CONVERSATION_ID?.trim() === selectedTicket.conversationId?.trim(),
    );
    setSelectedTicketDetail(matchedTicket || null);
  }, [ticketDetailData]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [],
  );

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleCustomerSelect = useCallback(
    async (customer: any) => {
      setCustomerSearchQuery(customer.name);
      setSelectedCustomerEmail(customer.email);

      // Automatically search for emails for this customer
      setIsCustomerSearching(true);
      setIsEmailListLoading(true);
      try {
        const response =
          mailType === "sent"
            ? await searchSentEmailsByCustomer(customer.email)
            : await searchInboxEmailsByCustomer(customer.email);
        const mails = response?.mails || [];
        setSendMailList(mails);
        setNextLink(response?.nextLink || null);
        setIsCustomerSearchActive(true);
        fetchAllTicketDetails(mails, false);
        toast({
          title: "Customer Search Complete",
          description: `Found ${mails.length} ${
            mailType === "sent" ? "sent" : "inbox"
          } emails for ${customer.name} (${customer.email})`,
        });
      } catch (error: any) {
        console.log("error while searching customer emails -->", error);
        const errorMessage =
          error?.message || "Failed to search customer emails";
        toast({
          title: "Search Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsCustomerSearching(false);
        setIsEmailListLoading(false);
      }
    },
    [toast, mailType],
  );

  const handleCustomerSearch = useCallback(async () => {
    if (!selectedCustomerEmail && !customerSearchQuery.trim()) {
      toast({
        title: "Select or Enter Customer",
        description:
          "Please select a customer from the dropdown or enter an email address",
        variant: "destructive",
      });
      return;
    }

    const emailToSearch = selectedCustomerEmail || customerSearchQuery.trim();

    setIsCustomerSearching(true);
    setIsEmailListLoading(true);
    try {
      const response =
        mailType === "sent"
          ? await searchSentEmailsByCustomer(emailToSearch)
          : await searchInboxEmailsByCustomer(emailToSearch);
      const mails = response?.mails || [];
      setSendMailList(mails);
      setNextLink(response?.nextLink || null);
      setIsCustomerSearchActive(true);
      fetchAllTicketDetails(mails, false);
      toast({
        title: "Customer Search Complete",
        description: `Found ${mails.length} ${
          mailType === "sent" ? "sent" : "inbox"
        } emails for "${emailToSearch}"`,
      });
    } catch (error: any) {
      console.log("error while searching customer emails -->", error);
      const errorMessage = error?.message || "Failed to search customer emails";
      toast({
        title: "Search Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsCustomerSearching(false);
      setIsEmailListLoading(false);
    }
  }, [customerSearchQuery, selectedCustomerEmail, toast, mailType]);

  const handleClearCustomerSearch = useCallback(() => {
    setCustomerSearchQuery("");
    setSelectedCustomerEmail("");
    setIsCustomerSearchActive(false);
    // Reload the default date-filtered emails
    refreshAllData(startDate, endDate);
  }, [startDate, endDate]);

  const handleStartDateChange = useCallback((date: string) => {
    setStartDate(date);
  }, []);

  const handleEndDateChange = useCallback((date: string) => {
    setEndDate(date);
  }, []);

  const handleApplyDateFilter = useCallback(() => {
    refreshAllData(startDate, endDate);
  }, [startDate, endDate]);

  const loadMore = useCallback(async () => {
    if (!nextLink || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res =
        mailType === "sent"
          ? await fetchMoreSentMails(nextLink)
          : await fetchMoreInboxMails(nextLink);
      const newMails = res.mails || [];
      setSendMailList((prev) => [...(prev || []), ...newMails]);
      setNextLink(res.nextLink);
      fetchAllTicketDetails(newMails, true);
    } catch (error: any) {
      console.log("error while loading more emails -->", error);
      const errorMessage = error?.message || "Failed to load more emails";
      toast({
        title: "Error Loading More",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextLink, isLoadingMore, toast, mailType]);

  return (
    <div className="h-screen flex flex-col bg-background">
      <LoadingOverlay open={isEmailListLoading} text="Loading..." />
      {/* Fixed Header */}
      <div className="flex items-center justify-between px-6 py-1 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleNavigateBack()}
            className="group mb-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <ArrowLeft className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:-translate-x-1" />
            Back
          </Button>
        </div>
      </div>

      {/* Mail Type Selector */}
      <div className="px-6 py-3 border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            View:
          </span>
          <div className="inline-flex rounded-lg border border-border bg-muted p-1">
            <button
              onClick={() => {
                setMailType("sent");
                setSelectedTicket(null);
                setCustomerSearchQuery("");
                setSelectedCustomerEmail("");
                setIsCustomerSearchActive(false);
              }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                mailType === "sent"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Send className="h-4 w-4" />
              Sent Items
            </button>
            <button
              onClick={() => {
                setMailType("inbox");
                setSelectedTicket(null);
                setCustomerSearchQuery("");
                setSelectedCustomerEmail("");
                setIsCustomerSearchActive(false);
              }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                mailType === "inbox"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Inbox className="h-4 w-4" />
              Inbox
            </button>
          </div>
        </div>
      </div>

      {/* Fixed Filter Bar */}
      <div className="px-6 py-3 border-b border-border bg-muted/30 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Subject Search */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by subject..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="px-3 py-1.5 text-sm border border-border rounded-md bg-background min-w-[200px]"
            />
            <Button variant="ghost" size="sm">
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-border" />

          {/* Customer Email Search */}
          <div className="flex items-center gap-2 relative">
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={customerSearchInputRef}
                type="text"
                placeholder="Search by customer name or email..."
                value={customerSearchQuery}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  setSelectedCustomerEmail(""); // Clear selected email when typing
                }}
                className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-md bg-background min-w-[280px]"
              />
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleCustomerSearch}
              disabled={
                isCustomerSearching ||
                (!selectedCustomerEmail && !customerSearchQuery.trim())
              }
              className="flex items-center gap-1.5"
            >
              {isCustomerSearching ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {isCustomerSearching ? "Searching..." : "Search"}
            </Button>
            {isCustomerSearchActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearCustomerSearch}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-border" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshAllData()}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
            {isLoading ? "Loading..." : "Refresh"}
          </Button>

          {/* Date Range Filter */}
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={handleStartDateChange}
            onEndDateChange={handleEndDateChange}
            onApplyFilter={handleApplyDateFilter}
          />
        </div>
      </div>

      {/* Active Customer Search Indicator */}
      {isCustomerSearchActive && (
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full flex items-center gap-1.5">
            <User className="h-3 w-3" />
            Showing results for: <strong>{customerSearchQuery}</strong>
            {selectedCustomerEmail &&
              customerSearchQuery !== selectedCustomerEmail && (
                <span className="text-xs">({selectedCustomerEmail})</span>
              )}
          </span>
        </div>
      )}

      {/* Main Content Area with Independent Scrolling */}
      <div className="flex-1 flex min-h-0">
        {/* EmailList - Independently Scrollable */}
        <div className="w-[360px] flex-shrink-0 border-r border-border bg-muted/20 flex flex-col">
          {isEmailListLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Loading emails...
                </p>
              </div>
            </div>
          ) : (
            <MailBoxList
              tickets={filteredTickets || []}
              selectedTicket={selectedTicket}
              onTicketSelect={handleTicketSelect}
              onScrollToBottom={loadMore}
              isLoadingMore={isLoadingMore}
              hasMore={!!nextLink}
              mailType={mailType}
              ticketDetailData={ticketDetailData}
            />
          )}
        </div>

        {/* EmailThread2 - Independently Scrollable */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {selectedTicket ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <MailBoxThread
                ticket={selectedTicket}
                managers={managers}
                selectedTicketDetail={selectedTicketDetail}
                onRefetchTicketDetails={() =>
                  fetchAllTicketDetails(sentMailList || [], false)
                }
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-2xl">📧</span>
                </div>
                <h3 className="text-lg font-medium mb-2">No Mail selected</h3>
                <p className="text-sm">
                  Select a Mail from the list to view the email thread
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MailBoxInterface;
