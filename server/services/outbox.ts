import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { clients, notificationOutbox } from '../../shared/schema';
import { resolveTelegramTarget, sendTelegramMessageStrict, type TelegramTarget } from '../lib/telegram';

export async function deliverNotifications(database = db, send: (target: TelegramTarget, body: string) => Promise<void> = sendTelegramMessageStrict) {
  const events = await database.transaction(async tx => {
    const rows = await tx.select().from(notificationOutbox)
      .where(and(isNull(notificationOutbox.deliveredAt), lte(notificationOutbox.nextAttemptAt, new Date())))
      .orderBy(notificationOutbox.createdAt).limit(20).for('update', { skipLocked: true });
    for (const row of rows) await tx.update(notificationOutbox).set({
      attempts: row.attempts + 1, nextAttemptAt: new Date(Date.now() + 60000),
    }).where(eq(notificationOutbox.id, row.id));
    return rows;
  });
  await Promise.all(events.map(async event => {
    try {
      const [client] = event.clientId ? await database.select().from(clients).where(eq(clients.id, event.clientId)) : [];
      const target = resolveTelegramTarget(client);
      if (target) await send(target, event.body);
      await database.update(notificationOutbox).set({ deliveredAt: new Date() }).where(eq(notificationOutbox.id, event.id));
    } catch {
      const delay = Math.min(3600000, 10000 * 2 ** Math.min(event.attempts, 9));
      await database.update(notificationOutbox).set({ nextAttemptAt: new Date(Date.now() + delay) }).where(eq(notificationOutbox.id, event.id));
      console.error('[outbox] Delivery deferred', event.id);
    }
  }));
  return events.length;
}

export function startOutboxWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await deliverNotifications(); } catch { console.error('[outbox] Worker failed; retry scheduled'); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 10000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
