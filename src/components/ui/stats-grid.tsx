import { StatCard } from "@/components/ui/stat-card";
import { MetricCardSkeletonGrid } from "@/components/ui/metric-card-skeleton";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatConfig {
  icon: LucideIcon;
  title: string;
  value: string | number;
  description?: string;
  valueClassName?: string;
  progress?: number;
  tooltip?: string;
}

interface StatsGridProps {
  stats: StatConfig[];
  loading?: boolean;
  error?: string | null;
  columns?: 2 | 3 | 4;
}

const gridColsMap: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
};

export const StatsGrid = ({ 
  stats, 
  loading = false, 
  error = null,
  columns = 4 
}: StatsGridProps) => {
  const gridClasses = gridColsMap[columns] || gridColsMap[4];

  if (loading) {
    return (
      <MetricCardSkeletonGrid
        count={columns}
        columns={columns}
        showIcon={false}
        size="lg"
      />
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
    <div className={cn("grid gap-6", gridClasses)}>
      {stats.map((stat, index) => (
        <StatCard
          key={index}
          icon={stat.icon}
          title={stat.title}
          value={stat.value}
          description={stat.description}
          valueClassName={stat.valueClassName}
          progress={stat.progress}
          tooltip={stat.tooltip}
        />
      ))}
    </div>
  );
};
