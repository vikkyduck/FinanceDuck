import { UnifiedInvoicesList } from "../UnifiedInvoicesList";
import { InvoiceStatus } from "@/hooks/useInvoiceFilters";

interface AdminInvoicesListProps {
  viewMode?: 'table' | 'cards';
  initialStatusFilter?: InvoiceStatus;
}

export const AdminInvoicesList = ({ viewMode = 'cards', initialStatusFilter }: AdminInvoicesListProps) => {
  return (
    <UnifiedInvoicesList 
      role="admin" 
      viewMode={viewMode}
      enableDelete={true}
      initialStatusFilter={initialStatusFilter}
    />
  );
};
