import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

// 后台源码/构建产物已移出小程序目录，避免 2MB 主包误打包 admin
const adminRoot = resolve(process.cwd(), "../admin-panel");

export default defineConfig({
  root: resolve(adminRoot, "admin-src"),
  base: "./",
  plugins: [vue()],
  build: {
    outDir: resolve(adminRoot, "admin"),
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
