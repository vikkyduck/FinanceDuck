import { z } from 'zod';

// Common validation patterns
const uuidSchema = z.string().uuid({ message: "Invalid ID format" });
const positiveNumberSchema = z.number().positive({ message: "Must be a positive number" }).max(1000000000, { message: "Amount too large" });
const telegramSchema = z.string().regex(/^@?[a-zA-Z0-9_]{5,32}$/, { message: "Invalid Telegram username (5-32 characters, @optional)" }).optional().or(z.literal(''));
const phoneSchema = z.string().regex(/^[+]?[0-9\-() ]{7,20}$/, { message: "Invalid phone number format" }).optional().or(z.literal(''));
const notesSchema = z.string().max(1000, { message: "Notes too long (max 1000 characters)" }).optional().or(z.literal(''));

// Partner management schema
export const partnerSchema = z.object({
  name: z.string().trim().min(1, { message: "Partner name is required" }).max(100, { message: "Name too long (max 100 characters)" }),
  telegram: telegramSchema,
  phone: phoneSchema,
});

// Client management schema
export const clientSchema = z.object({
  name: z.string().trim().min(1, { message: "Client name is required" }).max(100, { message: "Name too long (max 100 characters)" }),
  telegram: telegramSchema,
  phone: phoneSchema,
  partnerIds: z.array(uuidSchema).optional().default([]),
});

// Invoice creation schema
export const invoiceSchema = z.object({
  invoiceNumber: z.string().trim().max(50, { message: "Invoice number too long" }).optional().or(z.literal('')),
  partnerId: uuidSchema,
  clientId: uuidSchema,
  scheme: z.enum(['agency_30', 'commission_based'], { message: "Invalid scheme" }),
  clientBill: z.string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, { message: "Invalid amount format" })
    .transform(Number)
    .refine(n => n > 0 && n < 1000000000, { message: "Amount must be between 0 and 1 billion" }),
  partnerCommissionRate: z.union([
    z.literal(''),
    z.string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, { message: "Invalid rate format" })
      .transform(Number)
      .refine(n => n >= 0 && n <= 100, { message: "Rate must be between 0 and 100" })
  ]).optional(),
  notes: notesSchema,
  paymentDate: z.date().optional(),
});

// Expense creation schema
export const expenseSchema = z.object({
  description: z.string().trim().min(1, { message: "Description is required" }).max(500, { message: "Description too long (max 500 characters)" }),
  amount: z.string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, { message: "Invalid amount format" })
    .transform(Number)
    .refine(n => n > 0 && n < 1000000000, { message: "Amount must be between 0 and 1 billion" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Invalid date format" }),
  invoiceId: uuidSchema,
});

// Payment recording schema
export const paymentSchema = z.object({
  amount: z.string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, { message: "Invalid amount format" })
    .transform(Number)
    .refine(n => n > 0 && n < 1000000000, { message: "Amount must be between 0 and 1 billion" }),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Invalid date format" }),
  paymentMethod: z.string().max(100, { message: "Payment method too long" }).optional().or(z.literal('')),
  notes: notesSchema,
  invoiceId: uuidSchema,
  partnerId: uuidSchema.optional(),
});

// Document upload schema
export const documentUploadSchema = z.object({
  documentType: z.string().min(1, { message: "Document type is required" }),
  notes: notesSchema,
  invoiceId: uuidSchema,
  fileName: z.string().min(1, { message: "File name is required" }).max(255, { message: "File name too long" }),
});

// File validation schema
export const fileSchema = z.object({
  file: z.instanceof(File)
    .refine(file => file.size <= 10 * 1024 * 1024, { message: "File size must be less than 10MB" })
    .refine(
      file => ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg'].includes(file.type),
      { message: "Invalid file type. Allowed: PDF, Word, Excel, PNG, JPG" }
    ),
});
