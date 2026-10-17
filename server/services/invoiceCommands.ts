import { CommandError } from "../lib/commandError";
export { CommandError } from "../lib/commandError";
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as repo from '../repositories/invoiceRepo';
import { assistantActionLogs, commandReceipts, notificationOutbox, invoiceTransfers } from '../../shared/schema';
import type { InsertInvoice, InsertInvoiceExpense, InvoiceCalculation, AssistantActionType } from '../../shared/schema';
import type { InvoiceActor } from '../invoiceAccess';
import { constrainInvoiceWrite } from '../invoiceAccess';
import { isClientFinancialVisible, isClientUsageVisible } from '../permissions';
import { escapeHtml, publicUrl } from '../lib/telegram';

export interface CommandActor extends InvoiceActor {
  tokenId: string; requestKey?: string; ip?: string; userAgent?: string;
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const money = (value: string | number | null | undefined) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(value ?? 0));

/** Application boundary: authorization, locking, mutation, audit and outbox commit together. */
export class InvoiceCommands {
  constructor(private readonly database = db) {}

  private async run<T>(actor: CommandActor, ids: string[], action: AssistantActionType, input: unknown, execute: (tx: Tx) => Promise<{ result: T; entityId: string; description: string; notification?: { clientId: string; body: string } }>): Promise<T> {
    if (!['admin', 'assistant', 'accountant'].includes(actor.role)) throw new CommandError('Forbidden', 403);
    return this.database.transaction(async tx => {
      const key = actor.requestKey ? `${actor.tokenId}:${actor.requestKey}` : undefined;
      if (key && key.length > 256) throw new CommandError('Invalid idempotency key', 400);
      const fingerprint = createHash('sha256').update(JSON.stringify({ action, ids, input })).digest('hex');
      if (key) {
        const inserted = await tx.insert(commandReceipts).values({ key, fingerprint }).onConflictDoNothing().returning();
        if (!inserted.length) {
          const [receipt] = await tx.select().from(commandReceipts).where(eq(commandReceipts.key, key)).for('update');
          if (receipt.fingerprint !== fingerprint) throw new CommandError('Idempotency key already used for another command');
          if (receipt.result) return JSON.parse(receipt.result) as T;
        }
      }
      await repo.lockInvoices(tx, ids);
      for (const id of ids) {
        if (!await repo.getInvoice(tx, id, actor.role, actor.partnerId, actor.clientId)) throw new CommandError('Invoice not found', 404);
      }
      const outcome = await execute(tx);
      await tx.insert(assistantActionLogs).values({
        accessTokenId: actor.tokenId, actionType: action, entityType: 'invoice', entityId: outcome.entityId,
        description: outcome.description, details: JSON.stringify(input), ipAddress: actor.ip, userAgent: actor.userAgent,
      });
      if (outcome.notification) await tx.insert(notificationOutbox).values(outcome.notification);
      if (key) await tx.update(commandReceipts).set({ result: JSON.stringify(outcome.result ?? null) }).where(eq(commandReceipts.key, key));
      return outcome.result;
    });
  }

  create(actor: CommandActor, input: InsertInvoice, calculations: Partial<InvoiceCalculation> = {}) {
    return this.run(actor, [], 'create_invoice', { input, calculations }, async tx => {
      const invoice = await repo.createInvoice(tx, { ...constrainInvoiceWrite(actor.role, input, 'create'), createdBy: actor.tokenId }, calculations);
      const full = (await repo.getInvoice(tx, invoice.id))!;
      return { result: invoice, entityId: invoice.id, description: `Создан счёт: ${invoice.invoiceNumber}`, notification: this.invoiceNotice(full, 'Новый счёт') };
    });
  }

  update(actor: CommandActor, id: string, input: Partial<InsertInvoice>, calculations: Partial<InvoiceCalculation> = {}) {
    return this.run(actor, [id], 'update_invoice', { input, calculations }, async tx => {
      const before = (await repo.getInvoice(tx, id))!;
      const invoice = (await repo.updateInvoice(tx, id, constrainInvoiceWrite(actor.role, input, 'update'), calculations))!;
      const full = (await repo.getInvoice(tx, id))!;
      return { result: invoice, entityId: id, description: `Обновлён счёт: ${invoice.invoiceNumber}`,
        notification: before.status !== 'paid' && invoice.status === 'paid' ? this.invoiceNotice(full, 'Оплата получена') : undefined };
    });
  }

  delete(actor: CommandActor, id: string) {
    if (actor.role !== 'admin') throw new CommandError('Forbidden', 403);
    return this.run(actor, [id], 'delete_invoice', { id }, async tx => {
      const invoice = (await repo.getInvoice(tx, id))!;
      await repo.deleteInvoice(tx, id);
      return { result: { success: true }, entityId: id, description: `Удалён счёт: ${invoice.invoiceNumber}` };
    });
  }

  createExpense(actor: CommandActor, input: InsertInvoiceExpense) {
    return this.run(actor, [input.invoiceId], 'create_expense', input, async tx => {
      const expense = await repo.createInvoiceExpense(tx, { ...input, createdBy: actor.tokenId });
      const invoice = (await repo.getInvoice(tx, input.invoiceId))!;
      const periodic = invoice.serviceType === 'periodic';
      const notification = isClientUsageVisible(invoice) ? { clientId: invoice.clientId,
        body: `<b>Списание</b> · ${escapeHtml(invoice.clientTitle || invoice.invoiceNumber)}\n${periodic ? 'Оплата периода' : escapeHtml(expense.description)} — ${money(periodic ? invoice.pricePerPeriod : expense.amount)}` } : undefined;
      return { result: expense, entityId: input.invoiceId, description: `Создан расход: ${expense.description}`, notification };
    });
  }

  async updateExpense(actor: CommandActor, id: string, input: Partial<InsertInvoiceExpense>) {
    const expense = await repo.getInvoiceExpense(this.database, id);
    if (!expense) throw new CommandError('Expense not found', 404);
    return this.run(actor, [expense.invoiceId], 'update_expense', { id, input }, async tx => ({
      result: await repo.updateInvoiceExpense(tx, id, input), entityId: expense.invoiceId, description: `Обновлён расход: ${expense.description}`,
    }));
  }

  async deleteExpense(actor: CommandActor, id: string) {
    const expense = await repo.getInvoiceExpense(this.database, id);
    if (!expense) throw new CommandError('Expense not found', 404);
    return this.run(actor, [expense.invoiceId], 'delete_expense', { id }, async tx => {
      await repo.deleteInvoiceExpense(tx, id);
      return { result: { success: true }, entityId: expense.invoiceId, description: `Удалён расход: ${expense.description}` };
    });
  }

  transfer(actor: CommandActor, input: Parameters<typeof repo.createInvoiceTransfer>[1]) {
    if (actor.role !== 'admin') throw new CommandError('Forbidden', 403);
    return this.run(actor, [input.fromInvoiceId, input.toInvoiceId], 'transfer_funds', input, async tx => {
      const result = await repo.createInvoiceTransfer(tx, { ...input, createdBy: actor.tokenId });
      if (result.ok === false) throw new CommandError(result.error, 400);
      const from = (await repo.getInvoice(tx, input.fromInvoiceId))!;
      const to = (await repo.getInvoice(tx, input.toInvoiceId))!;
      return { result, entityId: from.id, description: `Перенос ${money(input.amount)}: ${from.invoiceNumber} → ${to.invoiceNumber}`,
        notification: isClientFinancialVisible(from.scheme) || isClientFinancialVisible(to.scheme) ? {
          clientId: from.clientId, body: `<b>Перенос средств</b>\n${escapeHtml(from.clientTitle || from.invoiceNumber)} → ${escapeHtml(to.clientTitle || to.invoiceNumber)}\n${money(input.amount)}`,
        } : undefined };
    });
  }

  async deleteTransfer(actor: CommandActor, id: string) {
    if (actor.role !== 'admin') throw new CommandError('Forbidden', 403);
    const [transfer] = await this.database.select().from(invoiceTransfers).where(eq(invoiceTransfers.id, id));
    if (!transfer) throw new CommandError('Transfer not found', 404);
    return this.run(actor, [transfer.fromInvoiceId, transfer.toInvoiceId], 'transfer_funds_delete', { id }, async tx => {
      await repo.deleteInvoiceTransfer(tx, id);
      return { result: { success: true }, entityId: transfer.fromInvoiceId, description: 'Удалён перенос средств' };
    });
  }

  private invoiceNotice(invoice: NonNullable<Awaited<ReturnType<typeof repo.getInvoice>>>, title: string) {
    const amount = isClientFinancialVisible(invoice.scheme) ? invoice.calculations?.clientBaseAfterMargin ?? invoice.clientBill : invoice.clientBill;
    const link = publicUrl(`/invoices/${invoice.id}`);
    return { clientId: invoice.clientId, body: `<b>${title}</b> · ${escapeHtml(invoice.clientTitle || invoice.invoiceNumber)}\nСумма: ${money(amount)}${link ? `\n<a href="${escapeHtml(link)}">Открыть счёт</a>` : ''}` };
  }
}

export const invoiceCommands = new InvoiceCommands();
