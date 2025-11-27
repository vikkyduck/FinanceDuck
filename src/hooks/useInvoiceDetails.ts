import { useState, useEffect, useCallback } from "react";
import { invoiceService, InvoiceViewModel, InvoiceExpense, InvoiceDocument } from "@/lib/services/invoices";
import { useToast } from "@/hooks/use-toast";

interface UseInvoiceDetailsReturn {
  invoice: InvoiceViewModel | null;
  expenses: InvoiceExpense[];
  documents: InvoiceDocument[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateStatus: (status: string) => Promise<boolean>;
  updateInvoice: (updates: Record<string, any>) => Promise<boolean>;
  deleteExpense: (expenseId: string) => Promise<boolean>;
  deleteDocument: (documentId: string) => Promise<boolean>;
}

export function useInvoiceDetails(invoiceId: string | null, isOpen: boolean): UseInvoiceDetailsReturn {
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<InvoiceViewModel | null>(null);
  const [expenses, setExpenses] = useState<InvoiceExpense[]>([]);
  const [documents, setDocuments] = useState<InvoiceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!invoiceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await invoiceService.fetchInvoiceById(invoiceId);
      setInvoice(result.invoice);
      setExpenses(result.expenses);
      setDocuments(result.documents);
    } catch (err: any) {
      console.error("[useInvoiceDetails] Error:", err);
      setError(err.message || "Failed to load invoice details");
      
      if (err.message?.includes("Not authenticated") || err.message?.includes("Session expired")) {
        window.location.href = "/auth";
      } else {
        toast({
          title: "Ошибка загрузки",
          description: err.message || "Не удалось загрузить детали счёта",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [invoiceId, toast]);

  useEffect(() => {
    if (isOpen && invoiceId) {
      fetchDetails();
    }
  }, [isOpen, invoiceId, fetchDetails]);

  const updateStatus = useCallback(async (status: string): Promise<boolean> => {
    if (!invoiceId) return false;

    try {
      await invoiceService.updateInvoiceStatus(invoiceId, status);
      await fetchDetails();
      toast({
        title: "Статус обновлён",
        description: `Статус счёта изменён`,
      });
      return true;
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err.message,
        variant: "destructive",
      });
      return false;
    }
  }, [invoiceId, fetchDetails, toast]);

  const updateInvoice = useCallback(async (updates: Record<string, any>): Promise<boolean> => {
    if (!invoiceId) return false;

    try {
      await invoiceService.updateInvoice(invoiceId, updates);
      await fetchDetails();
      return true;
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err.message,
        variant: "destructive",
      });
      return false;
    }
  }, [invoiceId, fetchDetails, toast]);

  const deleteExpense = useCallback(async (expenseId: string): Promise<boolean> => {
    try {
      await invoiceService.deleteExpense(expenseId);
      await fetchDetails();
      toast({
        title: "Успешно",
        description: "Расход удалён",
      });
      return true;
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err.message,
        variant: "destructive",
      });
      return false;
    }
  }, [fetchDetails, toast]);

  const deleteDocument = useCallback(async (documentId: string): Promise<boolean> => {
    try {
      await invoiceService.deleteDocument(documentId);
      await fetchDetails();
      toast({
        title: "Успешно",
        description: "Документ удалён",
      });
      return true;
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err.message,
        variant: "destructive",
      });
      return false;
    }
  }, [fetchDetails, toast]);

  return {
    invoice,
    expenses,
    documents,
    loading,
    error,
    refetch: fetchDetails,
    updateStatus,
    updateInvoice,
    deleteExpense,
    deleteDocument,
  };
}
