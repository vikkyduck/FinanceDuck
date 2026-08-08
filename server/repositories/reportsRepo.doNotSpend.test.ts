import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import { createInvoice, createInvoiceTransfer } from "./invoiceRepo";
import { getDoNotSpendData } from "./reportsRepo";
import { clients, invoices, invoiceCalculations, invoiceExpenses } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { parseNum } from "../../shared/financialEngine";

// Регрессия владельца (2026-08-03): в админке «Не тратить» деньги клиента
// показывались как 805К, а в кабинете клиента — 811К. Экран считал
// Σбаза − Σрасходы и НЕ знал о переносах бюджета между счетами (в т.ч.
// переносе со счёта ДРУГОГО клиента), а также клампил минус в ноль.
// Источник истины — сохранённый clientRemaining (его же проверяет аудит денег).

let db: TestDb;
let close: () => Promise<void>;
let partnerId: string;
let clientId: string;
let seq = 0;
const asDb = () => db as any;
const BY = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
  seq = 0;
});
afterEach(async () => { await close(); });

/** Агентский счёт 30%: клиенту доступно 70% суммы. */
async function mkAgency(bill: string, targetClientId = clientId) {
  seq++;
  return createInvoice(asDb(), {
    invoiceNumber: `DNS-${seq}`, clientId: targetClientId, partnerId,
    scheme: "agency_30" as const, createdBy: BY,
    status: "paid", paymentDate: "2026-03-01",
  } as any, { clientBill: bill });
}

async function addExpense(invoiceId: string, amount: string) {
  await db.insert(invoiceExpenses).values({
    invoiceId, description: "расход", amount, date: "2026-03-10", createdBy: BY,
  } as any);
  const { recalcInvoice } = await import("./invoiceRepo");
  await recalcInvoice(asDb(), invoiceId);
}

const storedRemaining = async (invoiceId: string) => {
  const [c] = await db.select().from(invoiceCalculations)
    .where(eq(invoiceCalculations.invoiceId, invoiceId));
  return parseNum(c.clientRemaining);
};

describe("«Не тратить» — итог сходится с кабинетом клиента", () => {
  it("перенос, ставший межклиентским после смены клиента у счёта", async () => {
    // Так и возникло на проде: перенос 004 → 033 сделан внутри одного клиента
    // (межклиентские переносы движок запрещает), а позже счёт-источник
    // переподчинили другой карточке клиента — деньги «уехали» к получателю.
    const [other] = await db.insert(clients).values({ name: "Другой клиент" }).returning();

    const mine   = await mkAgency("100000"); // доступно 70 000
    const source = await mkAgency("100000"); // доступно 70 000

    const res = await createInvoiceTransfer(asDb(), {
      fromInvoiceId: source.id, toInvoiceId: mine.id, amount: 5100, createdBy: BY,
    });
    expect(res.ok, JSON.stringify(res)).toBe(true);

    // Счёт-источник переехал к другому клиенту (как 004 → «Avito»)
    await db.update(invoices).set({ clientId: other.id }).where(eq(invoices.id, source.id));

    const rows = await getDoNotSpendData(asDb());
    const mineRow = rows.find(r => r.clientId === clientId)!;

    // Деньги клиента = 70 000 + 5 100 перенесённых
    expect(mineRow.remaining).toBeCloseTo(75100, 2);
    // …и совпадают с сохранённым остатком (его же видит клиент в кабинете)
    expect(mineRow.remaining).toBeCloseTo(await storedRemaining(mine.id), 2);
    // Идентичность карточки не сломана: бюджет − расходы = остаток
    expect(mineRow.totalBudget - mineRow.totalSpent).toBeCloseTo(mineRow.remaining, 2);

    // У клиента-источника деньги уменьшились на ту же сумму
    const alienRow = rows.find(r => r.clientId === other.id)!;
    expect(alienRow.remaining).toBeCloseTo(64900, 2);
  });

  it("перерасход по счёту не маскируется нулём в итоге клиента", async () => {
    const a = await mkAgency("100000"); // доступно 70 000
    const b = await mkAgency("100000"); // доступно 70 000
    await addExpense(a.id, "80000");    // перерасход: остаток −10 000

    const rows = await getDoNotSpendData(asDb());
    const row = rows.find(r => r.clientId === clientId)!;

    // 70 000 − 10 000 = 60 000, а не 70 000 (минус раньше клампился в ноль)
    expect(row.remaining).toBeCloseTo(60000, 2);
    const sumStored = (await storedRemaining(a.id)) + (await storedRemaining(b.id));
    expect(row.remaining).toBeCloseTo(sumStored, 2);
  });
});
