import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import { createInvoice, getInvoice } from "./invoiceRepo";
import { invoices, invoiceCalculations } from "../../shared/schema";

// Интеграционные тесты против настоящего Postgres (PGlite). Проверяют ранее
// внесённые фиксы: атомарность createInvoice и deny-by-default в getInvoice.

let db: TestDb;
let close: () => Promise<void>;
let partnerId: string;
let clientId: string;

// Репозитории типизированы под node-postgres; PGlite-инстанс совместим по API.
const asDb = () => db as unknown as typeof import("../db").db;

const baseInvoice = () => ({
  invoiceNumber: `INV-${Math.round(performance.now() * 1000)}`,
  clientId,
  partnerId,
  scheme: "commission_based" as const,
  createdBy: "00000000-0000-0000-0000-000000000001",
});

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
});
afterEach(async () => { await close(); });

describe("createInvoice — атомарность (транзакция)", () => {
  it("пишет и счёт, и строку расчётов", async () => {
    const created = await createInvoice(asDb(), baseInvoice(), { clientBill: "1000" });

    const invRows  = await db.select().from(invoices);
    const calcRows = await db.select().from(invoiceCalculations);

    expect(invRows).toHaveLength(1);
    expect(calcRows).toHaveLength(1);
    expect(calcRows[0].invoiceId).toBe(created.id);
    // Ни счёта-сироты без расчётов, ни расчётов без счёта.
    expect(invRows[0].id).toBe(calcRows[0].invoiceId);
  });
});

describe("getInvoice — deny-by-default (IDOR)", () => {
  it("client со своим clientId видит счёт", async () => {
    const created = await createInvoice(asDb(), baseInvoice(), {});
    const got = await getInvoice(asDb(), created.id, "client", undefined, clientId);
    expect(got?.id).toBe(created.id);
  });

  it("client БЕЗ scope-id → null (раньше проваливался в общий фильтр)", async () => {
    const created = await createInvoice(asDb(), baseInvoice(), {});
    const got = await getInvoice(asDb(), created.id, "client", undefined, undefined);
    expect(got).toBeNull();
  });

  it("client с ЧУЖИМ clientId → null", async () => {
    const created = await createInvoice(asDb(), baseInvoice(), {});
    const got = await getInvoice(asDb(), created.id, "client", undefined, "00000000-0000-0000-0000-0000000000ff");
    expect(got).toBeNull();
  });

  it("partner БЕЗ scope-id → null", async () => {
    const created = await createInvoice(asDb(), baseInvoice(), {});
    const got = await getInvoice(asDb(), created.id, "partner", undefined, undefined);
    expect(got).toBeNull();
  });

  it("admin (без scope) видит счёт", async () => {
    const created = await createInvoice(asDb(), baseInvoice(), {});
    const got = await getInvoice(asDb(), created.id, "admin");
    expect(got?.id).toBe(created.id);
  });
});
