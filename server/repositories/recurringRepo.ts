/**
 * Recurring Invoice Repository
 * CRUD for recurring invoice templates + draft generation, backdating, and scheduling.
 */

import { db as _db } from "../db";
import {
  recurringInvoices, invoices, clients, partners,
  InvoiceScheme,
} from "../../shared/schema";
import { eq, and, asc, lte, isNotNull, sql } from "drizzle-orm";
import { parseNum } from "../../shared/financialEngine";
import type { RecurringInvoiceForMonth } from "../storage";
import { calculateInvoiceServer } from "./invoiceRepo";
import * as invoiceRepo from "./invoiceRepo";

type DB = typeof _db;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _calculateNextInvoiceDate(currentDate: string, frequency: string): string {
  const date = new Date(currentDate);
  switch (frequency) {
    case 'monthly':  date.setMonth(date.getMonth() + 1);       break;
    case 'quarterly': date.setMonth(date.getMonth() + 3);      break;
    case 'yearly':   date.setFullYear(date.getFullYear() + 1); break;
  }
  return date.toISOString().split('T')[0];
}

function _mapRow(r: any) {
  return {
    ...r.recurring,
    clients:  { name: r.clientName },
    partners: { name: r.partnerName },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getRecurringInvoices(db: DB): Promise<any[]> {
  const result = await db.select({
    recurring:   recurringInvoices,
    clientName:  clients.name,
    partnerName: partners.name,
  })
    .from(recurringInvoices)
    .leftJoin(clients,  eq(recurringInvoices.clientId,  clients.id))
    .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
    .orderBy(asc(recurringInvoices.nextInvoiceDate));
  return result.map(_mapRow);
}

export async function getRecurringInvoice(db: DB, id: string): Promise<any | null> {
  const [result] = await db.select().from(recurringInvoices).where(eq(recurringInvoices.id, id));
  return result || null;
}

export async function createRecurringInvoice(db: DB, data: any): Promise<any> {
  const [created] = await db.insert(recurringInvoices).values({
    clientId:             data.clientId,
    partnerId:            data.partnerId,
    scheme:               data.scheme,
    partnerCommissionRate: data.partnerCommissionRate,
    amount:               data.amount,
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

export async function getDueRecurringInvoices(db: DB, upToDate?: Date): Promise<any[]> {
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
    .where(and(eq(recurringInvoices.isActive, true), lte(recurringInvoices.nextInvoiceDate, dateStr)))
    .orderBy(asc(recurringInvoices.nextInvoiceDate));
  return result.map(_mapRow);
}

export async function getActiveRecurringInvoicesForCashFlow(db: DB): Promise<any[]> {
  const result = await db.select({
    recurring:   recurringInvoices,
    clientName:  clients.name,
    partnerName: partners.name,
  })
    .from(recurringInvoices)
    .leftJoin(clients,  eq(recurringInvoices.clientId,  clients.id))
    .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
    .where(eq(recurringInvoices.isActive, true))
    .orderBy(asc(recurringInvoices.nextInvoiceDate));
  return result.map(_mapRow);
}

export async function updateRecurringInvoice(db: DB, id: string, data: any): Promise<any | null> {
  const [updated] = await db.update(recurringInvoices)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(recurringInvoices.id, id))
    .returning();
  return updated || null;
}

export async function deleteRecurringInvoice(db: DB, id: string): Promise<void> {
  await db.delete(recurringInvoices).where(eq(recurringInvoices.id, id));
}

export async function createDraftFromRecurring(db: DB, recurringId: string, invoiceDate?: string): Promise<any> {
  const recurring = await getRecurringInvoice(db, recurringId);
  if (!recurring) throw new Error('Recurring invoice not found');

  const targetDate    = invoiceDate || recurring.nextInvoiceDate;
  const invoiceNumber = await invoiceRepo.generateInvoiceNumber(db);

  const invoice = await invoiceRepo.createInvoice(db, {
    invoiceNumber,
    clientId:             recurring.clientId,
    partnerId:            recurring.partnerId,
    scheme:               recurring.scheme,
    partnerCommissionRate: recurring.partnerCommissionRate,
    clientBill:           recurring.amount,
    description:          recurring.description || `Recurring invoice for ${targetDate}`,
    issueDate:            targetDate,
    status:               'draft',
    hideFromAssistant:    recurring.hideFromAssistant ?? false,
    recurringInvoiceId:   recurring.id,
    createdBy:            recurring.createdBy,
  }, { clientBill: recurring.amount });

  const defaultExpenses = Number(recurring.defaultExpenses) || 0;
  if (defaultExpenses > 0 && invoice?.id) {
    await invoiceRepo.createInvoiceExpense(db, {
      invoiceId:   invoice.id,
      description: 'Расходы по умолчанию',
      amount:      String(defaultExpenses),
      paidByAdmin: true,
      createdBy:   recurring.createdBy,
    });
  }

  const newNextDate     = _calculateNextInvoiceDate(recurring.nextInvoiceDate, recurring.frequency);
  const shouldDeactivate = recurring.endDate && new Date(newNextDate) > new Date(recurring.endDate);

  await db.update(recurringInvoices)
    .set({ nextInvoiceDate: newNextDate, isActive: !shouldDeactivate, updatedAt: new Date() })
    .where(eq(recurringInvoices.id, recurringId));

  return invoice;
}

export async function processAllDueRecurringInvoices(db: DB): Promise<{ created: number; errors: string[] }> {
  const dueInvoices = await getDueRecurringInvoices(db);
  let created = 0;
  const errors: string[] = [];

  for (const recurring of dueInvoices) {
    try {
      await createDraftFromRecurring(db, recurring.id);
      created++;
    } catch (error: any) {
      errors.push(`Failed for recurring ${recurring.id}: ${error.message}`);
    }
  }
  return { created, errors };
}

export async function generateBackdatedInvoices(
  db: DB,
  recurringId: string,
  fromDate: string,
): Promise<{ created: number; invoices: any[] }> {
  const recurring = await getRecurringInvoice(db, recurringId);
  if (!recurring) throw new Error('Recurring invoice not found');

  const createdInvoices: any[] = [];
  let currentDate = new Date(fromDate);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const dayOfMonth    = parseInt(recurring.dayOfMonth) || 1;
  const defaultExpenses = Number(recurring.defaultExpenses) || 0;
  currentDate.setDate(dayOfMonth);

  while (currentDate <= today) {
    if (recurring.endDate && currentDate > new Date(recurring.endDate)) break;

    const invoiceDate   = currentDate.toISOString().split('T')[0];
    const invoiceNumber = await invoiceRepo.generateInvoiceNumber(db);

    const invoice = await invoiceRepo.createInvoice(db, {
      invoiceNumber,
      clientId:             recurring.clientId,
      partnerId:            recurring.partnerId,
      scheme:               recurring.scheme,
      partnerCommissionRate: recurring.partnerCommissionRate,
      clientBill:           recurring.amount,
      description:          recurring.description || `Backdated invoice for ${invoiceDate}`,
      issueDate:            invoiceDate,
      status:               'draft',
      hideFromAssistant:    recurring.hideFromAssistant ?? false,
      recurringInvoiceId:   recurring.id,
      createdBy:            recurring.createdBy,
    }, { clientBill: recurring.amount });

    if (defaultExpenses > 0 && invoice?.id) {
      await invoiceRepo.createInvoiceExpense(db, {
        invoiceId:   invoice.id,
        description: 'Расходы по умолчанию',
        amount:      String(defaultExpenses),
        paidByAdmin: true,
        createdBy:   recurring.createdBy,
      });
    }

    createdInvoices.push(invoice);

    switch (recurring.frequency) {
      case 'monthly':   currentDate.setMonth(currentDate.getMonth() + 1);        break;
      case 'quarterly': currentDate.setMonth(currentDate.getMonth() + 3);        break;
      case 'yearly':    currentDate.setFullYear(currentDate.getFullYear() + 1);  break;
    }
  }

  return { created: createdInvoices.length, invoices: createdInvoices };
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
      paymentDate: invoices.paymentDate,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(and(
      isNotNull(invoices.recurringInvoiceId),
      sql`${invoices.status} != 'cancelled'`
    ));
  
  const createdKeys = new Set<string>();
  for (const inv of existingFromRecurring) {
    const dateStr = inv.paymentDate || inv.createdAt;
    if (!dateStr || !inv.recurringInvoiceId) continue;
    const d = new Date(dateStr);
    const key = `${inv.recurringInvoiceId}:${d.getFullYear()}-${d.getMonth()}`;
    createdKeys.add(key);
  }
  
  const result: RecurringInvoiceForMonth[] = [];
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  
  const advanceByFrequency = (date: Date, freq: 'monthly' | 'quarterly' | 'yearly', day: number): Date => {
    switch (freq) {
      case 'monthly':
        return new Date(date.getFullYear(), date.getMonth() + 1, day);
      case 'quarterly':
        return new Date(date.getFullYear(), date.getMonth() + 3, day);
      case 'yearly':
        return new Date(date.getFullYear() + 1, date.getMonth(), day);
    }
  };
  
  const hasOccurrenceInMonth = (
    scheduleStart: Date,
    frequency: 'monthly' | 'quarterly' | 'yearly',
    dayOfMonth: number,
    scheduleEnd: Date | null
  ): boolean => {
    let cursor = new Date(scheduleStart.getFullYear(), scheduleStart.getMonth(), dayOfMonth);
    if (cursor < scheduleStart) {
      cursor = new Date(scheduleStart.getFullYear(), scheduleStart.getMonth(), dayOfMonth);
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
      paymentDate: invoices.paymentDate,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(and(
      isNotNull(invoices.recurringInvoiceId),
      sql`${invoices.status} != 'cancelled'`
    ));
  
  const createdKeys = new Set<string>();
  for (const inv of existingFromRecurring) {
    const dateStr = inv.paymentDate || inv.createdAt;
    if (!dateStr || !inv.recurringInvoiceId) continue;
    const d = new Date(dateStr);
    const key = `${inv.recurringInvoiceId}:${d.getFullYear()}-${d.getMonth()}`;
    createdKeys.add(key);
  }
  
  let monthlyAmount = 0;
  let yearlyTotal = 0;
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  
  const advanceByFrequency = (date: Date, freq: 'monthly' | 'quarterly' | 'yearly', day: number): Date => {
    switch (freq) {
      case 'monthly':
        return new Date(date.getFullYear(), date.getMonth() + 1, day);
      case 'quarterly':
        return new Date(date.getFullYear(), date.getMonth() + 3, day);
      case 'yearly':
        return new Date(date.getFullYear() + 1, date.getMonth(), day);
    }
  };
  
  const generateOccurrences = function*(
    scheduleStart: Date,
    frequency: 'monthly' | 'quarterly' | 'yearly',
    dayOfMonth: number,
    rangeStart: Date,
    rangeEnd: Date,
    scheduleEnd: Date | null
  ): Generator<Date> {
    let cursor = new Date(scheduleStart.getFullYear(), scheduleStart.getMonth(), dayOfMonth);
    
    if (cursor < scheduleStart) {
      cursor = new Date(scheduleStart.getFullYear(), scheduleStart.getMonth(), dayOfMonth);
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
      const key = `${recurring.id}:${occurrence.getFullYear()}-${occurrence.getMonth()}`;
      if (!createdKeys.has(key)) {
        monthlyAmount += expectedProfit;
      }
    }
    
    for (const occurrence of generateOccurrences(effectiveStartDate, frequency, dayOfMonth, yearStart, yearEnd, endDateValue)) {
      const key = `${recurring.id}:${occurrence.getFullYear()}-${occurrence.getMonth()}`;
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
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  
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
      : new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
    
    if (checkDate < now) {
      switch (frequency) {
        case 'monthly':
          checkDate = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth);
          break;
        case 'quarterly':
          checkDate.setMonth(checkDate.getMonth() + 3);
          break;
        case 'yearly':
          checkDate.setFullYear(checkDate.getFullYear() + 1);
          break;
      }
    }
    
    let iterations = 0;
    const maxIterations = 50;
    
    while (checkDate <= yearEnd && iterations < maxIterations) {
      iterations++;
      
      if (endDateValue && checkDate > endDateValue) break;
      
      yearlyTotal += expectedProfit;
      
      const nextYear = checkDate.getFullYear();
      const nextMonth = checkDate.getMonth();
      
      switch (frequency) {
        case 'monthly':
          checkDate = new Date(nextYear, nextMonth + 1, dayOfMonth);
          break;
        case 'quarterly':
          checkDate = new Date(nextYear, nextMonth + 3, dayOfMonth);
          break;
        case 'yearly':
          checkDate = new Date(nextYear + 1, nextMonth, dayOfMonth);
          break;
      }
    }
  }
  
  return { monthly: monthlyTotal, yearly: yearlyTotal };
}
