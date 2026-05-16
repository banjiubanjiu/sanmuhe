import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

export default defineConfig({
  root: "admin-src",
  base: "./",
  plugins: [vue()],
  build: {
    outDir: resolve(process.cwd(), "admin"),
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
