import { db } from "./db";
import { 
  partners, clients, accessTokens, userSessions, invoices, 
  invoiceCalculations, invoiceExpenses, partnerPayments,
  Partner, Client, Invoice, InvoiceCalculation, InvoiceExpense, PartnerPayment,
  InsertPartner, InsertClient, InsertInvoice, InsertInvoiceExpense, InsertPartnerPayment,
  AccessToken, UserSession, UserRole
} from "../shared/schema";
import { eq, and, desc, isNull, gte, sql } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  verifyAccessCode(code: string): Promise<AccessToken | null>;
  createSession(tokenId: string, ipAddress?: string, userAgent?: string): Promise<{ sessionId: string; csrfToken: string; expiresAt: Date }>;
  validateSession(sessionId: string, csrfToken?: string): Promise<{ isValid: boolean; token?: AccessToken } | null>;
  refreshSession(sessionId: string): Promise<Date | null>;
  revokeSession(sessionId: string): Promise<void>;
  
  getPartners(): Promise<Partner[]>;
  getPartner(id: string): Promise<Partner | null>;
  createPartner(partner: InsertPartner): Promise<Partner>;
  updatePartner(id: string, partner: Partial<InsertPartner>): Promise<Partner | null>;
  deletePartner(id: string): Promise<{ success: boolean; error?: string }>;
  getPartnerClients(partnerId: string): Promise<Client[]>;
  
  getClients(partnerId?: string): Promise<Client[]>;
  getClient(id: string): Promise<Client | null>;
  getClientWithPartner(id: string): Promise<(Client & { partner?: Partner }) | null>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<InsertClient>): Promise<Client | null>;
  deleteClient(id: string): Promise<{ success: boolean; error?: string }>;
  
  getInvoices(role: UserRole, partnerId?: string, clientId?: string): Promise<(Invoice & { calculations?: InvoiceCalculation; partner?: Partner; client?: Client })[]>;
  getInvoice(id: string): Promise<(Invoice & { calculations?: InvoiceCalculation; partner?: Partner; client?: Client }) | null>;
  createInvoice(invoice: InsertInvoice, calculations: Partial<InvoiceCalculation>): Promise<Invoice>;
  updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice | null>;
  updateInvoiceCalculations(invoiceId: string, calculations: Partial<InvoiceCalculation>): Promise<InvoiceCalculation | null>;
  deleteInvoice(id: string): Promise<void>;
  
  getInvoiceExpenses(invoiceId: string): Promise<InvoiceExpense[]>;
  createInvoiceExpense(expense: InsertInvoiceExpense): Promise<InvoiceExpense>;
  updateInvoiceExpense(id: string, updates: Partial<InsertInvoiceExpense>): Promise<InvoiceExpense | null>;
  deleteInvoiceExpense(id: string): Promise<void>;
  
  deleteDocument(id: string): Promise<void>;
  
  getPartnerPayments(partnerId?: string): Promise<PartnerPayment[]>;
  createPartnerPayment(payment: InsertPartnerPayment): Promise<PartnerPayment>;
  
  getAccessTokens(): Promise<AccessToken[]>;
  createAccessToken(code: string, role: UserRole, partnerId?: string, clientId?: string): Promise<AccessToken>;
  deleteAccessToken(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async verifyAccessCode(code: string): Promise<AccessToken | null> {
    const [token] = await db
      .select()
      .from(accessTokens)
      .where(and(
        eq(accessTokens.code, code),
        eq(accessTokens.isActive, true)
      ))
      .limit(1);
    
    if (token) {
      await db.update(accessTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(accessTokens.id, token.id));
    }
    
    return token || null;
  }

  async createSession(tokenId: string, ipAddress?: string, userAgent?: string): Promise<{ sessionId: string; csrfToken: string; expiresAt: Date }> {
    const sessionId = randomBytes(32).toString('base64');
    const csrfToken = randomBytes(32).toString('base64');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    await db.insert(userSessions).values({
      sessionId,
      accessTokenId: tokenId,
      csrfToken,
      ipAddress,
      userAgent,
      expiresAt,
    });
    
    return { sessionId, csrfToken, expiresAt };
  }

  async validateSession(sessionId: string, csrfToken?: string): Promise<{ isValid: boolean; token?: AccessToken } | null> {
    const [session] = await db
      .select()
      .from(userSessions)
      .where(and(
        eq(userSessions.sessionId, sessionId),
        eq(userSessions.revoked, false),
        gte(userSessions.expiresAt, new Date())
      ))
      .limit(1);
    
    if (!session) {
      return { isValid: false };
    }
    
    if (csrfToken && session.csrfToken !== csrfToken) {
      return { isValid: false };
    }
    
    await db.update(userSessions)
      .set({ lastActivity: new Date() })
      .where(eq(userSessions.id, session.id));
    
    const [token] = await db
      .select()
      .from(accessTokens)
      .where(and(
        eq(accessTokens.id, session.accessTokenId),
        eq(accessTokens.isActive, true)
      ))
      .limit(1);
    
    if (!token) {
      return { isValid: false };
    }
    
    return { isValid: true, token };
  }

  async refreshSession(sessionId: string): Promise<Date | null> {
    const newExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    const result = await db.update(userSessions)
      .set({ 
        expiresAt: newExpiresAt,
        lastActivity: new Date()
      })
      .where(and(
        eq(userSessions.sessionId, sessionId),
        eq(userSessions.revoked, false),
        gte(userSessions.expiresAt, new Date())
      ))
      .returning();
    
    return result.length > 0 ? newExpiresAt : null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await db.update(userSessions)
      .set({ revoked: true })
      .where(eq(userSessions.sessionId, sessionId));
  }

  async getPartners(): Promise<Partner[]> {
    return db.select().from(partners).orderBy(partners.name);
  }

  async getPartner(id: string): Promise<Partner | null> {
    const [partner] = await db.select().from(partners).where(eq(partners.id, id)).limit(1);
    return partner || null;
  }

  async createPartner(partner: InsertPartner): Promise<Partner> {
    const [created] = await db.insert(partners).values(partner).returning();
    return created;
  }

  async updatePartner(id: string, partner: Partial<InsertPartner>): Promise<Partner | null> {
    const [updated] = await db.update(partners)
      .set({ ...partner, updatedAt: new Date() })
      .where(eq(partners.id, id))
      .returning();
    return updated || null;
  }

  async deletePartner(id: string): Promise<{ success: boolean; error?: string }> {
    const linkedInvoices = await db.select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.partnerId, id))
      .limit(1);
    
    if (linkedInvoices.length > 0) {
      return { success: false, error: "Нельзя удалить партнёра: есть связанные счета" };
    }
    
    const linkedClients = await db.select({ id: clients.id })
      .from(clients)
      .where(eq(clients.partnerId, id))
      .limit(1);
    
    if (linkedClients.length > 0) {
      return { success: false, error: "Нельзя удалить партнёра: есть связанные клиенты" };
    }
    
    await db.delete(accessTokens).where(eq(accessTokens.partnerId, id));
    await db.delete(partners).where(eq(partners.id, id));
    
    return { success: true };
  }

  async getPartnerClients(partnerId: string): Promise<Client[]> {
    return db.select().from(clients).where(eq(clients.partnerId, partnerId)).orderBy(clients.name);
  }

  async getClients(partnerId?: string): Promise<Client[]> {
    if (partnerId) {
      return db.select().from(clients).where(eq(clients.partnerId, partnerId)).orderBy(clients.name);
    }
    return db.select().from(clients).orderBy(clients.name);
  }

  async getClient(id: string): Promise<Client | null> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    return client || null;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [created] = await db.insert(clients).values(client).returning();
    return created;
  }

  async updateClient(id: string, client: Partial<InsertClient>): Promise<Client | null> {
    const [updated] = await db.update(clients)
      .set({ ...client, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return updated || null;
  }

  async getClientWithPartner(id: string): Promise<(Client & { partner?: Partner }) | null> {
    const [result] = await db
      .select({
        client: clients,
        partner: partners,
      })
      .from(clients)
      .leftJoin(partners, eq(clients.partnerId, partners.id))
      .where(eq(clients.id, id))
      .limit(1);
    
    if (!result) return null;
    
    return {
      ...result.client,
      partner: result.partner || undefined,
    };
  }

  async deleteClient(id: string): Promise<{ success: boolean; error?: string }> {
    const linkedInvoices = await db.select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.clientId, id))
      .limit(1);
    
    if (linkedInvoices.length > 0) {
      return { success: false, error: "Нельзя удалить клиента: есть связанные счета" };
    }
    
    await db.delete(accessTokens).where(eq(accessTokens.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
    
    return { success: true };
  }

  async getInvoices(role: UserRole, partnerId?: string, clientId?: string): Promise<(Invoice & { calculations?: InvoiceCalculation; partner?: Partner; client?: Client })[]> {
    const baseQuery = db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partner: partners,
        client: clients,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .orderBy(desc(invoices.createdAt));
    
    let results;
    if (partnerId) {
      results = await baseQuery.where(eq(invoices.partnerId, partnerId));
    } else if (role === 'client' && clientId) {
      results = await baseQuery.where(eq(invoices.clientId, clientId));
    } else {
      results = await baseQuery;
    }
    
    return results.map(r => ({
      ...r.invoice,
      calculations: r.calculations || undefined,
      partner: r.partner || undefined,
      client: r.client || undefined,
    }));
  }

  async getInvoice(id: string): Promise<(Invoice & { calculations?: InvoiceCalculation; partner?: Partner; client?: Client }) | null> {
    const [result] = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partner: partners,
        client: clients,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(eq(invoices.id, id))
      .limit(1);
    
    if (!result) return null;
    
    return {
      ...result.invoice,
      calculations: result.calculations || undefined,
      partner: result.partner || undefined,
      client: result.client || undefined,
    };
  }

  async createInvoice(invoice: InsertInvoice, calculations: Partial<InvoiceCalculation>): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    
    await db.insert(invoiceCalculations).values({
      invoiceId: created.id,
      clientBill: calculations.clientBill || "0",
      commissionRate: calculations.commissionRate,
      commissionAmount: calculations.commissionAmount,
      amountToAdmin: calculations.amountToAdmin,
      agencyMargin: calculations.agencyMargin,
      partnerShareFromMargin: calculations.partnerShareFromMargin,
      adminShareFromMargin: calculations.adminShareFromMargin,
      clientBaseAfterMargin: calculations.clientBaseAfterMargin,
      clientRemaining: calculations.clientRemaining,
      executorExpensesTotal: calculations.executorExpensesTotal || "0",
      netProfitAdmin: calculations.netProfitAdmin,
      adminShare50: calculations.adminShare50,
      catShare50: calculations.catShare50,
    });
    
    return created;
  }

  async updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice | null> {
    const [updated] = await db.update(invoices)
      .set({ ...invoice, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return updated || null;
  }

  async updateInvoiceCalculations(invoiceId: string, calculations: Partial<InvoiceCalculation>): Promise<InvoiceCalculation | null> {
    const [existing] = await db
      .select()
      .from(invoiceCalculations)
      .where(eq(invoiceCalculations.invoiceId, invoiceId))
      .limit(1);
    
    if (existing) {
      const [updated] = await db.update(invoiceCalculations)
        .set({ ...calculations, updatedAt: new Date() })
        .where(eq(invoiceCalculations.invoiceId, invoiceId))
        .returning();
      return updated || null;
    } else {
      const [created] = await db.insert(invoiceCalculations)
        .values({
          invoiceId,
          clientBill: calculations.clientBill || "0",
          ...calculations,
        })
        .returning();
      return created;
    }
  }

  async getInvoiceExpenses(invoiceId: string): Promise<InvoiceExpense[]> {
    return db
      .select()
      .from(invoiceExpenses)
      .where(eq(invoiceExpenses.invoiceId, invoiceId))
      .orderBy(desc(invoiceExpenses.date));
  }

  async createInvoiceExpense(expense: InsertInvoiceExpense): Promise<InvoiceExpense> {
    const [created] = await db.insert(invoiceExpenses).values(expense).returning();
    
    const expenses = await this.getInvoiceExpenses(expense.invoiceId);
    const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    await db.update(invoiceCalculations)
      .set({ 
        executorExpensesTotal: total.toString(),
        updatedAt: new Date()
      })
      .where(eq(invoiceCalculations.invoiceId, expense.invoiceId));
    
    return created;
  }

  async updateInvoiceExpense(id: string, updates: Partial<InsertInvoiceExpense>): Promise<InvoiceExpense | null> {
    const [expense] = await db
      .select()
      .from(invoiceExpenses)
      .where(eq(invoiceExpenses.id, id))
      .limit(1);
    
    if (!expense) return null;
    
    const [updated] = await db.update(invoiceExpenses)
      .set(updates)
      .where(eq(invoiceExpenses.id, id))
      .returning();
    
    const expenses = await this.getInvoiceExpenses(expense.invoiceId);
    const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    await db.update(invoiceCalculations)
      .set({ 
        executorExpensesTotal: total.toString(),
        updatedAt: new Date()
      })
      .where(eq(invoiceCalculations.invoiceId, expense.invoiceId));
    
    return updated || null;
  }

  async deleteInvoiceExpense(id: string): Promise<void> {
    const [expense] = await db
      .select()
      .from(invoiceExpenses)
      .where(eq(invoiceExpenses.id, id))
      .limit(1);
    
    if (expense) {
      await db.delete(invoiceExpenses).where(eq(invoiceExpenses.id, id));
      
      const expenses = await this.getInvoiceExpenses(expense.invoiceId);
      const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      
      await db.update(invoiceCalculations)
        .set({ 
          executorExpensesTotal: total.toString(),
          updatedAt: new Date()
        })
        .where(eq(invoiceCalculations.invoiceId, expense.invoiceId));
    }
  }

  async deleteInvoice(id: string): Promise<void> {
    await db.delete(invoiceExpenses).where(eq(invoiceExpenses.invoiceId, id));
    await db.delete(invoiceCalculations).where(eq(invoiceCalculations.invoiceId, id));
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  async deleteDocument(id: string): Promise<void> {
    await db.execute(sql`DELETE FROM invoice_documents WHERE id = ${id}`);
  }

  async getPartnerPayments(partnerId?: string): Promise<PartnerPayment[]> {
    if (partnerId) {
      return db.select().from(partnerPayments)
        .where(eq(partnerPayments.partnerId, partnerId))
        .orderBy(desc(partnerPayments.paymentDate));
    }
    return db.select().from(partnerPayments).orderBy(desc(partnerPayments.paymentDate));
  }

  async createPartnerPayment(payment: InsertPartnerPayment): Promise<PartnerPayment> {
    const [created] = await db.insert(partnerPayments).values(payment).returning();
    return created;
  }

  async getAccessTokens(): Promise<AccessToken[]> {
    return db.select().from(accessTokens).orderBy(accessTokens.createdAt);
  }

  async createAccessToken(code: string, role: UserRole, partnerId?: string, clientId?: string): Promise<AccessToken> {
    const [created] = await db.insert(accessTokens).values({
      code,
      role,
      partnerId,
      clientId,
    }).returning();
    return created;
  }

  async deleteAccessToken(id: string): Promise<void> {
    await db.delete(accessTokens).where(eq(accessTokens.id, id));
  }
}

export const storage = new DatabaseStorage();
