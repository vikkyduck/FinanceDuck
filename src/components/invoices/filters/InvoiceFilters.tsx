import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown, Users, Building2 } from "lucide-react";
import type { InvoiceStatus, SortOption, FilterOption } from "@/hooks/useInvoiceFilters";

interface InvoiceFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: InvoiceStatus;
  onStatusChange: (status: InvoiceStatus) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  statusCounts: Record<InvoiceStatus, number>;
  // New filters
  clientFilter?: string;
  onClientChange?: (clientId: string) => void;
  clients?: FilterOption[];
  partnerFilter?: string;
  onPartnerChange?: (partnerId: string) => void;
  partners?: FilterOption[];
  showClientFilter?: boolean;
  showPartnerFilter?: boolean;
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
  clientFilter = 'all',
  onClientChange,
  clients = [],
  partnerFilter = 'all',
  onPartnerChange,
  partners = [],
  showClientFilter = false,
  showPartnerFilter = false,
}: InvoiceFiltersProps) => {
  return (
    <div className="space-y-4 mb-6">
      {/* Search, Sort, and Entity Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по номеру, клиенту, партнёру или комментарию..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
              data-testid="input-search-invoices"
            />
          </div>
          <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortOption)}>
            <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-sort-invoices">
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
        
        {/* Client and Partner Filters */}
        {(showClientFilter || showPartnerFilter) && (
          <div className="flex flex-col sm:flex-row gap-3">
            {showClientFilter && clients.length > 0 && onClientChange && (
              <Select value={clientFilter} onValueChange={onClientChange}>
                <SelectTrigger className="w-full sm:w-[220px]" data-testid="select-filter-client">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Все клиенты" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все клиенты</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {showPartnerFilter && partners.length > 0 && onPartnerChange && (
              <Select value={partnerFilter} onValueChange={onPartnerChange}>
                <SelectTrigger className="w-full sm:w-[220px]" data-testid="select-filter-partner">
                  <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Все партнёры" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все партнёры</SelectItem>
                  {partners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>
                      {partner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
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
