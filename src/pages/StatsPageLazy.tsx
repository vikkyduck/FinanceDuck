import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const MonthlySalesChart = lazy(() => 
  import("@/components/invoices/admin/MonthlySalesChart").then(m => ({ default: m.MonthlySalesChart }))
);
const RevenueForecastChart = lazy(() => 
  import("@/components/invoices/admin/RevenueForecastChart").then(m => ({ default: m.RevenueForecastChart }))
);
const SalesStatistics = lazy(() =>
  import("@/components/invoices/admin/SalesStatistics").then(m => ({ default: m.SalesStatistics }))
);

const ChartSkeleton = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-6 w-48" variant="shimmer" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-64 w-full" variant="wave" />
    </CardContent>
  </Card>
);

interface LazyChartProps {
  year?: number;
  monthsAhead?: number;
}

export const LazyMonthlySalesChart = ({ year = new Date().getFullYear() }: LazyChartProps) => (
  <Suspense fallback={<ChartSkeleton />}>
    <MonthlySalesChart year={year} />
  </Suspense>
);

export const LazyRevenueForecastChart = ({ monthsAhead = 6 }: LazyChartProps) => (
  <Suspense fallback={<ChartSkeleton />}>
    <RevenueForecastChart monthsAhead={monthsAhead} />
  </Suspense>
);

export const LazySalesStatistics = ({ year = new Date().getFullYear() }: LazyChartProps) => (
  <Suspense fallback={<ChartSkeleton />}>
    <SalesStatistics year={year} />
  </Suspense>
);
