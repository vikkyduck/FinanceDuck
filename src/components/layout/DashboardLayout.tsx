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
      <div className="container mx-auto px-3 py-4 sm:px-6 sm:py-6 md:py-8 lg:py-10 max-w-7xl">
        {children}
      </div>
    </div>
  );
};
