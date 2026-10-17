import type { ZodTypeAny } from "zod";
import { describe, it, expect } from "vitest";
import {
  validateBody, invoiceMoneySchema, expenseCreateSchema, expenseUpdateSchema, partnerPaymentSchema,
} from "./validate";

// S5 из ревью: whitelist режет лишние поля, но не типы — clientBill:"banana"
// доходил до движка. Эти тесты фиксируют, что мусор больше не проходит.

const ok = (s: ZodTypeAny, b: unknown) => expect(validateBody(s, b)).toBeNull();
const bad = (s: ZodTypeAny, b: unknown) => expect(validateBody(s, b)).toBeTruthy();

describe("invoiceMoneySchema", () => {
  it("валидные тела проходят (число, числовая строка, запятая, отсутствие полей)", () => {
    ok(invoiceMoneySchema, {});
    ok(invoiceMoneySchema, { clientBill: 450100 });
    ok(invoiceMoneySchema, { clientBill: "450100.50", partnerCommissionRate: "15" });
    ok(invoiceMoneySchema, { clientBill: "1000,25" }); // запятая как разделитель
    ok(invoiceMoneySchema, { calculations: { clientBill: "270000", commissionRate: 40 } });
    ok(invoiceMoneySchema, { clientBill: null, plannedExpenses: undefined });
    ok(invoiceMoneySchema, { description: "любые НЕденежные поля не трогаем" });
  });
  it("мусор отклоняется", () => {
    bad(invoiceMoneySchema, { clientBill: "banana" });
    bad(invoiceMoneySchema, { clientBill: NaN });
    bad(invoiceMoneySchema, { clientBill: Infinity });
    bad(invoiceMoneySchema, { clientBill: "" });
    bad(invoiceMoneySchema, { clientBill: -5 });                       // отрицательный счёт
    bad(invoiceMoneySchema, { calculations: { clientBill: "12abc" } }); // мусор во вложенном
    bad(invoiceMoneySchema, { totalPeriods: "3.5" });                   // периоды — целые
    bad(invoiceMoneySchema, { totalPeriods: -1 });
  });
});

describe("expense schemas", () => {
  it("создание: amount обязателен и > 0", () => {
    ok(expenseCreateSchema, { amount: "20000", description: "х" });
    bad(expenseCreateSchema, { description: "без суммы" });
    bad(expenseCreateSchema, { amount: 0 });
    bad(expenseCreateSchema, { amount: "banana" });
  });
  it("правка: amount опционален, но если есть — > 0", () => {
    ok(expenseUpdateSchema, { description: "только описание" });
    ok(expenseUpdateSchema, { amount: 500 });
    bad(expenseUpdateSchema, { amount: "нет" });
    bad(expenseUpdateSchema, { amount: -1 });
  });
});

describe("partnerPaymentSchema", () => {
  it("платёж: положительная сумма + дата", () => {
    ok(partnerPaymentSchema, { amount: "15000", paymentDate: "2026-07-04", partnerId: "x" });
    bad(partnerPaymentSchema, { amount: "15000" });            // нет даты
    bad(partnerPaymentSchema, { amount: 0, paymentDate: "2026-07-04" });
    bad(partnerPaymentSchema, { amount: "banana", paymentDate: "2026-07-04" });
  });
});
