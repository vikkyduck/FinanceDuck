import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import { createInvoice } from "./invoiceRepo";
import { getPartnerHeroMetrics } from "./dashboardRepo";
import { partners, partnerPayments, signedActs } from "../../shared/schema";

// Проверяем долг, резерв на расходы и годовую комиссию по первичным данным.

let db: TestDb;
let close: () => Promise<void>;
let partnerId: string;
let clientId: string;
const asDb = () => db as unknown as typeof import("../db").db;
const CREATED_BY = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
});
afterEach(async () => { await close(); });

async function seedPaidInvoice(num: string, clientBill: string, pId = partnerId) {
  return createInvoice(asDb(), {
    invoiceNumber: num, clientId, partnerId: pId,
    scheme: "commission_based" as const, createdBy: CREATED_BY,
    status: "paid",
  }, { clientBill });
}

describe("getPartnerHeroMetrics", () => {
  it("нет счетов → всё по нулям", async () => {
    const m = await getPartnerHeroMetrics(asDb(), partnerId);
    expect(m).toMatchObject({
      debtToAdmin: 0, totalPaidInvoices: 0, signedActsCount: 0, invoicesWithDebt: [],
    });
  });

  it("долг партнёра = сумма partnerTransferDue оплаченных счетов", async () => {
    await seedPaidInvoice("INV-1", "1000"); // commission_based → partnerTransferDue = 1000
    const m = await getPartnerHeroMetrics(asDb(), partnerId);
    expect(m.debtToAdmin).toBeCloseTo(1000, 2);
    expect(m.totalPaidInvoices).toBe(1);
    expect(m.invoicesWithDebt).toHaveLength(1);
    expect(m.invoicesWithDebt[0].amount).toBeCloseTo(1000, 2);
  });

  it("платежи партнёра уменьшают долг", async () => {
    await seedPaidInvoice("INV-2", "1000");
    await db.insert(partnerPayments).values({
      partnerId, amount: "300", paymentDate: "2026-03-01", createdBy: CREATED_BY,
    });
    const m = await getPartnerHeroMetrics(asDb(), partnerId);
    expect(m.debtToAdmin).toBeCloseTo(700, 2); // 1000 - 300
  });

  it("считаются только счета данного партнёра", async () => {
    await seedPaidInvoice("INV-3", "1000");
    const [other] = await db.insert(partners).values({ name: "Другой партнёр" }).returning();
    await seedPaidInvoice("INV-4", "500", other.id);
    const m = await getPartnerHeroMetrics(asDb(), partnerId);
    expect(m.totalPaidInvoices).toBe(1);
    expect(m.debtToAdmin).toBeCloseTo(1000, 2);
  });

  it("считает подписанные акты по счетам партнёра", async () => {
    const inv = await seedPaidInvoice("INV-5", "1000");
    await db.insert(signedActs).values({
      invoiceId: inv.id, actType: "executor", fileName: "act.pdf", uploadedBy: CREATED_BY,
    });
    const m = await getPartnerHeroMetrics(asDb(), partnerId);
    expect(m.signedActsCount).toBe(1);
  });

  it("считает резерв по плану и расходам партнёра, комиссию по действующей ставке", async () => {
    const invoice = await createInvoice(asDb(), {
      invoiceNumber: "INV-6", clientId, partnerId, scheme: "commission_based",
      partnerCommissionRate: "20", clientBill: "1000", plannedExpenses: "300",
      createdBy: CREATED_BY, status: "paid",
    });
    const { createInvoiceExpense } = await import("./invoiceRepo");
    await createInvoiceExpense(asDb(), { invoiceId: invoice.id, description: "cost", amount: "100", paidByAdmin: false, createdBy: CREATED_BY });
    const m = await getPartnerHeroMetrics(asDb(), partnerId);
    expect(m.reservedForExpenses).toBe(200);
    expect(m.yearlyCommission).toBe(200);
  });
});
