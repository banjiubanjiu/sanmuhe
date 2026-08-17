import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// 后台源码/构建产物在小程序目录外的 admin-panel，避免打进主包
const adminRoot = join(root, "..", "admin-panel");

function rel(path) {
  return relative(root, path).replace(/\\/g, "/");
}

function adminPath(...parts) {
  return join(adminRoot, ...parts);
}

function adminRel(file) {
  return relative(root, adminPath(file)).replace(/\\/g, "/");
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

function resolveSourcePath(file) {
  if (file.startsWith("admin-src/") || file.startsWith("admin/")) {
    return adminPath(file);
  }
  return join(root, file);
}

function verifyBuiltAdminAssets() {
  const htmlPath = adminPath("admin", "index.html");
  if (!existsSync(htmlPath)) {
    fail("admin-panel/admin/index.html missing; run npm run admin:build");
  }
  const html = readFileSync(htmlPath, "utf8");
  const assets = [...html.matchAll(/(?:\/admin\/|\.\/)assets\/([^"']+)/g)].map((match) => adminPath("admin", "assets", match[1]));
  if (!assets.length) {
    fail("admin/index.html does not reference built JS/CSS assets");
  }
  for (const asset of assets) {
    if (!existsSync(asset)) {
      fail(`missing built asset referenced by admin/index.html: ${adminRel(relative(adminRoot, asset))}`);
    }
  }
  const maxAssetBytes = 2 * 1024 * 1024;
  const oversized = readdirSync(adminPath("admin", "assets"))
    .map((name) => adminPath("admin", "assets", name))
    .filter((path) => statSync(path).isFile() && statSync(path).size > maxAssetBytes);
  if (oversized.length) {
    fail(`admin assets exceed 2MB each: ${oversized.map((p) => adminRel(relative(adminRoot, p))).join(", ")}`);
  }
  console.log(`[admin:verify] built admin assets exist under admin-panel/admin and each asset is under 2MB`);
}

function verifySourceContains(file, groups) {
  const path = resolveSourcePath(file);
  if (!existsSync(path)) {
    fail(`${file} missing (resolved: ${path})`);
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
  const path = resolveSourcePath(file);
  if (!existsSync(path)) {
    fail(`${file} missing (resolved: ${path})`);
  }
  const source = readFileSync(path, "utf8");
  const found = items.filter((item) => source.includes(item));
  if (found.length) {
    fail(`${file} contains non-production demo text: ${found.join(", ")}`);
  }
  console.log(`[admin:verify] ${file} excludes ${items.length} forbidden markers`);
}

function verifyManageOperationsActionCoverage() {
  const source = readFileSync(join(root, "cloudfunctions/manageOperations/index.js"), "utf8");
  const actionBlock = source.match(/const allowedActions = new Set\(\[([\s\S]*?)\]\);/);
  if (!actionBlock) {
    fail("manageOperations allowedActions set missing");
  }
  const allowedActions = new Set([...actionBlock[1].matchAll(/"([A-Za-z0-9_]+)"/g)].map((match) => match[1]));
  const dispatchedActions = new Set([...source.matchAll(/if \(action === "([^"]+)"\)/g)].map((match) => match[1]));
  const missingActions = [...dispatchedActions].filter((action) => !allowedActions.has(action));
  if (missingActions.length) {
    fail(`manageOperations dispatch branches missing from allowedActions: ${missingActions.join(", ")}`);
  }
  const unhandledActions = [...allowedActions].filter((action) => !dispatchedActions.has(action));
  if (unhandledActions.length) {
    fail(`manageOperations allowedActions has no dispatch branch: ${unhandledActions.join(", ")}`);
  }
  if (!allowedActions.has("getAdminProfile")) {
    fail("getAdminProfile must remain available after administrator whitelist authentication");
  }
  console.log(`[admin:verify] manageOperations allowlist covers ${dispatchedActions.size} dispatched actions`);
}

function verifyProductionSurfaces() {
  verifySourceContains("cloudfunctions/manageOperations/index.js", [
    {
      label: "administrator whitelist and audit",
      items: ["const allowedActions", "getAdminProfile", "assertAdmin", "unknownAction", "writeAdminAuditLog", "writeExportAuditLog", "writeAccessDeniedAudit", "accessDenied", "管理员白名单拦截", "导出 CSV 需填写原因", "requireAuditReason"]
    },
    {
      label: "commercial admin workflows",
      items: ["globalSearch", "deleteCustomerData", "exportCustomerData", "adjustInventory"]
    },
    {
      label: "server-side operation guards",
      items: ["allowedStatuses", "标记发货需填写快递单号", "人工调整库存需填写原因"]
    },
    {
      label: "customer operation context",
      items: ["recentActivity", "customer.recentActivity.push"]
    },
    {
      label: "dashboard truthful empty states",
      items: ["buildRoomBoard", "room.visible !== false", "dataScope"]
    },
    {
      label: "analytics data scope",
      items: ["ANALYTICS_READ_LIMIT", "normalizeRangeDays", "buildAnalytics", "rangeDays"]
    },
    {
      label: "system health probes",
      items: ["DEFAULT_HEALTH_FUNCTIONS", "checkCloudFunctionHealth", "cloud.callFunction", "云函数可用性", "durationMs", "paymentConfig", "name: \"manageOperations\""]
    },
    {
      label: "frontend catalog cloud data readiness",
      items: ["frontendCatalog", "前台资料云端数据", "catalogCounts", "content_blocks", "避免依赖本地兜底数据", "countCollectionStatus", "云端资料集合读取失败"]
    },
    {
      label: "offsite backup system status",
      items: ["backupTruncatedCollections", "hasBackupCompleteness", "latestBackupIntegrityReady", "最近异地备份完整", "sha256", "checksum"]
    }
  ]);

  verifySourceContains("cloudfunctions/manageOperations/analytics.js", [
    {
      label: "period-aware analytics",
      items: ["ALLOWED_RANGE_DAYS", "previousStartDate", "percentageChange", "grossRevenue", "refundRate", "channels", "topItems", "revenueBasis"]
    }
  ]);

  verifySourceContains("cloudfunctions/manageCatalog/index.js", [
    {
      label: "catalog sensitive change audit",
      items: ["requireAuditReason", "changedSensitiveCatalogFields", "修改价格、库存、名额或状态", "catalog.delete", "catalog.restore", "assertCanWrite", "writePermissionDeniedAudit", "accessDenied", "管理员白名单拦截"]
    }
  ]);

  verifySourceContains("admin-src/src/App.vue", [
    {
      label: "core production tabs",
      items: ["afterSales", "inventory", "audit", "notifications", "system"]
    },
    {
      label: "search export and calendar workflows",
      items: ["globalSearch", "exportOrders", "exportReservations", "exportSignups", "exportCustomers", "exportAuditLogs", "exportNotificationLogs", "reservationCalendarRows", "protectCsvCell"]
    },
    {
      label: "risk controls and customer context",
      items: ["requireTypedConfirm", "promptActionReason", "customerTimeline", "exportScopeLabel", "保存系统设置"]
    },
    {
      label: "professional state handling",
      items: ["EmptyState", "emptyActionLabel", "handleEmptyAction", "showSyncBanner", "runtimeError", "unhandledrejection", "navigator.onLine", "aria-selected", "saveRoomInfo", "Boolean(state.adminProfile)", "accessBlocked", "adminProfileError", "focusGlobalSearch", "saveCurrentView", "applySavedView", "currentFreshnessMeta", "aria-busy"]
    },
    {
      label: "truthful analytics copy",
      items: ["dashboardScopeText", "analyticsScopeText", "订单净收入", "analyticsDeltaText", "每日订单净收入"]
    },
    {
      label: "workflow-first admin polish",
      items: ["moduleWorkflowSteps", "buildWorkflowSteps", "当前模块状态流", "待履约", "售后关联"]
    },
    {
      label: "system required functions",
      items: ["requiredFunctions", "createPayment", "serviceNotify", "scheduledBackup", "cleanupSmokeData", "云函数探测明细", "health-table"]
    },
    {
      label: "catalog sensitive operation reasons",
      items: ["hasSensitiveCatalogChange", "保存 ${displayName(forms.catalog)} 的价格、库存、名额或状态", "下架 ${displayName(item)}"]
    }
  ]);
  verifySourceExcludes("admin-src/src/App.vue", ["较昨日", "较上月", "+12.5%", "+18.6%", "68.5", "20.3", "11.2", "2024年", "room-001"]);
  verifySourceExcludes("admin-src/src/App.vue", ["state.activeTab === 'roles'", "roleForm", "listAdminRoles", "saveAdminRole", "角色权限"]);
  verifySourceExcludes("admin-src/src/App.vue", ["state.activeTab === 'backups'", "backupForm", "backupLogs", "createDataBackup", "listBackupLogs", "getBackupDownloadUrl", "数据备份"]);
  verifySourceExcludes("cloudfunctions/manageOperations/index.js", ["room-001", "getAdminRole", "listAdminRoles", "saveAdminRole", "ROLE_PERMISSION_DENIED", "rolePermissionMap"]);
  verifySourceExcludes("cloudfunctions/manageOperations/index.js", ["createDataBackup", "listBackupLogs", "getBackupDownloadUrl", "admin-backups/"]);
  verifySourceExcludes("cloudfunctions/manageCatalog/index.js", ["getAdminRole", "ROLE_PERMISSION_DENIED", "rolePermissionMap"]);

  verifySourceContains("admin-src/src/styles.css", [
    {
      label: "professional loading and empty states",
      items: [".sync-banner", ".sync-skeleton", ".empty-action", ".rich-empty", ".network-banner", ".runtime-banner", ".icon-action.spinning", "@keyframes admin-spin"]
    },
    {
      label: "responsive admin shell",
      items: ["@media (max-width: 1120px)", "@media (max-width: 860px)", ".global-search-panel", ".interactive-row", ".panel-toolbar .line-input", ".donut.no-data", ".access-block", ".shortcut-hint", ".saved-views"]
    },
    {
      label: "workflow state strip",
      items: [".workflow-strip", "grid-template-columns: repeat(2, minmax(0, 1fr))", "data-tone=\"danger\""]
    },
    {
      label: "cloud function health detail table",
      items: [".health-table", ".health-function-name", "overflow-wrap: anywhere"]
    }
  ]);
}

function verifyCloudFunctionHealthChecks() {
  const requiredFunctions = [
    "getOpenId",
    "getCatalog",
    "listEvents",
    "listMyRecords",
    "memberCenter",
    "createOrder",
    "createPayment",
    "createReservation",
    "createEvent",
    "joinEvent",
    "manageCatalog",
    "serviceNotify",
    "releaseOrderLocks",
    "scheduledBackup",
    "seedDemoData",
    "cleanupSmokeData"
  ];
  const missing = requiredFunctions.filter((name) => {
    const source = readFileSync(join(root, "cloudfunctions", name, "index.js"), "utf8");
    return !source.includes('action === "health"');
  });
  if (missing.length) {
    fail(`cloud functions missing no-write health action: ${missing.join(", ")}`);
  }
  console.log(`[admin:verify] ${requiredFunctions.length} cloud functions expose no-write health checks`);
}

function verifyCloudFunctionDependencyHygiene() {
  const jsSdkFunctions = ["manageOperations", "manageCatalog", "seedDemoData"];
  const missing = jsSdkFunctions.filter((name) => {
    const pkg = readJson(join(root, "cloudfunctions", name, "package.json"));
    return !pkg.dependencies?.["@cloudbase/js-sdk"] || !pkg.dependencies?.ws;
  });
  if (missing.length) {
    fail(`cloud functions using @cloudbase/js-sdk must declare ws dependency: ${missing.join(", ")}`);
  }
  console.log(`[admin:verify] CloudBase JS SDK cloud functions declare ws dependency`);
}

console.log("[admin:verify] checking cloud function syntax");
for (const entrypoint of listFunctionEntrypoints()) {
  run(process.execPath, ["--check", rel(entrypoint)]);
}

verifyProductionSurfaces();
verifyManageOperationsActionCoverage();
verifyCloudFunctionHealthChecks();
verifyCloudFunctionDependencyHygiene();

console.log("[admin:verify] building admin");
run("npm", ["run", "admin:build"]);

verifyBuiltAdminAssets();
verifyProjectIgnore();

console.log("[admin:verify] ok");
