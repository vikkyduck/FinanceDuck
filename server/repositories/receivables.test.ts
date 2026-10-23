import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../test/testDb";
import { createInvoice } from "./invoiceRepo";
import { getPartnerDebtSummaries, getReceivables } from "./partnerDebtRepo";
import { clients, partnerPayments, partners } from "../../shared/schema";

// Партнер с directToOwner: клиенты платят владельцу напрямую, поэтому его
// "сумма к переводу" не долг, а неоплаченные счета - долг клиента целиком.

let db: TestDb;
let close: () => Promise<void>;
let ownerId: string;
let externalId: string;
let clientId: string;
const asDb = () => db as unknown as typeof import("../db").db;
const createdBy = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [owner] = await db.insert(partners).values({ name: "Владелец лично", directToOwner: true }).returning();
  const [external] = await db.insert(partners).values({ name: "Внешний партнер" }).returning();
  const [client] = await db.insert(clients).values({ name: "Клиент" }).returning();
  ownerId = owner.id; externalId = external.id; clientId = client.id;
});
afterEach(async () => { await close(); });

function invoice(invoiceNumber: string, partnerId: string, status: "sent" | "paid", clientBill: string, paymentDate: string) {
  return createInvoice(asDb(), { invoiceNumber, clientId, partnerId, scheme: "partner_10", createdBy, status, paymentDate }, { clientBill });
}

function payment(partnerId: string, invoiceId: string, amount: string) {
  return db.insert(partnerPayments).values({ partnerId, invoiceId, amount, paymentDate: "2026-10-01", createdBy });
}

describe("Расчеты с партнерами без партнеров-владельцев", () => {
  it("оплаченный счет владельца не создает долг, внешний партнер должен 90% по partner_10", async () => {
    await invoice("OWN-1", ownerId, "paid", "100000", "2026-10-01");
    await invoice("EXT-1", externalId, "paid", "100000", "2026-10-01");
    const summaries = await getPartnerDebtSummaries(asDb());
    expect(summaries.map(s => s.partnerId)).not.toContain(ownerId);
    expect(summaries.find(s => s.partnerId === externalId)).toMatchObject({ totalToTransfer: 90000, remaining: 90000 });
  });
});

describe("Нам должны", () => {
  it("клиенты владельца должны полную сумму, внешние партнеры - остаток к переводу", async () => {
    await invoice("OWN-LATE", ownerId, "sent", "50000", "2020-01-10");
    await invoice("OWN-NEXT", ownerId, "sent", "30000", "2999-01-01");
    await invoice("OWN-PAID", ownerId, "paid", "40000", "2026-10-01");
    await invoice("EXT-SENT", externalId, "sent", "70000", "2020-01-10");
    const paid = await invoice("EXT-PAID", externalId, "paid", "100000", "2026-10-01");
    await payment(externalId, paid.id, "40000");

    expect(await getReceivables(asDb())).toEqual({
      clients: { total: 80000, count: 2, overdueTotal: 50000, overdueCount: 1 },
      partners: { total: 50000, count: 1 },
    });
  });

  it("приход, записанный от партнера-владельца, ни на что не влияет", async () => {
    const own = await invoice("OWN-PAID", ownerId, "paid", "100000", "2026-10-01");
    await payment(ownerId, own.id, "92000");
    expect((await getReceivables(asDb())).partners).toEqual({ total: 0, count: 0 });
  });
});
