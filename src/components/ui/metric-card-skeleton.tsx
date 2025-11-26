import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MetricCardSkeletonProps {
  showIcon?: boolean;
  showTrend?: boolean;
  showHeader?: boolean;
  size?: "sm" | "default" | "lg";
  delay?: number;
  className?: string;
  borderless?: boolean;
}

export const MetricCardSkeleton = ({
  showIcon = true,
  showTrend = false,
  showHeader = false,
  size = "default",
  delay = 0,
  className,
  borderless = false,
}: MetricCardSkeletonProps) => {
  const valueSizes = {
    sm: "h-8 w-24",
    default: "h-10 w-32",
    lg: "h-12 w-40",
  };

  const titleSizes = {
    sm: "h-3 w-20",
    default: "h-4 w-28",
    lg: "h-4 w-32",
  };

  if (showHeader) {
    return (
      <Card
        className={cn(borderless && "border-0 shadow-lg", className)}
        style={{
          opacity: 0,
          animation: `stagger-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
          animationDelay: `${delay}ms`,
        }}
      >
        <CardHeader className="pb-2">
          <Skeleton className={titleSizes[size]} variant="shimmer" />
        </CardHeader>
        <CardContent>
          <Skeleton className={valueSizes[size]} variant="wave" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(borderless && "border-0 shadow-lg", className)}
      style={{
        opacity: 0,
        animation: `stagger-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
        animationDelay: `${delay}ms`,
      }}
    >
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className={titleSizes[size]} variant="shimmer" />
          {showIcon && (
            <Skeleton className="h-9 w-9 rounded-lg" variant="default" />
          )}
        </div>
        <div className="space-y-2">
          <Skeleton className={valueSizes[size]} variant="wave" />
          {showTrend && (
            <Skeleton className="h-5 w-48" variant="shimmer" />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface MetricCardSkeletonGridProps {
  count?: number;
  columns?: 2 | 3 | 4;
  showIcon?: boolean;
  showTrend?: boolean;
  showHeader?: boolean;
  size?: "sm" | "default" | "lg";
  delayMs?: number;
  borderless?: boolean;
  className?: string;
  gridClassName?: string;
}

const defaultGridCols: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
};

export const MetricCardSkeletonGrid = ({
  count = 4,
  columns = 4,
  showIcon = true,
  showTrend = false,
  showHeader = false,
  size = "default",
  delayMs = 100,
  borderless = false,
  className,
  gridClassName,
}: MetricCardSkeletonGridProps) => {
  const gridClasses = gridClassName || defaultGridCols[columns] || defaultGridCols[4];

  return (
    <div className={cn("grid gap-6", gridClasses, className)}>
      {[...Array(count)].map((_, i) => (
        <MetricCardSkeleton
          key={i}
          showIcon={showIcon}
          showTrend={showTrend}
          showHeader={showHeader}
          size={size}
          delay={i * delayMs}
          borderless={borderless}
        />
      ))}
    </div>
  );
};
