import { useAuth } from "@/hooks/useAuth";
import { UnifiedInvoicesList } from "../UnifiedInvoicesList";

interface PartnerInvoicesListProps {
  viewMode?: 'table' | 'cards';
}

export const PartnerInvoicesList = ({ viewMode = 'cards' }: PartnerInvoicesListProps) => {
  const { partnerId, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!partnerId) {
    return null;
  }

  return (
    <UnifiedInvoicesList 
      role="partner" 
      viewMode={viewMode}
      partnerId={partnerId}
      enableRealtime={true}
    />
  );
};
