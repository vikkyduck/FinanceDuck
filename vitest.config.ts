import { defineConfig } from "vitest/config";
import path from "path";

// Тесты — dev-инструмент, в прод-бандл не попадают. Раннер: `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", "dist/**", "dist-server/**"],
    // Импорт server/db.ts утверждает наличие DATABASE_URL и создаёт (ленивый,
    // не подключающийся) Pool. Тесты работают с отдельной PGlite-БД, которую
    // передают в функции репозиториев параметром db; этот URL нужен только
    // чтобы модуль db.ts импортировался без ошибки.
    env: { DATABASE_URL: "postgres://vitest-unused" },
    testTimeout: 20000,
    // Каждый тест-файл поднимает свою PGlite (WASM Postgres). Параллельный
    // запуск многих файлов исчерпывает ресурсы и даёт флапы. Гоняем файлы
    // ПОСЛЕДОВАТЕЛЬНО — детерминизм важнее скорости (сюита в барьере деплоя).
    fileParallelism: false,
  },
});
