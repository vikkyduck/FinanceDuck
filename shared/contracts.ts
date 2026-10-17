import type { z } from 'zod';
import type { invoiceDtoSchema, expenseDtoSchema } from './invoiceContract';
export type { AuthResponse } from './authContract';
export type Jsonify<T> = T extends Date ? string : T extends object ? { [K in keyof T]: Jsonify<T[K]> } : T;
export type InvoiceDto = z.infer<typeof invoiceDtoSchema>;
export type ExpenseDto = z.infer<typeof expenseDtoSchema>;
