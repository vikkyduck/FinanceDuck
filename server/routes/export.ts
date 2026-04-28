import { Router, Response } from "express";
import { storage } from "../storage";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";

export const exportRouter = Router();

exportRouter.post("/api/admin/export", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Invoice Management System";
    workbook.created = new Date();

    const { exportTypes = ["invoices"], dateFrom, dateTo, actualDateFrom, actualDateTo, statuses = [], partnerIds = [] } = req.body;

    const allInvoices = await storage.getInvoices("admin");
    const allClients = await storage.getClients();
    const allPartners = await storage.getPartners();
    const allExpenses = await storage.getAllExpenses();

    let filteredInvoices = allInvoices;
    if (statuses.length > 0) filteredInvoices = filteredInvoices.filter(inv => statuses.includes(inv.status));
    if (partnerIds.length > 0) filteredInvoices = filteredInvoices.filter(inv => inv.partnerId && partnerIds.includes(inv.partnerId));
    if (dateFrom) { const fromDate = new Date(dateFrom); filteredInvoices = filteredInvoices.filter(inv => inv.paymentDate && new Date(inv.paymentDate) >= fromDate); }
    if (dateTo) { const toDate = new Date(dateTo); filteredInvoices = filteredInvoices.filter(inv => inv.paymentDate && new Date(inv.paymentDate) <= toDate); }
    if (actualDateFrom) { const fromDate = new Date(actualDateFrom); filteredInvoices = filteredInvoices.filter(inv => inv.actualPaymentDate && new Date(inv.actualPaymentDate) >= fromDate); }
    if (actualDateTo) { const toDate = new Date(actualDateTo); filteredInvoices = filteredInvoices.filter(inv => inv.actualPaymentDate && new Date(inv.actualPaymentDate) <= toDate); }

    if (exportTypes.includes("invoices")) {
      const sheet = workbook.addWorksheet("Счета");
      sheet.columns = [
        { header: "Номер", key: "number", width: 15 },
        { header: "Клиент", key: "client", width: 25 },
        { header: "Партнёр", key: "partner", width: 25 },
        { header: "Статус", key: "status", width: 12 },
        { header: "Сумма клиента", key: "clientBill", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Схема", key: "scheme", width: 15 },
        { header: "Комиссия %", key: "commissionRate", width: 12 },
        { header: "Комиссия", key: "commissionAmount", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Расходы", key: "expenses", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Чистая прибыль", key: "netProfit", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Долг партнёра", key: "partnerDebt", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Остаток клиента", key: "clientRemaining", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "План. дата", key: "paymentDate", width: 14 },
        { header: "Факт. дата", key: "actualPaymentDate", width: 14 },
        { header: "Примечание", key: "notes", width: 30 },
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      const statusMap: Record<string, string> = { draft: "Черновик", sent: "Отправлен", paid: "Оплачен", cancelled: "Отменён" };
      const schemeMap: Record<string, string> = { partner_10: "Партнёр 10%", partner_15: "Партнёр 15%", agency_30: "Агентский 30%", commission_based: "Комиссионный" };
      for (const inv of filteredInvoices) {
        const client = allClients.find(c => c.id === inv.clientId);
        const partner = allPartners.find(p => p.id === inv.partnerId);
        const calc = inv.calculations;
        sheet.addRow({ number: inv.invoiceNumber, client: client?.name || "", partner: partner?.name || "", status: statusMap[inv.status] || inv.status, clientBill: Number(calc?.clientBill || inv.clientBill || 0), scheme: schemeMap[inv.scheme] || inv.scheme, commissionRate: calc?.commissionRate ? `${calc.commissionRate}%` : "", commissionAmount: Number(calc?.commissionAmount || 0), expenses: Number(calc?.executorExpensesTotal || 0), netProfit: Number(calc?.netProfitAdmin || 0), partnerDebt: Number(calc?.partnerTransferDue || 0), clientRemaining: Number(calc?.clientRemaining || 0), paymentDate: inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString("ru-RU") : "", actualPaymentDate: inv.actualPaymentDate ? new Date(inv.actualPaymentDate).toLocaleDateString("ru-RU") : "", notes: inv.notes || "" });
      }
    }

    if (exportTypes.includes("clients")) {
      const sheet = workbook.addWorksheet("Клиенты");
      sheet.columns = [
        { header: "Название", key: "name", width: 30 },
        { header: "Контактное лицо", key: "contact", width: 25 },
        { header: "Email", key: "email", width: 25 },
        { header: "Телефон", key: "phone", width: 18 },
        { header: "Счетов", key: "invoicesCount", width: 10 },
        { header: "Общая сумма", key: "totalBilled", width: 18, style: { numFmt: "#,##0.00 ₽" } },
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      for (const client of allClients) {
        const clientInvoices = allInvoices.filter(inv => inv.clientId === client.id);
        const totalBilled = clientInvoices.reduce((sum, inv) => sum + Number(inv.calculations?.clientBill || inv.clientBill || 0), 0);
        sheet.addRow({ name: client.name, contact: "", email: client.email || "", phone: client.phone || "", invoicesCount: clientInvoices.length, totalBilled });
      }
    }

    if (exportTypes.includes("partners")) {
      const sheet = workbook.addWorksheet("Партнёры");
      sheet.columns = [
        { header: "Название", key: "name", width: 30 },
        { header: "Email", key: "email", width: 25 },
        { header: "Телефон", key: "phone", width: 18 },
        { header: "Счетов (всего)", key: "invoicesCount", width: 12 },
        { header: "Счетов (оплач.)", key: "paidCount", width: 12 },
        { header: "Комиссия (оплач.)", key: "paidCommission", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Должен перевести", key: "totalToTransfer", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Уже оплатил", key: "totalPaid", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Остаток долга", key: "remaining", width: 18, style: { numFmt: "#,##0.00 ₽" } },
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      const partnerDebts = await storage.getPartnerDebtSummaries();
      for (const pd of partnerDebts) {
        sheet.addRow({ name: pd.partnerName, email: pd.email || "", phone: pd.phone || "", invoicesCount: pd.totalInvoiceCount, paidCount: pd.invoiceCount, paidCommission: pd.paidCommission, totalToTransfer: pd.totalToTransfer, totalPaid: pd.totalPaid, remaining: pd.remaining });
      }
    }

    if (exportTypes.includes("expenses")) {
      const sheet = workbook.addWorksheet("Расходы");
      sheet.columns = [
        { header: "Номер счёта", key: "invoiceNumber", width: 15 },
        { header: "Клиент", key: "client", width: 25 },
        { header: "Описание", key: "description", width: 35 },
        { header: "Сумма", key: "amount", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Оплатил", key: "paidBy", width: 15 },
        { header: "Дата", key: "date", width: 14 },
        { header: "Примечание", key: "notes", width: 30 },
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      for (const expense of allExpenses) {
        const invoice = allInvoices.find(inv => inv.id === expense.invoiceId);
        const client = allClients.find(c => c.id === invoice?.clientId);
        sheet.addRow({ invoiceNumber: invoice?.invoiceNumber || "—", client: client?.name || "—", description: expense.description || "—", amount: Number(expense.amount || 0), paidBy: expense.paidByAdmin ? "Администратор" : expense.paidByPartner ? "Партнёр" : "—", date: expense.date ? new Date(expense.date).toLocaleDateString("ru-RU") : "—", notes: expense.notes || "" });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=export_${new Date().toISOString().split("T")[0]}.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Export error:", error);
    res.status(500).json({ error: error.message || "Failed to export data" });
  }
});

exportRouter.post("/api/admin/export/client-report", authMiddleware, requireRole("admin", "partner", "client"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId, clientId, dateFrom, dateTo } = req.body;

    // Clients always download their own data — no body params needed from them
    if (req.user?.role !== "client" && !invoiceId && !clientId) {
      return res.status(400).json({ error: "invoiceId или clientId обязателен" });
    }

    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Invoice Management System";
    workbook.created = new Date();

    const allInvoices = await storage.getInvoices("admin");
    const allClients = await storage.getClients();

    let invoices = allInvoices;
    if (invoiceId) {
      invoices = allInvoices.filter(inv => inv.id === invoiceId);
    } else if (clientId) {
      invoices = allInvoices.filter(inv => inv.clientId === clientId);
    }

    // Partners may only download reports for invoices assigned to them
    if (req.user?.role === "partner") {
      const partnerOwnId = req.user.partnerId;
      if (!partnerOwnId) {
        return res.status(403).json({ error: "Партнёр не идентифицирован" });
      }
      invoices = invoices.filter(inv => inv.partnerId === partnerOwnId);
      if (invoices.length === 0) {
        return res.status(403).json({ error: "Нет доступа к этому счёту или клиенту" });
      }
    }

    // Clients may only download their own data
    if (req.user?.role === "client") {
      const ownClientId = req.user.clientId;
      if (!ownClientId) {
        return res.status(403).json({ error: "Клиент не идентифицирован" });
      }
      invoices = invoices.filter(inv => inv.clientId === ownClientId);
      // If a specific invoiceId was supplied, ensure it belongs to this client
      if (invoiceId && invoices.length === 0) {
        return res.status(403).json({ error: "Нет доступа к этому счёту" });
      }
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      invoices = invoices.filter(inv => inv.paymentDate && new Date(inv.paymentDate) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      invoices = invoices.filter(inv => inv.paymentDate && new Date(inv.paymentDate) <= to);
    }

    invoices = invoices.filter(inv => inv.status !== "cancelled");

    const clientName = (() => {
      if (invoiceId && invoices.length > 0) {
        return allClients.find(c => c.id === invoices[0].clientId)?.name || "клиент";
      }
      if (clientId) {
        return allClients.find(c => c.id === clientId)?.name || "клиент";
      }
      return "клиент";
    })();

    const statusMap: Record<string, string> = { draft: "Черновик", sent: "Отправлен", paid: "Оплачен", cancelled: "Отменён" };

    const agencyInvoices = invoices.filter(inv => inv.scheme === "agency_30" || inv.scheme === "agency_40");
    const closedInvoices = invoices.filter(inv => inv.scheme !== "agency_30" && inv.scheme !== "agency_40");

    if (agencyInvoices.length > 0) {
      const sheet = workbook.addWorksheet("Открытая комиссия");
      sheet.columns = [
        { header: "Номер счёта", key: "number", width: 18 },
        { header: "Статус", key: "status", width: 14 },
        { header: "Сумма счёта", key: "clientBill", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Комиссия агентства %", key: "commissionRate", width: 22 },
        { header: "Сумма комиссии", key: "commissionAmount", width: 20, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Бюджет после комиссии", key: "budgetAfterMargin", width: 24, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Расходы", key: "expenses", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Остаток", key: "remaining", width: 18, style: { numFmt: "#,##0.00 ₽" } },
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

      for (const inv of agencyInvoices) {
        const calc = inv.calculations;
        const clientBill = Number(calc?.clientBill || inv.clientBill || 0);
        const marginRate = inv.scheme === "agency_30" ? 30 : 40;
        const commissionAmount = Number(calc?.agencyMargin || clientBill * (marginRate / 100));
        const budgetAfterMargin = Number(calc?.clientBaseAfterMargin || clientBill * (1 - marginRate / 100));
        const expenses = Number(calc?.executorExpensesTotal || 0);
        const remaining = Number(calc?.clientRemaining ?? (budgetAfterMargin - expenses));
        sheet.addRow({
          number: inv.invoiceNumber || "—",
          status: statusMap[inv.status] || inv.status,
          clientBill,
          commissionRate: `${marginRate}%`,
          commissionAmount,
          budgetAfterMargin,
          expenses,
          remaining,
        });
      }
    }

    if (closedInvoices.length > 0) {
      const sheet = workbook.addWorksheet("Бюджет и расходы");
      sheet.columns = [
        { header: "Номер счёта", key: "number", width: 18 },
        { header: "Статус", key: "status", width: 14 },
        { header: "Бюджет клиента", key: "clientBill", width: 20, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Расходы", key: "expenses", width: 18, style: { numFmt: "#,##0.00 ₽" } },
        { header: "Остаток", key: "remaining", width: 18, style: { numFmt: "#,##0.00 ₽" } },
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

      for (const inv of closedInvoices) {
        const calc = inv.calculations;
        const clientBill = Number(calc?.clientBill || inv.clientBill || 0);
        const expenses = Number(calc?.executorExpensesTotal || 0);
        const remaining = Number(calc?.clientRemaining ?? (clientBill - expenses));
        sheet.addRow({
          number: inv.invoiceNumber || "—",
          status: statusMap[inv.status] || inv.status,
          clientBill,
          expenses,
          remaining,
        });
      }
    }

    if (agencyInvoices.length === 0 && closedInvoices.length === 0) {
      const sheet = workbook.addWorksheet("Отчёт");
      sheet.addRow(["Нет данных для отображения"]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeClientName = clientName.replace(/[^a-zA-Zа-яА-Я0-9_\- ]/g, "").trim().replace(/\s+/g, "_");
    const safeDate = (d: string) => d.replace(/[^0-9\-]/g, "").slice(0, 10);
    const dateSuffix = dateFrom && dateTo
      ? `_${safeDate(dateFrom)}_${safeDate(dateTo)}`
      : dateFrom
      ? `_${safeDate(dateFrom)}`
      : dateTo
      ? `_${safeDate(dateTo)}`
      : `_${new Date().toISOString().split("T")[0]}`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=client_report_${safeClientName}${dateSuffix}.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Client report export error:", error);
    res.status(500).json({ error: error.message || "Failed to generate client report" });
  }
});
