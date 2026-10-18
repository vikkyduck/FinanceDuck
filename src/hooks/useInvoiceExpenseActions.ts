import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ExpenseDto } from '@shared/contracts';
import { apiDelete } from '@/lib/api';
import { invalidateFinancialQueries } from '@/lib/financialQueries';
import { useToast } from './use-toast';

export function useInvoiceExpenseActions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fetchInvoiceDetails = () => invalidateFinancialQueries(queryClient);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editExpenseOpen, setEditExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<
    (ExpenseDto & { invoice_id?: string; amount: string }) | null
  >(null);
  const [deleteExpense, setDeleteExpense] = useState<{
    id: string;
    description: string;
  } | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(
    null,
  );
  const handleDeleteExpense = async () => {
    if (!deleteExpense) return;
    setDeletingExpenseId(deleteExpense.id);

    try {
      await apiDelete(`/expenses/${deleteExpense.id}`);
      toast({
        title: "Успешно",
        description: "Расход удалён",
      });

      // Invalidate all invoice-related caches to update partner debt everywhere

      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }

    setDeleteExpense(null);
    setDeletingExpenseId(null);
  };
  return { addExpenseOpen, setAddExpenseOpen, editExpenseOpen, setEditExpenseOpen, editingExpense, setEditingExpense, deleteExpense, setDeleteExpense, deletingExpenseId, setDeletingExpenseId, handleDeleteExpense };
}
