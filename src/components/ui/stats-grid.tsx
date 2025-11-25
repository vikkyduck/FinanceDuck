import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { LucideIcon } from "lucide-react";

export interface StatConfig {
  icon: LucideIcon;
  title: string;
  value: string | number;
  description?: string;
  valueClassName?: string;
  progress?: number;
}

interface StatsGridProps {
  stats: StatConfig[];
  loading?: boolean;
  error?: string | null;
  columns?: 2 | 3 | 4;
}

export const StatsGrid = ({ 
  stats, 
  loading = false, 
  error = null,
  columns = 4 
}: StatsGridProps) => {
  if (loading) {
    return (
      <div className={`grid gap-6 md:grid-cols-2 lg:grid-cols-${columns}`}>
        {[...Array(columns)].map((_, i) => (
          <div key={i} className="border-0 shadow-sm rounded-lg p-6 space-y-4">
            <Skeleton className="h-4 w-32" variant="shimmer" />
            <Skeleton className="h-12 w-24" variant="wave" />
            <Skeleton className="h-4 w-40" variant="shimmer" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className={`grid gap-6 md:grid-cols-2 lg:grid-cols-${columns}`}>
      {stats.map((stat, index) => (
        <StatCard
          key={index}
          icon={stat.icon}
          title={stat.title}
          value={stat.value}
          description={stat.description}
          valueClassName={stat.valueClassName}
          progress={stat.progress}
        />
      ))}
    </div>
  );
};
