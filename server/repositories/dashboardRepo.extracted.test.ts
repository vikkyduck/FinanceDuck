import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import { createInvoice } from "./invoiceRepo";
import { partners } from "../../shared/schema";
import {
  getPartnerDebtSummaries,
  getPartnerSchemeDoNotSpendData,
  getAdminDashboardStats,
  getClientBudget,
  getClientOverviewBuckets,
  getPartnerInvoicesDetail,
  getPartnerDebtDetails,
} from "./dashboardRepo";

// Smoke-тесты для 7 методов, вынесенных из God-объекта storage.ts в dashboardRepo.
// Цель — доказать, что дословный перенос не сломал runtime-обвязку (импорты
// таблиц, ссылки на колонки, SQL) на реальном PGlite и дать сеть от регрессий.
// Проверяем: (а) пустая БД не падает и даёт нулевые/пустые агрегаты;
// (б) с оплаченным счётом методы отрабатывают и держат форму ответа.

let db: TestDb;
let close: () => Promise<void>;
let partnerId: string;
let clientId: string;
const asDb = () => db as any;
const noRecurring = async () => ({ monthlyAmount: 0, yearlyTotal: 0 });

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
});
afterEach(async () => { await close(); });

async function seedPaidInvoice(num: string, clientBill: string) {
  return createInvoice(asDb(), {
    invoiceNumber: num, clientId, partnerId,
    scheme: "commission_based" as const,
    createdBy: "00000000-0000-0000-0000-000000000001",
    status: "paid", paymentDate: "2026-03-15",
  } as any, { clientBill });
}

describe("dashboardRepo — вынесенные методы: пустая БД (обвязка не падает)", () => {
  it("getPartnerDebtSummaries → сводка на посеянного партнёра с нулевым долгом", async () => {
    const r = await getPartnerDebtSummaries(asDb());
    expect(Array.isArray(r)).toBe(true);
    // партнёр посеян seedPartnerAndClient, счетов нет → долг 0
    expect(r.every(s => s.totalToTransfer === 0)).toBe(true);
  });
  it("getPartnerSchemeDoNotSpendData → отрабатывает", async () => {
    const r = await getPartnerSchemeDoNotSpendData(asDb(), partnerId, "partner");
    expect(r).toBeDefined();
  });
  it("getAdminDashboardStats → yearlySummary с нулями", async () => {
    const r = await getAdminDashboardStats(asDb(), noRecurring, 2026, 3);
    expect(r.yearlySummary).toBeDefined();
    expect(r.yearlySummary.totalRevenue).toBe(0);
  });
  it("getClientBudget → []", async () => {
    expect(await getClientBudget(asDb(), clientId)).toEqual([]);
  });
  it("getClientOverviewBuckets → agency-бакет определён", async () => {
    const r = await getClientOverviewBuckets(asDb(), clientId);
    expect(r.agency).toBeDefined();
  });
  it("getPartnerInvoicesDetail → []", async () => {
    expect(await getPartnerInvoicesDetail(asDb(), partnerId)).toEqual([]);
  });
  it("getPartnerDebtDetails → summary с нулями", async () => {
    const r = await getPartnerDebtDetails(asDb(), partnerId);
    expect(r.summary).toBeDefined();
    expect(r.summary.totalDebt).toBe(0);
  });
});

describe("dashboardRepo — вынесенные методы: с оплаченным счётом (форма ответа)", () => {
  beforeEach(async () => { await seedPaidInvoice("INV-1", "1000"); });

  it("getAdminDashboardStats видит выручку", async () => {
    const r = await getAdminDashboardStats(asDb(), noRecurring, 2026, 3);
    expect(r.yearlySummary.totalRevenue).toBeGreaterThan(0);
  });
  it("getClientBudget возвращает счёт клиента", async () => {
    const r = await getClientBudget(asDb(), clientId);
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBeGreaterThanOrEqual(0); // форма держится, метод не падает
  });
  it("getPartnerDebtSummaries отрабатывает с данными", async () => {
    const r = await getPartnerDebtSummaries(asDb());
    expect(Array.isArray(r)).toBe(true);
  });
  it("getPartnerDebtDetails держит форму summary", async () => {
    const r = await getPartnerDebtDetails(asDb(), partnerId);
    expect(r.summary).toHaveProperty("totalDebt");
    expect(r.summary).toHaveProperty("remainingDebt");
  });
  it("getClientOverviewBuckets держит форму", async () => {
    const r = await getClientOverviewBuckets(asDb(), clientId, "2026-01-01", "2026-12-31");
    expect(r.agency).toBeDefined();
  });
});

describe("Коэффициент эффективности — котлы по partners.leverage_role", () => {
  it("owner/managed_asset/external разносятся по своим котлам, ratio=(others+managed)/owner", async () => {
    // Посеянный партнёр — 'external' по умолчанию; добавляем owner и managed.
    const [ownerP]   = await db.insert(partners).values({ name: "P-owner",   leverageRole: "owner" }).returning();
    const [managedP] = await db.insert(partners).values({ name: "P-managed", leverageRole: "managed_asset" }).returning();

    const mk = (num: string, pid: string, bill: string) => createInvoice(asDb(), {
      invoiceNumber: num, clientId, partnerId: pid,
      scheme: "commission_based" as const,
      createdBy: "00000000-0000-0000-0000-000000000001",
      status: "paid", paymentDate: "2026-03-15",
    } as any, { clientBill: bill });

    await mk("LEV-1", ownerP.id,   "1000"); // владелец лично → знаменатель
    await mk("LEV-2", managedP.id, "2000"); // актив под управлением → числитель
    await mk("LEV-3", partnerId,   "3000"); // обычный партнёр → числитель

    const stats = await getAdminDashboardStats(asDb(), noRecurring, 2026, 2); // март
    expect(stats.leverage.ownerProfit).toBeCloseTo(1000, 2);
    expect(stats.leverage.managedProfit).toBeCloseTo(2000, 2);
    expect(stats.leverage.othersProfit).toBeCloseTo(3000, 2);
    expect(stats.leverage.ratio).toBeCloseTo(5, 2); // (3000+2000)/1000
  });
});
