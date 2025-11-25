import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SkeletonColumn {
  header: string;
  cellClassName?: string;
  variant?: "default" | "shimmer" | "wave";
}

interface TableSkeletonProps {
  columns: SkeletonColumn[];
  rowCount?: number;
  delayMs?: number;
}

export const TableSkeleton = ({ 
  columns, 
  rowCount = 3, 
  delayMs = 60 
}: TableSkeletonProps) => (
  <Table>
    <TableHeader>
      <TableRow>
        {columns.map((col, i) => (
          <TableHead key={i}>{col.header}</TableHead>
        ))}
      </TableRow>
    </TableHeader>
    <TableBody>
      {[...Array(rowCount)].map((_, i) => (
        <TableRow 
          key={i}
          style={{ 
            opacity: 0,
            animation: `stagger-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
            animationDelay: `${i * delayMs}ms` 
          }}
        >
          {columns.map((col, j) => (
            <TableCell key={j}>
              <Skeleton 
                className={col.cellClassName || "h-4 w-32"} 
                variant={col.variant || "shimmer"} 
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
