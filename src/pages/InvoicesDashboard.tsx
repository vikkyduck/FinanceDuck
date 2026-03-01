import { useAuth } from "@/hooks/useAuth";
import { AssistantDashboard } from "@/components/invoices/AssistantDashboard";
import { PartnerDashboard } from "@/components/invoices/PartnerDashboard";
import { AdminDashboard } from "@/components/invoices/AdminDashboard";
import { ClientDashboard } from "@/components/invoices/ClientDashboard";
import { AccountantDashboard } from "@/components/invoices/AccountantDashboard";

const InvoicesDashboard = () => {
  const { role } = useAuth();

  if (!role) {
    return null;
  }

  return (
    <>
      {role === 'assistant' && <AssistantDashboard />}
      {role === 'partner' && <PartnerDashboard />}
      {role === 'admin' && <AdminDashboard />}
      {role === 'client' && <ClientDashboard />}
      {role === 'accountant' && <AccountantDashboard />}
    </>
  );
};

export default InvoicesDashboard;
