import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown } from "lucide-react";
import type { InvoiceStatus, SortOption } from "@/hooks/useInvoiceFilters";

interface InvoiceFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: InvoiceStatus;
  onStatusChange: (status: InvoiceStatus) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  statusCounts: Record<InvoiceStatus, number>;
}

const statusLabels: Record<InvoiceStatus, string> = {
  all: 'Все',
  draft: 'Черновики',
  sent: 'Отправленные',
  paid: 'Оплаченные',
  cancelled: 'Отмененные',
  overdue: 'Просроченные',
};

const statusVariants: Record<InvoiceStatus, "default" | "secondary" | "destructive" | "outline"> = {
  all: 'secondary',
  draft: 'outline',
  sent: 'default',
  paid: 'secondary',
  cancelled: 'outline',
  overdue: 'destructive',
};

const sortLabels: Record<SortOption, string> = {
  'date-desc': 'Новые первыми',
  'date-asc': 'Старые первыми',
  'amount-desc': 'Сумма (убыв.)',
  'amount-asc': 'Сумма (возр.)',
};

export const InvoiceFilters = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  sortBy,
  onSortChange,
  statusCounts,
}: InvoiceFiltersProps) => {
  return (
    <div className="space-y-4 mb-6">
      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по номеру, клиенту или партнеру..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortOption)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(sortLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status Chips */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(statusLabels) as InvoiceStatus[]).map((status) => {
          const count = statusCounts[status];
          const isActive = statusFilter === status;
          
          return (
            <button
              key={status}
              onClick={() => onStatusChange(status)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border transition-all hover:shadow-md ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background border-border hover:bg-muted'
              }`}
            >
              <span className="font-medium text-sm">{statusLabels[status]}</span>
              <Badge 
                variant={isActive ? 'secondary' : statusVariants[status]}
                className={`${isActive ? 'bg-primary-foreground/20 text-primary-foreground' : ''} min-w-[24px] justify-center`}
              >
                {count}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
};
