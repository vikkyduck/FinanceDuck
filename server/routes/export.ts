import { readClientReportInvoices } from '../services/clientReportQuery';
import { CommandError } from '../lib/commandError';
import { z } from "zod";
import type { AuthMiddleware } from "../middleware";
import { Router, Response } from "express";
import fs from "fs";
import path from "path";
import { invoiceQueryInput } from "../invoiceQuery";
import type { ExportStore } from "../routeStores";
import { AuthenticatedRequest, requireRole } from "../middleware";
import { formatMoney, formatDate, formatDateTime } from "../lib/format";

export function createExportRouter(storage: ExportStore, authMiddleware: AuthMiddleware) {
const exportRouter = Router();

// Резолвим путь к TTF-шрифту с поддержкой кириллицы. При запуске через tsx
// __dirname указывает на server/routes/, при esbuild-бандле — на dist-server/.
// Файлы лежат в server/assets/, поэтому проверяем несколько кандидатов.
const FONT_CANDIDATES = [
  path.join(import.meta.dirname || "", "..", "assets", "DejaVuSans.ttf"),
  path.join(import.meta.dirname || "", "..", "server", "assets", "DejaVuSans.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];
const FONT_BOLD_CANDIDATES = [
  path.join(import.meta.dirname || "", "..", "assets", "DejaVuSans-Bold.ttf"),
  path.join(import.meta.dirname || "", "..", "server", "assets", "DejaVuSans-Bold.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
];
const findFont = (cands: string[]) => cands.find(p => p && fs.existsSync(p)) || null;

exportRouter.post("/api/admin/export", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = invoiceQueryInput.pick({ invoiceId: true, clientId: true, dateFrom: true, dateTo: true }).extend({
      exportTypes: z.array(z.enum(['invoices', 'clients', 'partners', 'expenses'])).min(1).default(['invoices']),
      actualDateFrom: z.string().date().optional(), actualDateTo: z.string().date().optional(),
      statuses: z.array(z.enum(['draft', 'sent', 'paid', 'cancelled'])).default([]),
      partnerIds: z.array(z.string().uuid()).default([]),
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid export filters' });
    const { exportTypes, actualDateFrom, actualDateTo, statuses, partnerIds, ...filters } = parsed.data;
    const query = invoiceQueryInput.parse(filters);

    // exceljs is a CommonJS module — under esbuild's ESM bundle the real
    // exports land on `.default`, so `ExcelJS.Workbook` would be undefined.
    const ExcelJSModule = await import("exceljs");
    const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=export_${new Date().toISOString().split("T")[0]}.xlsx`);
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
    workbook.creator = "Invoice Management System";
    workbook.created = new Date();

    const allClients = exportTypes.includes("clients") ? await storage.getClients({ kind: 'all' }) : [];
    const pages = async function* (filtered: boolean) {
      for await (const page of storage.invoiceExportPages(req.user!, query)) {
        if (res.destroyed) throw new Error('Export cancelled');
        yield filtered ? page.filter(inv => (!statuses.length || statuses.includes(inv.status)) && (!partnerIds.length || partnerIds.includes(inv.partnerId)) && (!actualDateFrom || (inv.actualPaymentDate && inv.actualPaymentDate >= actualDateFrom)) && (!actualDateTo || (inv.actualPaymentDate && inv.actualPaymentDate <= actualDateTo))) : page;
      }
    };
    const filteredInvoices = async function* () { for await (const page of pages(true)) yield* page; };
    const clientTotals = new Map<string, { count: number; billed: number }>();
    if (exportTypes.includes('clients')) for await (const page of pages(false)) for (const inv of page) {
      const total = clientTotals.get(inv.clientId) ?? { count: 0, billed: 0 };
      total.count++; total.billed += Number(inv.calculations?.clientBill ?? inv.clientBill ?? 0); clientTotals.set(inv.clientId, total);
    }

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
      const schemeMap: Record<string, string> = { partner_10: "Партнёр 10%", partner_15: "Партнёр 15%", agency_30: "Агентский 30%", agency_40: "Агентский 40%", agency: "Агентская", commission_based: "Комиссионный" };
      for await (const inv of filteredInvoices()) {
        const client = inv.client;
        const partner = inv.partner;
        const calc = inv.calculations;
        sheet.addRow({ number: inv.invoiceNumber, client: client?.name || "", partner: partner?.name || "", status: statusMap[inv.status] || inv.status, clientBill: Number(calc?.clientBill || inv.clientBill || 0), scheme: schemeMap[inv.scheme] || inv.scheme, commissionRate: calc?.commissionRate ? `${calc.commissionRate}%` : "", commissionAmount: Number(calc?.commissionAmount || 0), expenses: Number(calc?.executorExpensesTotal || 0), netProfit: Number(calc?.netProfitAdmin || 0), partnerDebt: Number(calc?.partnerTransferDue || 0), clientRemaining: Number(calc?.clientRemaining || 0), paymentDate: formatDate(inv.paymentDate), actualPaymentDate: formatDate(inv.actualPaymentDate), notes: inv.notes || "" }).commit();
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
        const total = clientTotals.get(client.id) ?? { count: 0, billed: 0 };
        sheet.addRow({ name: client.name, contact: "", email: client.email || "", phone: client.phone || "", invoicesCount: total.count, totalBilled: total.billed }).commit();
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
        sheet.addRow({ name: pd.partnerName, email: pd.email || "", phone: pd.phone || "", invoicesCount: pd.totalInvoiceCount, paidCount: pd.invoiceCount, paidCommission: pd.paidCommission, totalToTransfer: pd.totalToTransfer, totalPaid: pd.totalPaid, remaining: pd.remaining }).commit();
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
      for await (const batch of pages(true)) {
        const invoiceById = new Map(batch.map(invoice => [invoice.id, invoice]));
        for await (const expenses of storage.expenseExportPages(batch.map(invoice => invoice.id))) for (const expense of expenses) {
        const invoice = invoiceById.get(expense.invoiceId);
        const client = invoice?.client;
        sheet.addRow({ invoiceNumber: invoice?.invoiceNumber || "—", client: client?.name || "—", description: expense.description || "—", amount: Number(expense.amount || 0), paidBy: expense.paidByAdmin ? "Администратор" : "Партнёр", date: formatDate(expense.date), notes: "" }).commit();
        }
      }
    }

    await workbook.commit();
  } catch (error: unknown) {
    console.error("Export error:", error);
    if (res.headersSent) { res.destroy(); return; }
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to export data" });
  }
});

exportRouter.post("/api/admin/export/client-report/preview", authMiddleware, requireRole("admin", "partner", "client"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId, clientId, dateFrom, dateTo } = req.body;

    const query = invoiceQueryInput.parse({ invoiceId: req.body.invoiceId || undefined, clientId: req.body.clientId || undefined, dateFrom: req.body.dateFrom || undefined, dateTo: req.body.dateTo || undefined });
    const allInvoices = await readClientReportInvoices(storage, req.user!, query);

    let invoices = allInvoices;
    if (invoiceId) {
      invoices = allInvoices.filter(inv => inv.id === invoiceId);
    } else if (clientId) {
      invoices = allInvoices.filter(inv => inv.clientId === clientId);
    }

    if (req.user?.role === "partner") {
      const partnerOwnId = req.user.partnerId;
      if (!partnerOwnId) return res.status(403).json({ error: "Партнёр не идентифицирован" });
      invoices = invoices.filter(inv => inv.partnerId === partnerOwnId);
    }

    if (req.user?.role === "client") {
      const ownClientId = req.user.clientId;
      if (!ownClientId) return res.status(403).json({ error: "Клиент не идентифицирован" });
      invoices = invoices.filter(inv => inv.clientId === ownClientId);
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

    const isClient = req.user?.role === "client";
    // Клиенту «расходы / остаток» считаем только по агентским 30/40 —
    // по commission_based / partner_10 / partner_15 эта раскладка скрыта.
    const aggregateInvoices = isClient
      ? invoices.filter(inv => inv.scheme === "agency_30" || inv.scheme === "agency_40" || inv.scheme === "agency")
      : invoices;

    const count = invoices.length;
    const totalBudget = invoices.reduce((sum, inv) => sum + Number(inv.calculations?.clientBill || inv.clientBill || 0), 0);
    const totalExpenses = aggregateInvoices.reduce((sum, inv) => sum + Number(inv.calculations?.executorExpensesTotal || 0), 0);
    const totalRemaining = aggregateInvoices.reduce((sum, inv) => {
      const isAgency = inv.scheme === "agency_30" || inv.scheme === "agency_40";
      if (isAgency) {
        // Agency: clientRemaining = clientBaseAfterMargin - expenses (stored correctly in DB)
        return sum + Number(inv.calculations?.clientRemaining ?? (Number(inv.calculations?.clientBill || inv.clientBill || 0) - Number(inv.calculations?.executorExpensesTotal || 0)));
      }
      // Closed commission: clientRemaining is now stored by financialEngine
      // (0 for single-delivery, proportional for ongoing services when plannedExpenses > 0)
      return sum + Number(inv.calculations?.clientRemaining ?? 0);
    }, 0);

    res.json({ count, totalBudget, totalExpenses, totalRemaining });
  } catch (error: unknown) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid report filters" });
    console.error("Client report preview error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to generate preview" });
  }
});

// HTML-отчёт: открывается прямо в браузере, без скачивания xlsx. Клиент жмёт
// «Распечатать / Сохранить как PDF» из браузера. Это самый «читаемый» формат —
// не требует Excel/Numbers и работает на любом устройстве.
exportRouter.post("/api/admin/export/client-report-print", authMiddleware, requireRole("admin", "partner", "client"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId, clientId, dateFrom, dateTo } = req.body;

    if (req.user?.role !== "client" && !invoiceId && !clientId) {
      return res.status(400).json({ error: "invoiceId или clientId обязателен" });
    }

    const query = invoiceQueryInput.parse({ invoiceId: req.body.invoiceId || undefined, clientId: req.body.clientId || undefined, dateFrom: req.body.dateFrom || undefined, dateTo: req.body.dateTo || undefined });
    const allInvoices = await readClientReportInvoices(storage, req.user!, query);
    const allClients = [...new Map(allInvoices.flatMap(invoice => invoice.client ? [[invoice.client.id, invoice.client] as const] : [])).values()];

    let invoices = allInvoices;
    if (invoiceId)      invoices = allInvoices.filter(inv => inv.id === invoiceId);
    else if (clientId)  invoices = allInvoices.filter(inv => inv.clientId === clientId);

    if (req.user?.role === "partner") {
      const partnerOwnId = req.user.partnerId;
      if (!partnerOwnId) return res.status(403).json({ error: "Партнёр не идентифицирован" });
      invoices = invoices.filter(inv => inv.partnerId === partnerOwnId);
      if (invoices.length === 0) return res.status(403).json({ error: "Нет доступа к этому счёту или клиенту" });
    }
    if (req.user?.role === "client") {
      const ownClientId = req.user.clientId;
      if (!ownClientId) return res.status(403).json({ error: "Клиент не идентифицирован" });
      invoices = invoices.filter(inv => inv.clientId === ownClientId);
      if (invoiceId && invoices.length === 0) return res.status(403).json({ error: "Нет доступа к этому счёту" });
    }
    if (dateFrom) { const f = new Date(dateFrom); invoices = invoices.filter(inv => inv.paymentDate && new Date(inv.paymentDate) >= f); }
    if (dateTo)   { const t = new Date(dateTo);   invoices = invoices.filter(inv => inv.paymentDate && new Date(inv.paymentDate) <= t); }
    invoices = invoices.filter(inv => inv.status !== "cancelled");

    const clientName = (() => {
      if (invoices.length > 0) return allClients.find(c => c.id === invoices[0].clientId)?.name || "клиент";
      if (clientId)            return allClients.find(c => c.id === clientId)?.name || "клиент";
      return "клиент";
    })();

    const statusMap: Record<string, string> = { draft: "Черновик", sent: "Отправлен", paid: "Оплачен", cancelled: "Отменён" };
    // Локальные обёртки для совместимости с шаблоном — везде идём через
    // единый Format-сервис.
    const fmtMoney = (n: number) => formatMoney(n);
    const fmtDate  = (d: string | null | undefined) => formatDate(d);
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c] || c));

    const agency  = invoices.filter(inv => inv.scheme === "agency_30" || inv.scheme === "agency_40");
    const closed  = invoices.filter(inv => inv.scheme !== "agency_30" && inv.scheme !== "agency_40");
    const isClient = req.user?.role === "client";

    const agencyRows = agency.map(inv => {
      const calc = inv.calculations;
      const bill = Number(calc?.clientBill || inv.clientBill || 0);
      const rate = inv.scheme === "agency_30" ? 30 : 40;
      const commission = Number(calc?.agencyMargin || bill * (rate / 100));
      const budgetAfter = Number(calc?.clientBaseAfterMargin || bill * (1 - rate / 100));
      const expenses = Number(calc?.executorExpensesTotal || 0);
      const remaining = Number(calc?.clientRemaining ?? (budgetAfter - expenses));
      return { inv, bill, rate, commission, budgetAfter, expenses, remaining };
    });

    let totalBill = 0, totalAvail = 0, totalSpent = 0, totalLeft = 0;
    for (const r of agencyRows) { totalBill += r.bill; totalAvail += r.budgetAfter; totalSpent += r.expenses; totalLeft += r.remaining; }
    for (const inv of closed)  {
      const bill = Number(inv.calculations?.clientBill || inv.clientBill || 0);
      totalBill += bill;
      if (!isClient) {
        const calc = inv.calculations;
        const exp = Number(calc?.executorExpensesTotal || 0);
        const rem = Number(calc?.clientRemaining ?? 0);
        totalAvail += bill; totalSpent += exp; totalLeft += rem;
      } else {
        totalAvail += bill; // по неагентским «доступно» = сумма счёта, потрачено/осталось скрыты
      }
    }

    const periodText = dateFrom && dateTo
      ? `${formatDate(dateFrom)} — ${formatDate(dateTo)}`
      : dateFrom ? `с ${formatDate(dateFrom)}`
      : dateTo   ? `по ${formatDate(dateTo)}`
      : "за всё время";

    const agencyTable = agencyRows.length === 0 ? "" : `
      <h2>Открытая комиссия (агентские 30%/40%)</h2>
      <table>
        <thead>
          <tr>
            <th>Счёт</th><th>Статус</th><th class="num">Сумма</th>
            <th class="num">Комиссия</th><th class="num">Доступно</th>
            <th class="num">Потрачено</th><th class="num">Осталось</th>
            <th>За что</th>
          </tr>
        </thead>
        <tbody>
          ${agencyRows.map(r => `
            <tr>
              <td>${esc(r.inv.invoiceNumber || "—")}</td>
              <td>${esc(statusMap[r.inv.status] || r.inv.status)}</td>
              <td class="num">${fmtMoney(r.bill)}</td>
              <td class="num">${fmtMoney(r.commission)} <span class="muted">(${r.rate}%)</span></td>
              <td class="num">${fmtMoney(r.budgetAfter)}</td>
              <td class="num">${fmtMoney(r.expenses)}</td>
              <td class="num strong">${fmtMoney(r.remaining)}</td>
              <td class="notes">${esc(r.inv.notes || r.inv.description || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    const closedTable = closed.length === 0 ? "" : (() => {
      if (isClient) {
        return `
          <h2>Счета (партнёрские и комиссионные)</h2>
          <table>
            <thead><tr><th>Счёт</th><th>Статус</th><th class="num">Сумма</th><th>Оплата (план)</th><th>Оплата (факт)</th><th>За что</th></tr></thead>
            <tbody>
              ${closed.map(inv => `
                <tr>
                  <td>${esc(inv.invoiceNumber || "—")}</td>
                  <td>${esc(statusMap[inv.status] || inv.status)}</td>
                  <td class="num">${fmtMoney(Number(inv.calculations?.clientBill || inv.clientBill || 0))}</td>
                  <td>${fmtDate(inv.paymentDate)}</td>
                  <td>${fmtDate(inv.actualPaymentDate)}</td>
                  <td class="notes">${esc(inv.clientTitle || inv.notes || inv.description || "")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `;
      }
      return `
        <h2>Закрытая комиссия (партнёрские и комиссионные)</h2>
        <table>
          <thead><tr><th>Счёт</th><th>Статус</th><th class="num">Сумма</th><th class="num">Расходы</th><th class="num">Остаток</th><th>За что</th></tr></thead>
          <tbody>
            ${closed.map(inv => {
              const c = inv.calculations;
              const bill = Number(c?.clientBill || inv.clientBill || 0);
              const exp = Number(c?.executorExpensesTotal || 0);
              const rem = Number(c?.clientRemaining ?? 0);
              return `<tr>
                <td>${esc(inv.invoiceNumber || "—")}</td>
                <td>${esc(statusMap[inv.status] || inv.status)}</td>
                <td class="num">${fmtMoney(bill)}</td>
                <td class="num">${fmtMoney(exp)}</td>
                <td class="num strong">${fmtMoney(rem)}</td>
                <td class="notes">${esc(inv.clientTitle || inv.notes || inv.description || "")}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      `;
    })();

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Бюджетный отчёт · ${esc(clientName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
           color: #1a1a1a; max-width: 1100px; margin: 0 auto; padding: 32px; background: #fff; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 24px; }
    .head h1 { margin: 0 0 6px; font-size: 24px; }
    .head .meta { color: #666; font-size: 13px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 0 0 28px; }
    .summary .card { border: 1px solid #e2e2e2; border-radius: 10px; padding: 14px 16px; }
    .summary .card .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.06em; }
    .summary .card .value { font-size: 22px; font-weight: 600; margin-top: 6px; }
    h2 { font-size: 16px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e2e2; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #eee; text-align: left; }
    th { background: #f7f7f8; font-weight: 600; color: #444; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.notes { color: #555; font-size: 12px; max-width: 320px; white-space: pre-wrap; }
    .muted { color: #888; font-size: 12px; }
    .strong { font-weight: 600; }
    .actions { position: sticky; top: 12px; display: flex; justify-content: flex-end; gap: 8px; margin-bottom: -32px; }
    .btn { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
    .btn.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
    .empty { text-align: center; color: #888; padding: 32px; border: 1px dashed #d1d5db; border-radius: 10px; }
    @media print {
      body { padding: 0; max-width: none; }
      .actions { display: none; }
      h2 { page-break-after: avoid; }
      tr { page-break-inside: avoid; }
    }
    @page { margin: 16mm; }
  </style>
</head>
<body>
  <div class="actions">
    <button class="btn" onclick="window.close()">Закрыть</button>
    <button class="btn primary" onclick="window.print()">Распечатать / Сохранить PDF</button>
  </div>
  <div class="head">
    <div>
      <h1>Бюджетный отчёт</h1>
      <div class="meta">Клиент: <strong>${esc(clientName)}</strong></div>
    </div>
    <div class="meta">
      Период: <strong>${esc(periodText)}</strong><br>
      Сформирован: ${formatDateTime(new Date())}
    </div>
  </div>

  <div class="summary">
    <div class="card"><div class="label">Счетов</div><div class="value">${invoices.length}</div></div>
    <div class="card"><div class="label">Доступно вам</div><div class="value">${fmtMoney(totalAvail)}</div></div>
    <div class="card"><div class="label">Потрачено</div><div class="value">${fmtMoney(totalSpent)}</div></div>
    <div class="card"><div class="label">Осталось</div><div class="value">${fmtMoney(totalLeft)}</div></div>
  </div>

  ${agencyTable}
  ${closedTable}
  ${invoices.length === 0 ? '<div class="empty">Нет данных за выбранный период.</div>' : ''}
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  } catch (error: unknown) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid report filters" });
    console.error("Client report print error:", error);
    res.status(500).send(`<!doctype html><meta charset="utf-8"><body style="font-family: sans-serif; padding: 32px;">Ошибка: ${((error instanceof Error ? error.message : String(error)) || "").replace(/[<>]/g, "")}</body>`);
  }
});

// PDF-отчёт через pdfkit. Кириллица — через DejaVuSans (см. server/assets).
exportRouter.post("/api/admin/export/client-report-pdf", authMiddleware, requireRole("admin", "partner", "client"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId, clientId, dateFrom, dateTo } = req.body;
    if (req.user?.role !== "client" && !invoiceId && !clientId) {
      return res.status(400).json({ error: "invoiceId или clientId обязателен" });
    }

    const query = invoiceQueryInput.parse({ invoiceId: req.body.invoiceId || undefined, clientId: req.body.clientId || undefined, dateFrom: req.body.dateFrom || undefined, dateTo: req.body.dateTo || undefined });
    const allInvoices = await readClientReportInvoices(storage, req.user!, query);
    const allClients = [...new Map(allInvoices.flatMap(invoice => invoice.client ? [[invoice.client.id, invoice.client] as const] : [])).values()];
    let invoices = allInvoices;
    if (invoiceId)      invoices = allInvoices.filter(inv => inv.id === invoiceId);
    else if (clientId)  invoices = allInvoices.filter(inv => inv.clientId === clientId);

    if (req.user?.role === "partner") {
      const partnerOwnId = req.user.partnerId;
      if (!partnerOwnId) return res.status(403).json({ error: "Партнёр не идентифицирован" });
      invoices = invoices.filter(inv => inv.partnerId === partnerOwnId);
      if (invoices.length === 0) return res.status(403).json({ error: "Нет доступа" });
    }
    if (req.user?.role === "client") {
      const ownClientId = req.user.clientId;
      if (!ownClientId) return res.status(403).json({ error: "Клиент не идентифицирован" });
      invoices = invoices.filter(inv => inv.clientId === ownClientId);
      if (invoiceId && invoices.length === 0) return res.status(403).json({ error: "Нет доступа" });
    }
    if (dateFrom) { const f = new Date(dateFrom); invoices = invoices.filter(inv => inv.paymentDate && new Date(inv.paymentDate) >= f); }
    if (dateTo)   { const t = new Date(dateTo);   invoices = invoices.filter(inv => inv.paymentDate && new Date(inv.paymentDate) <= t); }
    invoices = invoices.filter(inv => inv.status !== "cancelled");

    const clientName = (() => {
      if (invoices.length > 0) return allClients.find(c => c.id === invoices[0].clientId)?.name || "клиент";
      if (clientId)            return allClients.find(c => c.id === clientId)?.name || "клиент";
      return "клиент";
    })();
    const statusMap: Record<string, string> = { draft: "Черновик", sent: "Отправлен", paid: "Оплачен", cancelled: "Отменён" };
    const fmtMoney = (n: number) => formatMoney(n);
    const fmtDate  = (d: string | null | undefined) => formatDate(d);
    const isClient = req.user?.role === "client";

    const agency = invoices.filter(inv => inv.scheme === "agency_30" || inv.scheme === "agency_40");
    const closed = invoices.filter(inv => inv.scheme !== "agency_30" && inv.scheme !== "agency_40");

    const PDFKitModule = await import("pdfkit");
    const PDFDocument = PDFKitModule.default;
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, info: { Title: `Бюджетный отчёт — ${clientName}`, Author: "FinanceDuck" } });

    const regularFont = findFont(FONT_CANDIDATES);
    const boldFont    = findFont(FONT_BOLD_CANDIDATES);
    if (regularFont) doc.registerFont("R", regularFont);
    if (boldFont)    doc.registerFont("B", boldFont);
    const FONT_R = regularFont ? "R" : "Helvetica";
    const FONT_B = boldFont ? "B" : "Helvetica-Bold";

    const ascii = (clientName || "client").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, "_") || "client";
    const fullName = (clientName || "клиент").replace(/[\\/:*?"<>|]/g, "").trim() || "клиент";
    const dateSuffix = `_${new Date().toISOString().split("T")[0]}`;
    const fileNameUtf  = `report_${fullName.replace(/\s+/g, "_")}${dateSuffix}.pdf`;
    const fileNameAsc  = `report_${ascii}${dateSuffix}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileNameAsc}"; filename*=UTF-8''${encodeURIComponent(fileNameUtf)}`);

    doc.pipe(res);

    // ---- header ----
    doc.font(FONT_B).fontSize(18).text("Бюджетный отчёт", { continued: false });
    doc.moveDown(0.2);
    doc.font(FONT_R).fontSize(10).fillColor("#444")
       .text(`Клиент: ${clientName}`)
       .text(`Период: ${dateFrom && dateTo ? `${formatDate(dateFrom)} — ${formatDate(dateTo)}` : (dateFrom ? `с ${formatDate(dateFrom)}` : (dateTo ? `по ${formatDate(dateTo)}` : "за всё время"))}`)
       .text(`Сформирован: ${formatDateTime(new Date())}`);
    doc.moveDown(0.8);
    doc.fillColor("#000");

    // ---- summary ----
    let sBill = 0, sAvail = 0, sSpent = 0, sLeft = 0;
    for (const inv of agency) {
      const c = inv.calculations;
      const bill = Number(c?.clientBill || inv.clientBill || 0);
      const rate = inv.scheme === "agency_30" ? 30 : 40;
      const budgetAfter = Number(c?.clientBaseAfterMargin || bill * (1 - rate / 100));
      const exp = Number(c?.executorExpensesTotal || 0);
      const rem = Number(c?.clientRemaining ?? (budgetAfter - exp));
      sBill += bill; sAvail += budgetAfter; sSpent += exp; sLeft += rem;
    }
    for (const inv of closed) {
      const bill = Number(inv.calculations?.clientBill || inv.clientBill || 0);
      sBill += bill;
      if (!isClient) {
        const c = inv.calculations;
        sAvail += bill;
        sSpent += Number(c?.executorExpensesTotal || 0);
        sLeft  += Number(c?.clientRemaining ?? 0);
      } else { sAvail += bill; }
    }

    const drawSummaryCards = () => {
      const cardW = (doc.page.width - 36 * 2 - 12 * 3) / 4;
      const y = doc.y;
      const items = [
        { label: "Счетов",         value: String(invoices.length) },
        { label: "Доступно вам",   value: fmtMoney(sAvail) },
        { label: "Потрачено",      value: fmtMoney(sSpent) },
        { label: "Осталось",       value: fmtMoney(sLeft)  },
      ];
      items.forEach((it, i) => {
        const x = 36 + i * (cardW + 12);
        doc.roundedRect(x, y, cardW, 56, 8).strokeColor("#e2e2e2").lineWidth(1).stroke();
        doc.font(FONT_R).fontSize(8).fillColor("#666").text(it.label.toUpperCase(), x + 10, y + 8);
        doc.font(FONT_B).fontSize(14).fillColor("#1a1a1a").text(it.value, x + 10, y + 24, { width: cardW - 20 });
      });
      doc.y = y + 56 + 16;
      doc.x = 36;
      doc.fillColor("#000");
    };
    drawSummaryCards();

    // ---- table renderer ----
    const renderTable = (title: string, headers: { label: string; width: number; align?: "left" | "right" }[], rows: string[][]) => {
      if (rows.length === 0) return;
      // Заголовок раздела
      doc.moveDown(0.4);
      doc.font(FONT_B).fontSize(12).fillColor("#1a1a1a").text(title);
      doc.moveDown(0.2);
      const startX = 36;
      let y = doc.y;
      const drawHeader = () => {
        let x = startX;
        doc.rect(startX, y, headers.reduce((a, h) => a + h.width, 0), 22).fillColor("#f3f4f6").fill();
        doc.fillColor("#444").font(FONT_B).fontSize(9);
        for (const h of headers) {
          doc.text(h.label, x + 6, y + 7, { width: h.width - 12, align: h.align || "left" });
          x += h.width;
        }
        y += 22;
        doc.font(FONT_R).fontSize(9).fillColor("#1a1a1a");
      };
      drawHeader();
      for (const row of rows) {
        // высота строки = max по cell text
        const cellHeights = row.map((cell, i) => doc.heightOfString(cell, { width: headers[i].width - 12 }));
        const rowH = Math.max(18, ...cellHeights) + 8;
        if (y + rowH > doc.page.height - 36) {
          doc.addPage();
          y = 36;
          drawHeader();
        }
        let x = startX;
        for (let i = 0; i < row.length; i++) {
          doc.fillColor("#1a1a1a")
             .text(row[i], x + 6, y + 4, { width: headers[i].width - 12, align: headers[i].align || "left" });
          x += headers[i].width;
        }
        // нижняя линия
        doc.moveTo(startX, y + rowH).lineTo(startX + headers.reduce((a, h) => a + h.width, 0), y + rowH).strokeColor("#eee").lineWidth(0.5).stroke();
        y += rowH;
      }
      doc.y = y + 8;
      doc.x = 36;
    };

    // agency table
    if (agency.length > 0) {
      const headers = [
        { label: "Счёт", width: 65 },
        { label: "Статус", width: 65 },
        { label: "Сумма", width: 70, align: "right" as const },
        { label: "Комиссия", width: 80, align: "right" as const },
        { label: "Доступно", width: 70, align: "right" as const },
        { label: "Потрачено", width: 70, align: "right" as const },
        { label: "Осталось", width: 70, align: "right" as const },
        { label: "За что", width: 280 },
      ];
      const rows = agency.map(inv => {
        const c = inv.calculations;
        const bill = Number(c?.clientBill || inv.clientBill || 0);
        const rate = inv.scheme === "agency_30" ? 30 : 40;
        const comm = Number(c?.agencyMargin || bill * (rate / 100));
        const budget = Number(c?.clientBaseAfterMargin || bill * (1 - rate / 100));
        const exp = Number(c?.executorExpensesTotal || 0);
        const rem = Number(c?.clientRemaining ?? (budget - exp));
        return [
          inv.invoiceNumber || "—",
          statusMap[inv.status] || inv.status,
          fmtMoney(bill),
          `${fmtMoney(comm)} (${rate}%)`,
          fmtMoney(budget),
          fmtMoney(exp),
          fmtMoney(rem),
          inv.clientTitle || inv.notes || inv.description || "",
        ];
      });
      renderTable("Открытая комиссия (агентские 30%/40%)", headers, rows);
    }

    // closed table
    if (closed.length > 0) {
      if (isClient) {
        const headers = [
          { label: "Счёт", width: 70 },
          { label: "Статус", width: 65 },
          { label: "Сумма", width: 85, align: "right" as const },
          { label: "Оплата (план)", width: 90 },
          { label: "Оплата (факт)", width: 90 },
          { label: "За что", width: 370 },
        ];
        const rows = closed.map(inv => [
          inv.invoiceNumber || "—",
          statusMap[inv.status] || inv.status,
          fmtMoney(Number(inv.calculations?.clientBill || inv.clientBill || 0)),
          fmtDate(inv.paymentDate),
          fmtDate(inv.actualPaymentDate),
          inv.clientTitle || inv.notes || inv.description || "",
        ]);
        renderTable("Счета (партнёрские и комиссионные)", headers, rows);
      } else {
        const headers = [
          { label: "Счёт", width: 70 },
          { label: "Статус", width: 70 },
          { label: "Сумма", width: 85, align: "right" as const },
          { label: "Расходы", width: 80, align: "right" as const },
          { label: "Остаток", width: 85, align: "right" as const },
          { label: "За что", width: 380 },
        ];
        const rows = closed.map(inv => {
          const c = inv.calculations;
          const bill = Number(c?.clientBill || inv.clientBill || 0);
          const exp = Number(c?.executorExpensesTotal || 0);
          const rem = Number(c?.clientRemaining ?? 0);
          return [
            inv.invoiceNumber || "—",
            statusMap[inv.status] || inv.status,
            fmtMoney(bill),
            fmtMoney(exp),
            fmtMoney(rem),
            inv.clientTitle || inv.notes || inv.description || "",
          ];
        });
        renderTable("Закрытая комиссия (партнёрские и комиссионные)", headers, rows);
      }
    }

    if (invoices.length === 0) {
      doc.font(FONT_R).fontSize(11).fillColor("#888").text("Нет данных за выбранный период.", { align: "center" });
    }

    doc.end();
  } catch (error: unknown) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid report filters" });
    console.error("Client report PDF error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to generate PDF" });
    } else {
      res.end();
    }
  }
});

exportRouter.post("/api/admin/export/client-report", authMiddleware, requireRole("admin", "partner", "client"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId, clientId, dateFrom, dateTo } = req.body;

    // Clients always download their own data — no body params needed from them
    if (req.user?.role !== "client" && !invoiceId && !clientId) {
      return res.status(400).json({ error: "invoiceId или clientId обязателен" });
    }

    // exceljs is a CommonJS module — under esbuild's ESM bundle the real
    // exports land on `.default`, so `ExcelJS.Workbook` would be undefined.
    const ExcelJSModule = await import("exceljs");
    const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Invoice Management System";
    workbook.created = new Date();

    const query = invoiceQueryInput.parse({ invoiceId: req.body.invoiceId || undefined, clientId: req.body.clientId || undefined, dateFrom: req.body.dateFrom || undefined, dateTo: req.body.dateTo || undefined });
    const allInvoices = await readClientReportInvoices(storage, req.user!, query);
    const allClients = [...new Map(allInvoices.flatMap(invoice => invoice.client ? [[invoice.client.id, invoice.client] as const] : [])).values()];

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

    // «Открытая комиссия» — только agency_30/40. commission_based для клиента
    // идёт в закрытый лист «Счета» (без расходов/остатка/комиссии).
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
        { header: "За что (комментарий)", key: "notes", width: 40 },
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
          notes: inv.clientTitle || inv.notes || inv.description || "",
        });
      }
    }

    if (closedInvoices.length > 0) {
      const isClient = req.user?.role === "client";
      const sheet = workbook.addWorksheet("Счета");
      // Клиенту по неагентским схемам не отдаём колонки «Расходы» и «Остаток» —
      // финансовая «кухня» этих схем структурно скрыта от клиента.
      sheet.columns = isClient
        ? [
            { header: "Номер счёта", key: "number", width: 18 },
            { header: "Статус", key: "status", width: 14 },
            { header: "Сумма счёта", key: "clientBill", width: 20, style: { numFmt: "#,##0.00 ₽" } },
            { header: "Дата оплаты (план)", key: "paymentDate", width: 18 },
            { header: "Дата оплаты (факт)", key: "actualPaymentDate", width: 18 },
            { header: "За что (комментарий)", key: "notes", width: 40 },
          ]
        : [
            { header: "Номер счёта", key: "number", width: 18 },
            { header: "Статус", key: "status", width: 14 },
            { header: "Бюджет клиента", key: "clientBill", width: 20, style: { numFmt: "#,##0.00 ₽" } },
            { header: "Расходы", key: "expenses", width: 18, style: { numFmt: "#,##0.00 ₽" } },
            { header: "Остаток", key: "remaining", width: 18, style: { numFmt: "#,##0.00 ₽" } },
            { header: "За что (комментарий)", key: "notes", width: 40 },
          ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

      for (const inv of closedInvoices) {
        const calc = inv.calculations;
        const clientBill = Number(calc?.clientBill || inv.clientBill || 0);
        if (isClient) {
          sheet.addRow({
            number: inv.invoiceNumber || "—",
            status: statusMap[inv.status] || inv.status,
            clientBill,
            paymentDate: formatDate(inv.paymentDate),
            actualPaymentDate: formatDate(inv.actualPaymentDate),
            notes: inv.clientTitle || inv.notes || inv.description || "",
          });
        } else {
          const expenses = Number(calc?.executorExpensesTotal || 0);
          // For closed commission: use stored clientRemaining from financialEngine.
          // Single-delivery (plannedExpenses = 0) → 0.
          // Ongoing service (plannedExpenses > 0) → clientBill × (1 − executorExpenses / plannedExpenses).
          const remaining = Number(calc?.clientRemaining ?? 0);
          sheet.addRow({
            number: inv.invoiceNumber || "—",
            status: statusMap[inv.status] || inv.status,
            clientBill,
            expenses,
            remaining,
            notes: inv.clientTitle || inv.notes || inv.description || "",
          });
        }
      }
    }

    if (agencyInvoices.length === 0 && closedInvoices.length === 0) {
      const sheet = workbook.addWorksheet("Отчёт");
      sheet.addRow(["Нет данных для отображения"]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    // Кириллица напрямую в HTTP-заголовке Content-Disposition даёт
    // ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION / Invalid character.
    // Имя файла кодируем по RFC 5987: ASCII-fallback в filename=...,
    // и filename*=UTF-8''<percent-encoded> для современных браузеров.
    const fullName = (clientName || "клиент").replace(/[\\/:*?"<>|]/g, "").trim() || "клиент";
    const asciiName = fullName.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, "_") || "client";
    const safeDate = (d: string) => d.replace(/[^0-9-]/g, "").slice(0, 10);
    const dateSuffix = dateFrom && dateTo
      ? `_${safeDate(dateFrom)}_${safeDate(dateTo)}`
      : dateFrom
      ? `_${safeDate(dateFrom)}`
      : dateTo
      ? `_${safeDate(dateTo)}`
      : `_${new Date().toISOString().split("T")[0]}`;
    const baseName = `client_report_${fullName.replace(/\s+/g, "_")}${dateSuffix}.xlsx`;
    const asciiFallback = `client_report_${asciiName}${dateSuffix}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(baseName)}`
    );
    res.send(Buffer.from(buffer));
  } catch (error: unknown) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid report filters" });
    console.error("Client report export error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to generate client report" });
  }
});

return exportRouter;
}
