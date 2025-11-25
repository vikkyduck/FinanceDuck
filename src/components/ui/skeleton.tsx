import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "shimmer" | "wave";
}

function Skeleton({ className, variant = "shimmer", ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted",
        {
          "skeleton-pulse": variant === "default",
          "skeleton-shimmer": variant === "shimmer",
          "skeleton-wave skeleton-pulse": variant === "wave",
        },
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
