import { useQuery } from "@tanstack/react-query";
import { INVOICE_STATUS_LABELS } from "@/lib/invoiceHelpers";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet } from "@/lib/api";
import type { AssistantActionLog } from "@shared/schema";
import { AssistantBonusManager } from "@/components/invoices/admin/AssistantBonusManager";
import { 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  Users, 
  Building, 
  Coins, 
  RefreshCcw,
  Clock,
  Filter,
  X,
  Wallet,
  History
} from "lucide-react";

interface AssistantActionLogWithDetails extends AssistantActionLog {
  tokenCode?: string;
  tokenRole?: string;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  create_invoice: "Создание счёта",
  update_invoice: "Обновление счёта",
  delete_invoice: "Удаление счёта",
  create_expense: "Создание расхода",
  update_expense: "Обновление расхода",
  delete_expense: "Удаление расхода",
  create_client: "Создание клиента",
  update_client: "Обновление клиента",
  delete_client: "Удаление клиента",
  create_partner: "Создание партнёра",
  update_partner: "Обновление партнёра",
  delete_partner: "Удаление партнёра",
  upload_act: "Загрузка акта",
  delete_act: "Удаление акта",
  create_recurring_invoice: "Создание регулярного счёта",
  update_recurring_invoice: "Обновление регулярного счёта",
  delete_recurring_invoice: "Удаление регулярного счёта",
  other: "Другое",
};

const ACTION_TYPE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create_invoice: "default",
  update_invoice: "secondary",
  delete_invoice: "destructive",
  create_expense: "default",
  update_expense: "secondary",
  delete_expense: "destructive",
  create_client: "default",
  update_client: "secondary",
  delete_client: "destructive",
  create_partner: "default",
  update_partner: "secondary",
  delete_partner: "destructive",
  upload_act: "default",
  delete_act: "destructive",
  create_recurring_invoice: "default",
  update_recurring_invoice: "secondary",
  delete_recurring_invoice: "destructive",
  other: "outline",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Админ",
  assistant: "Ассистент",
};

function getActionIcon(actionType: string) {
  if (actionType.includes("invoice") || actionType.includes("recurring")) {
    return FileText;
  }
  if (actionType.includes("client")) {
    return Users;
  }
  if (actionType.includes("partner")) {
    return Building;
  }
  if (actionType.includes("expense")) {
    return Coins;
  }
  return Clock;
}

function formatChangedFields(details: string | null): { field: string; value: string }[] | null {
  if (!details) return null;
  
  try {
    const parsed = JSON.parse(details);
    const result: { field: string; value: string }[] = [];
    
    const fieldLabels: Record<string, string> = {
      clientName: "Клиент",
      partnerName: "Партнёр",
      invoiceNumber: "Номер счёта",
      invoiceStatus: "Статус",
      amount: "Сумма",
      clientBill: "Счёт клиента",
      description: "Описание",
      status: "Статус",
      paymentDate: "Дата оплаты",
      paidByPartner: "Оплачено партнёром",
      name: "Название",
      email: "Email",
      phone: "Телефон",
      notes: "Заметки",
      actualPaymentDate: "Факт. дата оплаты",
      hideFromAssistant: "Скрыто от ассистента",
    };
    
    const hiddenFields = [
      "partnerCommissionRate", "partnerCommissionFormula", "commissionScheme",
      "partnerPaymentFormula", "clientPaymentFormula", "id", "createdAt", "updatedAt",
      "accessTokenId", "createdBy", "clientId", "partnerId", "invoiceId"
    ];
    
    for (const [key, value] of Object.entries(parsed)) {
      if (hiddenFields.includes(key)) continue;
      if (value === null || value === undefined || value === "") continue;
      
      const label = fieldLabels[key] || key;
      let displayValue: string;
      
      if (typeof value === "boolean") {
        displayValue = value ? "Да" : "Нет";
      } else if (typeof value === "object") {
        continue;
      } else if (key === "status" || key === "invoiceStatus") {
        displayValue = INVOICE_STATUS_LABELS[String(value)] || String(value);
      } else {
        displayValue = String(value);
      }
      
      result.push({ field: label, value: displayValue });
    }
    
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

function ActionLogCard({ log }: { log: AssistantActionLogWithDetails }) {
  const Icon = getActionIcon(log.actionType);
  const formattedDate = format(new Date(log.createdAt), "d MMM yyyy", { locale: ru });
  const formattedTime = format(new Date(log.createdAt), "HH:mm:ss", { locale: ru });
  const changedFields = formatChangedFields(log.details);
  
  return (
    <div 
      className="flex gap-4 p-4 border-b last:border-b-0"
      data-testid={`row-assistant-log-${log.id}`}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant={ACTION_TYPE_VARIANTS[log.actionType] || "outline"}
              data-testid={`badge-action-type-${log.id}`}
            >
              {ACTION_TYPE_LABELS[log.actionType] || log.actionType}
            </Badge>
            {log.tokenRole && (
              <Badge 
                variant={log.tokenRole === "admin" ? "default" : "secondary"}
                className="text-xs"
              >
                {ROLE_LABELS[log.tokenRole] || log.tokenRole}
              </Badge>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div className="flex items-center gap-1 justify-end">
              <Clock className="w-3 h-3" />
              {formattedTime}
            </div>
            <div>{formattedDate}</div>
          </div>
        </div>
        
        <p className="text-sm mt-1" data-testid={`text-description-${log.id}`}>
          {log.description}
        </p>
        
        {changedFields && changedFields.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
            {changedFields.slice(0, 4).map((field, idx) => (
              <div key={idx} className="flex gap-2">
                <span className="font-medium">{field.field}:</span>
                <span className="truncate">{field.value}</span>
              </div>
            ))}
            {changedFields.length > 4 && (
              <div className="text-muted-foreground/60">
                +{changedFields.length - 4} полей
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AssistantLogsPage() {
  const [activeTab, setActiveTab] = useState("bonuses");
  const [page, setPage] = useState(0);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const pageSize = 50;

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String(page * pageSize));
    if (roleFilter && roleFilter !== "all") {
      params.set("role", roleFilter);
    }
    if (dateFrom) {
      params.set("dateFrom", dateFrom);
    }
    if (dateTo) {
      params.set("dateTo", dateTo);
    }
    return params.toString();
  };

  const { data, isLoading, refetch, isFetching } = useQuery<{ logs: AssistantActionLogWithDetails[]; total: number }>({
    queryKey: ["/api/assistant-logs", page, pageSize, roleFilter, dateFrom, dateTo],
    queryFn: () => apiGet<{ logs: AssistantActionLogWithDetails[]; total: number }>(
      `/assistant-logs?${buildQueryParams()}`
    ),
    staleTime: 30000,
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  const hasFilters = roleFilter !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setRoleFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 p-6 pb-4 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              Ассистент
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Управление бонусами и история действий
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="bonuses" className="gap-2" data-testid="tab-bonuses">
              <Wallet className="h-4 w-4" />
              Бонусы
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2" data-testid="tab-logs">
              <History className="h-4 w-4" />
              История действий
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bonuses" className="mt-4">
            <AssistantBonusManager />
          </TabsContent>

          <TabsContent value="logs" className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Card className="flex-1">
                <CardContent className="py-3 px-4">
                  <div className="flex items-end gap-4 flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Filter className="w-4 h-4" />
                      <span>Фильтры:</span>
                    </div>
                    
                    <div className="space-y-1">
                      <Label htmlFor="role-filter" className="text-xs">Роль</Label>
                      <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(0); }}>
                        <SelectTrigger id="role-filter" className="w-[140px]" data-testid="select-role-filter">
                          <SelectValue placeholder="Все роли" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все роли</SelectItem>
                          <SelectItem value="admin">Админ</SelectItem>
                          <SelectItem value="assistant">Ассистент</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1">
                      <Label htmlFor="date-from" className="text-xs">С даты</Label>
                      <Input
                        id="date-from"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                        className="w-[140px]"
                        data-testid="input-date-from"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <Label htmlFor="date-to" className="text-xs">По дату</Label>
                      <Input
                        id="date-to"
                        type="date"
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                        className="w-[140px]"
                        data-testid="input-date-to"
                      />
                    </div>
                    
                    {hasFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="text-muted-foreground"
                        data-testid="button-clear-filters"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Сбросить
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-refresh"
              >
                <RefreshCcw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                Обновить
              </Button>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 py-3">
                <CardTitle className="text-base font-medium">
                  Журнал действий
                  {data && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({data.total} записей)
                    </span>
                  )}
                </CardTitle>
                
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0 || isFetching}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground min-w-[80px] text-center">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1 || isFetching}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              
              <CardContent className="p-0 max-h-[60vh] overflow-auto">
                {isLoading ? (
                  <LoadingSkeleton />
                ) : data?.logs.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Нет записей в журнале</p>
                    <p className="text-xs mt-1">
                      {hasFilters ? "Попробуйте изменить фильтры" : "Действия будут отображаться здесь"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {data?.logs.map((log) => (
                      <ActionLogCard key={log.id} log={log} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
