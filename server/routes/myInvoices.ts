import { Router, Response } from "express";
import { storage } from "../storage";
import { UserRole } from "../../shared/schema";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";
import { parseNum } from "../../shared/financialEngine";

export const myInvoicesRouter = Router();

const statusMap: Record<string, string> = { draft: "Черновик", sent: "Отправлен", paid: "Оплачен", cancelled: "Отменён" };
const schemeMap: Record<string, string> = { agency_30: "Агентство 30%", agency_40: "Агентство 40%", partner_10: "Партнёрское 10%", partner_15: "Партнёрское 15%", commission_based: "Партнёрское соглашение" };
const isAgency = (scheme?: string | null) => scheme === "agency_30" || scheme === "agency_40";

// Единый маршрут выгрузки счетов в Excel. Кнопка «Выгрузить в Excel» есть
// у ассистента, бухгалтера и админа. Раньше тот же путь обслуживался
// дублирующим хендлером в recurring.ts — он удалён.
// getInvoices сам отдаёт нужный срез по роли: admin — все, assistant — кроме
// скрытых (hideFromAssistant), accountant — только скрытые.
//
// Для АДМИНА выгрузка отражает все операции по счёту: приход, условия по
// партнёрскому соглашению, комиссию партнёру, траты, остаток клиента на дату
// и чистую прибыль админа. Для ассистента/бухгалтера остаётся безопасная
// раскладка без прибыли/комиссий — эти поля getInvoices по ролям не вырезает.
myInvoicesRouter.post("/api/my-invoices/export", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role as UserRole;
    const isAdmin = role === "admin";

    // exceljs is a CommonJS module — under esbuild's ESM bundle the real
    // exports land on `.default`, so `ExcelJS.Workbook` would be undefined.
    const ExcelJSModule: any = await import("exceljs");
    const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Invoice Management System";
    workbook.created = new Date();

    const invoices = await storage.getInvoices(role);
    const allClients = await storage.getClients();
    const clientMap = new Map(allClients.map(c => [c.id, c.name]));

    const sheet = workbook.addWorksheet("Счета");
    if (isAdmin) {
      // Полный финансовый отчёт для админа.
      sheet.columns = [
        { header: "Номер счёта", key: "number", width: 20 },
        { header: "Клиент", key: "client", width: 25 },
        { header: "Партнёр", key: "partner", width: 25 },
        { header: "Статус", key: "status", width: 14 },
        { header: "Условия (схема)", key: "scheme", width: 22 },
        { header: "Приход", key: "clientBill", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Комиссия партнёру", key: "partnerCommission", width: 20, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Траты по счёту", key: "expenses", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Остаток клиента (без партнёрских)", key: "clientRemaining", width: 28, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Чистая прибыль админа", key: "netProfit", width: 22, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Дата оплаты", key: "paymentDate", width: 14 },
        { header: "Примечание", key: "notes", width: 30 },
        { header: "Закрывающий документ", key: "closingDoc", width: 40 },
      ];
    } else {
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
    }
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

    for (const inv of invoices) {
      const calc = inv.calculations;
      const clientBill = parseNum(calc?.clientBill || inv.clientBill || "0");
      const actualExpenses = parseNum(calc?.executorExpensesTotal || "0");
      const common = {
        number: inv.invoiceNumber || "—",
        client: clientMap.get(inv.clientId || "") || "—",
        partner: inv.partner?.name || "—",
        status: statusMap[inv.status || ""] || inv.status,
        scheme: schemeMap[inv.scheme || ""] || inv.scheme || "—",
        clientBill,
        paymentDate: inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString("ru-RU") : "—",
        notes: inv.notes || "",
        closingDoc: (inv as any).closingDocumentUrl || "",
      };

      if (isAdmin) {
        // Комиссия партнёру и остаток клиента считаются по той же логике,
        // что и в storage.ts (агентские схемы vs закрытая комиссия).
        const partnerCommission = isAgency(inv.scheme)
          ? parseNum(calc?.partnerShareFromMargin || "0")
          : parseNum(calc?.commissionAmount || "0");
        const clientRemaining = isAgency(inv.scheme)
          ? parseNum(calc?.clientBaseAfterMargin || "0") - actualExpenses
          : parseNum(calc?.clientRemaining || "0");
        const netProfit = parseNum(calc?.netProfitAdmin || "0");
        sheet.addRow({
          ...common,
          partnerCommission,
          expenses: actualExpenses,
          clientRemaining,
          netProfit,
        });
      } else {
        const plannedExpenses = parseNum(inv.plannedExpenses || "0");
        const remaining = isAgency(inv.scheme)
          ? parseNum(calc?.clientBaseAfterMargin || "0") - actualExpenses
          : clientBill - actualExpenses;
        sheet.addRow({
          ...common,
          plannedExpenses: plannedExpenses || 0,
          actualExpenses,
          remaining,
        });
      }
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
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=export_${role}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.send(Buffer.from(buffer as ArrayBuffer));
  } catch (error) {
    console.error("My invoices export error:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});
