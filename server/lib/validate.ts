/**
 * zod-валидация ТИПОВ на денежных мутирующих роутах (S5 из ревью).
 *
 * Дополняет whitelist (sanitize.ts): pick() режет ЛИШНИЕ поля, но не проверяет
 * значения — clientBill: "banana" доходил до движка и превращался в 0/NaN.
 * Здесь проверяем только денежные/числовые поля; остальные поля пропускаем
 * (passthrough), чтобы не отклонять валидные запросы из-за строгости схемы.
 *
 * Использование в роуте:
 *   const err = validateBody(invoiceMoneySchema, req.body);
 *   if (err) return res.status(400).json({ error: err });
 */
import { z } from "zod";

// Деньги: число или числовая строка ("450100", "450100.50").
// Отклоняет "banana", NaN, Infinity, пустую строку.
const NUMERIC_RE = /^-?\d{1,13}([.,]\d{1,4})?$/;
export const moneyValue = z.union([
  z.number().finite(),
  z.string().trim().regex(NUMERIC_RE, "не число"),
]);
// Неотрицательные деньги (суммы счетов/расходов не бывают < 0).
export const nonNegativeMoney = moneyValue.refine(
  (v) => (typeof v === "number" ? v : parseFloat(String(v).replace(",", "."))) >= 0,
  "должно быть ≥ 0",
);
// Строго положительные (платёж/расход на 0 не имеет смысла).
export const positiveMoney = moneyValue.refine(
  (v) => (typeof v === "number" ? v : parseFloat(String(v).replace(",", "."))) > 0,
  "должно быть > 0",
);
// Целочисленный счётчик (периоды).
export const intCount = z.union([
  z.number().int().min(0),
  z.string().trim().regex(/^\d{1,6}$/, "не целое число"),
]);

// nullish-обёртка: поле может отсутствовать или быть null — валидируем только присланное значение.
const opt = <T extends z.ZodTypeAny>(s: T) => s.nullish();

/** POST/PATCH /api/invoices — денежные поля счёта + вложенных calculations. */
export const invoiceMoneySchema = z
  .object({
    clientBill:            opt(nonNegativeMoney),
    partnerCommissionRate: opt(nonNegativeMoney),
    plannedExpenses:       opt(nonNegativeMoney),
    pricePerPeriod:        opt(nonNegativeMoney),
    totalPeriods:          opt(intCount),
    periodsUsed:           opt(intCount),
    calculations: opt(
      z.object({
        clientBill:     opt(nonNegativeMoney),
        commissionRate: opt(nonNegativeMoney),
      }).passthrough(),
    ),
  })
  .passthrough();

/** POST /api/invoices/:id/expenses — расход обязан иметь положительную сумму. */
export const expenseCreateSchema = z
  .object({ amount: positiveMoney })
  .passthrough();

/** PATCH /api/expenses/:id — сумма опциональна, но если прислана — положительная. */
export const expenseUpdateSchema = z
  .object({ amount: opt(positiveMoney) })
  .passthrough();

/** POST /api/partner-payments — платёж: положительная сумма + дата. */
export const partnerPaymentSchema = z
  .object({
    amount: positiveMoney,
    paymentDate: z.string().trim().min(1, "нужна дата платежа"),
  })
  .passthrough();

/** Возвращает текст ошибки (для 400) или null, если тело валидно. */
export function validateBody(schema: z.ZodTypeAny, body: unknown): string | null {
  const r = schema.safeParse(body ?? {});
  if (r.success) return null;
  const details = r.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "тело"}: ${i.message}`)
    .join("; ");
  return `Некорректные значения — ${details}`;
}
