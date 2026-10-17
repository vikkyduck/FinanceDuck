import { invoiceTerms, calculationInput, expenseInput, parseCommand, validatePeriodicTerms, type CreateInvoiceInput, type ChangeInvoiceTerms, type CalculationInput, type RecordExpense, type ExpenseFields } from './invoiceCommandInput';
import { invoiceNotice } from './invoiceNotice';
import { CommandError } from "../lib/commandError";
export { CommandError } from "../lib/commandError";
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as repo from '../repositories/invoiceRepo';
import { assistantActionLogs, commandReceipts, notificationOutbox, invoiceTransfers } from '../../shared/schema';
import type { AssistantActionType } from '../../shared/schema';
import type { InvoiceActor } from '../invoiceAccess';
import { constrainInvoiceWrite } from '../invoiceAccess';
import { isClientFinancialVisible, isClientUsageVisible } from '../permissions';
import { escapeHtml } from '../lib/telegram';

export interface CommandActor extends InvoiceActor {
  tokenId: string; requestKey?: string; ip?: string; userAgent?: string;
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const money = (value: string | number | null | undefined) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(value ?? 0));

/** Application boundary: authorization, locking, mutation, audit and outbox commit together. */
export class InvoiceCommands {
  constructor(private readonly database = db) {}

  private async run<T>(actor: CommandActor, targets: string[] | ((tx: Tx) => Promise<string[]>), action: AssistantActionType, input: unknown, execute: (tx: Tx) => Promise<{ result: T; entityId: string; description: string; notification?: { clientId: string; body: string } }>): Promise<T> {
    if (!['admin', 'assistant', 'accountant'].includes(actor.role)) throw new CommandError('Forbidden', 403);
    return this.database.transaction(async tx => {
      const key = actor.requestKey ? `${actor.tokenId}:${actor.requestKey}` : undefined;
      if (key && key.length > 256) throw new CommandError('Invalid idempotency key', 400);
      const fingerprint = createHash('sha256').update(JSON.stringify({ action, input })).digest('hex');
      const authorize = async (ids: string[], replay = false) => {
        await repo.lockInvoices(tx, ids);
        for (const id of ids) {
          if (!await repo.getInvoice(tx, id, actor.role, actor.partnerId, actor.clientId)) {
            // Deletion receipts contain only success, and deletion remains admin-only.
            if (replay && action === 'delete_invoice' && actor.role === 'admin') continue;
            throw new CommandError('Invoice not found', 404);
          }
        }
      };
      if (key) {
        const inserted = await tx.insert(commandReceipts).values({ key, fingerprint }).onConflictDoNothing().returning();
        if (!inserted.length) {
          const [receipt] = await tx.select().from(commandReceipts).where(eq(commandReceipts.key, key)).for('update');
          const cached = receipt.result ? JSON.parse(receipt.result) : null;
          const envelope = cached?.receiptVersion === 1;
          const ids: string[] = envelope ? cached.invoiceIds : typeof targets === 'function' ? await targets(tx) : targets;
          const legacyFingerprint = createHash('sha256').update(JSON.stringify({ action, ids, input })).digest('hex');
          if (receipt.fingerprint !== fingerprint && receipt.fingerprint !== legacyFingerprint) throw new CommandError('Idempotency key already used for another command');
          if (cached) {
            const result = envelope ? cached.result : cached;
            await authorize(action === 'create_invoice' ? [result.id] : ids, true);
            return result as T;
          }
        }
      }
      const ids = typeof targets === 'function' ? await targets(tx) : targets;
      await authorize(ids);
      const outcome = await execute(tx);
      await tx.insert(assistantActionLogs).values({
        accessTokenId: actor.tokenId, actionType: action, entityType: 'invoice', entityId: outcome.entityId,
        description: outcome.description, details: JSON.stringify(input), ipAddress: actor.ip, userAgent: actor.userAgent,
      });
      if (outcome.notification) await tx.insert(notificationOutbox).values(outcome.notification);
      if (key) await tx.update(commandReceipts).set({ result: JSON.stringify({ receiptVersion: 1, invoiceIds: ids.length ? ids : [outcome.entityId], result: outcome.result ?? null }) }).where(eq(commandReceipts.key, key));
      return outcome.result;
    });
  }

  create(actor: CommandActor, input: CreateInvoiceInput, calculations: CalculationInput = {}) {
    const terms = parseCommand(invoiceTerms, input);
    const projection = parseCommand(calculationInput, calculations);
    validatePeriodicTerms(terms);
    return this.run(actor, [], 'create_invoice', { input, calculations }, async tx => {
      const invoice = await repo.createInvoice(tx, { ...constrainInvoiceWrite(actor.role, terms, 'create'), createdBy: actor.tokenId }, projection);
      const full = (await repo.getInvoice(tx, invoice.id))!;
      return { result: invoice, entityId: invoice.id, description: `Создан счёт: ${invoice.invoiceNumber}`, notification: invoiceNotice(full, 'Новый счёт') };
    });
  }

  update(actor: CommandActor, id: string, input: ChangeInvoiceTerms, calculations: CalculationInput = {}) {
    const terms = parseCommand(invoiceTerms.partial(), input);
    const projection = parseCommand(calculationInput, calculations);
    return this.run(actor, [id], 'update_invoice', { input, calculations }, async tx => {
      const before = (await repo.getInvoice(tx, id))!;
      validatePeriodicTerms({ ...before, ...terms });
      const invoice = (await repo.updateInvoice(tx, id, constrainInvoiceWrite(actor.role, terms, 'update'), projection))!;
      const full = (await repo.getInvoice(tx, id))!;
      return { result: invoice, entityId: id, description: `Обновлён счёт: ${invoice.invoiceNumber}`,
        notification: before.status !== 'paid' && invoice.status === 'paid' ? invoiceNotice(full, 'Оплата получена') : undefined };
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

  createExpense(actor: CommandActor, input: RecordExpense) {
    const fields = parseCommand(expenseInput, input);
    return this.run(actor, [input.invoiceId], 'create_expense', input, async tx => {
      const expense = await repo.createInvoiceExpense(tx, { ...fields, invoiceId: input.invoiceId, createdBy: actor.tokenId });
      const invoice = (await repo.getInvoice(tx, input.invoiceId))!;
      const periodic = invoice.serviceType === 'periodic';
      const notification = isClientUsageVisible(invoice) ? { clientId: invoice.clientId,
        body: `<b>Списание</b> · ${escapeHtml(invoice.clientTitle || invoice.invoiceNumber)}\n${periodic ? 'Оплата периода' : escapeHtml(expense.description)} — ${money(periodic ? invoice.pricePerPeriod : expense.amount)}` } : undefined;
      return { result: expense, entityId: input.invoiceId, description: `Создан расход: ${expense.description}`, notification };
    });
  }

  async updateExpense(actor: CommandActor, id: string, input: Partial<ExpenseFields>) {
    const fields = parseCommand(expenseInput.partial(), input);
    const expense = await repo.getInvoiceExpense(this.database, id);
    if (!expense) throw new CommandError('Expense not found', 404);
    return this.run(actor, [expense.invoiceId], 'update_expense', { id, input }, async tx => ({
      result: await repo.updateInvoiceExpense(tx, id, fields), entityId: expense.invoiceId, description: `Обновлён расход: ${expense.description}`,
    }));
  }

  async deleteExpense(actor: CommandActor, id: string) {
    return this.run(actor, async tx => {
      const expense = await repo.getInvoiceExpense(tx, id);
      if (!expense) throw new CommandError('Expense not found', 404);
      return [expense.invoiceId];
    }, 'delete_expense', { id }, async tx => {
      const expense = await repo.getInvoiceExpense(tx, id);
      if (!expense) throw new CommandError('Expense not found', 404);
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
    return this.run(actor, async tx => {
      const [transfer] = await tx.select().from(invoiceTransfers).where(eq(invoiceTransfers.id, id));
      if (!transfer) throw new CommandError('Transfer not found', 404);
      return [transfer.fromInvoiceId, transfer.toInvoiceId];
    }, 'transfer_funds_delete', { id }, async tx => {
      const [transfer] = await tx.select().from(invoiceTransfers).where(eq(invoiceTransfers.id, id));
      if (!transfer) throw new CommandError('Transfer not found', 404);
      await repo.deleteInvoiceTransfer(tx, id);
      return { result: { success: true }, entityId: transfer.fromInvoiceId, description: 'Удалён перенос средств' };
    });
  }


}

export const invoiceCommands = new InvoiceCommands();
