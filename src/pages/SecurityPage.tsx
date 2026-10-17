import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Download, LogOut, Smartphone, Clock, Users as UsersIcon, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime, formatDate } from "@/lib/format";

interface SessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface AccessInfo {
  role: string;
  lastLogin: { at: string; ipAddress: string | null; userAgent: string } | null;
  peers: Array<{
    id: string;
    role: string;
    codeMask: string;
    isActive: boolean;
    lastUsedAt: string | null;
    createdAt: string;
    expiresAt: string | null;
    isYou: boolean;
  }>;
}

const roleLabel: Record<string, string> = {
  admin: "Админ",
  assistant: "Ассистент",
  client: "Клиент",
  partner: "Партнёр",
  accountant: "Бухгалтер",
};

export default function SecurityPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);

  const { data: info, isLoading: loadingInfo } = useQuery<AccessInfo>({
    queryKey: ["/me/access-info"],
    queryFn: () => apiGet<AccessInfo>("/me/access-info"),
  });

  const { data: sessions = [], isLoading: loadingSessions } = useQuery<SessionRow[]>({
    queryKey: ["/me/sessions"],
    queryFn: () => apiGet<SessionRow[]>("/me/sessions"),
  });

  const revokeOne = useMutation({
    mutationFn: (id: string) => apiPost(`/me/sessions/${id}/revoke`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/me/sessions"] });
      toast({ title: "Сессия закрыта" });
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: (e instanceof Error ? e.message : String(e)) || "Не удалось закрыть сессию", variant: "destructive" });
    },
  });

  const revokeAll = useMutation({
    mutationFn: () => apiPost("/me/sessions/revoke-all", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/me/sessions"] });
      toast({ title: "Все другие сессии закрыты" });
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: (e instanceof Error ? e.message : String(e)) || "Не удалось закрыть сессии", variant: "destructive" });
    },
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const csrfToken = localStorage.getItem("csrf_token");
      const response = await fetch("/api/me/data-export", {
        method: "GET",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const cd = response.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^";]+)"?/);
      const filename = m ? m[1] : `my-data-${new Date().toISOString().split("T")[0]}.json`;
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { window.URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
      toast({ title: "Данные скачаны", description: filename });
    } catch (e: unknown) {
      toast({ title: "Ошибка", description: (e instanceof Error ? e.message : String(e)) || "Не удалось скачать", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield className="h-6 w-6 text-muted-foreground" />
          Безопасность и данные
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Что система знает о тебе и кто имеет доступ. Управляй своими сессиями и данными.
        </p>
      </div>

      {/* Последний вход */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Последний вход
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingInfo ? (
            <Skeleton className="h-6 w-64" />
          ) : info?.lastLogin ? (
            <div className="space-y-1">
              <div className="text-sm">{formatDateTime(info.lastLogin.at)}</div>
              <div className="text-xs text-muted-foreground">
                {info.lastLogin.userAgent}{info.lastLogin.ipAddress ? ` · ${info.lastLogin.ipAddress}` : ""}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </CardContent>
      </Card>

      {/* Активные сессии */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              Активные сессии
            </CardTitle>
            <CardDescription>Устройства, с которых сейчас открыт кабинет.</CardDescription>
          </div>
          {sessions.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (confirm("Закрыть все другие сессии? Текущая останется активной.")) revokeAll.mutate();
              }}
              disabled={revokeAll.isPending}
              data-testid="button-revoke-all"
            >
              {revokeAll.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
              Закрыть все другие
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loadingSessions ? (
            <div className="p-4"><Skeleton className="h-20 w-full" /></div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Активных сессий не обнаружено.</div>
          ) : (
            <div className="divide-y">
              {sessions.map(s => (
                <div key={s.id} className="flex items-start justify-between gap-3 px-4 py-3" data-testid={`session-${s.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{s.userAgent}</span>
                      {s.isCurrent && (
                        <Badge variant="default" className="text-[10px] bg-green-100 text-green-800 hover:bg-green-100">текущая</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Создана {formatDateTime(s.createdAt)} · последняя активность {formatDateTime(s.lastActivity)}
                      {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Закрыть эту сессию?")) revokeOne.mutate(s.id);
                      }}
                      disabled={revokeOne.isPending}
                      data-testid={`revoke-${s.id}`}
                    >
                      Закрыть
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Кто из компании имеет доступ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            Кто из компании имеет доступ
          </CardTitle>
          <CardDescription>Коды доступа, выпущенные на эту компанию.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingInfo ? (
            <div className="p-4"><Skeleton className="h-16 w-full" /></div>
          ) : (info?.peers.length ?? 0) === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Нет других кодов доступа.</div>
          ) : (
            <div className="divide-y">
              {info!.peers.map(p => (
                <div key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{roleLabel[p.role] || p.role}</span>
                      <span className="text-xs text-muted-foreground font-mono">{p.codeMask}</span>
                      {p.isYou && <Badge variant="outline" className="text-[10px]">вы</Badge>}
                      {!p.isActive && <Badge variant="outline" className="text-[10px] text-muted-foreground">неактивен</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Выпущен {formatDate(p.createdAt)}
                      {p.lastUsedAt ? ` · последний вход ${formatDateTime(p.lastUsedAt)}` : " · ещё ни разу не использовался"}
                      {p.expiresAt ? ` · истекает ${formatDate(p.expiresAt)}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-3 text-xs text-muted-foreground border-t flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Управление кодами доступа (создание новых, отзыв) — у админа агентства.
              Если видишь незнакомый код в этом списке, напиши админу через раздел «Сообщения».
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Экспорт данных */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-muted-foreground" />
            Скачать все мои данные
          </CardTitle>
          <CardDescription>
            Полный архив в формате JSON: профиль, счета, расчёты, затраты по агентским счетам, переписка, коды доступа.
            Можно сохранить себе и в любой момент изучить.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={exporting} data-testid="button-export-data">
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Скачать JSON
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
