import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../test/testDb";
import { createInvoice, createInvoiceExpense } from "./invoiceRepo";
import { createOwnerPayout, deleteOwnerPayout, getOwnerLedger, getPayables, setOwnerLedgerStart } from "./ownerLedgerRepo";
import { accessTokens, assistantBonusPayments, clients, documentPackages, invoiceExpenses, ownerTransfers, partnerPayments, partners } from "../../shared/schema";
import { InvoiceCommands } from "../services/invoiceCommands";
import { CommandError } from "../lib/commandError";

// Учет денег владельцев: остаток на дату начала + доля прибыли, пришедшей на счет
// ИП с этой даты, - переводы. Клиенты партнеров-владельцев платят напрямую, внешние
// партнеры переводят деньги сами. Ассистентам Кря платит с личной карты.

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
    expect(ledger.kot).toEqual({ since: null, opening: 0, accrued: 0, paidOut: 0, balance: 0, ignored: { count: 0, total: 0 } });
    expect(ledger.arrivals).toEqual([]);
    expect(ledger.krya.since).toBeNull();
  });

  it("считает долю с даты начала и вычитает переводы, выплаты ассистентам не трогает", async () => {
    await invoice("BEFORE", ownerPartnerId, "paid", "50000", "2026-09-20");
    const paid = await invoice("AFTER", ownerPartnerId, "paid", "100000", "2026-10-03");
    await expense(paid.id, "20000", true, "2026-10-04");
    await invoice("NOT-PAID", ownerPartnerId, "sent", "40000", "2026-10-05");
    await db.insert(assistantBonusPayments).values([
      { amount: "3000", paymentDate: "2026-10-05", paidBy: actorId },
      { amount: "7000", paymentDate: "2026-09-30", paidBy: actorId },
    ]);
    // Перевод, записанный до того, как начали учет: он уже в остатке на начало.
    await payout("kot", "5000", "2026-09-25");
    await setOwnerLedgerStart(asDb(), { since: "2026-10-01", kot: "10000", krya: "0", createdBy: actorId });
    await payout("kot", "20000", "2026-10-10");
    await payout("krya", "30000", "2026-10-12");

    // partner_10: 100 000 - 10% = 90 000, минус расход 20 000 = прибыль 70 000, по 35 000.
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.kot).toEqual({ since: "2026-10-01", opening: 10000, accrued: 35000, paidOut: 20000, balance: 25000, ignored: { count: 1, total: 5000 } });
    expect(ledger.krya).toEqual({ since: "2026-10-01", opening: 0, accrued: 35000, paidOut: 30000, balance: 5000, ignored: { count: 0, total: 0 } });
    expect(ledger.transfers.filter(t => t.kind === "payout")).toHaveLength(3);
    expect(ledger.arrivals).toEqual([
      { date: "2026-10-03", invoiceId: paid.id, invoiceNumber: "AFTER", source: "client", profit: 70000 },
    ]);
  });

  it("перевод раньше даты начала не записывается: он уже в остатке на начало дня", async () => {
    await setOwnerLedgerStart(asDb(), { since: "2026-11-02", kot: "42000", krya: "42000", createdBy: actorId });
    const early = await payout("kot", "42000", "2026-11-01").then(() => null, (error: unknown) => error);
    expect(early).toBeInstanceOf(CommandError);
    expect((early as CommandError).status).toBe(400);
    expect((early as CommandError).message).toContain("02.11.2026");
    await payout("kot", "1000", "2026-11-02");
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.kot).toMatchObject({ paidOut: 1000, balance: 41000, ignored: { count: 0, total: 0 } });
  });

  it("расшифровка доли: каждое поступление с даты начала, в сумме ровно доли Кота и Кря", async () => {
    await invoice("OWN-OCT", ownerPartnerId, "paid", "10000", "2026-11-01");
    const own = await invoice("OWN-NOV", ownerPartnerId, "paid", "100000", "2026-11-02");
    const ext = await invoice("EXT-NOV", externalId, "paid", "33333.33", "2026-11-03");
    // К переводу 29 999.99, перевели треть: прибыль перевода 9 999.99 + копейки по доле.
    await db.insert(partnerPayments).values({ partnerId: externalId, invoiceId: ext.id, amount: "10000", paymentDate: "2026-11-05", createdBy: actorId });
    await setOwnerLedgerStart(asDb(), { since: "2026-11-02", kot: "0", krya: "0", createdBy: actorId });
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.arrivals.map(a => [a.date, a.invoiceNumber, a.source])).toEqual([
      ["2026-11-02", "OWN-NOV", "client"],
      ["2026-11-05", "EXT-NOV", "partner"],
    ]);
    expect(ledger.arrivals[0].invoiceId).toBe(own.id);
    const total = ledger.arrivals.reduce((sum, a) => sum + Math.round(a.profit * 100), 0);
    expect(total).toBe(Math.round((ledger.kot.accrued + ledger.krya.accrued) * 100));
  });

  it("по внешнему партнеру доля приходит с его переводами: сначала по ссылке на счет, потом по порядку дат", async () => {
    await invoice("EXT-SEPT", externalId, "paid", "20000", "2026-09-15");
    const withCosts = await invoice("EXT-COSTS", externalId, "paid", "100000", "2026-10-03");
    await expense(withCosts.id, "20000", true, "2026-10-04");
    const linked = await invoice("EXT-LINKED", externalId, "paid", "50000", "2026-10-04");
    const transfer = (amount: string, paymentDate: string, invoiceId: string | null) =>
      db.insert(partnerPayments).values({ partnerId: externalId, invoiceId, amount, paymentDate, createdBy: actorId });
    await transfer("18000", "2026-09-20", null);
    await transfer("45000", "2026-10-06", linked.id);
    await transfer("45000", "2026-10-08", null);
    await setOwnerLedgerStart(asDb(), { since: "2026-10-01", kot: "0", krya: "0", createdBy: actorId });

    // EXT-SEPT (к переводу 18 000) закрыт в сентябре, до даты начала. EXT-LINKED пришел
    // целиком: 45 000. EXT-COSTS: к переводу 90 000, прибыль 70 000, пришла половина,
    // в ней 35 000 прибыли. Вторая половина ждет перевода: еще 35 000 прибыли.
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.kot).toMatchObject({ accrued: 40000, balance: 40000 });
    expect(ledger.krya).toMatchObject({ accrued: 40000, balance: 40000 });
    expect(ledger.pendingFromPartners).toBe(35000);
  });

  it("неоплаченный клиентом счет внешнего партнера и перевод партнера-владельца долю не начисляют", async () => {
    await invoice("EXT-SENT", externalId, "sent", "100000", "2026-10-03");
    const own = await invoice("OWN-PAID", ownerPartnerId, "paid", "10000", "2026-10-03");
    await db.insert(partnerPayments).values({ partnerId: ownerPartnerId, invoiceId: own.id, amount: "9000", paymentDate: "2026-10-05", createdBy: actorId });
    await setOwnerLedgerStart(asDb(), { since: "2026-10-01", kot: "0", krya: "0", createdBy: actorId });
    // Только OWN-PAID: 10 000 - 10% = 9 000 прибыли в день оплаты клиентом.
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.kot.accrued + ledger.krya.accrued).toBe(9000);
    expect(ledger.pendingFromPartners).toBe(0);
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
  it("неоплаченные расходы, которые платит владелец, без долга Коту: это расчет между владельцами", async () => {
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
    expect(Object.keys(payables).sort()).toEqual(["assistant", "executors"]);
    expect(payables.assistant).toEqual({ since: "2026-10-22", unpaid: 0 });
    // Прибыль OWN: 90 000 - 15 000 - 1 000 = 74 000, Коту 37 000 - 1 000. EXT внешний
    // партнер еще не перевел, его прибыль 78 000 ждет перевода.
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.kot.balance).toBe(36000);
    expect(ledger.pendingFromPartners).toBe(78000);
  });

  it("долг ассистенту отдельной строкой: принятые пакеты минус выплаты с 22.10.2026, счет ИП не трогает", async () => {
    const own = await invoice("PKG", ownerPartnerId, "paid", "100000", "2026-10-03");
    await db.insert(documentPackages).values([
      { invoiceId: own.id, side: "client", status: "accepted", acceptedAt: new Date("2026-10-23T10:00:00Z") },
      { invoiceId: own.id, side: "executor", executorName: "Иван", status: "accepted", acceptedAt: new Date("2026-10-23T10:00:00Z") },
      { invoiceId: own.id, side: "executor", executorName: "Анна", status: "pending" },
    ]);
    await db.insert(assistantBonusPayments).values([
      { amount: "1000", paymentDate: "2026-10-24", paidBy: actorId },
      { amount: "5000", paymentDate: "2026-10-01", paidBy: actorId },
    ]);
    await setOwnerLedgerStart(asDb(), { since: "2026-10-01", kot: "0", krya: "0", createdBy: actorId });
    const payables = await getPayables(asDb());
    expect(payables.assistant).toEqual({ since: "2026-10-22", unpaid: 2000 });
    const ledger = await getOwnerLedger(asDb());
    expect(ledger.kot.balance).toBe(45000);
    expect(ledger.krya.balance).toBe(45000);
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
