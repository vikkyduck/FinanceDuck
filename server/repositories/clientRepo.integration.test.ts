import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../test/testDb";
import { setClientPartners, getClients } from "./clientRepo";
import { clients, partners, clientPartners } from "../../shared/schema";
import { eq } from "drizzle-orm";

// Единый механизм связи клиент↔партнёр: client_partners — источник истины,
// clients.partner_id синхронится к первому партнёру (в т.ч. при 2+).

let db: TestDb;
let close: () => Promise<void>;
let p1: string, p2: string, c1: string, c2: string;
const asDb = () => db as any;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [a] = await db.insert(partners).values({ name: "P1" }).returning();
  const [b] = await db.insert(partners).values({ name: "P2" }).returning();
  const [x] = await db.insert(clients).values({ name: "C1" }).returning();
  const [y] = await db.insert(clients).values({ name: "C2" }).returning();
  p1 = a.id; p2 = b.id; c1 = x.id; c2 = y.id;
});
afterEach(async () => { await close(); });

async function links(clientId: string) {
  return db.select().from(clientPartners).where(eq(clientPartners.clientId, clientId));
}
async function partnerIdOf(clientId: string) {
  const [c] = await db.select().from(clients).where(eq(clients.id, clientId));
  return c.partnerId;
}

describe("setClientPartners — единый писатель", () => {
  it("2 партнёра: связи = 2, partner_id = первый (раньше оставался устаревшим)", async () => {
    await setClientPartners(asDb(), c1, [p1, p2]);
    expect(await links(c1)).toHaveLength(2);
    expect(await partnerIdOf(c1)).toBe(p1);
  });
  it("1 партнёр: связь = 1, partner_id = он", async () => {
    await setClientPartners(asDb(), c1, [p2]);
    expect(await links(c1)).toHaveLength(1);
    expect(await partnerIdOf(c1)).toBe(p2);
  });
  it("0 партнёров: связей нет, partner_id = null", async () => {
    await setClientPartners(asDb(), c1, [p1]);
    await setClientPartners(asDb(), c1, []);
    expect(await links(c1)).toHaveLength(0);
    expect(await partnerIdOf(c1)).toBeNull();
  });
  it("замена партнёров перезаписывает связи", async () => {
    await setClientPartners(asDb(), c1, [p1, p2]);
    await setClientPartners(asDb(), c1, [p2]);
    const l = await links(c1);
    expect(l).toHaveLength(1);
    expect(l[0].partnerId).toBe(p2);
  });
});

describe("getClients(partnerId) — по client_partners (много-ко-многим)", () => {
  it("партнёр видит клиента, где он ВТОРИЧНЫЙ партнёр", async () => {
    await setClientPartners(asDb(), c1, [p1, p2]); // c1 → p1(осн.) + p2(вторичный)
    const forP2 = await getClients(asDb(), p2);
    expect(forP2.map(c => c.id)).toContain(c1);
  });
  it("не возвращает несвязанных клиентов", async () => {
    await setClientPartners(asDb(), c1, [p1]);
    const forP1 = await getClients(asDb(), p1);
    expect(forP1.map(c => c.id)).toEqual([c1]); // c2 не связан
  });
  it("без partnerId — все клиенты", async () => {
    const all = await getClients(asDb());
    expect(all.length).toBe(2);
  });
});
