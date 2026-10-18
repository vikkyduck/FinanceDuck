import { invalidateFinancialQueries } from '@/lib/financialQueries';
import { isAgencyScheme, normalizeCalculations } from '@/lib/invoiceHelpers';
import { getVisibleFields, type UserRole } from '@/lib/invoicePermissions';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from './use-toast';
import { useInvoice } from './useInvoice';
import { useInvoiceExpenseActions } from './useInvoiceExpenseActions';
import { useInvoiceFinancialTerms } from './useInvoiceFinancialTerms';
import { useInvoiceMetadataCommands } from './useInvoiceMetadataCommands';
import { useInvoicePeriodCommands } from './useInvoicePeriodCommands';
import { useInvoiceStatusCommands } from './useInvoiceStatusCommands';

/** Composes independent editors without owning their forms or mutation implementations. */
export function useInvoiceCommands({ open, invoiceId, canEdit = false, userRole = 'client' }: { open: boolean; invoiceId: string | null; canEdit?: boolean; userRole?: UserRole }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invoice, setStatus, expenses, loading, error } = useInvoice(invoiceId, open);
  const fetchInvoiceDetails = () => invalidateFinancialQueries(queryClient);
  const context = { invoiceId, invoice, expenses, setStatus, refresh: fetchInvoiceDetails };
  const status = useInvoiceStatusCommands(context);
  const metadata = useInvoiceMetadataCommands(context);
  const financial = useInvoiceFinancialTerms(context);
  const expense = useInvoiceExpenseActions();
  const period = useInvoicePeriodCommands(context);
  const [messageInvoiceOpen, setMessageInvoiceOpen] = useState(false);
  const [messageExpense, setMessageExpense] = useState<{ id: string; description: string; amount: number | null } | null>(null);
  const calcRaw = invoice?.invoice_calculations ?? null;
  const calc = normalizeCalculations(calcRaw);
  const isAgency30 = isAgencyScheme(invoice?.scheme);
  const permissions = getVisibleFields(userRole, invoice?.scheme ?? 'agency_30');
  const getStatusLabel = (value: string) => ({ draft: 'Черновик', sent: 'Отправлен', paid: 'Оплачен', cancelled: 'Отменен' }[value] ?? value);
  return {
    ...status, ...metadata, ...financial, ...expense, ...period,
    toast, queryClient, invoice, setStatus, expenses, loading, error, fetchInvoiceDetails,
    messageInvoiceOpen, setMessageInvoiceOpen, messageExpense, setMessageExpense,
    getStatusLabel, calcRaw, calc, isAgency30, permissions, open, invoiceId, canEdit, userRole,
  };
}
export type InvoiceDetailsModel = ReturnType<typeof useInvoiceCommands>;
