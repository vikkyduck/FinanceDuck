import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Info } from "lucide-react";

export const CurrentMonthPlanFact = () => {
  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];
  
  const currentMonth = monthNames[new Date().getMonth()];
  const currentYear = new Date().getFullYear();

  return (
    <Card>
      <CardHeader>
        <CardTitle>План / Факт: {currentMonth} {currentYear}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Для отслеживания выполнения плана необходимо настроить целевые показатели.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-6 bg-muted/30 rounded-lg border border-dashed text-center">
          <Info className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-lg font-medium text-muted-foreground">
            Планирование будет доступно в следующей версии
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Для установки целей продаж обратитесь к администратору
          </p>
        </div>

        <div className="space-y-4 opacity-50">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Продажи</span>
              <span className="text-muted-foreground">— / —</span>
            </div>
            <Progress value={0} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Прибыль</span>
              <span className="text-muted-foreground">— / —</span>
            </div>
            <Progress value={0} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Поступления</span>
              <span className="text-muted-foreground">— / —</span>
            </div>
            <Progress value={0} className="h-2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
