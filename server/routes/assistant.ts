import { Router, Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { invoices, invoiceCalculations, partners, clients } from "../../shared/schema";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";

export const assistantRouter = Router();

assistantRouter.get(
  "/api/assistant/stats-invoices",
  authMiddleware,
  requireRole("admin", "assistant"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const yearParam = req.query.year;
      const year = Number(yearParam);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        return res.status(400).json({ error: "Invalid or missing year" });
      }

      const excludeHidden = req.user?.role === "assistant";

      const conditions = [
        eq(invoices.status, "paid"),
        sql`extract(year from ${invoices.actualPaymentDate}) = ${year}`,
      ];
      if (excludeHidden) {
        conditions.push(eq(invoices.hideFromAssistant, false));
      }

      const rows = await db
        .select({
          id: invoices.id,
          invoice_number: invoices.invoiceNumber,
          client_id: invoices.clientId,
          partner_id: invoices.partnerId,
          scheme: invoices.scheme,
          status: invoices.status,
          actual_payment_date: invoices.actualPaymentDate,
          created_at: invoices.createdAt,
          client_bill: invoiceCalculations.clientBill,
          executor_expenses_total: invoiceCalculations.executorExpensesTotal,
          client_spent: invoiceCalculations.clientSpent,
          agency_margin: invoiceCalculations.agencyMargin,
          partner_share_from_margin: invoiceCalculations.partnerShareFromMargin,
          commission_amount: invoiceCalculations.commissionAmount,
          assistant_bonus_total: invoiceCalculations.assistantBonusActs,
          partner_name: partners.name,
          client_name: clients.name,
        })
        .from(invoices)
        .leftJoin(invoiceCalculations, eq(invoiceCalculations.invoiceId, invoices.id))
        .leftJoin(partners, eq(invoices.partnerId, partners.id))
        .leftJoin(clients, eq(invoices.clientId, clients.id))
        .where(and(...conditions))
        .orderBy(invoices.actualPaymentDate);

      res.json(rows);
    } catch (error) {
      console.error("Get assistant stats-invoices error:", error);
      res.status(500).json({ error: "Failed to load assistant stats invoices" });
    }
  }
);
