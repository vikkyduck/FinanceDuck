import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassBackgroundProps {
  children: ReactNode;
  className?: string;
}

export const GlassBackground = ({ children, className }: GlassBackgroundProps) => {
  return (
    <div className={cn("relative min-h-screen bg-background", className)}>
      {/* Чистый фон без декоративных элементов - Apple HIG style */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};
