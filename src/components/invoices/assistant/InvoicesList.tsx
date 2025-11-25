import { UnifiedInvoicesList } from "../UnifiedInvoicesList";
import { InvoiceStatus } from "@/hooks/useInvoiceFilters";

interface InvoicesListProps {
  viewMode?: 'table' | 'cards';
  initialStatusFilter?: InvoiceStatus;
}

export const InvoicesList = ({ viewMode = 'table', initialStatusFilter }: InvoicesListProps) => {
  return (
    <UnifiedInvoicesList 
      role="assistant" 
      viewMode={viewMode}
      initialStatusFilter={initialStatusFilter}
    />
  );
};
