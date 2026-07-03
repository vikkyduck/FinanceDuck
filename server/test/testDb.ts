/**
 * Тестовая БД на PGlite — настоящий Postgres в WASM, в процессе Node.
 * Без Docker и внешнего сервера. Схема накатывается сгенерированной миграцией
 * (drizzle/0000_*.sql). Репозитории принимают db параметром, поэтому в тесты
 * передаём эту db вместо боевого пула.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "../../shared/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/** Свежая изолированная in-memory БД со всей схемой. */
export async function createTestDb(): Promise<{ db: TestDb; close: () => Promise<void> }> {
  const client = new PGlite(); // in-memory
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return { db, close: () => client.close() };
}

/** Минимальные партнёр+клиент (обязательные FK у invoices). Возвращает их id. */
export async function seedPartnerAndClient(db: TestDb): Promise<{ partnerId: string; clientId: string }> {
  const [partner] = await db.insert(schema.partners).values({ name: "Тест-партнёр" }).returning();
  const [client]  = await db.insert(schema.clients).values({ name: "Тест-клиент" }).returning();
  return { partnerId: partner.id, clientId: client.id };
}
