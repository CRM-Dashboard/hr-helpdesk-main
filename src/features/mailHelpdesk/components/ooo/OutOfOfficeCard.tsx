/**
 * One cover arrangement.
 *
 * The list endpoint is the only shape that carries a server-computed `status`,
 * but a card is also rendered from write responses that do not, so the status is
 * derived either way — `deriveOooStatus` is a pure function of the timestamps
 * and agrees with the server's SQL by construction.
 */
import { format } from "date-fns";
import {
  ArrowRight,
  CalendarOff,
  Loader2,
  Play,
  UserCog,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useActivateOutOfOffice } from "../../hooks/pg";
import type { OutOfOfficeListRow } from "../../types/pg";
import {
  ACTIVATION_POLICY_LABEL,
  deriveOooStatus,
  EXPIRY_POLICY_LABEL,
  oooStatusClass,
  oooStatusExplanation,
  oooStatusLabel,
} from "../../utils/pgOoo";

interface OutOfOfficeCardProps {
  record: OutOfOfficeListRow;
  /** False on the "covering for others" tab — somebody else's leave is theirs. */
  canManage: boolean;
  onReplace: (record: OutOfOfficeListRow) => void;
  onCancel: (record: OutOfOfficeListRow) => void;
}

/**
 * @param iso an ISO timestamp
 * @returns "01 Sep 2026, 09:00 am"
 */
const when = (iso: string): string => format(new Date(iso), "dd MMM yyyy, hh:mm a");

export function OutOfOfficeCard({
  record,
  canManage,
  onReplace,
  onCancel,
}: OutOfOfficeCardProps) {
  const { toast } = useToast();
  const activate = useActivateOutOfOffice();

  // `status` is on the list row, but deriving keeps one rule for both shapes.
  const status = record.status ?? deriveOooStatus(record);
  const settled = status === "CANCELLED" || status === "ENDED";

  const runActivate = () => {
    activate.mutate(record.id, {
      onSuccess: (result) =>
        toast({
          title: "Cover activated",
          description:
            result.delegated > 0
              ? `${result.delegated} open ${result.delegated === 1 ? "ticket" : "tickets"} moved to ${record.delegate_name ?? "the delegate"}.`
              : "Routing is following it now.",
        }),
      onError: (error) =>
        toast({
          title: "Could not activate",
          description: error.message,
          variant: "destructive",
        }),
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs font-semibold border ${oooStatusClass(status)}`}
            >
              {oooStatusLabel(status)}
            </Badge>
            <Badge variant="outline" className="border-dashed text-xs">
              {record.reason.charAt(0) + record.reason.slice(1).toLowerCase()}
            </Badge>
            {record.replaced_by_ooo_id && (
              <Badge
                variant="outline"
                className="border-slate-200 bg-slate-50 text-xs text-slate-600"
                title="Cover was handed on to a successor arrangement"
              >
                Handed over
              </Badge>
            )}
          </div>

          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <CalendarOff className="h-4 w-4 text-muted-foreground" />
            {when(record.starts_at)}
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            {when(record.ends_at)}
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            <span className="text-foreground">{record.user_name ?? "—"}</span>{" "}
            covered by{" "}
            <span className="text-foreground">
              {record.delegate_name ?? "—"}
            </span>
            {record.delegate_email && (
              <span className="text-muted-foreground">
                {" "}
                · {record.delegate_email}
              </span>
            )}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {oooStatusExplanation(status)}
          </p>

          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <li>{ACTIVATION_POLICY_LABEL[record.activation_policy]}</li>
            <li>{EXPIRY_POLICY_LABEL[record.expiry_policy]}</li>
            {record.block_new_assignment && (
              <li>
                New tickets are left unassigned when the cover chain dead-ends
              </li>
            )}
          </ul>

          {record.message && (
            <p className="mt-2 text-sm italic text-muted-foreground">
              “{record.message}”
            </p>
          )}

          {record.cancelled_at && (
            <p className="mt-2 text-xs text-muted-foreground">
              Ended {when(record.cancelled_at)}
              {record.cancel_mode && ` · ${record.cancel_mode.toLowerCase()}`}
              {record.cancelled_reason && ` · “${record.cancelled_reason}”`}
            </p>
          )}
        </div>

        {canManage && !settled && (
          <div className="flex flex-shrink-0 flex-col items-stretch gap-2">
            {/* Only AWAITING_ACTIVATION needs this. The other policies are live
                from their start date, so a button would be a no-op dressed up
                as a decision. */}
            {status === "AWAITING_ACTIVATION" && (
              <Button
                size="sm"
                disabled={activate.isPending}
                onClick={runActivate}
              >
                {activate.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                Activate
              </Button>
            )}

            <Button size="sm" variant="outline" onClick={() => onReplace(record)}>
              <UserCog className="mr-1.5 h-3.5 w-3.5" />
              Change delegate
            </Button>

            <Button size="sm" variant="ghost" onClick={() => onCancel(record)}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              End early
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default OutOfOfficeCard;
