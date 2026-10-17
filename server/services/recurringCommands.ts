import type { db as Database } from '../db';
import { and, or, eq, asc, isNull } from 'drizzle-orm';
import { recurringInvoices, invoices, assistantActionLogs, notificationOutbox, type Invoice } from '../../shared/schema';
import { nextOccurrence } from '../../shared/recurringSchedule';
import type { RecurringScope } from '../repositories/recurringRepo';
import * as invoiceRepo from '../repositories/invoiceRepo';
import { invoiceNotice } from './invoiceNotice';
import { CommandError } from '../lib/commandError';

type DB = typeof Database;
const visibility = (scope: RecurringScope) => scope === 'assistant' ? eq(recurringInvoices.hideFromAssistant, false) : undefined;

/** An occurrence, schedule, audit and notification are committed or rolled back together. */
export async function generateOccurrence(db: DB, recurringId: string, invoiceDate?: string, scope: RecurringScope = "all", actorId?: string, requireActive = false): Promise<{ invoice: Invoice; created: boolean }> {
  return db.transaction(async tx => {
    const [recurring] = await tx.select().from(recurringInvoices)
      .where(and(eq(recurringInvoices.id, recurringId), visibility(scope))).for("update");
    if (!recurring) throw new CommandError('Recurring invoice not found', 404);
    if (requireActive && !recurring.isActive) throw new CommandError('Recurring invoice is inactive', 409);
    const targetDate = invoiceDate || recurring.nextInvoiceDate;
    const occurrenceKey = `${recurringId}:${targetDate}`;
    const [existing] = await tx.select().from(invoices)
      .where(or(eq(invoices.recurringOccurrenceKey, occurrenceKey),
        and(isNull(invoices.recurringOccurrenceKey), eq(invoices.recurringInvoiceId, recurringId), eq(invoices.issueDate, targetDate))))
      .orderBy(asc(invoices.createdAt), asc(invoices.id)).limit(1).for('update');
    if (existing && scope === 'assistant' && existing.hideFromAssistant) throw new CommandError('Invoice not found', 404);
    const advance = async () => {
      if (targetDate < recurring.nextInvoiceDate) return;
      const next = nextOccurrence(targetDate, recurring.frequency, Number(recurring.dayOfMonth));
      await tx.update(recurringInvoices).set({ nextInvoiceDate: next,
        isActive: recurring.isActive && !(recurring.endDate && next > recurring.endDate), updatedAt: new Date(),
      }).where(eq(recurringInvoices.id, recurringId));
    };
    if (existing) {
      await advance();
      return { invoice: existing, created: false };
    }
    if ((!invoiceDate && !recurring.isActive) || targetDate < recurring.startDate || (recurring.endDate && targetDate > recurring.endDate)) {
      throw new CommandError('Дата вне расписания повторяющегося счёта', 400);
    }
    const invoiceNumber = await invoiceRepo.generateInvoiceNumber(tx);
    const invoice = await invoiceRepo.createInvoice(tx, {
      invoiceNumber, clientId: recurring.clientId, partnerId: recurring.partnerId,
      scheme: recurring.scheme, partnerCommissionRate: recurring.partnerCommissionRate,
      clientBill: recurring.amount, description: recurring.description,
      issueDate: targetDate, status: 'draft', hideFromAssistant: recurring.hideFromAssistant,
      recurringInvoiceId: recurring.id, recurringOccurrenceKey: occurrenceKey, createdBy: actorId ?? recurring.createdBy,
    });
    if (Number(recurring.defaultExpenses) > 0) {
      await invoiceRepo.createInvoiceExpense(tx, {
        invoiceId: invoice.id, description: 'Расходы по умолчанию', amount: recurring.defaultExpenses!,
        paidByAdmin: true, createdBy: actorId ?? recurring.createdBy, date: targetDate,
      });
    }
    await advance();
    await tx.insert(assistantActionLogs).values({
      accessTokenId: actorId ?? null, actionType: 'create_invoice', entityType: 'invoice', entityId: invoice.id,
      description: `Создан повторяющийся счёт: ${invoice.invoiceNumber}`,
      details: JSON.stringify({ recurringId, occurrenceKey, source: actorId ? 'manual' : 'scheduler' }),
    });
    const full = (await invoiceRepo.getInvoice(tx, invoice.id))!;
    await tx.insert(notificationOutbox).values(invoiceNotice(full, 'Новый счёт'));
    return { invoice, created: true };
  });
}

