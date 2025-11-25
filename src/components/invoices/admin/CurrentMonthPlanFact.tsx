import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Settings, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

export const CurrentMonthPlanFact = () => {
  const { accessTokenId: authAccessTokenId } = useAuth();
  const { getSession } = useUserRole();
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState({
    plannedAdminShare: 0,
    plannedCatShare: 0,
  });
  const [fact, setFact] = useState({
    actualAdminShare: 0,
    actualCatShare: 0,
  });
  const [editValues, setEditValues] = useState({
    plannedAdminShare: "",
    plannedCatShare: "",
  });

  useEffect(() => {
    fetchCurrentMonthData();
  }, []);

  const fetchCurrentMonthData = async () => {
    setLoading(true);
    try {
      await ensureSessionContext();

      // Fetch plan
      const { data: planData } = await supabase
        .from("monthly_financial_plans")
        .select("*")
        .eq("year", currentYear)
        .eq("month", currentMonth)
        .maybeSingle();

      if (planData) {
        setPlan({
          plannedAdminShare: Number(planData.planned_admin_share),
          plannedCatShare: Number(planData.planned_cat_share),
        });
        setEditValues({
          plannedAdminShare: planData.planned_admin_share.toString(),
          plannedCatShare: planData.planned_cat_share.toString(),
        });
      }

      // Fetch fact (actual data from current month)
      const startOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString();
      const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();

      const { data: invoices } = await supabase
        .from("invoices")
        .select(`
          invoice_calculations (
            admin_share_50,
            cat_share_50
          )
        `)
        .gte('payment_date', startOfMonth)
        .lte('payment_date', endOfMonth)
        .not('payment_date', 'is', null);

      if (invoices) {
        let totalAdminShare = 0;
        let totalCatShare = 0;

        invoices.forEach((invoice: any) => {
          const calc = invoice.invoice_calculations?.[0];
          if (calc) {
            totalAdminShare += Number(calc.admin_share_50 || 0);
            totalCatShare += Number(calc.cat_share_50 || 0);
          }
        });

        setFact({
          actualAdminShare: totalAdminShare,
          actualCatShare: totalCatShare,
        });
      }
    } catch (error) {
      console.error("Error fetching current month data:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async () => {
    try {
      await ensureSessionContext();

      const plannedAdmin = parseFloat(editValues.plannedAdminShare) || 0;
      const plannedCat = parseFloat(editValues.plannedCatShare) || 0;

      // Get created_by from either auth system (email login) or access token system (code login)
      const session = getSession();
      const createdBy = authAccessTokenId || session?.accessTokenId;
      
      if (!createdBy) {
        toast.error("Сессия не найдена");
        return;
      }

      const { error } = await supabase
        .from("monthly_financial_plans")
        .upsert({
          year: currentYear,
          month: currentMonth,
          planned_admin_share: plannedAdmin,
          planned_cat_share: plannedCat,
          created_by: createdBy,
        });

      if (error) throw error;

      setPlan({
        plannedAdminShare: plannedAdmin,
        plannedCatShare: plannedCat,
      });
      setIsEditing(false);
      toast.success("План сохранен");
    } catch (error) {
      console.error("Error saving plan:", error);
      toast.error("Ошибка сохранения плана");
    }
  };

  const getMonthName = () => {
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];
    return monthNames[currentMonth - 1];
  };

  const calculateDifference = (fact: number, plan: number) => {
    if (plan === 0) return null;
    return ((fact - plan) / plan) * 100;
  };

  const adminDiff = calculateDifference(fact.actualAdminShare, plan.plannedAdminShare);
  const catDiff = calculateDifference(fact.actualCatShare, plan.plannedCatShare);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Загрузка...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>План / Факт — {getMonthName()} {currentYear}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Текущий месяц обнуляется 1-го числа
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
          >
            <Settings className="h-4 w-4 mr-2" />
            {isEditing ? "Отмена" : "Установить план"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isEditing ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="plannedAdminShare">План для Админа</Label>
                <Input
                  id="plannedAdminShare"
                  type="number"
                  value={editValues.plannedAdminShare}
                  onChange={(e) => setEditValues(prev => ({ ...prev, plannedAdminShare: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plannedCatShare">План для Кота</Label>
                <Input
                  id="plannedCatShare"
                  type="number"
                  value={editValues.plannedCatShare}
                  onChange={(e) => setEditValues(prev => ({ ...prev, plannedCatShare: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <Button onClick={handleSavePlan} className="w-full">
              Сохранить план
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Admin Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Доля Админа</h3>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">План:</span>
                  <span className="font-semibold">{formatCurrency(plan.plannedAdminShare)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Факт:</span>
                  <span className="font-semibold text-primary">{formatCurrency(fact.actualAdminShare)}</span>
                </div>
                {adminDiff !== null && (
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Отклонение:</span>
                    <span className={`font-semibold flex items-center gap-1 ${adminDiff >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                      {adminDiff >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {adminDiff > 0 ? '+' : ''}{adminDiff.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Cat Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Доля Кота</h3>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">План:</span>
                  <span className="font-semibold">{formatCurrency(plan.plannedCatShare)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Факт:</span>
                  <span className="font-semibold text-primary">{formatCurrency(fact.actualCatShare)}</span>
                </div>
                {catDiff !== null && (
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Отклонение:</span>
                    <span className={`font-semibold flex items-center gap-1 ${catDiff >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                      {catDiff >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {catDiff > 0 ? '+' : ''}{catDiff.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
