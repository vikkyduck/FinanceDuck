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
      {/* max-w-screen-2xl (1536px) вместо 1280 — таблице счетов (10 колонок)
          не хватало ширины. mobile-first: max-width на узких экранах не мешает,
          там контент и так на всю ширину. `container` убран, чтобы не резать
          ширину на промежуточных брейкпоинтах (он капал на 1280 до 2xl). */}
      <div className="mx-auto w-full px-3 py-4 sm:px-6 sm:py-6 md:py-8 lg:py-10 max-w-screen-2xl">
        {children}
      </div>
    </div>
  );
};
