import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  Users, 
  Building, 
  Coins, 
  RefreshCcw,
  Clock,
  Monitor,
  Globe
} from "lucide-react";

interface AssistantActionLog {
  id: string;
  accessTokenId: string | null;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  tokenCode?: string;
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

function ActionLogCard({ log }: { log: AssistantActionLog }) {
  const Icon = getActionIcon(log.actionType);
  const formattedDate = format(new Date(log.createdAt), "d MMM yyyy, HH:mm:ss", { locale: ru });
  
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
            {log.tokenCode && (
              <Badge variant="outline" className="font-mono text-xs">
                {log.tokenCode}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formattedDate}
          </span>
        </div>
        
        <p className="text-sm mt-1" data-testid={`text-description-${log.id}`}>
          {log.description}
        </p>
        
        {log.details && (
          <pre className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded-md overflow-x-auto max-w-full">
            {log.details}
          </pre>
        )}
        
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          {log.ipAddress && (
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {log.ipAddress}
            </span>
          )}
          {log.userAgent && (
            <span className="flex items-center gap-1 truncate max-w-[200px]" title={log.userAgent}>
              <Monitor className="w-3 h-3" />
              {log.userAgent.split(' ').slice(0, 2).join(' ')}
            </span>
          )}
        </div>
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
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data, isLoading, refetch, isFetching } = useQuery<{ logs: AssistantActionLog[]; total: number }>({
    queryKey: ["/api/assistant-logs", page, pageSize],
    queryFn: async () => {
      const response = await fetch(`/api/assistant-logs?limit=${pageSize}&offset=${page * pageSize}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch logs");
      }
      return response.json();
    },
    staleTime: 30000,
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            История действий ассистента
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Журнал всех действий, выполненных ассистентами в системе
          </p>
        </div>
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
        <CardHeader className="flex flex-row items-center justify-between gap-4 py-4">
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
        
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingSkeleton />
          ) : data?.logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Нет записей в журнале</p>
              <p className="text-xs mt-1">
                Действия ассистентов будут отображаться здесь
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[calc(100vh-300px)]">
              <div className="divide-y">
                {data?.logs.map((log) => (
                  <ActionLogCard key={log.id} log={log} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
