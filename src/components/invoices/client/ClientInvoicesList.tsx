import { useAuth } from "@/hooks/useAuth";
import { UnifiedInvoicesList } from "../UnifiedInvoicesList";

interface ClientInvoicesListProps {
  viewMode?: "table" | "cards";
}

export const ClientInvoicesList = ({ viewMode = "cards" }: ClientInvoicesListProps) => {
  const { clientId, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!clientId) {
    return null;
  }

  return (
    <UnifiedInvoicesList
      role="client"
      viewMode={viewMode}
      clientId={clientId}
      enableRealtime={true}
    />
  );
};
