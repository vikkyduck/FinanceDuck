import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * СТРАЖ ФАСАДА. storage.ts обязан быть тонким фасадом: только делегация в
 * репозитории, ноль сырых обращений к БД.
 *
 * Урок ревью 2026-07: «фасад завершён» однажды было отчитано по grep'у,
 * который не ловил МНОГОСТРОЧНЫЕ запросы (`await db\n.select()...`) — 36 сырых
 * запросов прятались в 25 методах. Этот тест ловит и однострочные, и
 * многострочные формы и гоняется в барьере деплоя ([1/6] vitest run):
 * новый сырой запрос в storage.ts = красный деплой.
 */
describe("storage.ts — тонкий фасад", () => {
  it("не содержит сырых обращений к db/tx", () => {
    const src = readFileSync(path.resolve(process.cwd(), "server/storage.ts"), "utf-8");
    const offenders = src
      .split("\n")
      .map((line, i) => ({ n: i + 1, line }))
      // `await db` ловит db.select/insert/update/delete/execute/transaction,
      // включая многострочные цепочки; `await tx` — работу внутри транзакций.
      .filter(({ line }) => /await (db|tx)\b/.test(line))
      // делегация вида `return repo.fn(db, ...)` не матчится — там нет await db
      .map(({ n, line }) => `  storage.ts:${n}: ${line.trim().slice(0, 80)}`);

    expect(
      offenders,
      `Сырые обращения к БД в storage.ts — вынеси в репозиторий:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("не разросся обратно (потолок размера фасада)", () => {
    const src = readFileSync(path.resolve(process.cwd(), "server/storage.ts"), "utf-8");
    const lines = src.split("\n").length;
    // Фасад после выноса: ~735 строк (интерфейс + типы + делегаты).
    // Потолок с запасом: новые делегаты дёшевы, а вот +200 строк логики — сигнал.
    expect(lines, `storage.ts вырос до ${lines} строк — логика должна жить в репозиториях`).toBeLessThan(950);
  });
});
