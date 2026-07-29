import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

// 后台源码/构建产物已移出小程序目录，避免 2MB 主包误打包 admin
const adminRoot = resolve(process.cwd(), "../admin-panel");

const projectRoot = process.cwd();
const nodeModules = resolve(projectRoot, "node_modules");

export default defineConfig({
  root: resolve(adminRoot, "admin-src"),
  base: "./",
  plugins: [vue()],
  // admin-src 在小程序目录外，需显式指向小程序侧 node_modules
  resolve: {
    alias: {
      vue: resolve(nodeModules, "vue"),
      "@lucide/vue": resolve(nodeModules, "@lucide/vue")
    },
    preserveSymlinks: true
  },
  optimizeDeps: {
    modules: [nodeModules]
  },
  build: {
    outDir: resolve(adminRoot, "admin"),
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 5173,
    strictPort: false,
    fs: {
      allow: [adminRoot, projectRoot, nodeModules]
    }
  }
});
