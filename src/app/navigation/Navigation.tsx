import React from "react";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Plane,
  Receipt,
  FileCheck,
  Settings,
  LogOut,
  User,
  HelpCircle,
} from "lucide-react";
import { AppView } from "@/app/navHandler";

interface NavigationProps {
  activeTab: AppView;
  onTabChange: (tab: string) => void;
}

const Navigation = ({ activeTab, onTabChange }: NavigationProps) => {
  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      id: "travel-request",
      label: "Travel Request",
      icon: Plane,
    },
    // {
    //   id: "claim-request",
    //   label: "Expense Claim",
    //   icon: Receipt,
    // },
    {
      id: "approvals",
      label: "Approvals",
      icon: FileCheck,
    },
    // {
    //   id: "helpdesk",
    //   label: "Helpdesk",
    //   icon: HelpCircle,
    // },
    {
      id: "mail-helpdesk",
      label: "Helpdesk",
      icon: HelpCircle,
    },
  ];

  return (
    <div className="bg-card border-r border-border w-64 h-screen flex flex-col shadow-soft">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg">
            <Plane className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-lg">TravelReimburse</h2>
            <p className="text-xs text-muted-foreground">Employee Portal</p>
          </div>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant={activeTab === item.id ? "default" : "ghost"}
            className={`w-full justify-start gap-3 ${
              activeTab === item.id
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
            }`}
            onClick={() => onTabChange(item.id)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Button>
        ))}
      </nav>

      {/* User Profile & Settings */}
      <div className="p-4 border-t border-border space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
        >
          <User className="h-4 w-4" />
          John Doe
        </Button>
        {/* <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button> */}
      </div>
    </div>
  );
};

export default Navigation;
