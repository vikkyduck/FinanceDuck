import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, AlertTriangle, Lock, CheckCircle } from "lucide-react";

export default function SecurityMonitoring() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Мониторинг безопасности</h1>
            <p className="text-muted-foreground">
              Отслеживание попыток входа, событий безопасности и подозрительной активности
            </p>
          </div>
          <Shield className="h-10 w-10 text-primary" />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <h3 className="text-sm font-medium text-muted-foreground">Статус системы</h3>
            </div>
            <p className="text-2xl font-bold mt-2 text-green-600">Защищено</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-medium text-muted-foreground">Аутентификация</h3>
            </div>
            <p className="text-2xl font-bold mt-2">Cookie + CSRF</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">Rate Limiting</h3>
            </div>
            <p className="text-2xl font-bold mt-2">Активно</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">RBAC</h3>
            </div>
            <p className="text-2xl font-bold mt-2">4 роли</p>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Меры безопасности
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-lg border bg-muted/30">
                <h4 className="font-semibold mb-2">Аутентификация</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Cookie-based сессии с HttpOnly</li>
                  <li>CSRF защита через токены</li>
                  <li>Secure флаги в production</li>
                  <li>Хеширование паролей</li>
                </ul>
              </div>
              
              <div className="p-4 rounded-lg border bg-muted/30">
                <h4 className="font-semibold mb-2">Контроль доступа</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Роли: admin, assistant, partner, client</li>
                  <li>Серверная фильтрация данных</li>
                  <li>Allowlist для каждой роли</li>
                  <li>Защита API endpoints</li>
                </ul>
              </div>
              
              <div className="p-4 rounded-lg border bg-muted/30">
                <h4 className="font-semibold mb-2">Защита данных</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>XSS защита через санитизацию</li>
                  <li>Валидация входных данных (Zod)</li>
                  <li>Безопасное хранение секретов</li>
                  <li>SSL/TLS шифрование</li>
                </ul>
              </div>
              
              <div className="p-4 rounded-lg border bg-muted/30">
                <h4 className="font-semibold mb-2">Rate Limiting</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Token bucket алгоритм</li>
                  <li>Защита от брутфорса</li>
                  <li>API throttling</li>
                  <li>Временная блокировка</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
