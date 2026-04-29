import { Router, Response } from "express";
import { storage } from "../storage";
import { UserRole } from "../../shared/schema";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";
import { parseNum } from "../../shared/financialEngine";

export const recurringRouter = Router();

recurringRouter.get("/api/recurring-invoices", authMiddleware, requireRole("admin", "assistant"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getRecurringInvoices()); }
  catch (error) { console.error("Get recurring invoices error:", error); res.status(500).json({ error: "Failed to get recurring invoices" }); }
});

recurringRouter.post("/api/recurring-invoices", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { clientId, partnerId, scheme, partnerCommissionRate, amount, description, frequency, dayOfMonth, startDate, endDate, nextInvoiceDate, notes, hideFromAssistant } = req.body;
    const created = await storage.createRecurringInvoice({ clientId, partnerId, scheme, partnerCommissionRate: partnerCommissionRate ? partnerCommissionRate.toString() : null, amount: amount?.toString() || "0", description, frequency: frequency || "monthly", dayOfMonth: dayOfMonth?.toString() || "1", startDate: startDate || new Date().toISOString().split("T")[0], endDate: endDate || null, nextInvoiceDate: nextInvoiceDate || startDate, notes, hideFromAssistant: hideFromAssistant ?? false, createdBy: req.user!.token.id });
    res.status(201).json(created);
  } catch (error) { console.error("Create recurring invoice error:", error); res.status(500).json({ error: "Failed to create recurring invoice" }); }
});

recurringRouter.get("/api/recurring-invoices/due", authMiddleware, requireRole("admin", "assistant"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getDueRecurringInvoices()); }
  catch (error) { console.error("Get due recurring invoices error:", error); res.status(500).json({ error: "Failed to get due recurring invoices" }); }
});

recurringRouter.post("/api/recurring-invoices/process", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.processAllDueRecurringInvoices()); }
  catch (error) { console.error("Process recurring invoices error:", error); res.status(500).json({ error: "Failed to process recurring invoices" }); }
});

recurringRouter.get("/api/recurring-invoices/cashflow", authMiddleware, requireRole("admin", "assistant"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getActiveRecurringInvoicesForCashFlow()); }
  catch (error) { console.error("Get recurring for cashflow error:", error); res.status(500).json({ error: "Failed to get recurring invoices for cashflow" }); }
});

recurringRouter.post("/api/recurring-invoices/:id/create-draft", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { invoiceDate } = req.body;
    res.status(201).json(await storage.createDraftFromRecurring(id, invoiceDate));
  } catch (error: any) { console.error("Create draft from recurring error:", error); res.status(500).json({ error: error.message || "Failed to create draft" }); }
});

recurringRouter.post("/api/recurring-invoices/:id/backdate", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { fromDate } = req.body;
    if (!fromDate) return res.status(400).json({ error: "fromDate is required" });
    res.json(await storage.generateBackdatedInvoices(id, fromDate));
  } catch (error: any) { console.error("Generate backdated invoices error:", error); res.status(500).json({ error: error.message || "Failed to generate backdated invoices" }); }
});

recurringRouter.patch("/api/recurring-invoices/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await storage.updateRecurringInvoice(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Recurring invoice not found" });
    res.json(updated);
  } catch (error) { console.error("Update recurring invoice error:", error); res.status(500).json({ error: "Failed to update recurring invoice" }); }
});

recurringRouter.delete("/api/recurring-invoices/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try { await storage.deleteRecurringInvoice(req.params.id); res.json({ success: true }); }
  catch (error) { console.error("Delete recurring invoice error:", error); res.status(500).json({ error: "Failed to delete recurring invoice" }); }
});

// My invoices export (assistant/accountant)
recurringRouter.post("/api/my-invoices/export", authMiddleware, requireRole("assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Invoice Management System";
    workbook.created = new Date();
    const role = req.user?.role as UserRole;
    const invoices = await storage.getInvoices(role);
    const allClients = await storage.getClients();
    const clientMap = new Map(allClients.map(c => [c.id, c.name]));
    const statusMap: Record<string, string> = { draft: "Черновик", sent: "Отправлен", paid: "Оплачен", cancelled: "Отменён" };
    const schemeMap: Record<string, string> = { agency_30: "Агентство 30%", agency_40: "Агентство 40%", partner_10: "Партнёрское 10%", partner_15: "Партнёрское 15%", commission_based: "Партнёрское соглашение" };
    const sheet = workbook.addWorksheet("Счета");
    sheet.columns = [
      { header: "Номер счёта", key: "number", width: 20 },
      { header: "Клиент", key: "client", width: 25 },
      { header: "Статус", key: "status", width: 14 },
      { header: "Схема", key: "scheme", width: 22 },
      { header: "Сумма клиенту", key: "clientBill", width: 18, style: { numFmt: "#,##0.00 ₽" } },
      { header: "План. расходы", key: "plannedExpenses", width: 18, style: { numFmt: "#,##0.00 ₽" } },
      { header: "Факт. расходы", key: "actualExpenses", width: 18, style: { numFmt: "#,##0.00 ₽" } },
      { header: "Остаток", key: "remaining", width: 18, style: { numFmt: "#,##0.00 ₽" } },
      { header: "Дата оплаты", key: "paymentDate", width: 14 },
      { header: "Примечание", key: "notes", width: 30 },
      { header: "Закрывающий документ", key: "closingDoc", width: 40 },
    ];
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    for (const inv of invoices) {
      const clientBill = parseNum(inv.calculations?.clientBill || inv.clientBill || "0");
      const actualExpenses = parseNum(inv.calculations?.executorExpensesTotal || "0");
      const plannedExpenses = parseNum(inv.plannedExpenses || "0");
      let remaining: number;
      if (inv.calculations?.clientRemaining != null) {
        remaining = parseNum(inv.calculations.clientRemaining);
      } else if (inv.scheme === "agency_30" || inv.scheme === "agency_40") {
        remaining = parseNum(inv.calculations?.clientBaseAfterMargin || "0") - actualExpenses;
      } else {
        remaining = clientBill - actualExpenses;
      }
      sheet.addRow({ number: inv.invoiceNumber || "—", client: clientMap.get(inv.clientId || "") || "—", status: statusMap[inv.status || ""] || inv.status, scheme: schemeMap[inv.scheme || ""] || inv.scheme || "—", clientBill, plannedExpenses: plannedExpenses || 0, actualExpenses, remaining, paymentDate: inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString("ru-RU") : "—", notes: inv.notes || "", closingDoc: (inv as any).closingDocumentUrl || "" });
    }
    const expSheet = workbook.addWorksheet("Расходы");
    expSheet.columns = [
      { header: "Номер счёта", key: "invoiceNumber", width: 20 },
      { header: "Клиент", key: "client", width: 25 },
      { header: "Описание расхода", key: "description", width: 30 },
      { header: "Сумма", key: "amount", width: 18, style: { numFmt: "#,##0.00 ₽" } },
      { header: "Дата", key: "date", width: 14 },
      { header: "Оплачено админом", key: "paidByAdmin", width: 16 },
    ];
    const expHeaderRow = expSheet.getRow(1);
    expHeaderRow.font = { bold: true };
    expHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    for (const inv of invoices) {
      const expenses = await storage.getInvoiceExpenses(inv.id);
      for (const exp of expenses) {
        expSheet.addRow({ invoiceNumber: inv.invoiceNumber || "—", client: clientMap.get(inv.clientId || "") || "—", description: exp.description || "—", amount: parseNum(exp.amount || "0"), date: exp.date ? new Date(exp.date).toLocaleDateString("ru-RU") : "—", paidByAdmin: exp.paidByAdmin ? "Да" : "Нет" });
      }
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const roleLabel = role === "accountant" ? "accountant" : "assistant";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=export_${roleLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.send(Buffer.from(buffer as ArrayBuffer));
  } catch (error) { console.error("Export my invoices error:", error); res.status(500).json({ error: "Failed to export data" }); }
});
