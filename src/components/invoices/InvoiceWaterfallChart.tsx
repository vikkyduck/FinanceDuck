import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { formatCurrency } from "@/lib/invoiceCalculations";

interface WaterfallChartProps {
  clientBill: number;
  scheme: "agency_30" | "commission_based";
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
  const data = useMemo(() => {
    const items: WaterfallItem[] = [];
    let runningTotal = 0;

    items.push({
      name: "Счёт клиенту",
      value: clientBill,
      total: clientBill,
      isPositive: true,
      color: "hsl(var(--primary))",
    });
    runningTotal = clientBill;

    if (scheme === "agency_30") {
      items.push({
        name: "Партнёру (15%)",
        value: -partnerShare,
        total: runningTotal - partnerShare,
        isPositive: false,
        color: "hsl(var(--chart-2))",
      });
      runningTotal -= partnerShare;

      items.push({
        name: "Админу (15%)",
        value: -adminShare,
        total: runningTotal - adminShare,
        isPositive: false,
        color: "hsl(var(--chart-3))",
      });
      runningTotal -= adminShare;
    } else {
      const commissionAmount = clientBill * (commissionRate / 100);
      items.push({
        name: `Комиссия (${commissionRate.toFixed(2)}%)`,
        value: -commissionAmount,
        total: runningTotal - commissionAmount,
        isPositive: false,
        color: "hsl(var(--chart-2))",
      });
      runningTotal -= commissionAmount;
    }

    if (expensesPaidByPartner > 0) {
      items.push({
        name: "Расходы (партнёр)",
        value: -expensesPaidByPartner,
        total: runningTotal - expensesPaidByPartner,
        isPositive: false,
        color: "hsl(var(--chart-3))",
      });
      runningTotal -= expensesPaidByPartner;
    }

    const actualNetProfit = netProfitAdmin ?? runningTotal - expensesPaidByAdmin;
    
    if (showCatShare && catShare > 0 && actualNetProfit > 0) {
      items.push({
        name: "Чистая прибыль",
        value: actualNetProfit,
        total: actualNetProfit,
        isPositive: true,
        color: "hsl(var(--chart-1))",
      });
      runningTotal = actualNetProfit;
      
      const halfProfit = catShare;
      
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
      runningTotal -= halfProfit;
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
  }, [clientBill, scheme, commissionRate, expensesPaidByPartner, expensesPaidByAdmin, partnerShare, adminShare, netProfitAdmin, catShare, showCatShare]);

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

  const CustomTooltip = ({ active, payload }: any) => {
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
