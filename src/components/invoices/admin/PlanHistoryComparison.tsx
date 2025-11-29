import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Check, X } from "lucide-react";

interface MonthlyPlanFact {
  year: number;
  month: number;
  monthName: string;
  plannedAdmin: number;
  plannedCat: number;
  actualAdmin: number;
  actualCat: number;
  adminDiff: number;
  catDiff: number;
  adminAchieved: boolean;
  catAchieved: boolean;
}

interface PlanHistoryEntry {
  id: string;
  year: number;
  month: number;
  plannedAdminShare: string;
  plannedCatShare: string;
  actualAdminShare?: number;
  actualCatShare?: number;
}

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

export const PlanHistoryComparison = () => {
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  // Fetch plans from Express API
  const { data: plansData, isLoading: loading } = useQuery<PlanHistoryEntry[]>({
    queryKey: ['/api/financial-plans/history'],
  });

  // Transform data to the expected format
  const history: MonthlyPlanFact[] = (plansData || []).map(plan => {
    const plannedAdmin = parseFloat(plan.plannedAdminShare || "0");
    const plannedCat = parseFloat(plan.plannedCatShare || "0");
    const actualAdmin = plan.actualAdminShare || 0;
    const actualCat = plan.actualCatShare || 0;
    const adminDiff = plannedAdmin > 0 ? ((actualAdmin - plannedAdmin) / plannedAdmin) * 100 : 0;
    const catDiff = plannedCat > 0 ? ((actualCat - plannedCat) / plannedCat) * 100 : 0;

    return {
      year: plan.year,
      month: plan.month,
      monthName: `${MONTH_NAMES[plan.month - 1]} ${plan.year}`,
      plannedAdmin,
      plannedCat,
      actualAdmin,
      actualCat,
      adminDiff,
      catDiff,
      adminAchieved: actualAdmin >= plannedAdmin,
      catAchieved: actualCat >= plannedCat,
    };
  });

  // Auto-select last 3 months on data load
  useEffect(() => {
    if (history.length > 0 && selectedMonths.length === 0) {
      const lastThree = history.slice(0, Math.min(3, history.length)).map(h => `${h.year}-${h.month}`);
      setSelectedMonths(lastThree);
    }
  }, [history.length]);

  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${month}`;
    setSelectedMonths(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const getComparisonData = () => {
    return history
      .filter(h => selectedMonths.includes(`${h.year}-${h.month}`))
      .map(h => ({
        month: h.monthName,
        планАдмин: h.plannedAdmin,
        фактАдмин: h.actualAdmin,
        планКот: h.plannedCat,
        фактКот: h.actualCat,
      }));
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{payload[0].payload.month}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Загрузка...
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>История выполнения планов</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Нет данных по планам. Установите план в текущем месяце для начала отслеживания.
          </p>
        </CardContent>
      </Card>
    );
  }

  const comparisonData = getComparisonData();

  return (
    <div className="space-y-6">
      {/* Comparison Chart */}
      {selectedMonths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Сравнение выбранных месяцев</CardTitle>
            <p className="text-sm text-muted-foreground">
              План vs Факт для {selectedMonths.length} {selectedMonths.length === 1 ? 'месяца' : 'месяцев'}
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis 
                  className="text-xs"
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}к`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="планАдмин" fill="hsl(var(--primary))" name="План Админ" />
                <Bar dataKey="фактАдмин" fill="hsl(var(--chart-2))" name="Факт Админ" />
                <Bar dataKey="планКот" fill="hsl(var(--chart-3))" name="План Кот" />
                <Bar dataKey="фактКот" fill="hsl(var(--chart-4))" name="Факт Кот" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle>История выполнения планов</CardTitle>
          <p className="text-sm text-muted-foreground">
            Выберите месяцы для сравнения
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Месяц</TableHead>
                  <TableHead className="text-right">План Админ</TableHead>
                  <TableHead className="text-right">Факт Админ</TableHead>
                  <TableHead className="text-center">Достигнут</TableHead>
                  <TableHead className="text-right">Отклонение</TableHead>
                  <TableHead className="text-right">План Кот</TableHead>
                  <TableHead className="text-right">Факт Кот</TableHead>
                  <TableHead className="text-center">Достигнут</TableHead>
                  <TableHead className="text-right">Отклонение</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => {
                  const isSelected = selectedMonths.includes(`${row.year}-${row.month}`);
                  return (
                    <TableRow 
                      key={`${row.year}-${row.month}`}
                      className={isSelected ? "bg-muted/50" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleMonth(row.year, row.month)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{row.monthName}</TableCell>
                      
                      {/* Admin columns */}
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(row.plannedAdmin)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(row.actualAdmin)}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.adminAchieved ? (
                          <Check className="h-5 w-5 text-chart-2 inline" />
                        ) : (
                          <X className="h-5 w-5 text-destructive inline" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`flex items-center justify-end gap-1 ${row.adminDiff >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                          {row.adminDiff >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          {row.adminDiff > 0 ? '+' : ''}{row.adminDiff.toFixed(1)}%
                        </span>
                      </TableCell>

                      {/* Cat columns */}
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(row.plannedCat)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(row.actualCat)}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.catAchieved ? (
                          <Check className="h-5 w-5 text-chart-2 inline" />
                        ) : (
                          <X className="h-5 w-5 text-destructive inline" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`flex items-center justify-end gap-1 ${row.catDiff >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                          {row.catDiff >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          {row.catDiff > 0 ? '+' : ''}{row.catDiff.toFixed(1)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
