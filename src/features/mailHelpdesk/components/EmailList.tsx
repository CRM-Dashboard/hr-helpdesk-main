import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Circle, Loader2, Mail, Users } from "lucide-react";
import type { TicketListRow } from "../types/pg";
import {
  listTimestamp,
  priorityBadgeClass,
  requesterLabel,
  stateBadgeClass,
} from "../utils/pgTicket";

/** How far ahead of the bottom to start fetching the next page. */
const PREFETCH_MARGIN_PX = 300;

interface EmailListProps {
  /** Every page loaded so far, flattened and in server order. */
  rows: TicketListRow[];
  selectedTicketId: string | null;
  onTicketSelect: (row: TicketListRow) => void;
  /** True while the first page of a filter set is loading. */
  isLoading?: boolean;
  /** `meta.total` — the size of the whole result set, not of what is loaded. */
  total?: number;
  /** Whether the server reported another page after the last one loaded. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  /** Asked for as the agent approaches the bottom. Must be stable. */
  onLoadMore?: () => void;
  /**
   * Changes whenever the filters change, so the list can jump back to the top
   * instead of leaving the agent stranded mid-way down a different result set.
   */
  resetToken?: string;
}

function EmailList({
  rows,
  selectedTicketId,
  onTicketSelect,
  isLoading = false,
  total,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  resetToken,
}: EmailListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Watch a sentinel below the last row rather than listening to scroll events:
  // no per-frame work, and it re-fires by itself when a short page leaves the
  // sentinel still on screen.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || !onLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { root, rootMargin: `0px 0px ${PREFETCH_MARGIN_PX}px 0px` },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, rows.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetToken]);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto bg-gradient-to-b from-background to-muted/20"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-xl bg-background/80 border-b border-border/50 shadow-sm">
        <div className="p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base tracking-tight">Inbox</h2>
              <p className="text-xs text-muted-foreground">
                {total === undefined
                  ? `${rows.length} tickets`
                  : `${rows.length} of ${total} tickets`}
              </p>
            </div>
            {isLoading && rows.length > 0 && (
              <Loader2 className="w-3.5 h-3.5 ml-auto animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Rows. The server already ranks unread above `sort` unless the caller
          sent unreadFirst=false, so this list is rendered in arrival order. */}
      <div className="p-1.5">
        {isLoading && rows.length === 0 && (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading tickets…
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No tickets match these filters.
          </div>
        )}

        {rows.map((row) => {
          const isSelected = selectedTicketId === row.id;
          const isUnread = row.has_unread;

          return (
            <div
              key={row.id}
              onClick={() => onTicketSelect(row)}
              className={`group relative mb-1.5 rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.01] ${
                isSelected
                  ? "bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 shadow-lg shadow-blue-500/10 border-2 border-blue-200 dark:border-blue-800"
                  : isUnread
                    ? "bg-white dark:bg-slate-900 shadow-md hover:shadow-xl border-2 border-blue-200 dark:border-blue-900"
                    : "bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 border border-border/50 hover:border-border hover:shadow-md"
              }`}
            >
              {isUnread && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-gradient-to-b from-blue-500 to-purple-600 rounded-r-full shadow-lg shadow-blue-500/50" />
              )}

              <div className="p-2.5 pl-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shadow-sm flex-shrink-0 ${
                        isUnread
                          ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
                          : "bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {requesterLabel(row).charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-sm truncate ${
                            isUnread
                              ? "font-bold text-foreground"
                              : "font-medium text-foreground/80"
                          }`}
                        >
                          {requesterLabel(row)}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1.5 font-medium border-dashed flex-shrink-0"
                        >
                          {row.ticket_number}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <span className="text-xs font-medium text-muted-foreground flex-shrink-0 ml-2">
                    {listTimestamp(row.last_activity_at)}
                  </span>
                </div>

                <div
                  className={`text-sm truncate mb-2 ml-9 ${
                    isUnread
                      ? "font-semibold text-foreground"
                      : "font-normal text-muted-foreground"
                  }`}
                >
                  {row.subject}
                </div>

                <div className="flex items-center gap-1.5 ml-9 flex-wrap">
                  <Badge
                    variant="secondary"
                    className={`text-xs h-5 px-2 rounded-lg font-medium shadow-sm border ${stateBadgeClass(
                      row.state_category,
                    )}`}
                  >
                    {row.state_name}
                  </Badge>

                  {row.priority_name && (
                    <Badge
                      variant="secondary"
                      className={`text-xs h-5 px-2 rounded-lg font-medium shadow-sm border ${priorityBadgeClass(
                        row.severity_rank,
                      )}`}
                    >
                      {row.priority_name}
                    </Badge>
                  )}

                  <Badge
                    variant="secondary"
                    className="text-xs h-5 px-2 rounded-lg font-medium shadow-sm flex items-center bg-blue-100 text-blue-700 border border-blue-200"
                  >
                    <Users className="w-3 h-3 mr-1 text-blue-600" />
                    {row.assigned_to_name || "Unassigned"}
                  </Badge>

                  {isUnread && (
                    <Badge className="text-xs h-5 px-2 rounded-lg font-bold bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-lg shadow-red-500/30 border-0">
                      <Circle className="w-2 h-2 mr-1 fill-current" />
                      {row.unread_count} new
                    </Badge>
                  )}

                  {row.is_ola_breached && (
                    <Badge className="text-xs h-5 px-2 rounded-lg font-bold bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-lg shadow-red-500/30 border-0">
                      OLA Breached
                    </Badge>
                  )}
                </div>
              </div>

              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-200 pointer-events-none" />
            </div>
          );
        })}

        {/* The observer watches this, so it must sit inside the scroll box and
            stay mounted whenever another page exists. */}
        <div ref={sentinelRef} aria-hidden className="h-px" />

        {isLoadingMore && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading more tickets…
          </div>
        )}

        {!isLoadingMore && hasMore && onLoadMore && (
          // Fallback for anything the observer cannot reach — a trackpad-free
          // desk, or a container that never scrolls because the page is short.
          <button
            type="button"
            onClick={onLoadMore}
            className="w-full py-3 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            Load more
          </button>
        )}

        {!hasMore && rows.length > 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            {total !== undefined && total === rows.length
              ? `All ${total} tickets loaded`
              : "End of list"}
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailList;
