import { Fragment } from "react";
import { splitHighlight } from "@/lib/highlight";

/**
 * Подсветка совпадений `query` в `text` — БЕЗОПАСНО, через React-узлы: текст
 * экранируется автоматически. Раньше подсветка шла через
 * dangerouslySetInnerHTML прямо от имени клиента/партнёра — сырой HTML в имени
 * (напр. `<img onerror=...>`) исполнялся в браузере админа (stored XSS).
 */
export function HighlightMatch({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlight(text, query).map((part, i) =>
        part.match
          ? <mark key={i} className="bg-primary/20">{part.value}</mark>
          : <Fragment key={i}>{part.value}</Fragment>,
      )}
    </>
  );
}
