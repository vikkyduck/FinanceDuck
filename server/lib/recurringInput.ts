import { z } from 'zod';
import { invoiceSchemeEnum, frequencyEnum } from '../../shared/schema';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Некорректная дата');
const money = z.union([z.string().regex(/^\d{1,13}(\.\d{1,2})?$/), z.number().finite().nonnegative().max(9999999999999.99)])
  .transform(value => Number(value).toFixed(2));
const rate = money.refine(value => Number(value) <= 100, 'Процент должен быть от 0 до 100');
export const recurringInput = z.object({
  // В шаблоне нет колонки маржи: счёт по 'agency' вышел бы с маржой 0.
  clientId: z.string().uuid(), partnerId: z.string().uuid(),
  scheme: z.enum(invoiceSchemeEnum.enumValues).refine(scheme => scheme !== 'agency', 'Схема «Агентская» для периодики не поддерживается'),
  amount: money, defaultExpenses: money.optional(), partnerCommissionRate: rate.nullish(),
  frequency: z.enum(frequencyEnum.enumValues).default('monthly'),
  dayOfMonth: z.coerce.number().int().min(1).max(31).transform(String).default(1),
  startDate: isoDate, endDate: isoDate.nullish(), nextInvoiceDate: isoDate.optional(),
  description: z.string().max(10000).nullish(), notes: z.string().max(10000).nullish(),
  isActive: z.boolean().optional(), hideFromAssistant: z.boolean().optional(),
}).strict();
