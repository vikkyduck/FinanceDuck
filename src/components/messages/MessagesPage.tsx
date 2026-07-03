import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { messagesService, type Message, type MessageThread } from "@/lib/services/messages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { VirtualizedList, VIRTUALIZATION_THRESHOLD } from "@/components/virtualized/VirtualizedList";
import { useToast } from "@/hooks/use-toast";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

const roleLabel: Record<string, string> = {
  client: "Клиент",
  admin: "Админ",
  assistant: "Ассистент",
};

const threadKey = (t: { invoice_id: string; expense_id: string | null }) =>
  `${t.invoice_id}::${t.expense_id ?? ""}`;

export const MessagesPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role: currentRole } = useAuth();

  const { data: threads = [], isLoading: loadingThreads } = useQuery<MessageThread[]>({
    queryKey: ["/messages/threads"],
    queryFn: () => messagesService.listThreads(),
    refetchInterval: 15000,
  });

  const [searchParams] = useSearchParams();
  // Если на /messages пришли с query (?invoiceId=&expenseId=), активируем
  // именно этот тред. Это используется при клике на тред из поиска.
  const initialKeyFromUrl = (() => {
    const inv = searchParams.get('invoiceId');
    if (!inv) return null;
    const exp = searchParams.get('expenseId');
    return `${inv}::${exp ?? ''}`;
  })();
  const [activeKey, setActiveKey] = useState<string | null>(initialKeyFromUrl);

  // Если URL поменялся (новая навигация из поиска по другому треду) —
  // переключаемся.
  useEffect(() => {
    const inv = searchParams.get('invoiceId');
    if (!inv) return;
    const exp = searchParams.get('expenseId');
    const k = `${inv}::${exp ?? ''}`;
    if (k !== activeKey) setActiveKey(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const active = useMemo(
    () => threads.find((t) => threadKey(t) === activeKey) || threads[0],
    [threads, activeKey]
  );

  useEffect(() => {
    if (!activeKey && threads.length > 0) {
      setActiveKey(threadKey(threads[0]));
    }
  }, [threads, activeKey]);

  // Когда юзер открыл тред — помечаем его прочитанным. Бейдж в меню и дот
  // на счёте мгновенно гаснут (после инвалидации /messages/unread-summary).
  useEffect(() => {
    if (!active) return;
    messagesService.markRead(active.invoice_id, active.expense_id ?? null)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/messages/unread-summary"] });
        queryClient.invalidateQueries({ queryKey: ["/messages/threads"] });
      })
      .catch(() => {});
  }, [active, queryClient]);

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ["/messages", active?.invoice_id, active?.expense_id ?? null],
    queryFn: () => messagesService.listMessages(active!.invoice_id, active!.expense_id ?? null),
    enabled: !!active,
    refetchInterval: 15000,
  });

  const [body, setBody] = useState("");
  const del = useMutation({
    mutationFn: (msgId: string) => messagesService.deleteMessage(msgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/messages", active?.invoice_id, active?.expense_id ?? null] });
      queryClient.invalidateQueries({ queryKey: ["/messages/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/messages/unread-summary"] });
      toast({ title: "Сообщение удалено" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось удалить", variant: "destructive" });
    },
  });
  const send = useMutation({
    mutationFn: (text: string) => messagesService.sendMessage(active!.invoice_id, text, active!.expense_id ?? null),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["/messages", active?.invoice_id, active?.expense_id ?? null] });
      queryClient.invalidateQueries({ queryKey: ["/messages/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/messages/unread-summary"] });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось отправить", variant: "destructive" });
    },
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-160px)]">
      <Card className="overflow-hidden flex flex-col">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Треды
          </CardTitle>
        </CardHeader>
        <div className="flex-1 overflow-y-auto">
          {(() => {
            if (loadingThreads) return <div className="p-6 text-center text-sm text-muted-foreground">Загружаю…</div>;
            if (threads.length === 0) return <div className="p-6 text-center text-sm text-muted-foreground">Пока ни одного треда.</div>;

            const renderThread = (t: MessageThread) => {
              const k = threadKey(t);
              const isActive = k === (active && threadKey(active));
              return (
                <button
                  key={k}
                  onClick={() => setActiveKey(k)}
                  data-testid={`thread-${k}`}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-accent/50 transition-colors ${isActive ? "bg-accent" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">
                      № {t.invoice_number || "—"}
                      {currentRole !== 'client' && <span className="text-muted-foreground"> · {t.client_name}</span>}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDate(t.last_message_at)}
                    </span>
                  </div>
                  {t.expense_id && (
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      Списание: {t.expense_description || "—"} {t.expense_amount ? `· ${formatMoney(Number(t.expense_amount))}` : ""}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    <span className="font-medium">{roleLabel[t.last_message_role]}:</span> {t.last_message_body}
                  </div>
                </button>
              );
            };

            // Виртуализация при > 100 тредов: в DOM держится ~10-15 кнопок,
            // даже если у админа их сотни. Прокрутка плавная даже на iPhone SE.
            if (threads.length > VIRTUALIZATION_THRESHOLD) {
              return (
                <VirtualizedList
                  items={threads}
                  getRowKey={(t) => threadKey(t)}
                  rowHeight={86}
                  maxHeight={typeof window !== "undefined" && window.innerWidth < 768 ? 480 : 800}
                  renderRow={(t) => renderThread(t)}
                />
              );
            }
            return <>{threads.map(renderThread)}</>;
          })()}
        </div>
      </Card>

      <Card className="overflow-hidden flex flex-col">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-base">
            {active ? (
              <>
                Счёт № {active.invoice_number}
                {active.expense_id && (
                  <span className="text-muted-foreground font-normal text-sm ml-2">
                    · Списание: {active.expense_description || "—"}
                    {active.expense_amount ? ` · ${formatMoney(Number(active.expense_amount))}` : ""}
                  </span>
                )}
              </>
            ) : "Выберите тред"}
          </CardTitle>
        </CardHeader>

        <div className="flex-1 overflow-y-auto p-4 bg-muted/20">
          {(() => {
            if (loadingMessages) return <div className="text-sm text-muted-foreground text-center py-8">Загружаю…</div>;
            if (messages.length === 0) return <div className="text-sm text-muted-foreground text-center py-8">Сообщений в этом треде ещё нет.</div>;

            const renderMessage = (m: Message) => {
              const alignRight = m.authorRole === currentRole;
              const canDelete = currentRole === 'admin';
              const deleteBtn = canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Удалить сообщение? Это действие нельзя отменить.")) del.mutate(m.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 mt-1"
                  title="Удалить"
                  aria-label="Удалить сообщение"
                  data-testid={`delete-message-${m.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              );
              return (
                <div className={`group flex items-start gap-1 py-1.5 ${alignRight ? "justify-end" : "justify-start"}`}>
                  {alignRight && deleteBtn}
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 ${alignRight ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                    <div className={`text-[10px] uppercase tracking-wide mb-1 ${alignRight ? "opacity-80" : "text-muted-foreground"}`}>
                      {roleLabel[m.authorRole] || m.authorRole} · {formatDateTime(m.createdAt)}
                    </div>
                    <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                  </div>
                  {!alignRight && deleteBtn}
                </div>
              );
            };

            if (messages.length > VIRTUALIZATION_THRESHOLD) {
              return (
                <VirtualizedList
                  items={messages}
                  getRowKey={(m) => m.id}
                  rowHeight={88}
                  maxHeight={typeof window !== "undefined" && window.innerWidth < 768 ? 460 : 720}
                  renderRow={renderMessage}
                />
              );
            }
            return (
              <div className="space-y-3">
                {messages.map((m) => (
                  <div key={m.id}>{renderMessage(m)}</div>
                ))}
              </div>
            );
          })()}
        </div>

        {active && (
          <CardContent className="border-t py-3 space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Напишите сообщение…"
              rows={2}
              data-testid="textarea-thread-body"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (body.trim()) send.mutate(body.trim());
                }
              }}
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter — отправить</span>
              <Button onClick={() => send.mutate(body.trim())} disabled={send.isPending || !body.trim()} data-testid="button-send-thread">
                {send.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Отправить
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
