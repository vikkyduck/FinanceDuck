import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import { createInvoice } from "./invoiceRepo";
import { getActsStatistics, getAssistantBonusAccrued } from "./actsRepo";
import { getAdminDashboardStats } from "./adminDashboardRepo";
import { signedActs } from "../../shared/schema";

// Бонус ассистентам за период: только акты по оплаченным счетам, видимым
// ассистенту, по дате загрузки акта. Платится из доли Кря.

let db: TestDb;
let close: () => Promise<void>;
let partnerId: string;
let clientId: string;
const asDb = () => db as unknown as typeof import("../db").db;
const createdBy = "00000000-0000-0000-0000-000000000001";
const noRecurring = async () => ({ monthlyAmount: 0, yearlyTotal: 0 });

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
});
afterEach(async () => { await close(); });

function invoice(invoiceNumber: string, status: "sent" | "paid", hideFromAssistant = false) {
  return createInvoice(asDb(), {
    invoiceNumber, clientId, partnerId, scheme: "partner_10", createdBy, status, paymentDate: "2026-03-15", hideFromAssistant,
  }, { clientBill: "100000" });
}

function act(invoiceId: string, actType: "executor" | "company", createdAt: string) {
  return db.insert(signedActs).values({ invoiceId, actType, fileName: `${actType}.pdf`, uploadedBy: createdBy, createdAt: new Date(createdAt) });
}

describe("Бонус ассистентам за период", () => {
  beforeEach(async () => {
    const visible = await invoice("PAID-1", "paid");
    const hidden = await invoice("PAID-HIDDEN", "paid", true);
    const sent = await invoice("SENT-1", "sent");
    await act(visible.id, "executor", "2026-03-10T12:00:00Z");
    await act(visible.id, "company", "2026-03-20T12:00:00Z");
    await act(visible.id, "executor", "2026-04-02T12:00:00Z");
    await act(hidden.id, "executor", "2026-03-15T12:00:00Z");
    await act(sent.id, "company", "2026-03-12T12:00:00Z");
  });

  it("общая статистика актов считает по тем же правилам", async () => {
    expect(await getActsStatistics(asDb(), true)).toEqual({ executorActs: 2, companyActs: 1, totalPaidInvoices: 1 });
    expect(await getActsStatistics(asDb(), false)).toEqual({ executorActs: 3, companyActs: 1, totalPaidInvoices: 2 });
  });

  it("считает только акты оплаченных видимых счетов внутри периода", async () => {
    expect(await getAssistantBonusAccrued(asDb(), "2026-03-01", "2026-03-31")).toBe(3000);
    expect(await getAssistantBonusAccrued(asDb(), "2026-01-01", "2026-12-31")).toBe(4000);
  });

  it("доля Кря после ассистентов = доля Кря минус бонус периода", async () => {
    const stats = await getAdminDashboardStats(asDb(), noRecurring, 2026, 2);
    expect(stats.assistantBonus).toEqual({ yearly: 4000, monthly: 3000 });
    expect(stats.ownerShares.monthlyKrya).toBe(90000);
    expect(stats.ownerShares.monthlyKryaAfterAssistants).toBe(87000);
    expect(stats.ownerShares.yearlyKryaAfterAssistants).toBe(stats.ownerShares.yearlyKrya - 4000);
  });
});
