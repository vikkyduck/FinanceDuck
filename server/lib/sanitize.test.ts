import { describe, it, expect } from "vitest";
import { decodeHtmlEntities, pickExpense } from "./sanitize";

// Описание расхода — простой текст. Старый клиент экранировал его в HTML
// перед сохранением: в таблице «https:&#x2F;&#x2F;…», строка без переносов
// распирала окно счета, и кнопка «Добавить расход» уезжала за край.
describe("описание расхода — простой текст", () => {
  it("снимает экранирование старого клиента", () => {
    expect(decodeHtmlEntities("https:&#x2F;&#x2F;lknpd.nalog.ru&#x2F;api"))
      .toBe("https://lknpd.nalog.ru/api");
    expect(decodeHtmlEntities("тренеру &quot;От инициативы&quot; &amp; Ко, l&#x27;été"))
      .toBe(`тренеру "От инициативы" & Ко, l'été`);
  });

  it("снимает двойное экранирование (правка уже экранированного)", () => {
    expect(decodeHtmlEntities("04&amp;#x2F;08")).toBe("04/08");
  });

  it("обычный текст не трогает", () => {
    const s = "Анна Жданова 5 сессий, 95 240 ₽ — 50% & больше";
    expect(decodeHtmlEntities(s)).toBe(s);
  });

  it("pickExpense чистит описание и режет лишние поля", () => {
    const out = pickExpense({ description: "  a&#x2F;b ", amount: "10", invoiceId: "x", id: "y" });
    expect(out).toEqual({ description: "a/b", amount: "10" });
  });
});
