import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Trash2 } from "lucide-react";
import { VirtualizedList, VIRTUALIZATION_THRESHOLD } from "@/components/virtualized/VirtualizedList";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { messagesService, type Message } from "@/lib/services/messages";
import { useToast } from "@/hooks/use-toast";
import { formatMoney, formatDateTime } from "@/lib/format";

interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber?: string;
  expenseId?: string | null;
  expenseDescription?: string | null;
  expenseAmount?: number | null;
  currentRole?: import("@shared/schema").UserRole;
}

const roleLabel: Record<string, string> = {
  client: "Клиент",
  admin: "Админ",
  assistant: "Ассистент",
};

export const SendMessageDialog = ({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  expenseId,
  expenseDescription,
  expenseAmount,
  currentRole,
}: SendMessageDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/messages", invoiceId, expenseId ?? null],
    queryFn: () => messagesService.listMessages(invoiceId, expenseId ?? null),
    enabled: open && !!invoiceId,
  });

  const del = useMutation({
    mutationFn: (msgId: string) => messagesService.deleteMessage(msgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/messages", invoiceId, expenseId ?? null] });
      queryClient.invalidateQueries({ queryKey: ["/messages/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/messages/unread-summary"] });
      toast({ title: "Сообщение удалено" });
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось удалить", variant: "destructive" });
    },
  });

  const send = useMutation({
    mutationFn: (text: string) => messagesService.sendMessage(invoiceId, text, expenseId ?? null),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["/messages", invoiceId, expenseId ?? null] });
      queryClient.invalidateQueries({ queryKey: ["/messages/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/messages/unread-summary"] });
      toast({ title: "Отправлено" });
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось отправить", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (open) setTimeout(() => taRef.current?.focus(), 100);
  }, [open]);

  // Когда диалог открыт и сообщения загружены — помечаем тред прочитанным
  // с нашей стороны. Это закрывает дот возле счёта и убирает бейдж в меню.
  useEffect(() => {
    if (!open || isLoading) return;
    messagesService.markRead(invoiceId, expenseId ?? null)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/messages/unread-summary"] });
        queryClient.invalidateQueries({ queryKey: ["/api/client/overview-buckets"] });
      })
      .catch(() => {});
  }, [open, isLoading, invoiceId, expenseId, queryClient]);

  const handleSend = () => {
    const text = body.trim();
    if (!text) return;
    send.mutate(text);
  };

  const subtitle = expenseId
    ? `Списание · ${expenseDescription || "—"}${expenseAmount ? " · " + formatMoney(Number(expenseAmount)) : ""}`
    : `Счёт № ${invoiceNumber || "—"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle>Сообщения</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        {(() => {
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
                <div className={`max-w-[80%] rounded-lg px-3 py-2 ${alignRight ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                  <div className={`text-[10px] uppercase tracking-wide mb-1 ${alignRight ? "opacity-80" : "text-muted-foreground"}`}>
                    {roleLabel[m.authorRole] || m.authorRole} · {formatDateTime(m.createdAt)}
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                </div>
                {!alignRight && deleteBtn}
              </div>
            );
          };

          // Виртуализация только когда сообщений много (длинный исторический тред).
          // Иначе — обычный flex-список (естественное распределение высот).
          const useVirt = messages.length > VIRTUALIZATION_THRESHOLD;
          return (
            <div className={`border rounded-md bg-muted/30 ${useVirt ? "" : "max-h-[40vh] overflow-y-auto p-3 space-y-3"}`}>
              {isLoading && (
                <div className="text-sm text-muted-foreground text-center py-6">Загружаю…</div>
              )}
              {!isLoading && messages.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-6">
                  Сообщений пока нет. Напишите первое.
                </div>
              )}
              {!isLoading && messages.length > 0 && (
                useVirt ? (
                  <div className="p-3">
                    <VirtualizedList
                      items={messages}
                      getRowKey={(m) => m.id}
                      rowHeight={88}
                      maxHeight={typeof window !== "undefined" && window.innerWidth < 640 ? 360 : 480}
                      renderRow={renderMessage}
                    />
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id}>{renderMessage(m)}</div>
                  ))
                )
              )}
            </div>
          );
        })()}

        <div className="space-y-2">
          <Textarea
            ref={taRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Напишите сообщение…"
            rows={3}
            data-testid="textarea-message-body"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="text-xs text-muted-foreground">
            ⌘/Ctrl + Enter — отправить
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-message-dialog">
            Закрыть
          </Button>
          <Button onClick={handleSend} disabled={send.isPending || !body.trim()} data-testid="button-send-message">
            {send.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Отправить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
