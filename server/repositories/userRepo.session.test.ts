import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../test/testDb";
import { createSession, validateSession, refreshSession } from "./userRepo";
import { accessTokens, userSessions } from "../../shared/schema";
import { eq } from "drizzle-orm";

// 1.8 — абсолютный потолок жизни сессии. Скользящее окно (30 мин) продлевает
// сессию только В ПРЕДЕЛАХ 12ч от создания; дальше — не валидна и не продлевается.

let db: TestDb;
let close: () => Promise<void>;
const asDb = () => db as unknown as typeof import("../db").db;

beforeEach(async () => { ({ db, close } = await createTestDb()); });
afterEach(async () => { await close(); });

async function seedToken() {
  const [t] = await db.insert(accessTokens).values({ code: "TEST-CODE", role: "admin" as const }).returning();
  return t.id;
}
async function ageSession(sessionId: string, hoursAgo: number) {
  await db.update(userSessions)
    .set({
      createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // скользящее окно ещё «живо»
    })
    .where(eq(userSessions.sessionId, sessionId));
}

describe("Абсолютный потолок жизни сессии", () => {
  it("свежая сессия валидна", async () => {
    const { sessionId } = await createSession(asDb(), await seedToken());
    expect((await validateSession(asDb(), sessionId))?.isValid).toBe(true);
  });

  it("сессия старше 12ч НЕ валидна, хотя expiresAt ещё в будущем", async () => {
    const { sessionId } = await createSession(asDb(), await seedToken());
    await ageSession(sessionId, 13);
    expect((await validateSession(asDb(), sessionId))?.isValid).toBe(false);
  });

  it("сессию старше 12ч нельзя продлить (refreshSession → null)", async () => {
    const { sessionId } = await createSession(asDb(), await seedToken());
    await ageSession(sessionId, 13);
    expect(await refreshSession(asDb(), sessionId)).toBeNull();
  });

  it("сессия в 11ч ещё валидна и продлевается", async () => {
    const { sessionId } = await createSession(asDb(), await seedToken());
    await ageSession(sessionId, 11);
    expect((await validateSession(asDb(), sessionId))?.isValid).toBe(true);
    expect(await refreshSession(asDb(), sessionId)).not.toBeNull();
  });
});
