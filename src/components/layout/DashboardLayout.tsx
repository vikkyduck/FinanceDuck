import { ReactNode } from "react";
import { useAlertNotifications } from "@/hooks/useAlertNotifications";

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  // Initialize alert notifications system
  useAlertNotifications();
  
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-10 max-w-7xl">
        {children}
      </div>
    </div>
  );
};
