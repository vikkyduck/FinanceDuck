/**
 * Минимальный Telegram-клиент для нотификаций.
 *
 * Логика выбора бота:
 *   1. Если у клиента задан client.tgBotToken — используем его (свой бот клиента).
 *   2. Иначе fallback на process.env.FALLBACK_TG_BOT_TOKEN.
 *   3. Если нет ни того, ни другого — нотификация молча пропускается.
 *
 * sendTelegramMessage никогда не бросает наверх: ошибки логируются, но
 * основной поток (создание сообщения в кабинете) не прерывается.
 */

// API-хост можно переопределить через TELEGRAM_API_BASE — нужно для
// российских хостингов (Timeweb), где прямой доступ к api.telegram.org
// заблокирован: указываем туда URL Cloudflare-Worker-прокси.
const TG_API = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");

export interface TelegramTarget {
  botToken: string;
  chatId: string;
}

/** Вернёт настройки целевого чата для клиента или null, если не настроено. */
export function resolveTelegramTarget(client: {
  tgChatId?: string | null;
  tgBotToken?: string | null;
} | null | undefined): TelegramTarget | null {
  if (!client?.tgChatId) return null;
  const token = (client.tgBotToken && client.tgBotToken.trim())
    || (process.env.FALLBACK_TG_BOT_TOKEN || "").trim();
  if (!token) return null;
  return { botToken: token, chatId: client.tgChatId.trim() };
}

/** Отправить HTML-сообщение в чат. Все ошибки — лог + резолв (нет throw). */
export async function sendTelegramMessage(
  target: TelegramTarget,
  text: string,
  options: { disableLinkPreview?: boolean } = {},
): Promise<void> {
  try { await sendTelegramMessageStrict(target, text, options); }
  catch { console.error("[telegram] sendMessage failed"); }
}

/** Outbox delivery requires failure propagation and a bounded network timeout. */
export async function sendTelegramMessageStrict(
  target: TelegramTarget, text: string, options: { disableLinkPreview?: boolean } = {},
): Promise<void> {
  const url = `${TG_API}/bot${target.botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        chat_id: target.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: options.disableLinkPreview ?? true,
      }),
    });
    if (!res.ok) {
      throw new Error("Telegram delivery failed");
    }
  } catch (e) {
    throw new Error("Telegram delivery failed");
  }
}

/** Эскейп HTML для безопасного включения в parse_mode=HTML. */
export function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  } as Record<string, string>)[c] || c);
}

/** Безопасно сборка ссылки: PUBLIC_BASE_URL обязателен, иначе ссылка пустая. */
export function publicUrl(path: string): string {
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return "";
  return `${base}${path.startsWith("/") ? path : "/" + path}`;
}
