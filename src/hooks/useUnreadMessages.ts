import { useQuery } from "@tanstack/react-query";
import { messagesService, type UnreadSummary } from "@/lib/services/messages";

const EMPTY: UnreadSummary = { totalUnread: 0, byInvoice: {} };

/**
 * Узнаёт раз в 30 секунд, сколько у меня непрочитанных по тредам.
 * Возвращает totalUnread (для бейджа на «Сообщения») и byInvoice (для дотов).
 */
export const useUnreadMessages = () => {
  const q = useQuery<UnreadSummary>({
    queryKey: ["/messages/unread-summary"],
    queryFn: () => messagesService.unreadSummary(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
  return q.data ?? EMPTY;
};
