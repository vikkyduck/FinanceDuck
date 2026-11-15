import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/.local/**", "**/node_modules/**"],
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@shared": path.resolve(import.meta.dirname, "./shared"),
      "@assets": path.resolve(import.meta.dirname, "./attached_assets"),
    },
  },
  build: {
    target: ['es2020', 'edge111', 'firefox128', 'chrome111', 'safari16.4'],
    cssMinify: true,
    outDir: 'dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});
