import React from "react";
import { Calendar, Search } from "lucide-react";
import { format } from "date-fns";

interface DateRangeFilterProps {
  startDate: any;
  endDate: any;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onApplyFilter: () => void;
}

const formatDateToYYYYMMDD = (date: any) => {
  if (typeof date === "string") {
    return date;
  }
  return format(date, "yyyy-MM-dd");
};

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApplyFilter,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Calendar className="w-4 h-4 text-blue-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="date"
            value={formatDateToYYYYMMDD(startDate)}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Calendar className="w-4 h-4 text-blue-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="date"
            value={formatDateToYYYYMMDD(endDate)}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
      </div>

      <button
        onClick={onApplyFilter}
        className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-sm hover:shadow"
      >
        <Search className="w-4 h-4" />
        Apply Filter
      </button>
    </div>
  );
}
