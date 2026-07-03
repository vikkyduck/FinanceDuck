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
  },
});
