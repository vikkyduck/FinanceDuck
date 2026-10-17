import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import {
  createInvoice, createInvoiceExpense, createInvoiceTransfer, recalculateAllInvoices,
} from "./invoiceRepo";
import { parseNum } from "../../shared/financialEngine";
import { invoices, invoiceCalculations, invoiceExpenses, invoiceTransfers } from "../../shared/schema";
import { eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// ИНВАРИАНТЫ ДЕНЕГ. Прогоняем НАСТОЯЩИЕ пути записи (создание счёта, расход,
// перенос, массовый пересчёт) на PGlite и проверяем, что сохранённые
// производные поля сходятся с формулой движка — те же инварианты, что и в
// scripts/audit-money.sql. Плохая правка кода уронит эти тесты ДО деплоя.
// ─────────────────────────────────────────────────────────────────────────────

let db: TestDb;
let close: () => Promise<void>;
let partnerId: string;
let clientId: string;
let seq = 0;
const asDb = () => db as unknown as typeof import("../db").db;
const BY = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
  seq = 0;
});
afterEach(async () => { await close(); });

async function createInv(
  scheme: import("../../shared/schema").InvoiceScheme, bill: number,
  opts: { commissionRate?: number; partnerCommissionRate?: number } = {},
) {
  seq++;
  const inv: import("../../shared/schema").InsertInvoice = { invoiceNumber: `T-${seq}`, clientId, partnerId, scheme, createdBy: BY, status: "sent" };
  if (opts.partnerCommissionRate !== undefined) inv.partnerCommissionRate = String(opts.partnerCommissionRate);
  const calc: Partial<import("../../shared/schema").InvoiceCalculation> = { clientBill: String(bill) };
  if (opts.commissionRate !== undefined) calc.commissionRate = String(opts.commissionRate);
  return createInvoice(asDb(), inv, calc);
}

const near = (a: number, b: number, label = "") =>
  expect(Math.abs(a - b), `${label}: ${a} ≠ ${b}`).toBeLessThanOrEqual(0.02);

/** Проверка, что сохранённый расчёт счёта держит формулу (зеркало audit-money.sql). */
async function assertConsistent(invoiceId: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  const [c]   = await db.select().from(invoiceCalculations).where(eq(invoiceCalculations.invoiceId, invoiceId));
  const exps  = await db.select().from(invoiceExpenses).where(eq(invoiceExpenses.invoiceId, invoiceId));
  const trs   = await db.select().from(invoiceTransfers);
  const expSum = exps.reduce((s, e) => s + parseNum(e.amount), 0);
  const inAmt  = trs.filter(t => t.toInvoiceId === invoiceId).reduce((s, t) => s + parseNum(t.amount), 0);
  const outAmt = trs.filter(t => t.fromInvoiceId === invoiceId).reduce((s, t) => s + parseNum(t.amount), 0);
  const b = parseNum(c.clientBill);
  const g = (v: string | number | null) => parseNum(v);

  near(g(c.executorExpensesTotal), expSum, "расходы=сумме_строк");
  near(g(c.adminShare50), g(c.netProfitAdmin) / 2, "админ50");
  near(g(c.catShare50),   g(c.netProfitAdmin) / 2, "кот50");

  switch (inv.scheme) {
    case "agency_30":
      near(g(c.agencyMargin), b * 0.30, "маржа30"); near(g(c.partnerShareFromMargin), b * 0.15, "партнёр15");
      near(g(c.adminShareFromMargin), b * 0.15, "админ15"); near(g(c.clientBaseAfterMargin), b * 0.70, "база70");
      break;
    case "agency_40":
      near(g(c.agencyMargin), b * 0.40, "маржа40"); near(g(c.partnerShareFromMargin), b * 0.16, "партнёр16");
      near(g(c.adminShareFromMargin), b * 0.24, "админ24"); near(g(c.clientBaseAfterMargin), b * 0.60, "база60");
      break;
    case "agency": {
      const rate = parseNum(c.commissionRate);
      near(g(c.agencyMargin), b * rate / 100, "маржа=b×ставка");
      near(g(c.adminShareFromMargin), g(c.agencyMargin) - g(c.partnerShareFromMargin), "админ=маржа−партнёр");
      near(g(c.clientBaseAfterMargin), b - g(c.agencyMargin), "база=b−маржа");
      break;
    }
    case "partner_10":
      near(g(c.commissionAmount), b * 0.10, "комиссия10"); near(g(c.amountToAdmin), b * 0.90, "админу90"); break;
    case "partner_15":
      near(g(c.commissionAmount), b * 0.15, "комиссия15"); near(g(c.amountToAdmin), b * 0.85, "админу85"); break;
    case "commission_based": {
      const r = parseNum(c.commissionRate);
      near(g(c.commissionAmount), b * r / 100, "комиссия=b×ставка");
      near(g(c.amountToAdmin), b - g(c.commissionAmount), "админу=b−комиссия"); break;
    }
  }
  if (["agency_30", "agency_40", "agency"].includes(inv.scheme) && inv.serviceType !== "periodic") {
    near(g(c.clientRemaining), g(c.clientBaseAfterMargin) - g(c.executorExpensesTotal) + inAmt - outAmt, "остаток");
  }
  return c;
}

describe("Создание счёта: расчёт держит формулу по всем схемам", () => {
  it("agency_30 / agency_40 / partner_10 / partner_15 / commission_based / agency", async () => {
    const a30 = await createInv("agency_30", 100000);
    const a40 = await createInv("agency_40", 200000);
    const p10 = await createInv("partner_10", 300000);
    const p15 = await createInv("partner_15", 150000);
    const cb  = await createInv("commission_based", 100000, { commissionRate: 10 });
    const ag  = await createInv("agency", 1000000, { commissionRate: 40, partnerCommissionRate: 15 });

    for (const inv of [a30, a40, p10, p15, cb, ag]) await assertConsistent(inv.id);

    // Точечно проверим ключевой пример гибкой agency: маржа 400к, партнёр 150к, админ 250к.
    const [c] = await db.select().from(invoiceCalculations).where(eq(invoiceCalculations.invoiceId, ag.id));
    near(parseNum(c.agencyMargin), 400000, "agency маржа");
    near(parseNum(c.partnerShareFromMargin), 150000, "agency партнёр");
    near(parseNum(c.adminShareFromMargin), 250000, "agency админ");
  });
});

describe("Добавление расхода: остаток и сумма расходов сходятся", () => {
  it("agency_30: расход уменьшает остаток на свою величину", async () => {
    const inv = await createInv("agency_30", 100000); // база 70000
    await createInvoiceExpense(asDb(), { invoiceId: inv.id, description: "расход", amount: "20000", paidByAdmin: false, createdBy: BY });
    const c = await assertConsistent(inv.id);
    near(parseNum(c.executorExpensesTotal), 20000, "eet");
    near(parseNum(c.clientRemaining), 50000, "остаток=база−расход"); // 70000 − 20000
  });
});

describe("Перенос бюджета: деньги сохраняются, остатки сдвигаются", () => {
  it("перенос 10000 между агентскими счетами клиента", async () => {
    const from = await createInv("agency_30", 100000); // остаток 70000
    const to   = await createInv("agency_30", 50000);  // остаток 35000

    const res = await createInvoiceTransfer(asDb(), { fromInvoiceId: from.id, toInvoiceId: to.id, amount: 10000, createdBy: BY });
    expect(res.ok, JSON.stringify(res)).toBe(true);

    const cFrom = await assertConsistent(from.id);
    const cTo   = await assertConsistent(to.id);
    near(parseNum(cFrom.clientRemaining), 60000, "источник −10000");
    near(parseNum(cTo.clientRemaining),   45000, "получатель +10000");
    // деньги не создались и не исчезли
    near(parseNum(cFrom.clientRemaining) + parseNum(cTo.clientRemaining), 105000, "сумма доступного сохранена");
  });

  it("нельзя перенести больше доступного (не уводит в минус)", async () => {
    const from = await createInv("agency_30", 100000); // остаток 70000
    const to   = await createInv("agency_30", 50000);
    const res = await createInvoiceTransfer(asDb(), { fromInvoiceId: from.id, toInvoiceId: to.id, amount: 999999, createdBy: BY });
    expect(res.ok).toBe(false);
  });
});

describe("Массовый пересчёт идемпотентен (регрессия: agency + переносы)", () => {
  it("recalculateAllInvoices НЕ портит гибкую agency и остаток по переносам", async () => {
    const ag   = await createInv("agency", 1000000, { commissionRate: 40, partnerCommissionRate: 15 });
    const from = await createInv("agency_30", 100000);
    const to   = await createInv("agency_30", 50000);
    await createInvoiceTransfer(asDb(), { fromInvoiceId: from.id, toInvoiceId: to.id, amount: 10000, createdBy: BY });

    const snap = async (id: string) => {
      const [c] = await db.select().from(invoiceCalculations).where(eq(invoiceCalculations.invoiceId, id));
      return { m: parseNum(c.agencyMargin), p: parseNum(c.partnerShareFromMargin), a: parseNum(c.adminShareFromMargin), r: parseNum(c.clientRemaining) };
    };
    const before = { ag: await snap(ag.id), from: await snap(from.id), to: await snap(to.id) };

    await recalculateAllInvoices(asDb());

    const after = { ag: await snap(ag.id), from: await snap(from.id), to: await snap(to.id) };
    // до фикса: recalcAll обнулял бы маржу agency и стирал остаток по переносам
    near(after.ag.m, before.ag.m, "agency маржа не изменилась"); near(after.ag.m, 400000, "agency маржа=400к");
    near(after.ag.p, before.ag.p, "agency партнёр"); near(after.ag.a, before.ag.a, "agency админ");
    near(after.from.r, before.from.r, "источник остаток"); near(after.from.r, 60000, "источник=60000");
    near(after.to.r, before.to.r, "получатель остаток"); near(after.to.r, 45000, "получатель=45000");

    for (const id of [ag.id, from.id, to.id]) await assertConsistent(id);
  });
});
