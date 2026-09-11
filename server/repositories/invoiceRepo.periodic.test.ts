/**
 * Периодические счета: «использовано» = число расходов.
 *
 * До этого правила месяцы закрывались только руками, и счёт 0899 при восьми
 * оплатах исполнителю показывал «использовано 0/9» и остаток на полную сумму —
 * и админу, и партнёру, и клиенту. Теперь каждая строка расхода = прожитый
 * период; второго (ручного) источника нет — два источника спорили.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import {
  createInvoice, createInvoiceExpense, deleteInvoiceExpense, getInvoice,
  updateInvoice, updateInvoiceCalculations, derivePeriodsUsed, healPeriodicUsage,
} from "./invoiceRepo";
import { invoices } from "../../shared/schema";
import { eq } from "drizzle-orm";

describe("derivePeriodsUsed — правило", () => {
  const periodic = { serviceType: "periodic", totalPeriods: 9 };

  it("one_time — не трогаем", () => {
    expect(derivePeriodsUsed({ serviceType: "one_time", totalPeriods: 9 }, 5)).toBeUndefined();
  });
  it("использовано = число расходов", () => {
    expect(derivePeriodsUsed(periodic, 0)).toBe(0);
    expect(derivePeriodsUsed(periodic, 8)).toBe(8);
  });
  it("не больше totalPeriods", () => {
    expect(derivePeriodsUsed(periodic, 40)).toBe(9);
  });
});

let db: TestDb;
let close: () => Promise<void>;
let partnerId: string;
let clientId: string;
const asDb = () => db as any;
const ACTOR = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
});
afterEach(async () => { await close(); });

// Счёт как 0899: 270 000 × 9 мес, клиентская схема, плановые расходы.
async function makePeriodic() {
  return createInvoice(asDb(), {
    invoiceNumber: `P-${Math.round(performance.now() * 1000)}`,
    clientId, partnerId,
    scheme: "commission_based" as const,
    createdBy: ACTOR,
    serviceType: "periodic",
    periodUnit: "month",
    pricePerPeriod: "270000",
    totalPeriods: 9,
    periodsUsed: 0,
    partnerCommissionRate: "15",
    plannedExpenses: "1215000",
  } as any, { clientBill: "2430000", commissionRate: "15" });
}

const expense = (invoiceId: string) => ({
  invoiceId, description: "ИП Марушкина (оклад)", amount: "130000",
  paidByAdmin: false, date: "2026-06-03", createdBy: ACTOR,
});

describe("periodsUsed следует за расходами (PGlite)", () => {
  it("каждый расход = прожитый месяц; остаток и «потрачено» считаются от него", async () => {
    const inv = await makePeriodic();
    for (let i = 0; i < 3; i++) await createInvoiceExpense(asDb(), expense(inv.id));

    const got = await getInvoice(asDb(), inv.id, "admin");
    expect(got?.periodsUsed).toBe(3);
    expect(Number(got?.calculations?.clientSpent)).toBe(270000 * 3);
    expect(Number(got?.calculations?.clientRemaining)).toBe(270000 * 6);
    // Денежная математика админа не тронута: расходы как были.
    expect(Number(got?.calculations?.executorExpensesTotal)).toBe(130000 * 3);
  });

  it("удаление расхода откатывает месяц", async () => {
    const inv = await makePeriodic();
    const e1 = await createInvoiceExpense(asDb(), expense(inv.id));
    await createInvoiceExpense(asDb(), expense(inv.id));
    await deleteInvoiceExpense(asDb(), e1.id);

    const got = await getInvoice(asDb(), inv.id, "admin");
    expect(got?.periodsUsed).toBe(1);
    expect(Number(got?.calculations?.clientRemaining)).toBe(270000 * 8);
  });

  it("ручная правка periodsUsed не удерживается — число расходов главнее", async () => {
    const inv = await makePeriodic();
    await createInvoiceExpense(asDb(), expense(inv.id));
    await createInvoiceExpense(asDb(), expense(inv.id));

    // PATCH periodic-полей идёт через updateInvoice + updateInvoiceCalculations.
    await updateInvoice(asDb(), inv.id, { periodsUsed: 5 } as any);
    await updateInvoiceCalculations(asDb(), inv.id, {});
    const got = await getInvoice(asDb(), inv.id, "admin");
    expect(got?.periodsUsed).toBe(2);
    expect(Number(got?.calculations?.clientRemaining)).toBe(270000 * 7);
  });

  it("healPeriodicUsage подтягивает старые данные (periods_used = 0 при расходах)", async () => {
    const inv = await makePeriodic();
    for (let i = 0; i < 8; i++) await createInvoiceExpense(asDb(), expense(inv.id));
    // Имитируем состояние до правила: счётчик обнулён напрямую в БД.
    await db.update(invoices).set({ periodsUsed: 0 }).where(eq(invoices.id, inv.id));

    const healed = await healPeriodicUsage(asDb());
    expect(healed).toBe(1);
    const got = await getInvoice(asDb(), inv.id, "admin");
    expect(got?.periodsUsed).toBe(8);
    expect(Number(got?.calculations?.clientRemaining)).toBe(270000);

    // Повторный прогон ничего не находит — идемпотентно.
    expect(await healPeriodicUsage(asDb())).toBe(0);
  });
});
