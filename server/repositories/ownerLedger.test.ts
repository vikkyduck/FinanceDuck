import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../test/testDb";
import { createInvoice, createInvoiceExpense } from "./invoiceRepo";
import { createOwnerPayout, deleteOwnerPayout, getOwnerLedger, getPayables, setOwnerLedgerStart } from "./ownerLedgerRepo";
import { accessTokens, assistantBonusPayments, clients, invoiceExpenses, ownerTransfers, partners } from "../../shared/schema";
import { InvoiceCommands } from "../services/invoiceCommands";

// Учет денег владельцев: остаток на дату начала + доля по оплаченным счетам
// с этой даты - переводы. Ассистентам Кря платит из своей доли.

let db: TestDb;
let close: () => Promise<void>;
let ownerPartnerId: string;
let externalId: string;
let clientId: string;
let actorId: string;
const asDb = () => db as unknown as typeof import("../db").db;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [owner] = await db.insert(partners).values({ name: "Владелец лично", directToOwner: true }).returning();
  const [external] = await db.insert(partners).values({ name: "Внешний партнер" }).returning();
  const [client] = await db.insert(clients).values({ name: "Клиент" }).returning();
  const [actor] = await db.insert(accessTokens).values({ code: "LEDGER-ADMIN", role: "admin" }).returning();
  ownerPartnerId = owner.id; externalId = external.id; clientId = client.id; actorId = actor.id;
});
afterEach(async () => { await close(); });

function invoice(invoiceNumber: string, partnerId: string, status: "sent" | "paid" | "cancelled", clientBill: string, paymentDate: string) {
  return createInvoice(asDb(), { invoiceNumber, clientId, partnerId, scheme: "partner_10", createdBy: actorId, status, paymentDate }, { clientBill });
}

function expense(invoiceId: string, amount: string, paidByAdmin: boolean, paidAt: string | null) {
  return createInvoiceExpense(asDb(), { invoiceId, description: "Исполнитель", amount, paidByAdmin, date: "2026-10-02", paidAt, createdBy: actorId });
}

function payout(owner: "krya" | "kot", amount: string, transferDate: string) {
  return createOwnerPayout(asDb(), { owner, amount, transferDate, notes: null, createdBy: actorId });
}

describe("Переводы Коту и себе", () => {
  it("без даты начала учета балансов нет", async () => {
    await invoice("PAID-1", ownerPartnerId, "paid", "100000", "2026-10-03");
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.kot).toEqual({ since: null, opening: 0, accrued: 0, assistants: 0, paidOut: 0, balance: 0 });
    expect(ledger.krya.since).toBeNull();
  });

  it("считает долю с даты начала, вычитает переводы и выплаты ассистентам", async () => {
    await invoice("BEFORE", ownerPartnerId, "paid", "50000", "2026-09-20");
    const paid = await invoice("AFTER", ownerPartnerId, "paid", "100000", "2026-10-03");
    await expense(paid.id, "20000", true, "2026-10-04");
    await invoice("NOT-PAID", ownerPartnerId, "sent", "40000", "2026-10-05");
    await db.insert(assistantBonusPayments).values([
      { amount: "3000", paymentDate: "2026-10-05", paidBy: actorId },
      { amount: "7000", paymentDate: "2026-09-30", paidBy: actorId },
    ]);
    await setOwnerLedgerStart(asDb(), { since: "2026-10-01", kot: "10000", krya: "0", createdBy: actorId });
    await payout("kot", "20000", "2026-10-10");
    await payout("kot", "5000", "2026-09-25");
    await payout("krya", "30000", "2026-10-12");

    // partner_10: 100 000 - 10% = 90 000, минус расход 20 000 = прибыль 70 000, по 35 000.
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.kot).toEqual({ since: "2026-10-01", opening: 10000, accrued: 35000, assistants: 0, paidOut: 20000, balance: 25000 });
    expect(ledger.krya).toEqual({ since: "2026-10-01", opening: 0, accrued: 35000, assistants: 3000, paidOut: 30000, balance: 2000 });
    expect(ledger.transfers.filter(t => t.kind === "payout")).toHaveLength(3);
  });

  it("нечетные копейки делит как движок: Кря с округлением, Коту остаток", async () => {
    await invoice("ODD", ownerPartnerId, "paid", "111.12", "2026-10-03");
    await setOwnerLedgerStart(asDb(), { since: "2026-10-01", kot: "0", krya: "0", createdBy: actorId });
    // 111.12 - 10% (11.11) = 100.01: Кря 50.01, Кот 50.00.
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.krya.accrued).toBe(50.01);
    expect(ledger.kot.accrued).toBe(50);
  });

  it("новая дата начала заменяет прежнюю, удаляются только переводы", async () => {
    await setOwnerLedgerStart(asDb(), { since: "2026-09-01", kot: "1000", krya: "0", createdBy: actorId });
    await setOwnerLedgerStart(asDb(), { since: "2026-10-01", kot: "-500", krya: "200", createdBy: actorId });
    const openings = await db.select().from(ownerTransfers).where(eq(ownerTransfers.kind, "opening"));
    expect(openings).toHaveLength(2);
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.kot).toMatchObject({ since: "2026-10-01", opening: -500, balance: -500 });
    expect(ledger.krya).toMatchObject({ since: "2026-10-01", opening: 200, balance: 200 });

    const transfer = await payout("kot", "100", "2026-10-02");
    expect(await deleteOwnerPayout(asDb(), openings[0].id)).toBe(false);
    expect(await deleteOwnerPayout(asDb(), transfer.id)).toBe(true);
    expect(await db.select().from(ownerTransfers)).toHaveLength(2);
  });

  it("база не принимает перевод на ноль и неизвестного владельца", async () => {
    await expect(payout("kot", "0", "2026-10-02")).rejects.toThrow();
    await expect(db.insert(ownerTransfers).values({ owner: "someone", kind: "payout", amount: "10", transferDate: "2026-10-02", createdBy: actorId })).rejects.toThrow();
  });
});

describe("Мы должны", () => {
  it("неоплаченные расходы, которые платит владелец, и остаток Кота", async () => {
    const own = await invoice("OWN", ownerPartnerId, "paid", "100000", "2026-10-03");
    const ext = await invoice("EXT", externalId, "paid", "100000", "2026-10-03");
    const cancelled = await invoice("CANCELLED", ownerPartnerId, "cancelled", "100000", "2026-10-03");
    await expense(own.id, "15000", false, null);          // партнер-владелец: платит владелец
    await expense(own.id, "1000", false, "2026-10-04");    // уже оплачен
    await expense(ext.id, "5000", false, null);            // платит внешний партнер
    await expense(ext.id, "7000", true, null);             // платит админ
    await expense(cancelled.id, "9000", true, null);       // счет отменен
    await setOwnerLedgerStart(asDb(), { since: "2026-10-01", kot: "0", krya: "0", createdBy: actorId });
    await payout("kot", "1000", "2026-10-05");

    const payables = await getPayables(asDb());
    expect(payables.executors.total).toBe(22000);
    expect(payables.executors.count).toBe(2);
    expect(payables.executors.items.map(item => [item.invoiceNumber, item.amount])).toEqual([["EXT", 7000], ["OWN", 15000]]);
    // Прибыль OWN: 90 000 - 15 000 - 1 000 = 74 000, EXT: 90 000 - 5 000 - 7 000 = 78 000. Коту 76 000 - 1 000.
    expect(payables.kot).toEqual({ since: "2026-10-01", balance: 75000 });
  });

  it("расход без отметки оплачен в свою дату, null - не оплачен, отметку можно поставить позже", async () => {
    const commands = new InvoiceCommands(asDb());
    const actor = { role: "admin" as const, tokenId: actorId };
    const own = await invoice("CMD", ownerPartnerId, "paid", "100000", "2026-10-03");
    const settled = await commands.createExpense(actor, { invoiceId: own.id, description: "Старый клиент", amount: "100", date: "2026-10-06" });
    const open = await commands.createExpense(actor, { invoiceId: own.id, description: "Еще не оплачен", amount: "200", date: "2026-10-06", paidAt: null });
    expect(settled.paidAt).toBe("2026-10-06");
    expect(open.paidAt).toBeNull();
    expect((await getPayables(asDb())).executors.total).toBe(200);

    await commands.updateExpense(actor, open.id, { paidAt: "2026-10-20" });
    const [row] = await db.select().from(invoiceExpenses).where(eq(invoiceExpenses.id, open.id));
    expect(row.paidAt).toBe("2026-10-20");
    expect((await getPayables(asDb())).executors.count).toBe(0);
  });
});
