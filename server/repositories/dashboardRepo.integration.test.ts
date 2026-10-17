import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import { createInvoice } from "./invoiceRepo";
import { getAdminMonthlyData } from "./dashboardRepo";

// Интеграционные тесты для getAdminMonthlyData, вынесенного из storage.ts.
// Проверяют, что перенос ничего не сломал: агрегация по месяцам, фильтр по
// статусу 'paid', привязка к paymentDate.

let db: TestDb;
let close: () => Promise<void>;
let partnerId: string;
let clientId: string;
const asDb = () => db as unknown as typeof import("../db").db;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
});
afterEach(async () => { await close(); });

async function seedPaidInvoice(num: string, paymentDate: string, clientBill: string) {
  return createInvoice(asDb(), {
    invoiceNumber: num, clientId, partnerId,
    scheme: "commission_based" as const,
    createdBy: "00000000-0000-0000-0000-000000000001",
    status: "paid", paymentDate,
  }, { clientBill });
}

describe("getAdminMonthlyData", () => {
  it("пустая БД → 12 месяцев по нулям", async () => {
    const data = await getAdminMonthlyData(asDb(), 2026);
    expect(data).toHaveLength(12);
    expect(data.every(m => m.totalSales === 0 && m.invoiceCount === 0)).toBe(true);
    expect(data[0].monthNumber).toBe(1);
  });

  it("оплаченный счёт попадает в свой месяц по paymentDate", async () => {
    await seedPaidInvoice("INV-1", "2026-03-15", "1000");
    const data = await getAdminMonthlyData(asDb(), 2026);

    const march = data[2]; // индекс 2 = март
    expect(march.invoiceCount).toBe(1);
    expect(march.totalSales).toBeCloseTo(1000, 2);
    expect(march.totalProfit).toBeGreaterThan(0);
    // остальные месяцы пусты
    expect(data[0].invoiceCount).toBe(0);
    expect(data[5].invoiceCount).toBe(0);
  });

  it("суммирует несколько счетов одного месяца и разносит по месяцам", async () => {
    await seedPaidInvoice("INV-2", "2026-03-01", "1000");
    await seedPaidInvoice("INV-3", "2026-03-20", "500");
    await seedPaidInvoice("INV-4", "2026-07-10", "700");
    const data = await getAdminMonthlyData(asDb(), 2026);

    expect(data[2].invoiceCount).toBe(2);       // март: 2 счёта
    expect(data[2].totalSales).toBeCloseTo(1500, 2);
    expect(data[6].invoiceCount).toBe(1);       // июль: 1 счёт
    expect(data[6].totalSales).toBeCloseTo(700, 2);
  });

  it("счёт из другого года не учитывается", async () => {
    await seedPaidInvoice("INV-5", "2025-03-15", "1000");
    const data = await getAdminMonthlyData(asDb(), 2026);
    expect(data.every(m => m.invoiceCount === 0)).toBe(true);
  });
});
