import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { isAgencyScheme } from "@/lib/invoiceHelpers";
import { formatCurrency } from "@/lib/invoiceCalculations";

interface WaterfallChartProps {
  clientBill: number;
  scheme: import("@shared/schema").InvoiceScheme;
  commissionRate?: number;
  executorExpenses: number;
  expensesPaidByPartner?: number;
  expensesPaidByAdmin?: number;
  partnerShare: number;
  adminShare: number;
  netProfitAdmin?: number;
  partnerTransferDue?: number;
  catShare?: number;
  showCatShare?: boolean;
}

interface WaterfallItem {
  name: string;
  value: number;
  total: number;
  isPositive: boolean;
  color: string;
}

export function InvoiceWaterfallChart({
  clientBill,
  scheme,
  commissionRate = 0,
  executorExpenses,
  expensesPaidByPartner = 0,
  expensesPaidByAdmin = 0,
  partnerShare,
  adminShare,
  netProfitAdmin,
  partnerTransferDue,
  catShare = 0,
  showCatShare = false,
}: WaterfallChartProps) {
  // Validate inputs - convert to safe numbers
  const safeClientBill = Number(clientBill) || 0;
  const safeCommissionRate = Number(commissionRate) || 0;
  const safePartnerShare = Number(partnerShare) || 0;
  const safeAdminShare = Number(adminShare) || 0;
  const safeExpensesPaidByPartner = Number(expensesPaidByPartner) || 0;
  const safeExpensesPaidByAdmin = Number(expensesPaidByAdmin) || 0;
  const safeCatShare = Number(catShare) || 0;
  const safeNetProfitAdmin = netProfitAdmin !== undefined && netProfitAdmin !== null ? Number(netProfitAdmin) : undefined;

  const data = useMemo(() => {
    // If no client bill, return empty array
    if (safeClientBill <= 0) {
      return [];
    }

    const items: WaterfallItem[] = [];

    items.push({
      name: "Счёт клиенту",
      value: safeClientBill,
      total: safeClientBill,
      isPositive: true,
      color: "hsl(var(--primary))",
    });
    let runningTotal = safeClientBill;

    if (isAgencyScheme(scheme)) {
      const partnerPercent = scheme === "agency_40" ? "16%" : "15%";
      const adminPercent = scheme === "agency_40" ? "24%" : "15%";
      
      items.push({
        name: `Партнёру (${partnerPercent})`,
        value: -safePartnerShare,
        total: runningTotal - safePartnerShare,
        isPositive: false,
        color: "hsl(var(--chart-2))",
      });
      runningTotal -= safePartnerShare;

      items.push({
        name: `Админу (${adminPercent})`,
        value: -safeAdminShare,
        total: runningTotal - safeAdminShare,
        isPositive: false,
        color: "hsl(var(--chart-3))",
      });
      runningTotal -= safeAdminShare;
    } else {
      const commissionAmount = safeClientBill * (safeCommissionRate / 100);
      items.push({
        name: `Комиссия (${safeCommissionRate.toFixed(2)}%)`,
        value: -commissionAmount,
        total: runningTotal - commissionAmount,
        isPositive: false,
        color: "hsl(var(--chart-2))",
      });
      runningTotal -= commissionAmount;
    }

    if (safeExpensesPaidByPartner > 0) {
      items.push({
        name: "Расходы (партнёр)",
        value: -safeExpensesPaidByPartner,
        total: runningTotal - safeExpensesPaidByPartner,
        isPositive: false,
        color: "hsl(var(--chart-3))",
      });
      runningTotal -= safeExpensesPaidByPartner;
    }

    const actualNetProfit = safeNetProfitAdmin ?? runningTotal - safeExpensesPaidByAdmin;
    
    if (showCatShare && safeCatShare > 0 && actualNetProfit > 0) {
      items.push({
        name: "Чистая прибыль",
        value: actualNetProfit,
        total: actualNetProfit,
        isPositive: true,
        color: "hsl(var(--chart-1))",
      });
      runningTotal = actualNetProfit;
      
      const halfProfit = safeCatShare;
      
      items.push({
        name: "→ Админ (50%)",
        value: -halfProfit,
        total: runningTotal - halfProfit,
        isPositive: false,
        color: "hsl(var(--chart-4))",
      });
      runningTotal -= halfProfit;

      items.push({
        name: "→ Кот (50%)",
        value: -halfProfit,
        total: runningTotal - halfProfit,
        isPositive: false,
        color: "hsl(var(--chart-5))",
      });
    } else {
      items.push({
        name: "Чистая прибыль",
        value: actualNetProfit,
        total: actualNetProfit,
        isPositive: actualNetProfit >= 0,
        color: actualNetProfit >= 0 ? "hsl(var(--chart-1))" : "hsl(var(--destructive))",
      });
    }

    return items;
  }, [safeClientBill, scheme, safeCommissionRate, safeExpensesPaidByPartner, safeExpensesPaidByAdmin, safePartnerShare, safeAdminShare, safeNetProfitAdmin, safeCatShare, showCatShare]);

  const chartData = useMemo(() => {
    let cumulative = 0;
    return data.map((item, index) => {
      const start = index === 0 ? 0 : cumulative;
      cumulative = item.total;
      
      return {
        name: item.name,
        start: Math.min(start, cumulative),
        end: Math.max(start, cumulative),
        value: Math.abs(item.value),
        isPositive: item.isPositive,
        color: item.color,
        displayValue: item.value,
      };
    });
  }, [data]);

  const CustomTooltip = ({ active, payload }: Partial<import("recharts").TooltipContentProps<number, string>>) => {
    if (!active || !payload?.[0]) return null;
    const item = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-lg">
        <p className="font-medium text-sm">{item.name}</p>
        <p className={`text-sm ${item.isPositive ? "text-green-600" : "text-red-600"}`}>
          {item.isPositive ? "+" : ""}{formatCurrency(item.displayValue)}
        </p>
      </div>
    );
  };

  // Don't render if no data
  if (!chartData || chartData.length === 0) {
    return null;
  }

  return (
    <div className="w-full h-[200px]" data-testid="chart-waterfall">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 10, left: 80, bottom: 10 }}
        >
          <XAxis type="number" hide />
          <YAxis 
            type="category" 
            dataKey="name" 
            tick={{ fontSize: 12 }}
            width={75}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine x={0} stroke="hsl(var(--border))" />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
