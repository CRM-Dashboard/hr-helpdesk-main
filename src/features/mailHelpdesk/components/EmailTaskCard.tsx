import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { format } from "date-fns";
import { User, CheckCircle, Plus, Edit, Calendar } from "lucide-react";

interface iTaskProps {
  ticket: any;
  handleShowCreateTask: () => void;
}

export const EmailTaskCard = ({ ticket, handleShowCreateTask }: iTaskProps) => {
  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Tasks ({ticket.tasks.length})
          </h3>
          <Button
            size="sm"
            onClick={() => handleShowCreateTask()}
            className="flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            Add Task
          </Button>
        </div>

        {ticket?.tasks?.length > 0 ? (
          <div className="space-y-3">
            {ticket?.tasks?.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-medium text-sm">{task.title}</div>
                    <Badge
                      variant={
                        task.priority === "high"
                          ? "destructive"
                          : task.priority === "medium"
                          ? "default"
                          : "secondary"
                      }
                      className="text-xs"
                    >
                      {task.priority.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {task.description}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Due: {format(task.deadline, "PPp")}</span>
                    <User className="h-3 w-3 ml-2" />
                    <span>Assigned to Member</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      task.status === "completed"
                        ? "default"
                        : task.status === "in-progress"
                        ? "secondary"
                        : "outline"
                    }
                    className="text-xs"
                  >
                    {task.status.replace("-", " ").toUpperCase()}
                  </Badge>
                  <Button variant="ghost" size="sm">
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No tasks created yet</p>
            <p className="text-xs">
              Create tasks to track progress on this ticket
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EmailTaskCard;
