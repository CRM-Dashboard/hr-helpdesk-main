import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function HelpdeskLayout() {
  const tabs = [
    { to: "/helpdesk", label: "My Requests", end: true },
    { to: "/helpdesk/new", label: "New Request" },
    { to: "/helpdesk/dashboard", label: "HR Dashboard" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={(tab as any).end}
            className={({ isActive }) =>
              cn(
                "px-4 py-2 rounded-md text-sm font-medium border",
                isActive
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-background text-foreground border-border hover:bg-accent/50"
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
