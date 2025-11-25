import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface CardSkeletonProps {
  rows?: number;
  delayMs?: number;
}

export const CardSkeleton = ({ rows = 3, delayMs = 80 }: CardSkeletonProps) => (
  <div className="space-y-4">
    {[...Array(rows)].map((_, i) => (
      <Card
        key={i}
        style={{
          opacity: 0,
          animation: `stagger-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
          animationDelay: `${i * delayMs}ms`,
        }}
      >
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-32" variant="shimmer" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Skeleton className="h-4 w-16 mb-2" variant="wave" />
            <Skeleton className="h-5 w-40" variant="shimmer" />
          </div>
          <div>
            <Skeleton className="h-4 w-20 mb-2" variant="wave" />
            <Skeleton className="h-8 w-28" variant="shimmer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Skeleton className="h-3 w-20 mb-2" variant="wave" />
              <Skeleton className="h-4 w-24" variant="shimmer" />
            </div>
            <div>
              <Skeleton className="h-3 w-20 mb-2" variant="wave" />
              <Skeleton className="h-4 w-24" variant="shimmer" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" variant="shimmer" />
        </CardContent>
      </Card>
    ))}
  </div>
);
