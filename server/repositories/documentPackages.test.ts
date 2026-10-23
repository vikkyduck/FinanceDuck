import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedPartnerAndClient, type TestDb } from "../test/testDb";
import { createInvoice } from "./invoiceRepo";
import { createSignedAct, deleteSignedAct, getAssistantBonusAccrued, getAssistantBonusSummary } from "./actsRepo";
import { getInvoicePackages, getPackagesByStatus, reviewPackage } from "./documentPackagesRepo";
import { accessTokens, assistantActionLogs, assistantBonusPayments, documentPackages, signedActs } from "../../shared/schema";
import { CommandError } from "../lib/commandError";

// Пакеты документов ассистента: пакет клиента по счету и пакет каждого исполнителя.
// Владелец принимает или возвращает пакет целиком. С 22.10.2026 бонус ассистенту
// 2000 ₽ за принятый пакет клиента и 1000 ₽ за пакет исполнителя, по дате принятия.

let db: TestDb;
let close: () => Promise<void>;
let partnerId: string;
let clientId: string;
let assistantId: string;
let ownerId: string;
const asDb = () => db as unknown as typeof import("../db").db;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
  const [assistant] = await db.insert(accessTokens).values({ code: "PKG-ASSISTANT", role: "assistant" }).returning();
  const [owner] = await db.insert(accessTokens).values({ code: "PKG-OWNER", role: "admin" }).returning();
  assistantId = assistant.id; ownerId = owner.id;
});
afterEach(async () => { await close(); });

function invoice(invoiceNumber: string, status: "sent" | "paid" = "paid", hideFromAssistant = false) {
  return createInvoice(asDb(), {
    invoiceNumber, clientId, partnerId, scheme: "partner_10", createdBy: ownerId, status, paymentDate: "2026-10-20", hideFromAssistant,
  }, { clientBill: "100000" });
}

/** Загрузка ассистента: ссылка, чтобы не трогать хранилище файлов. */
function upload(invoiceId: string, actType: "company" | "executor", executorName: string | null = null) {
  return createSignedAct(asDb(), {
    invoiceId, actType, fileName: `${actType}.pdf`, isLink: true, url: "https://example.com/doc", uploadedBy: assistantId,
  }, undefined, { executorName });
}

async function rejection(promise: Promise<unknown>): Promise<CommandError> {
  const error = await promise.then(() => null, (failure: unknown) => failure);
  expect(error).toBeInstanceOf(CommandError);
  return error as CommandError;
}

describe("Пакеты документов ассистента", () => {
  it("собирает документы в пакет клиента и пакеты исполнителей по имени без учета регистра", async () => {
    const paid = await invoice("PKG-1");
    const client1 = await upload(paid.id, "company");
    const client2 = await upload(paid.id, "company");
    const ivan1 = await upload(paid.id, "executor", "Иван Петров");
    const ivan2 = await upload(paid.id, "executor", "иван петров");
    const anna = await upload(paid.id, "executor", "Анна Смирнова");
    expect(client2.packageId).toBe(client1.packageId);
    expect(ivan2.packageId).toBe(ivan1.packageId);
    expect(anna.packageId).not.toBe(ivan1.packageId);
    expect(client1.packageId).not.toBe(ivan1.packageId);

    const packages = await getInvoicePackages(asDb(), paid.id);
    expect(packages.map(p => [p.side, p.executorName, p.status, p.documents])).toEqual([
      ["client", null, "pending", 2],
      ["executor", "Анна Смирнова", "pending", 1],
      ["executor", "Иван Петров", "pending", 2],
    ]);
  });

  it("документы владельца в пакеты не попадают", async () => {
    const paid = await invoice("PKG-OWNER");
    const act = await createSignedAct(asDb(), {
      invoiceId: paid.id, actType: "company", fileName: "owner.pdf", isLink: true, url: "https://example.com/doc", uploadedBy: ownerId,
    });
    expect(act.packageId).toBeNull();
    expect(await getInvoicePackages(asDb(), paid.id)).toEqual([]);
  });

  it("возврат требует комментария, новая загрузка возвращает пакет на проверку", async () => {
    const paid = await invoice("PKG-RETURN");
    const act = await upload(paid.id, "executor", "Иван Петров");
    const id = act.packageId!;
    expect((await rejection(reviewPackage(asDb(), id, "return", null, ownerId))).status).toBe(400);

    const returned = await reviewPackage(asDb(), id, "return", "Нет подписи исполнителя", ownerId);
    expect(returned).toMatchObject({ status: "returned", reviewComment: "Нет подписи исполнителя", acceptedAt: null, reviewedBy: ownerId });
    expect((await getPackagesByStatus(asDb(), "returned", true)).map(p => [p.invoiceNumber, p.reviewComment]))
      .toEqual([["PKG-RETURN", "Нет подписи исполнителя"]]);

    const fixed = await upload(paid.id, "executor", "Иван Петров");
    expect(fixed.packageId).toBe(id);
    const [pending] = await getInvoicePackages(asDb(), paid.id);
    expect(pending).toMatchObject({ status: "pending", reviewComment: "Нет подписи исполнителя", documents: 2 });
  });

  it("принятие, повторное решение и отмена принятия", async () => {
    const paid = await invoice("PKG-ACCEPT");
    const { packageId } = await upload(paid.id, "company");
    const accepted = await reviewPackage(asDb(), packageId!, "accept", null, ownerId);
    expect(accepted?.status).toBe("accepted");
    expect(accepted?.acceptedAt).toBeInstanceOf(Date);
    expect((await rejection(reviewPackage(asDb(), packageId!, "accept", null, ownerId))).status).toBe(409);
    expect((await rejection(reviewPackage(asDb(), packageId!, "return", "поздно", ownerId))).status).toBe(409);

    const reopened = await reviewPackage(asDb(), packageId!, "reopen", null, ownerId);
    expect(reopened).toMatchObject({ status: "pending", acceptedAt: null });
    expect(await reviewPackage(asDb(), "00000000-0000-0000-0000-000000000099", "accept", null, ownerId)).toBeNull();

    const log = await db.select().from(assistantActionLogs).where(eq(assistantActionLogs.entityId, packageId!));
    expect(log.map(row => row.description).sort()).toEqual([
      "Принят пакет клиента: счет PKG-ACCEPT",
      "Снято принятие пакета клиента: счет PKG-ACCEPT",
    ]);
  });

  it("принятый пакет ассистент не меняет, владелец может удалить документ", async () => {
    const paid = await invoice("PKG-LOCKED");
    const first = await upload(paid.id, "executor", "Иван Петров");
    const second = await upload(paid.id, "executor", "Иван Петров");
    await reviewPackage(asDb(), first.packageId!, "accept", null, ownerId);

    expect((await rejection(upload(paid.id, "executor", "Иван Петров"))).status).toBe(409);
    expect((await rejection(deleteSignedAct(asDb(), first.id))).status).toBe(409);
    expect(await db.select().from(signedActs).where(eq(signedActs.packageId, first.packageId!))).toHaveLength(2);

    await deleteSignedAct(asDb(), first.id, true);
    await deleteSignedAct(asDb(), second.id, true);
    const [kept] = await getInvoicePackages(asDb(), paid.id);
    expect(kept).toMatchObject({ status: "accepted", documents: 0 });
  });

  it("пустой непринятый пакет удаляется вместе с последним документом", async () => {
    const paid = await invoice("PKG-EMPTY");
    const first = await upload(paid.id, "company");
    const second = await upload(paid.id, "company");
    await deleteSignedAct(asDb(), first.id);
    expect(await getInvoicePackages(asDb(), paid.id)).toHaveLength(1);
    await deleteSignedAct(asDb(), second.id);
    expect(await getInvoicePackages(asDb(), paid.id)).toEqual([]);
  });

  it("ассистент не видит пакеты скрытых от него счетов", async () => {
    const visible = await invoice("PKG-VISIBLE");
    const hidden = await invoice("PKG-HIDDEN", "paid", true);
    await upload(visible.id, "company");
    await upload(hidden.id, "company");
    expect((await getPackagesByStatus(asDb(), "pending", true)).map(p => p.invoiceNumber)).toEqual(["PKG-VISIBLE"]);
    expect((await getPackagesByStatus(asDb(), "pending", false)).map(p => p.invoiceNumber).sort()).toEqual(["PKG-HIDDEN", "PKG-VISIBLE"]);
  });
});

describe("Бонус ассистента за принятые пакеты", () => {
  async function acceptAt(packageId: string, acceptedAt: string) {
    await reviewPackage(asDb(), packageId, "accept", null, ownerId);
    await db.update(documentPackages).set({ acceptedAt: new Date(acceptedAt) }).where(eq(documentPackages.id, packageId));
  }

  it("2000 ₽ за пакет клиента и 1000 ₽ за пакет исполнителя, выплаты с 22.10.2026 вычитаются", async () => {
    const paid = await invoice("BONUS-1");
    const sent = await invoice("BONUS-2", "sent");
    const client = await upload(paid.id, "company");
    const ivan = await upload(paid.id, "executor", "Иван Петров");
    await upload(paid.id, "executor", "Анна Смирнова");
    const returned = await upload(sent.id, "company");
    await acceptAt(client.packageId!, "2026-10-25T10:00:00Z");
    await acceptAt(ivan.packageId!, "2026-11-03T10:00:00Z");
    await reviewPackage(asDb(), returned.packageId!, "return", "Нет печати", ownerId);
    await db.insert(assistantBonusPayments).values([
      { amount: "500", paymentDate: "2026-10-21", paidBy: ownerId },
      { amount: "1000", paymentDate: "2026-10-28", paidBy: ownerId },
    ]);

    expect(await getAssistantBonusSummary(asDb())).toEqual({
      since: "2026-10-22",
      accepted: { client: 1, executor: 1 },
      earned: 3000,
      paid: 1000,
      unpaid: 2000,
      pending: 1,
      returned: 1,
    });
    expect(await getAssistantBonusAccrued(asDb(), "2026-10-01", "2026-10-31")).toBe(2000);
    expect(await getAssistantBonusAccrued(asDb(), "2026-11-01", "2026-11-30")).toBe(1000);
  });

  it("до 22.10.2026 действует старое правило за акты, с этой даты только принятые пакеты", async () => {
    const paid = await invoice("MIXED-1");
    // Старое правило: акт исполнителя 1000 ₽, акт компании 2000 ₽ по дате загрузки.
    await db.insert(signedActs).values([
      { invoiceId: paid.id, actType: "executor", fileName: "old.pdf", uploadedBy: assistantId, createdAt: new Date("2026-10-10T12:00:00Z") },
      { invoiceId: paid.id, actType: "company", fileName: "old.pdf", uploadedBy: assistantId, createdAt: new Date("2026-10-21T12:00:00Z") },
      // Без пакета после начала правила: бонуса нет.
      { invoiceId: paid.id, actType: "company", fileName: "admin.pdf", uploadedBy: ownerId, createdAt: new Date("2026-10-22T12:00:00Z") },
    ]);
    const { packageId } = await upload(paid.id, "executor", "Иван Петров");
    await acceptAt(packageId!, "2026-10-22T12:00:00Z");

    expect(await getAssistantBonusAccrued(asDb(), "2026-10-01", "2026-10-21")).toBe(3000);
    expect(await getAssistantBonusAccrued(asDb(), "2026-10-22", "2026-10-31")).toBe(1000);
    expect(await getAssistantBonusAccrued(asDb(), "2026-10-01", "2026-10-31")).toBe(4000);
    expect((await getAssistantBonusSummary(asDb())).earned).toBe(1000);
  });
});
