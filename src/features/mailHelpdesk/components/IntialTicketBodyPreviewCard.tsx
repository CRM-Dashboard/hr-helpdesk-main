import { format } from "date-fns";
import { Paperclip } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

import { Ticket } from "../types/ticket";

interface IntialTicketBodyPreviewCardProps {
  ticket: Ticket;
  ticketDetailSub: string;
}

const IntialTicketBodyPreviewCard = ({
  ticket,
  ticketDetailSub,
}: IntialTicketBodyPreviewCardProps) => {
  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold">
              {ticket.customerName.charAt(0)}
            </div>
            <div>
              <div className="font-medium">{ticket.customerName}</div>
              <div className="text-sm text-muted-foreground">
                {ticket.customerEmail}
              </div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {format(ticket.receivedDate, "PPp")}
          </div>
        </div>

        <div className="prose prose-sm max-w-none">
          <p className="whitespace-pre-wrap">
            {ticketDetailSub || ticket.description}
          </p>
        </div>

        {ticket.attachments && ticket.attachments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Paperclip className="h-4 w-4" />
              <span>{ticket.attachments.length} attachment(s)</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default IntialTicketBodyPreviewCard;
