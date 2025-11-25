import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export const InvoicesTableSkeleton = () => (
  <TableSkeleton 
    columns={[
      { header: "Номер", cellClassName: "h-4 w-20", variant: "shimmer" },
      { header: "Клиент", cellClassName: "h-4 w-32", variant: "shimmer" },
      { header: "Партнер", cellClassName: "h-4 w-32", variant: "shimmer" },
      { header: "Схема", cellClassName: "h-4 w-24", variant: "wave" },
      { header: "Счет клиенту", cellClassName: "h-4 w-24", variant: "wave" },
      { header: "Остаток", cellClassName: "h-4 w-20", variant: "shimmer" },
      { header: "Статус", cellClassName: "h-6 w-20 rounded-full", variant: "wave" },
      { header: "Дата", cellClassName: "h-4 w-24", variant: "shimmer" },
      { header: "", cellClassName: "h-8 w-8 rounded-md", variant: "default" }
    ]}
    rowCount={5}
    delayMs={80}
  />
);

export const InvoicesCardsSkeleton = () => (
  <div className="space-y-4">
    {[...Array(3)].map((_, i) => (
      <Card 
        key={i}
        style={{ 
          opacity: 0,
          animation: `stagger-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
          animationDelay: `${i * 100}ms` 
        }}
      >
        <CardHeader>
          <div className="flex justify-between items-center">
            <Skeleton className="h-6 w-32" variant="shimmer" />
            <Skeleton className="h-4 w-24" variant="shimmer" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" variant="default" />
              <Skeleton className="h-4 w-full" variant="wave" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" variant="default" />
              <Skeleton className="h-4 w-full" variant="wave" />
            </div>
          </div>
          <div className="border-t pt-4 space-y-3">
            <Skeleton className="h-4 w-full" variant="shimmer" />
            <Skeleton className="h-4 w-5/6" variant="shimmer" />
            <Skeleton className="h-4 w-4/6" variant="shimmer" />
            <div className="pt-2">
              <Skeleton className="h-2 w-full rounded-full" variant="wave" />
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

export const PartnersTableSkeleton = () => (
  <TableSkeleton 
    columns={[
      { header: "Имя", cellClassName: "h-4 w-32", variant: "shimmer" },
      { header: "Email", cellClassName: "h-4 w-48", variant: "wave" },
      { header: "Телефон", cellClassName: "h-4 w-32", variant: "shimmer" },
      { header: "", cellClassName: "h-8 w-8 rounded-md", variant: "default" }
    ]}
  />
);

export const ClientsTableSkeleton = () => (
  <TableSkeleton 
    columns={[
      { header: "Имя", cellClassName: "h-4 w-32", variant: "shimmer" },
      { header: "Email", cellClassName: "h-4 w-48", variant: "wave" },
      { header: "Телефон", cellClassName: "h-4 w-32", variant: "shimmer" },
      { header: "Партнер", cellClassName: "h-4 w-32", variant: "shimmer" },
      { header: "", cellClassName: "h-8 w-8 rounded-md", variant: "default" }
    ]}
  />
);
