import { describe, it, expect } from "vitest";
import { splitHighlight, escapeRegExp } from "./highlight";

// XSS-фикс подсветки поиска (S4): раньше имя клиента/партнёра вставлялось в
// страницу через dangerouslySetInnerHTML → сырой HTML в имени исполнялся.
// Теперь splitHighlight возвращает СТРОКИ (React рендерит их как текст).

describe("splitHighlight", () => {
  it("без запроса — одна часть, весь текст, без подсветки", () => {
    expect(splitHighlight("ООО Ромашка", "")).toEqual([{ value: "ООО Ромашка", match: false }]);
  });

  it("подсвечивает совпадение, регистронезависимо", () => {
    expect(splitHighlight("Ромашка", "ром")).toEqual([{ value: "Ром", match: true }, { value: "ашка", match: false }]);
  });

  it("несколько совпадений", () => {
    expect(splitHighlight("абаба", "а").filter(p => p.match).length).toBe(3);
  });

  it("БЕЗОПАСНОСТЬ: вредоносное имя остаётся строкой (не HTML-узлом)", () => {
    const evil = '<img src=x onerror="steal()">';
    const parts = splitHighlight(evil, "img");
    // склеиваем обратно — исходная строка сохранена дословно, никакого <mark> в value
    expect(parts.map(p => p.value).join("")).toBe(evil);
    expect(parts.every(p => typeof p.value === "string")).toBe(true);
    // ни одна часть не содержит инъецированной HTML-разметки подсветки
    expect(parts.some(p => p.value.includes("<mark"))).toBe(false);
  });

  it("БЕЗОПАСНОСТЬ: regex-спецсимволы в запросе не ломают и не инъецируют", () => {
    // раньше new RegExp(search) кидал/вёл себя странно на '(' и '['
    expect(() => splitHighlight("a(b[c", "(")).not.toThrow();
    expect(() => splitHighlight("текст", "[")).not.toThrow();
    expect(() => splitHighlight("a.b.c", ".")).not.toThrow();
    // '.' не должен матчить всё подряд (иначе подсветится каждый символ)
    expect(splitHighlight("abc", ".").every(p => !p.match)).toBe(true);
  });

  it("escapeRegExp экранирует спецсимволы", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
  });
});
