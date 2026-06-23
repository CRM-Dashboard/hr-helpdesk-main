export const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    // urgent: "bg-red-500",
    high: "bg-red-500 text-white",
    medium: "bg-yellow-500 text-white",
    low: "bg-green-500 text-white",
  };

  return colors[priority?.toLowerCase()] || "bg-gray-500 text-white";
};

export const getStatusColor = (statusTxt: string) => {
  const colors: Record<string, string> = {
    open: "bg-blue-500 text-white border-blue-600",
    "in process": "bg-amber-500 text-white border-amber-600",
    closed: "bg-slate-500 text-white border-slate-600",
    "work completed": "bg-green-500 text-white border-green-600",
    "pending on sap": "bg-purple-500 text-white border-purple-600",
    "awaiting on 3rd party": "bg-indigo-500 text-white border-indigo-600",
    "pending for review and approval":
      "bg-orange-500 text-white border-orange-600",
    reopen: "bg-red-500 text-white border-red-600",
  };

  return (
    colors[statusTxt?.toLowerCase()] || "bg-gray-500 text-white border-gray-600"
  );
};
