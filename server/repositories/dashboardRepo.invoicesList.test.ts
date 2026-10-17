import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import { createInvoice } from "./invoiceRepo";
import { invoices } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { getDashboardInvoices } from "./dashboardRepo";

// Характеризующие тесты getDashboardInvoices (провал-списки дашборда).
// Написаны ДО переписывания полной выборки на WHERE — фиксируют поведение
// всех 5 категорий, чтобы оптимизация ничего не сдвинула.

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

async function mk(opts: {
  status?: string; paymentDate?: string | null; actualPaymentDate?: string | null;
  createdAt?: string; bill?: string; recurring?: boolean;
}) {
  seq++;
  const inv = await createInvoice(asDb(), {
    invoiceNumber: `D-${seq}`, clientId, partnerId,
    scheme: "commission_based" as const, createdBy: BY,
    status: opts.status ?? "sent",
    paymentDate: opts.paymentDate === undefined ? null : opts.paymentDate,
  }, { clientBill: opts.bill ?? "1000" });
  const patch: Partial<import("../../shared/schema").Invoice> = {};
  if (opts.actualPaymentDate) patch.actualPaymentDate = opts.actualPaymentDate;
  if (opts.createdAt) patch.createdAt = new Date(opts.createdAt);
  if (opts.recurring) patch.recurringInvoiceId = inv.id; // маркер «из рекуррентного»
  if (Object.keys(patch).length) await db.update(invoices).set(patch).where(eq(invoices.id, inv.id));
  return inv;
}
const nums = (rows: Array<{ invoiceNumber: string }>) => rows.map(r => r.invoiceNumber).sort();

// Выбранный месяц: март 2026 (month=2, 0-индексный)
describe("getDashboardInvoices — категории", () => {
  it("received: оплаченные с effectiveDate в месяце", async () => {
    await mk({ status: "paid", paymentDate: "2026-03-15" });          // D-1 ✓
    await mk({ status: "paid", paymentDate: "2026-04-01" });          // D-2 другой месяц
    await mk({ status: "sent", paymentDate: "2026-03-10" });          // D-3 не оплачен
    await mk({ status: "paid", paymentDate: null, createdAt: "2026-03-20" }); // D-4 ✓ fallback createdAt
    expect(nums(await getDashboardInvoices(asDb(), 2026, 2, "received"))).toEqual(["D-1", "D-4"]);
  });

  it("received: оплата в другом месяце — счёт идёт в месяц ФАКТА, не плана", async () => {
    // Регрессия владельца (2026-08-03): счёт 29062026 — план 17 июля,
    // фактически оплачен 6 августа — не показывался в августовских деньгах.
    await mk({ status: "paid", paymentDate: "2026-07-17", actualPaymentDate: "2026-08-06" }); // D-1
    const aug  = await getDashboardInvoices(asDb(), 2026, 7, "received");
    const july = await getDashboardInvoices(asDb(), 2026, 6, "received");
    expect(nums(aug)).toEqual(["D-1"]);
    expect(nums(july)).toEqual([]);
    // В списке подписан датой фактической оплаты, а не плановым сроком
    expect(aug[0].paymentDate).toContain("2026-08-06");
  });

  it("expected: неоплаченные/неотменённые с effectiveDate в месяце", async () => {
    await mk({ status: "sent",  paymentDate: "2026-03-10" });         // D-1 ✓
    await mk({ status: "draft", paymentDate: "2026-03-20" });         // D-2 ✓
    await mk({ status: "paid",  paymentDate: "2026-03-15" });         // D-3 оплачен — нет
    await mk({ status: "cancelled", paymentDate: "2026-03-15" });     // D-4 отменён — нет
    await mk({ status: "sent",  paymentDate: "2026-05-01" });         // D-5 другой месяц
    expect(nums(await getDashboardInvoices(asDb(), 2026, 2, "expected"))).toEqual(["D-1", "D-2"]);
  });

  it("drafts (продажи месяца): неотменённые, нерекуррентные, созданные в месяце", async () => {
    await mk({ status: "sent", paymentDate: null, createdAt: "2026-03-05" });                 // D-1 ✓
    await mk({ status: "cancelled", paymentDate: null, createdAt: "2026-03-06" });            // D-2 отменён
    await mk({ status: "sent", paymentDate: null, createdAt: "2026-03-07", recurring: true }); // D-3 рекуррентный
    await mk({ status: "sent", paymentDate: null, createdAt: "2026-02-01" });                 // D-4 другой месяц
    expect(nums(await getDashboardInvoices(asDb(), 2026, 2, "drafts"))).toEqual(["D-1"]);
  });

  it("overdue: sent, не оплачен, срок прошёл (месяц игнорируется)", async () => {
    await mk({ status: "sent", paymentDate: "2020-01-01" });                                   // D-1 ✓ давно
    await mk({ status: "sent", paymentDate: "2099-01-01" });                                   // D-2 срок впереди
    await mk({ status: "sent", paymentDate: "2020-02-01", actualPaymentDate: "2020-02-05" });  // D-3 оплачен фактически
    await mk({ status: "draft", paymentDate: "2020-03-01" });                                  // D-4 не sent
    await mk({ status: "sent", paymentDate: null });                                           // D-5 нет срока
    expect(nums(await getDashboardInvoices(asDb(), 2026, 2, "overdue"))).toEqual(["D-1"]);
  });

  it("drafts_no_date: черновики без плановой даты (месяц игнорируется)", async () => {
    await mk({ status: "draft", paymentDate: null });               // D-1 ✓
    await mk({ status: "draft", paymentDate: "2026-03-01" });       // D-2 дата есть
    await mk({ status: "sent",  paymentDate: null });               // D-3 не draft
    expect(nums(await getDashboardInvoices(asDb(), 2026, 2, "drafts_no_date"))).toEqual(["D-1"]);
  });

  it("сортировка по netProfitAdmin по убыванию", async () => {
    await mk({ status: "paid", paymentDate: "2026-03-01", bill: "100" });
    await mk({ status: "paid", paymentDate: "2026-03-02", bill: "900" });
    const rows = await getDashboardInvoices(asDb(), 2026, 2, "received");
    expect(rows[0].netProfitAdmin).toBeGreaterThan(rows[1].netProfitAdmin);
  });
});
