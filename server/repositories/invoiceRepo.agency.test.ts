import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import { createInvoice, createInvoiceExpense } from "./invoiceRepo";
import { invoices, invoiceCalculations } from "../../shared/schema";
import { eq } from "drizzle-orm";

// Интеграционные тесты гибкой схемы 'agency': маржа в calc.commissionRate,
// процент партнёра в invoices.partnerCommissionRate; персист и пересчёт.

let db: TestDb;
let close: () => Promise<void>;
let partnerId: string;
let clientId: string;
const asDb = () => db as unknown as typeof import("../db").db;
const num = (v: string | number | null) => Number(v);

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
});
afterEach(async () => { await close(); });

async function createAgency(clientBill: string, marginRate: string, partnerRate: string | null) {
  return createInvoice(asDb(), {
    invoiceNumber: `AG-${Math.round(performance.now() * 1000)}`,
    clientId, partnerId, scheme: "agency" as const,
    createdBy: "00000000-0000-0000-0000-000000000001",
    partnerCommissionRate: partnerRate,          // партнёр (скрыт от клиента)
  }, { clientBill, commissionRate: marginRate }); // маржа (видна клиенту)
}

async function getCalc(invoiceId: string) {
  const [c] = await db.select().from(invoiceCalculations).where(eq(invoiceCalculations.invoiceId, invoiceId));
  return c;
}

describe("createInvoice — agency (гибкая)", () => {
  it("1млн, маржа 40%, партнёр 15% → 400к/600к/150к/250к (пример пользователя)", async () => {
    const inv = await createAgency("1000000", "40", "15");
    const c = await getCalc(inv.id);
    expect(num(c.agencyMargin)).toBeCloseTo(400000, 2);
    expect(num(c.clientBaseAfterMargin)).toBeCloseTo(600000, 2);
    expect(num(c.partnerShareFromMargin)).toBeCloseTo(150000, 2);
    expect(num(c.adminShareFromMargin)).toBeCloseTo(250000, 2);
    expect(num(c.netProfitAdmin)).toBeCloseTo(250000, 2);
    // маржа персистится в calc.commissionRate, партнёр — в invoices.partnerCommissionRate
    expect(num(c.commissionRate)).toBeCloseTo(40, 2);

    const [i] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(num(i.partnerCommissionRate)).toBeCloseTo(15, 2);
  });

  it("другой процент партнёра (25%) считается верно", async () => {
    const inv = await createAgency("1000000", "40", "25");
    const c = await getCalc(inv.id);
    expect(num(c.partnerShareFromMargin)).toBeCloseTo(250000, 2); // 25% от 1млн
    expect(num(c.adminShareFromMargin)).toBeCloseTo(150000, 2);   // 400к − 250к
  });

  it("пересчёт после расхода: остаток клиента падает, прибыль админа фиксирована", async () => {
    const inv = await createAgency("1000000", "40", "15");
    await createInvoiceExpense(asDb(), {
      invoiceId: inv.id, description: "работа", amount: "100000",
      createdBy: "00000000-0000-0000-0000-000000000001", paidByAdmin: false,
    });
    const c = await getCalc(inv.id);
    expect(num(c.executorExpensesTotal)).toBeCloseTo(100000, 2);
    expect(num(c.clientRemaining)).toBeCloseTo(500000, 2); // 600к − 100к
    expect(num(c.netProfitAdmin)).toBeCloseTo(250000, 2);  // не изменилась
    expect(num(c.partnerShareFromMargin)).toBeCloseTo(150000, 2); // партнёр не изменился
  });

  it("без ставки партнёра вся маржа остаётся админу и после пересчёта (N2)", async () => {
    // В calc.commissionRate у 'agency' лежит маржа: брать её ставкой партнёра нельзя.
    const inv = await createAgency("1000000", "40", null);
    await createInvoiceExpense(asDb(), {
      invoiceId: inv.id, description: "работа", amount: "100000",
      createdBy: "00000000-0000-0000-0000-000000000001", paidByAdmin: false,
    });
    const c = await getCalc(inv.id);
    expect(num(c.agencyMargin)).toBeCloseTo(400000, 2);
    expect(num(c.partnerShareFromMargin)).toBe(0);
    expect(num(c.adminShareFromMargin)).toBeCloseTo(400000, 2);
    expect(num(c.netProfitAdmin)).toBeCloseTo(400000, 2);
  });
});
