import { invoiceQueryInput } from '../invoiceQuery';
import type { AuthMiddleware } from "../middleware";
import { Router, Response } from "express";
import type { DashboardStore } from "../routeStores";
import { AuthenticatedRequest, requireRole } from "../middleware";
import { parseNum } from "../../shared/financialEngine";
import { projectStatsForRole, projectInvoiceForRole } from "../permissions";
import { ownerLedgerStartInput, ownerPayoutInput } from "../lib/ownerLedgerInput";
import { z } from "zod";

const inputError = (error: z.ZodError) => error.issues.slice(0, 3).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');

export function createDashboardRouter(storage: DashboardStore, authMiddleware: AuthMiddleware) {
const dashboardRouter = Router();

dashboardRouter.get("/api/dashboard/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    const stats = await storage.getDashboardStats(role, req.user?.partnerId, req.user?.clientId);
    res.json(projectStatsForRole(stats, role));
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});

dashboardRouter.get("/api/admin/monthly-data", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getAdminMonthlyData(parseInt(req.query.year as string) || new Date().getFullYear()));
  } catch (error) {
    console.error("Get admin monthly data error:", error);
    res.status(500).json({ error: "Failed to get monthly data" });
  }
});

dashboardRouter.get("/api/admin/forecast", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getAdminForecast(parseInt(req.query.months as string) || 6));
  } catch (error) {
    console.error("Get admin forecast error:", error);
    res.status(500).json({ error: "Failed to get forecast" });
  }
});

dashboardRouter.get("/api/admin/drafts-stats", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getDraftsStats());
  } catch (error) {
    console.error("Get drafts stats error:", error);
    res.status(500).json({ error: "Failed to get drafts stats" });
  }
});

dashboardRouter.get("/api/admin/invoices-by-month", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const month = parseInt(req.query.month as string);
    const year = parseInt(req.query.year as string);
    if (!month || !year) return res.status(400).json({ error: "Month and year are required" });
    res.json(await storage.getInvoicesByMonth(month, year, req.query.type as string));
  } catch (error) {
    console.error("Get invoices by month error:", error);
    res.status(500).json({ error: "Failed to get invoices by month" });
  }
});

dashboardRouter.get("/api/invoices/overdue", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getOverdueInvoices());
  } catch (error) {
    console.error("Get overdue invoices error:", error);
    res.status(500).json({ error: "Failed to get overdue invoices" });
  }
});

dashboardRouter.get("/api/alert-counts", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getAlertCounts(req.user!));
  } catch (error) {
    console.error("Get alert counts error:", error);
    res.status(500).json({ error: "Failed to get alert counts" });
  }
});

dashboardRouter.get("/api/search", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = (req.query.q as string) || "";
    if (!query.trim()) return res.json([]);
    res.json(await storage.globalSearch(query, req.user?.role || "client", {
      clientId: req.user?.clientId,
    }));
  } catch (error) {
    console.error("Global search error:", error);
    res.status(500).json({ error: "Failed to search" });
  }
});

dashboardRouter.get("/api/priority-actions", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getPriorityActions(req.user!));
  } catch (error) {
    console.error("Get priority actions error:", error);
    res.status(500).json({ error: "Failed to get priority actions" });
  }
});

dashboardRouter.get("/api/overdue-invoices", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getOverdueInvoicesDetailed(req.user!));
  } catch (error) {
    console.error("Get overdue invoices detailed error:", error);
    res.status(500).json({ error: "Failed to get overdue invoices" });
  }
});

dashboardRouter.get("/api/admin/partner-invoices/:partnerId", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getPartnerInvoicesDetail(req.params.partnerId));
  } catch (error) {
    console.error("Get partner invoices detail error:", error);
    res.status(500).json({ error: "Failed to get partner invoices" });
  }
});

dashboardRouter.get("/api/admin/receivables", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getReceivables());
  } catch (error) {
    console.error("Get receivables error:", error);
    res.status(500).json({ error: "Failed to get receivables" });
  }
});

dashboardRouter.get("/api/admin/payables", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getPayables());
  } catch (error) {
    console.error("Get payables error:", error);
    res.status(500).json({ error: "Failed to get payables" });
  }
});

dashboardRouter.get("/api/admin/owner-ledger", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getOwnerLedger());
  } catch (error) {
    console.error("Get owner ledger error:", error);
    res.status(500).json({ error: "Failed to get owner ledger" });
  }
});

dashboardRouter.put("/api/admin/owner-ledger/start", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const input = ownerLedgerStartInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: inputError(input.error) });
    await storage.setOwnerLedgerStart({ ...input.data, createdBy: req.user!.token.id });
    res.json(await storage.getOwnerLedger());
  } catch (error) {
    console.error("Set owner ledger start error:", error);
    res.status(500).json({ error: "Failed to set owner ledger start" });
  }
});

dashboardRouter.post("/api/admin/owner-transfers", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const input = ownerPayoutInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: inputError(input.error) });
    res.status(201).json(await storage.createOwnerPayout({ ...input.data, notes: input.data.notes || null, createdBy: req.user!.token.id }));
  } catch (error) {
    console.error("Create owner transfer error:", error);
    res.status(500).json({ error: "Failed to create owner transfer" });
  }
});

dashboardRouter.delete("/api/admin/owner-transfers/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success || !await storage.deleteOwnerPayout(id.data)) return res.status(404).json({ error: "Transfer not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete owner transfer error:", error);
    res.status(500).json({ error: "Failed to delete owner transfer" });
  }
});

dashboardRouter.get("/api/admin/client-ltv", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getClientLTV(req.query.year ? parseInt(req.query.year as string) : undefined));
  } catch (error) {
    console.error("Get client LTV error:", error);
    res.status(500).json({ error: "Failed to get client LTV" });
  }
});

dashboardRouter.get("/api/admin/plan-fact", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getAdminPlanFact(parseInt(req.query.year as string) || new Date().getFullYear()));
  } catch (error) {
    console.error("Get admin plan-fact error:", error);
    res.status(500).json({ error: "Failed to get plan-fact data" });
  }
});

dashboardRouter.get("/api/admin/monthly-plans", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getMonthlyPlans(parseInt(req.query.year as string) || new Date().getFullYear()));
  } catch (error) {
    console.error("Get monthly plans error:", error);
    res.status(500).json({ error: "Failed to get monthly plans" });
  }
});

dashboardRouter.get("/api/financial-plans/history", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    const [currentYearPlans, lastYearPlans] = await Promise.all([storage.getMonthlyPlans(currentYear), storage.getMonthlyPlans(lastYear)]);
    const allPlans = [...currentYearPlans, ...lastYearPlans].sort((a, b) => {
      if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year);
      return parseInt(b.month) - parseInt(a.month);
    });

    const getActualsForYear = async (year: number) => {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      const paidInvoices = await storage.getInvoicesWithCalculations();
      const monthlyActuals: { [m: number]: { admin: number; cat: number } } = {};
      for (let m = 1; m <= 12; m++) monthlyActuals[m] = { admin: 0, cat: 0 };
      for (const invoice of paidInvoices) {
        if (!invoice.paymentDate) continue;
        const paymentDate = new Date(invoice.paymentDate);
        if (paymentDate < yearStart || paymentDate > yearEnd) continue;
        const month = paymentDate.getMonth() + 1;
        const parseShare = (val: string | null): number => {
          if (!val || val.trim() === "") return 0;
          const num = parseNum(val);
          return isNaN(num) || Math.abs(num) < 0.01 ? 0 : num;
        };
        let adminShare = parseShare(invoice.adminShare50);
        let catShare = parseShare(invoice.catShare50);
        if (adminShare === 0 && catShare === 0 && invoice.netProfitAdmin) {
          const netProfit = parseShare(invoice.netProfitAdmin);
          if (netProfit > 0) { adminShare = netProfit / 2; catShare = netProfit / 2; }
        }
        monthlyActuals[month].admin += adminShare;
        monthlyActuals[month].cat += catShare;
      }
      return monthlyActuals;
    };

    const [currentYearActuals, lastYearActuals] = await Promise.all([getActualsForYear(currentYear), getActualsForYear(lastYear)]);
    const result = allPlans.map(plan => {
      const year = parseInt(plan.year);
      const month = parseInt(plan.month);
      const actuals = year === currentYear ? currentYearActuals : lastYearActuals;
      const halfTarget = parseNum(plan.profitTarget || "0") / 2;
      return { id: plan.id, year, month, plannedAdminShare: halfTarget.toString(), plannedCatShare: halfTarget.toString(), actualAdminShare: actuals[month]?.admin || 0, actualCatShare: actuals[month]?.cat || 0 };
    });
    res.json(result);
  } catch (error) {
    console.error("Get financial plans history error:", error);
    res.status(500).json({ error: "Failed to get plans history" });
  }
});

dashboardRouter.post("/api/admin/monthly-plans", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { year, month, salesTarget, profitTarget, receiptsTarget } = req.body;
    const plan = await storage.upsertMonthlyPlan({
      year: parseInt(year),
      month: parseInt(month),
      salesTarget: salesTarget ? parseNum(salesTarget) : undefined,
      profitTarget: profitTarget ? parseNum(profitTarget) : undefined,
      receiptsTarget: receiptsTarget ? parseNum(receiptsTarget) : undefined,
    });
    res.json(plan);
  } catch (error) {
    console.error("Upsert monthly plan error:", error);
    res.status(500).json({ error: "Failed to save monthly plan" });
  }
});

dashboardRouter.post("/api/admin/recalculate-invoices", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await storage.recalculateAllInvoices();
    res.json({ success: true, message: `Recalculated ${result.updated} invoices with ${result.errors} errors`, ...result });
  } catch (error) {
    console.error("[API] Recalculate invoices error:", error);
    res.status(500).json({ error: "Failed to recalculate invoices" });
  }
});

dashboardRouter.get("/api/financial-summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    const partnerId = req.user?.partnerId;
    const clientId = req.user?.clientId;
    const stats = await storage.getDashboardStats(role, partnerId, clientId);
    const filteredStats = projectStatsForRole(stats, role);
    const query = invoiceQueryInput.safeParse(req.query);
    if (!query.success) return res.status(400).json({ error: 'Invalid invoice filters' });
    const invoices = await storage.getInvoices(role, partnerId, clientId, query.data);
    const filteredInvoices = invoices.map(inv => projectInvoiceForRole(inv, role));
    const summary: Record<string, unknown> = { stats: filteredStats, invoices: filteredInvoices, page: query.data.page, limit: query.data.limit, role, dataSource: "invoice_calculations" };
    if (role === "admin") summary.partnerDebts = await storage.getPartnerDebtSummaries();
    if (role === "partner" && partnerId) {
      const partnerDebts = await storage.getPartnerDebtSummaries();
      summary.myDebt = partnerDebts.find(d => d.partnerId === partnerId) || { totalToTransfer: 0, totalPaid: 0, remaining: 0 };
    }
    res.json(summary);
  } catch (error) {
    console.error("Get financial summary error:", error);
    res.status(500).json({ error: "Failed to get financial summary" });
  }
});

dashboardRouter.get("/api/admin/dashboard-stats", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    res.json(await storage.getAdminDashboardStats(year, month));
  } catch (error) {
    console.error("Get admin dashboard stats error:", error);
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});

dashboardRouter.get("/api/admin/dashboard-invoices", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const month = req.query.month !== undefined ? parseInt(req.query.month as string) : new Date().getMonth();
    const ALLOWED = ["received", "expected", "drafts", "overdue", "drafts_no_date"] as const;
    const category = req.query.category as typeof ALLOWED[number];
    if (!category || !ALLOWED.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${ALLOWED.join(", ")}` });
    }
    res.json(await storage.getDashboardInvoices(year, month, category));
  } catch (error) {
    console.error("Get dashboard invoices error:", error);
    res.status(500).json({ error: "Failed to get dashboard invoices" });
  }
});

dashboardRouter.get("/api/admin/dashboard-recurring", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const month = req.query.month !== undefined ? parseInt(req.query.month as string) : new Date().getMonth();
    res.json(await storage.getRecurringInvoicesForMonth(year, month));
  } catch (error) {
    console.error("Get dashboard recurring error:", error);
    res.status(500).json({ error: "Failed to get recurring invoices" });
  }
});

return dashboardRouter;
}
