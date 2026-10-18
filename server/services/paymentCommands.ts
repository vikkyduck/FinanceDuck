import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { assistantActionLogs, commandReceipts, invoices, partners, partnerPayments } from '../../shared/schema';
import { lockInvoices } from '../repositories/invoiceRepo';
import { moneyString } from '../../shared/money';
import { positiveMoney } from '../lib/validate';
import { isoDate } from '../lib/recurringInput';
import { CommandError } from '../lib/commandError';
import { parseCommand } from './invoiceCommandInput';
import type { CommandActor } from './invoiceCommands';

const uuid = z.string().uuid();
const fields = z.object({
  amount: positiveMoney.transform(value => moneyString(String(value).replace(',', '.')))
    .refine(value => Number(value) > 0, 'Платёж должен быть не меньше 0,01'),
  paymentDate: isoDate,
  notes: z.string().trim().max(10000).nullish(),
});
const recordInput = fields.extend({ partnerId: uuid, invoiceId: uuid.nullish() });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Payment = typeof partnerPayments.$inferSelect;

/** Partner payments have their own owner, transactional receipt and durable audit. */
export class PaymentCommands {
  constructor(private readonly database = db) {}

  private async run<T>(actor: CommandActor, command: string, input: unknown,
    execute: (tx: Tx) => Promise<{ result: T; before?: Payment; after?: Payment }>): Promise<T> {
    if (actor.role !== 'admin') throw new CommandError('Forbidden', 403);
    return this.database.transaction(async tx => {
      const key = actor.requestKey ? `${actor.tokenId}:payment:${actor.requestKey}` : undefined;
      if (key && key.length > 256) throw new CommandError('Invalid idempotency key', 400);
      const fingerprint = createHash('sha256').update(JSON.stringify({ command, input })).digest('hex');
      if (key) {
        const inserted = await tx.insert(commandReceipts).values({ key, fingerprint }).onConflictDoNothing().returning();
        if (!inserted.length) {
          const [receipt] = await tx.select().from(commandReceipts).where(eq(commandReceipts.key, key)).for('update');
          if (receipt.fingerprint !== fingerprint) throw new CommandError('Idempotency key already used for another payment command');
          if (receipt.result !== null) return JSON.parse(receipt.result) as T;
        }
      }
      const outcome = await execute(tx);
      const payment = outcome.after ?? outcome.before!;
      await tx.insert(assistantActionLogs).values({ accessTokenId: actor.tokenId, actionType: 'other',
        entityType: 'partner_payment', entityId: payment.id,
        description: `${command === 'record' ? 'Записан' : command === 'correct' ? 'Исправлен' : 'Отменён'} платёж партнёра: ${payment.amount} ₽`,
        details: JSON.stringify({ command, before: outcome.before ?? null, after: outcome.after ?? null }),
        ipAddress: actor.ip, userAgent: actor.userAgent });
      if (key) await tx.update(commandReceipts).set({ result: JSON.stringify(outcome.result) }).where(eq(commandReceipts.key, key));
      return outcome.result;
    });
  }

  record(actor: CommandActor, body: unknown) {
    const input = parseCommand(recordInput, body);
    return this.run(actor, 'record', input, async tx => {
      const [partner] = await tx.select({ id: partners.id }).from(partners).where(eq(partners.id, input.partnerId));
      if (!partner) throw new CommandError('Партнёр не найден', 404);
      if (input.invoiceId) {
        // Same invoice lock as reassignment/deletion: neither can race this check.
        await lockInvoices(tx, [input.invoiceId]);
        const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId));
        if (!invoice) throw new CommandError('Счёт не найден', 404);
        if (invoice.partnerId !== input.partnerId) throw new CommandError('Счёт принадлежит другому партнёру', 409);
      }
      const [after] = await tx.insert(partnerPayments).values({ ...input, createdBy: actor.tokenId }).returning();
      return { result: after, after };
    });
  }

  private async lockPayment(tx: Tx, id: string) {
    const [snapshot] = await tx.select().from(partnerPayments).where(eq(partnerPayments.id, id));
    if (!snapshot) throw new CommandError('Платёж не найден', 404);
    if (snapshot.invoiceId) await lockInvoices(tx, [snapshot.invoiceId]);
    const [payment] = await tx.select().from(partnerPayments).where(eq(partnerPayments.id, id)).for('update');
    if (!payment) throw new CommandError('Платёж не найден', 404);
    return payment;
  }

  correct(actor: CommandActor, paymentId: string, body: unknown) {
    const id = parseCommand(uuid, paymentId), input = parseCommand(fields, body);
    return this.run(actor, 'correct', { id, ...input }, async tx => {
      const before = await this.lockPayment(tx, id);
      const [after] = await tx.update(partnerPayments).set(input).where(eq(partnerPayments.id, id)).returning();
      return { result: after, before, after };
    });
  }

  cancel(actor: CommandActor, paymentId: string) {
    const id = parseCommand(uuid, paymentId);
    return this.run(actor, 'cancel', { id }, async tx => {
      const before = await this.lockPayment(tx, id);
      await tx.delete(partnerPayments).where(eq(partnerPayments.id, id));
      return { result: { success: true }, before };
    });
  }
}

export type PaymentCommandPort = Pick<PaymentCommands, 'record' | 'correct' | 'cancel'>;
