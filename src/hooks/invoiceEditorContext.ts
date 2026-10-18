import type { useInvoice } from './useInvoice';
export type InvoiceEditorContext = Pick<ReturnType<typeof useInvoice>, 'invoice' | 'expenses' | 'setStatus'> & {
 invoiceId: string | null; refresh: () => Promise<unknown>;
};
