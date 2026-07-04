/** Экранируем спецсимволы regex — чужой ввод не сломает и не «внедрит» шаблон. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface HighlightPart {
  value: string;   // ВСЕГДА обычная строка → React отрендерит как текст (экранирует)
  match: boolean;  // true → обернуть в <mark>
}

/**
 * Разбивает text на части с пометкой совпадений query. Чистая функция, без DOM
 * и без HTML: возвращает СТРОКИ. Потому вредоносное имя (`<img onerror=...>`)
 * остаётся строкой и не может исполниться — в отличие от прежнего
 * dangerouslySetInnerHTML.
 */
export function splitHighlight(text: string, query: string): HighlightPart[] {
  const q = (query || "").trim();
  if (!q || !text) return [{ value: text || "", match: false }];
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return parts
    .filter((p) => p !== "")
    .map((value) => ({ value, match: value.toLowerCase() === q.toLowerCase() }));
}
