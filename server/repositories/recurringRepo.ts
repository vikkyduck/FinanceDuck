/**
 * Recurring Invoice Repository
 * CRUD for recurring invoice templates + draft generation, backdating, and scheduling.
 */

import { db as _db } from "../db";
import {
  recurringInvoices, invoices, clients, partners,
  InvoiceScheme, RecurringInvoice, InsertRecurringInvoice, Invoice,
} from "../../shared/schema";
import { eq, and, or, asc, lte, isNotNull, sql } from "drizzle-orm";
import { parseNum } from "../../shared/financialEngine";
import type { RecurringInvoiceForMonth } from "../storage";
import { nextOccurrence, calendarDate } from "../../shared/recurringSchedule";
import { calculateInvoiceServer } from "./invoiceRepo";
import * as invoiceRepo from "./invoiceRepo";

type DB = typeof _db;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const advanceByFrequency = (date: Date, frequency: RecurringInvoice['frequency'], day: number) =>
  new Date(nextOccurrence(date.toISOString().slice(0, 10), frequency, day));

export type RecurringScope = "all" | "assistant";
const visibility = (scope: RecurringScope) => scope === "assistant" ? eq(recurringInvoices.hideFromAssistant, false) : undefined;
function _mapRow(r: { recurring: RecurringInvoice; clientName: string | null; partnerName: string | null }) {
  return {
    ...r.recurring,
    clients:  { name: r.clientName },
    partners: { name: r.partnerName },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getRecurringInvoices(db: DB, scope: RecurringScope = "all") {
  const result = await db.select({
    recurring:   recurringInvoices,
    clientName:  clients.name,
    partnerName: partners.name,
  })
    .from(recurringInvoices)
    .leftJoin(clients,  eq(recurringInvoices.clientId,  clients.id))
    .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
    .where(visibility(scope))
    .orderBy(asc(recurringInvoices.nextInvoiceDate));
  return result.map(_mapRow);
}

export async function getRecurringInvoice(db: DB, id: string, scope: RecurringScope = "all"): Promise<RecurringInvoice | null> {
  const [result] = await db.select().from(recurringInvoices).where(and(eq(recurringInvoices.id, id), visibility(scope)));
  return result || null;
}

export async function createRecurringInvoice(db: DB, data: InsertRecurringInvoice): Promise<RecurringInvoice> {
  const [created] = await db.insert(recurringInvoices).values({
    clientId:             data.clientId,
    partnerId:            data.partnerId,
    scheme:               data.scheme,
    partnerCommissionRate: data.partnerCommissionRate,
    amount:               data.amount,
    defaultExpenses:      data.defaultExpenses,
    description:          data.description,
    frequency:            data.frequency,
    dayOfMonth:           data.dayOfMonth,
    startDate:            data.startDate,
    endDate:              data.endDate || null,
    nextInvoiceDate:      data.nextInvoiceDate,
    notes:                data.notes,
    hideFromAssistant:    data.hideFromAssistant ?? false,
    createdBy:            data.createdBy,
  }).returning();
  return created;
}

export async function getDueRecurringInvoices(db: DB, upToDate?: Date, scope: RecurringScope = "all") {
  const checkDate = upToDate || new Date();
  const dateStr   = checkDate.toISOString().split('T')[0];
  const result = await db.select({
    recurring:   recurringInvoices,
    clientName:  clients.name,
    partnerName: partners.name,
  })
    .from(recurringInvoices)
    .leftJoin(clients,  eq(recurringInvoices.clientId,  clients.id))
    .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
    .where(and(eq(recurringInvoices.isActive, true), lte(recurringInvoices.nextInvoiceDate, dateStr), visibility(scope)))
    .orderBy(asc(recurringInvoices.nextInvoiceDate));
  return result.map(_mapRow);
}

export async function getActiveRecurringInvoicesForCashFlow(db: DB, scope: RecurringScope = "all") {
  const result = await db.select({
    recurring:   recurringInvoices,
    clientName:  clients.name,
    partnerName: partners.name,
  })
    .from(recurringInvoices)
    .leftJoin(clients,  eq(recurringInvoices.clientId,  clients.id))
    .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
    .where(and(eq(recurringInvoices.isActive, true), visibility(scope)))
    .orderBy(asc(recurringInvoices.nextInvoiceDate));
  return result.map(_mapRow);
}

export async function updateRecurringInvoice(db: DB, id: string, data: Partial<InsertRecurringInvoice>, scope: RecurringScope = "all"): Promise<RecurringInvoice | null> {
  const [updated] = await db.update(recurringInvoices)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(recurringInvoices.id, id), visibility(scope)))
    .returning();
  return updated || null;
}

export async function deleteRecurringInvoice(db: DB, id: string): Promise<void> {
  await db.delete(recurringInvoices).where(eq(recurringInvoices.id, id));
}

async function generateOccurrence(db: DB, recurringId: string, invoiceDate?: string, scope: RecurringScope = "all"): Promise<{ invoice: Invoice; created: boolean }> {
  return db.transaction(async tx => {
    const [recurring] = await tx.select().from(recurringInvoices)
      .where(and(eq(recurringInvoices.id, recurringId), visibility(scope))).for("update");
    if (!recurring) throw new Error('Recurring invoice not found');
    const targetDate = invoiceDate || recurring.nextInvoiceDate;
    const occurrenceKey = `${recurringId}:${targetDate}`;
    const [existing] = await tx.select().from(invoices)
      .where(or(eq(invoices.recurringOccurrenceKey, occurrenceKey),
        and(eq(invoices.recurringInvoiceId, recurringId), eq(invoices.issueDate, targetDate))))
      .orderBy(asc(invoices.createdAt), asc(invoices.id)).limit(1);
    if (existing) return { invoice: existing, created: false };
    if ((!invoiceDate && !recurring.isActive) || targetDate < recurring.startDate || (recurring.endDate && targetDate > recurring.endDate)) {
      throw new Error('Дата вне расписания повторяющегося счёта');
    }
    const invoiceNumber = await invoiceRepo.generateInvoiceNumber(tx);
    const invoice = await invoiceRepo.createInvoice(tx, {
      invoiceNumber, clientId: recurring.clientId, partnerId: recurring.partnerId,
      scheme: recurring.scheme, partnerCommissionRate: recurring.partnerCommissionRate,
      clientBill: recurring.amount, description: recurring.description,
      issueDate: targetDate, status: 'draft', hideFromAssistant: recurring.hideFromAssistant,
      recurringInvoiceId: recurring.id, recurringOccurrenceKey: occurrenceKey, createdBy: recurring.createdBy,
    });
    if (Number(recurring.defaultExpenses) > 0) {
      await invoiceRepo.createInvoiceExpense(tx, {
        invoiceId: invoice.id, description: 'Расходы по умолчанию', amount: recurring.defaultExpenses!,
        paidByAdmin: true, createdBy: recurring.createdBy, date: targetDate,
      });
    }
    // Backdating past occurrences never advances a future schedule.
    if (targetDate >= recurring.nextInvoiceDate) {
      const next = nextOccurrence(targetDate, recurring.frequency, Number(recurring.dayOfMonth));
      await tx.update(recurringInvoices).set({ nextInvoiceDate: next,
        isActive: !(recurring.endDate && next > recurring.endDate), updatedAt: new Date(),
      }).where(eq(recurringInvoices.id, recurringId));
    }
    return { invoice, created: true };
  });
}

export async function createDraftFromRecurring(db: DB, recurringId: string, invoiceDate?: string, scope: RecurringScope = "all"): Promise<Invoice> {
  return (await generateOccurrence(db, recurringId, invoiceDate, scope)).invoice;
}

export async function processAllDueRecurringInvoices(db: DB): Promise<{ created: number; errors: string[] }> {
  const due = await getDueRecurringInvoices(db);
  let created = 0;
  const errors: string[] = [];
  for (const recurring of due) {
    try {
      // Pass the observed occurrence: overlapping workers converge on its unique key.
      if ((await generateOccurrence(db, recurring.id, recurring.nextInvoiceDate)).created) created++;
    } catch (error) {
      errors.push(`Failed for recurring ${recurring.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { created, errors };
}

export async function generateBackdatedInvoices(db: DB, recurringId: string, fromDate: string): Promise<{ created: number; invoices: Invoice[] }> {
  const recurring = await getRecurringInvoice(db, recurringId);
  if (!recurring) throw new Error('Recurring invoice not found');
  const date = new Date(`${fromDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid fromDate');
  const anchor = Number(recurring.dayOfMonth);
  let cursor = calendarDate(date.getUTCFullYear(), date.getUTCMonth(), anchor);
  const until = new Date().toISOString().slice(0, 10);
  const result: Invoice[] = [];
  // Bound one request; repeated calls resume idempotently through occurrence keys.
  for (let steps = 0; cursor <= until && steps < 1200; steps++) {
    if (recurring.endDate && cursor > recurring.endDate) break;
    if (cursor >= fromDate && cursor >= recurring.startDate) {
      const occurrence = await generateOccurrence(db, recurringId, cursor);
      if (occurrence.created) result.push(occurrence.invoice);
    }
    cursor = nextOccurrence(cursor, recurring.frequency, anchor);
  }
  return { created: result.length, invoices: result };
}

/** For use in cash-flow forecast calculations — same logic as in dashboardRepo */

export async function getRecurringInvoicesForMonth(db: DB, year: number, month: number): Promise<RecurringInvoiceForMonth[]> {
  const activeRecurring = await db
    .select({
      recurring: recurringInvoices,
      clientName: clients.name,
      partnerName: partners.name,
    })
    .from(recurringInvoices)
    .leftJoin(clients, eq(recurringInvoices.clientId, clients.id))
    .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
    .where(eq(recurringInvoices.isActive, true));
  
  const existingFromRecurring = await db
    .select({
      recurringInvoiceId: invoices.recurringInvoiceId,
      issueDate: invoices.issueDate,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(and(
      isNotNull(invoices.recurringInvoiceId),
      sql`${invoices.status} != 'cancelled'`
    ));
  
  const createdKeys = new Set<string>();
  for (const inv of existingFromRecurring) {
    const dateStr = inv.issueDate || inv.createdAt;
    if (!dateStr || !inv.recurringInvoiceId) continue;
    const d = new Date(dateStr);
    const key = `${inv.recurringInvoiceId}:${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    createdKeys.add(key);
  }
  
  const result: RecurringInvoiceForMonth[] = [];
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  
  
  const hasOccurrenceInMonth = (
    scheduleStart: Date,
    frequency: 'monthly' | 'quarterly' | 'yearly',
    dayOfMonth: number,
    scheduleEnd: Date | null
  ): boolean => {
    let cursor = new Date(calendarDate(scheduleStart.getUTCFullYear(), scheduleStart.getUTCMonth(), dayOfMonth));
    if (cursor < scheduleStart) {
      cursor = new Date(calendarDate(scheduleStart.getUTCFullYear(), scheduleStart.getUTCMonth(), dayOfMonth));
    }
    
    let iterations = 0;
    while (cursor <= monthEnd && iterations < 500) {
      iterations++;
      if (scheduleEnd && cursor > scheduleEnd) break;
      
      if (cursor >= scheduleStart && cursor >= monthStart && cursor <= monthEnd) {
        return true;
      }
      cursor = advanceByFrequency(cursor, frequency, dayOfMonth);
    }
    return false;
  };
  
  for (const row of activeRecurring) {
    const recurring = row.recurring;
    const amount = parseNum(recurring.amount);
    if (amount <= 0) continue;
    
    const scheme = recurring.scheme as InvoiceScheme;
    const partnerCommissionRate = recurring.partnerCommissionRate 
      ? parseNum(recurring.partnerCommissionRate) 
      : undefined;
    const defaultExpenses = parseNum(recurring.defaultExpenses);
    
    const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
    const expectedProfit = parseNum(calculation.netProfitAdmin);
    
    if (expectedProfit <= 0) continue;
    
    const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
    const frequency = recurring.frequency as 'monthly' | 'quarterly' | 'yearly';
    const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
    const baseStartDate = recurring.startDate ? new Date(recurring.startDate) : new Date();
    
    const nextInvoiceDateValue = recurring.nextInvoiceDate ? new Date(recurring.nextInvoiceDate) : null;
    const effectiveStartDate = nextInvoiceDateValue && nextInvoiceDateValue > baseStartDate ? nextInvoiceDateValue : baseStartDate;
    
    if (effectiveStartDate > monthEnd) continue;
    if (endDateValue && endDateValue < monthStart) continue;
    
    const key = `${recurring.id}:${year}-${month}`;
    if (createdKeys.has(key)) continue;
    
    if (hasOccurrenceInMonth(effectiveStartDate, frequency, dayOfMonth, endDateValue)) {
      result.push({
        id: recurring.id,
        clientName: row.clientName,
        partnerName: row.partnerName,
        amount,
        expectedProfit,
        frequency,
        dayOfMonth,
        scheme,
      });
    }
  }
  
  return result;
}

export async function getRecurringExpectedForMonth(db: DB, year: number, month: number): Promise<{ monthlyAmount: number; yearlyTotal: number }> {
  const activeRecurring = await db
    .select()
    .from(recurringInvoices)
    .where(eq(recurringInvoices.isActive, true));
  
  const existingFromRecurring = await db
    .select({
      recurringInvoiceId: invoices.recurringInvoiceId,
      issueDate: invoices.issueDate,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(and(
      isNotNull(invoices.recurringInvoiceId),
      sql`${invoices.status} != 'cancelled'`
    ));
  
  const createdKeys = new Set<string>();
  for (const inv of existingFromRecurring) {
    const dateStr = inv.issueDate || inv.createdAt;
    if (!dateStr || !inv.recurringInvoiceId) continue;
    const d = new Date(dateStr);
    const key = `${inv.recurringInvoiceId}:${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    createdKeys.add(key);
  }
  
  let monthlyAmount = 0;
  let yearlyTotal = 0;
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  
  
  const generateOccurrences = function*(
    scheduleStart: Date,
    frequency: 'monthly' | 'quarterly' | 'yearly',
    dayOfMonth: number,
    rangeStart: Date,
    rangeEnd: Date,
    scheduleEnd: Date | null
  ): Generator<Date> {
    let cursor = new Date(calendarDate(scheduleStart.getUTCFullYear(), scheduleStart.getUTCMonth(), dayOfMonth));
    
    if (cursor < scheduleStart) {
      cursor = new Date(calendarDate(scheduleStart.getUTCFullYear(), scheduleStart.getUTCMonth(), dayOfMonth));
    }
    
    let iterations = 0;
    while (cursor <= rangeEnd && iterations < 500) {
      iterations++;
      if (scheduleEnd && cursor > scheduleEnd) break;
      
      if (cursor >= scheduleStart && cursor >= rangeStart && cursor <= rangeEnd) {
        yield cursor;
      }
      
      cursor = advanceByFrequency(cursor, frequency, dayOfMonth);
    }
  };
  
  for (const recurring of activeRecurring) {
    const amount = parseNum(recurring.amount);
    if (amount <= 0) continue;
    
    const scheme = recurring.scheme as InvoiceScheme;
    const partnerCommissionRate = recurring.partnerCommissionRate 
      ? parseNum(recurring.partnerCommissionRate) 
      : undefined;
    const defaultExpenses = parseNum(recurring.defaultExpenses);
    
    const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
    const expectedProfit = parseNum(calculation.netProfitAdmin);
    
    if (expectedProfit <= 0) continue;
    
    const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
    const frequency = recurring.frequency as 'monthly' | 'quarterly' | 'yearly';
    const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
    const baseStartDate = recurring.startDate ? new Date(recurring.startDate) : new Date();
    
    const nextInvoiceDate = recurring.nextInvoiceDate ? new Date(recurring.nextInvoiceDate) : null;
    const effectiveStartDate = nextInvoiceDate && nextInvoiceDate > baseStartDate ? nextInvoiceDate : baseStartDate;
    
    if (effectiveStartDate > yearEnd) continue;
    if (endDateValue && endDateValue < yearStart) continue;
    
    for (const occurrence of generateOccurrences(effectiveStartDate, frequency, dayOfMonth, monthStart, monthEnd, endDateValue)) {
      const key = `${recurring.id}:${occurrence.getUTCFullYear()}-${occurrence.getUTCMonth()}`;
      if (!createdKeys.has(key)) {
        monthlyAmount += expectedProfit;
      }
    }
    
    for (const occurrence of generateOccurrences(effectiveStartDate, frequency, dayOfMonth, yearStart, yearEnd, endDateValue)) {
      const key = `${recurring.id}:${occurrence.getUTCFullYear()}-${occurrence.getUTCMonth()}`;
      if (!createdKeys.has(key)) {
        yearlyTotal += expectedProfit;
      }
    }
  }
  
  return { monthlyAmount, yearlyTotal };
}

export async function getRecurringExpectedAmounts(db: DB): Promise<{ monthly: number; yearly: number }> {
  const activeRecurring = await db
    .select()
    .from(recurringInvoices)
    .where(eq(recurringInvoices.isActive, true));
  
  let monthlyTotal = 0;
  let yearlyTotal = 0;
  const now = new Date();
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31));
  
  for (const recurring of activeRecurring) {
    const amount = parseNum(recurring.amount);
    if (amount <= 0) continue;
    
    const scheme = recurring.scheme as InvoiceScheme;
    const partnerCommissionRate = recurring.partnerCommissionRate 
      ? parseNum(recurring.partnerCommissionRate) 
      : undefined;
    const defaultExpenses = parseNum(recurring.defaultExpenses);
    
    // Calculate expected admin profit (including default expenses)
    const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
    const expectedProfit = parseNum(calculation.netProfitAdmin);
    
    if (expectedProfit <= 0) continue;
    
    const frequency = recurring.frequency as 'monthly' | 'quarterly' | 'yearly';
    const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
    
    // Calculate monthly expected (for next month)
    if (!endDateValue || endDateValue >= now) {
      switch (frequency) {
        case 'monthly':
          monthlyTotal += expectedProfit;
          break;
        case 'quarterly':
          monthlyTotal += expectedProfit / 3;
          break;
        case 'yearly':
          monthlyTotal += expectedProfit / 12;
          break;
      }
    }
    
    // Calculate yearly expected (remaining occurrences this year)
    const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
    let checkDate = recurring.nextInvoiceDate 
      ? new Date(recurring.nextInvoiceDate) 
      : new Date(calendarDate(now.getUTCFullYear(), now.getUTCMonth(), dayOfMonth));
    
    const today = new Date(now.toISOString().slice(0, 10));
    for (let skipped = 0; checkDate < today && skipped < 1200; skipped++) {
      checkDate = advanceByFrequency(checkDate, frequency, dayOfMonth);
    }

    let iterations = 0;
    const maxIterations = 50;
    
    while (checkDate <= yearEnd && iterations < maxIterations) {
      iterations++;
      
      if (endDateValue && checkDate > endDateValue) break;
      
      yearlyTotal += expectedProfit;
      
      checkDate = advanceByFrequency(checkDate, frequency, dayOfMonth);
    }
  }
  
  return { monthly: monthlyTotal, yearly: yearlyTotal };
}
