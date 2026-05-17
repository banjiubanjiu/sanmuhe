import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function rel(path) {
  return relative(root, path).replace(/\\/g, "/");
}

function fail(message) {
  console.error(`\n[admin:verify] ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function listFunctionEntrypoints() {
  const functionsDir = join(root, "cloudfunctions");
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(functionsDir, entry.name, "index.js"))
    .filter((path) => existsSync(path))
    .sort();
}

function verifyProjectIgnore() {
  const config = readJson(join(root, "project.config.json"));
  const ignored = new Set((config.packOptions?.ignore || []).map((item) => item.value));
  const required = ["admin", "admin-src", "node_modules", "package-lock.json", "package.json", "vite.config.mjs"];
  const missing = required.filter((item) => !ignored.has(item));
  if (missing.length) {
    fail(`project.config.json missing packOptions.ignore: ${missing.join(", ")}`);
  }
  console.log(`[admin:verify] project.config.json ignores ${required.length} heavy/admin paths`);
}

function verifyBuiltAdminAssets() {
  const htmlPath = join(root, "admin", "index.html");
  if (!existsSync(htmlPath)) {
    fail("admin/index.html missing; run npm run admin:build");
  }
  const html = readFileSync(htmlPath, "utf8");
  const assets = [...html.matchAll(/(?:\/admin\/|\.\/)assets\/([^"']+)/g)].map((match) => join(root, "admin", "assets", match[1]));
  if (!assets.length) {
    fail("admin/index.html does not reference built JS/CSS assets");
  }
  for (const asset of assets) {
    if (!existsSync(asset)) {
      fail(`missing built asset referenced by admin/index.html: ${rel(asset)}`);
    }
  }
  const maxAssetBytes = 2 * 1024 * 1024;
  const oversized = readdirSync(join(root, "admin", "assets"))
    .map((name) => join(root, "admin", "assets", name))
    .filter((path) => statSync(path).isFile() && statSync(path).size > maxAssetBytes);
  if (oversized.length) {
    fail(`admin assets exceed 2MB each: ${oversized.map(rel).join(", ")}`);
  }
  console.log(`[admin:verify] built admin assets exist and each asset is under 2MB`);
}

function verifySourceContains(file, groups) {
  const path = join(root, file);
  if (!existsSync(path)) {
    fail(`${file} missing`);
  }
  const source = readFileSync(path, "utf8");
  for (const group of groups) {
    const missing = group.items.filter((item) => !source.includes(item));
    if (missing.length) {
      fail(`${file} missing ${group.label}: ${missing.join(", ")}`);
    }
  }
  console.log(`[admin:verify] ${file} covers ${groups.length} production surface groups`);
}

function verifySourceExcludes(file, items) {
  const path = join(root, file);
  if (!existsSync(path)) {
    fail(`${file} missing`);
  }
  const source = readFileSync(path, "utf8");
  const found = items.filter((item) => source.includes(item));
  if (found.length) {
    fail(`${file} contains non-production demo text: ${found.join(", ")}`);
  }
  console.log(`[admin:verify] ${file} excludes demo-only metric copy`);
}

function verifyProductionSurfaces() {
  verifySourceContains("cloudfunctions/manageOperations/index.js", [
    {
      label: "permissions and audit",
      items: ["const actionPermissions", "writeAdminAuditLog", "writeExportAuditLog", "redactAuditDetail", "导出 CSV 需填写原因"]
    },
    {
      label: "commercial admin workflows",
      items: ["globalSearch", "listBackupLogs", "createDataBackup", "deleteCustomerData", "exportCustomerData", "adjustInventory"]
    },
    {
      label: "server-side operation guards",
      items: ["allowedStatuses", "标记发货需填写快递单号", "人工调整库存需填写原因"]
    },
    {
      label: "customer operation context",
      items: ["recentActivity", "customer.recentActivity.push"]
    }
  ]);

  verifySourceContains("admin-src/src/App.vue", [
    {
      label: "core production tabs",
      items: ["afterSales", "inventory", "audit", "notifications", "roles", "backups", "system"]
    },
    {
      label: "search export and calendar workflows",
      items: ["globalSearch", "exportOrders", "exportReservations", "exportSignups", "exportCustomers", "exportAuditLogs", "exportNotificationLogs", "reservationCalendarRows", "protectCsvCell"]
    },
    {
      label: "risk controls and customer context",
      items: ["requireTypedConfirm", "promptActionReason", "customerTimeline", "exportScopeLabel"]
    },
    {
      label: "professional state handling",
      items: ["EmptyState", "emptyActionLabel", "handleEmptyAction", "showSyncBanner", "runtimeError", "unhandledrejection", "navigator.onLine", "aria-selected"]
    }
  ]);
  verifySourceExcludes("admin-src/src/App.vue", ["较昨日", "较上月", "+12.5%", "+18.6%"]);

  verifySourceContains("admin-src/src/styles.css", [
    {
      label: "professional loading and empty states",
      items: [".sync-banner", ".sync-skeleton", ".empty-action", ".rich-empty", ".network-banner", ".runtime-banner"]
    },
    {
      label: "responsive admin shell",
      items: ["@media (max-width: 1120px)", "@media (max-width: 860px)", ".global-search-panel", ".interactive-row", ".panel-toolbar .line-input"]
    }
  ]);
}

console.log("[admin:verify] checking cloud function syntax");
for (const entrypoint of listFunctionEntrypoints()) {
  run(process.execPath, ["--check", rel(entrypoint)]);
}

verifyProductionSurfaces();

console.log("[admin:verify] building admin");
run("npm", ["run", "admin:build"]);

verifyBuiltAdminAssets();
verifyProjectIgnore();

console.log("[admin:verify] ok");
