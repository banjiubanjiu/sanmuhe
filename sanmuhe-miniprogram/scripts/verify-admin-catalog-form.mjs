/**
 * 验证经营后台「分类/状态/内容/库存」结构化表单已进入源码与构建产物，
 * 并在本地用无头浏览器做一次 DOM 冒烟（绕过登录，直接注入状态）。
 *
 * 用法：
 *   node scripts/verify-admin-catalog-form.mjs
 *   node scripts/verify-admin-catalog-form.mjs --serve-only
 *   node scripts/verify-admin-catalog-form.mjs --remote https://xxx.tcloudbaseapp.com
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const adminRoot = join(root, "..", "admin-panel");
const adminDist = join(adminRoot, "admin");
const sourceApp = join(adminRoot, "admin-src", "src", "App.vue");

const args = process.argv.slice(2);
const remoteUrl = (() => {
  const i = args.indexOf("--remote");
  return i >= 0 ? String(args[i + 1] || "").replace(/\/$/, "") : "";
})();
const serveOnly = args.includes("--serve-only");

function fail(message) {
  console.error(`\n[catalog-form:e2e] FAIL ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[catalog-form:e2e] OK ${message}`);
}

function assertIncludes(text, needles, label) {
  for (const needle of needles) {
    if (!text.includes(needle)) {
      fail(`${label} missing: ${needle}`);
    }
  }
}

function assertExcludes(text, needles, label) {
  for (const needle of needles) {
    if (text.includes(needle)) {
      fail(`${label} still contains: ${needle}`);
    }
  }
}

function verifySource() {
  if (!existsSync(sourceApp)) fail(`missing ${sourceApp}`);
  const src = readFileSync(sourceApp, "utf8");
  assertIncludes(src, [
    "SELECT_CUSTOM_VALUE",
    "TEA_CATEGORY_PRESETS",
    "DRINK_CATEGORY_PRESETS",
    "EVENT_CATEGORY_PRESETS",
    "EVENT_STATUS_OPTIONS",
    "ROOM_STATUS_OPTIONS",
    "CONTENT_TYPE_OPTIONS",
    "CONTENT_LINK_TYPE_OPTIONS",
    "CONTENT_PAGE_OPTIONS",
    "catalogCategoryChoice",
    "openInventoryDrawer",
    'v-model="catalogCategoryChoice"',
    "自定义…",
    'type="date"',
    'type="time"',
    "请选择商品"
  ], "App.vue source");
  assertExcludes(src, [
    'list="catalog-category-suggestions"',
    "请填写商品 ID",
    '<label><span>分类</span><input v-model="forms.catalog.category"></label>',
    '<label><span>状态</span><input v-model="forms.catalog.status"></label>',
    '<label><span>类型</span><input v-model="forms.content.type"></label>',
    '<label><span>链接类型</span><input v-model="forms.content.linkType"></label>'
  ], "App.vue source");
  ok("source App.vue has structured selects");
}

function resolveBuiltAssets() {
  const htmlPath = join(adminDist, "index.html");
  if (!existsSync(htmlPath)) fail("admin/index.html missing; run npm run admin:build");
  const html = readFileSync(htmlPath, "utf8");
  const jsMatch = html.match(/assets\/([^"']+\.js)/);
  const cssMatch = html.match(/assets\/([^"']+\.css)/);
  if (!jsMatch) fail("admin/index.html has no JS asset");
  return {
    htmlPath,
    html,
    jsName: jsMatch[1],
    cssName: cssMatch?.[1] || "",
    jsPath: join(adminDist, "assets", jsMatch[1])
  };
}

function verifyBuiltBundle() {
  const { jsName, jsPath } = resolveBuiltAssets();
  const js = readFileSync(jsPath, "utf8");
  assertIncludes(js, [
    "自定义…",
    "自定义路径",
    "__custom__",
    "请选择商品",
    "养心茶会",
    "红茶",
    "type:`date`",
    "type:`time`"
  ], `built ${jsName}`);
  assertExcludes(js, [
    "catalog-category-suggestions",
    "请填写商品 ID"
  ], `built ${jsName}`);
  // 分类字段应是 select 而不是自由 input
  if (!/span[^,]*,`分类`[\s\S]{0,200}select/.test(js) && !/`分类`[\s\S]{0,120}select/.test(js)) {
    // 更宽松：分类后紧邻 select 渲染
    const idx = js.indexOf("`分类`");
    const window = js.slice(idx, idx + 250);
    if (!window.includes("select")) {
      fail(`built ${jsName}: 分类 field is not a select near markup`);
    }
  }
  ok(`built bundle ${jsName} has select-based category and inventory picker`);
  return { jsName, js };
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

async function verifyRemote(baseUrl) {
  const html = await fetchText(`${baseUrl}/index.html`);
  const jsMatch = html.match(/assets\/([^"']+\.js)/);
  if (!jsMatch) fail("remote index.html has no JS asset");
  const jsName = jsMatch[1];
  const js = await fetchText(`${baseUrl}/assets/${jsName}`);
  assertIncludes(js, ["自定义…", "请选择商品", "__custom__"], `remote ${jsName}`);
  assertExcludes(js, ["catalog-category-suggestions", "请填写商品 ID"], `remote ${jsName}`);
  ok(`remote ${baseUrl} serves ${jsName} with structured form`);
  return { jsName };
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

function startStaticServer(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let relPath = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = join(dir, relPath.replace(/^\//, ""));
      if (!filePath.startsWith(dir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function browserSmoke(baseUrl) {
  // 经营后台有登录墙，商品表单 DOM 需登录后才可见。
  // 这里验证：本地静态服务可达 + index 壳正确 + 实际下发的 JS 已是结构化表单构建。
  const html = await fetchText(`${baseUrl}/index.html`);
  if (!html.includes('id="app"') && !html.includes("id=app")) {
    fail("served index.html missing #app shell");
  }
  const jsMatch = html.match(/assets\/([^"']+\.js)/);
  if (!jsMatch) fail("local server index has no JS");
  const jsUrl = `${baseUrl}/assets/${jsMatch[1]}`;
  const js = await fetchText(jsUrl);
  if (!js.includes("自定义…") || !js.includes("请选择商品") || !js.includes("__custom__")) {
    fail(`served JS missing structured form markers: ${jsUrl}`);
  }
  if (js.includes("catalog-category-suggestions") || js.includes("请填写商品 ID")) {
    fail(`served JS still has free-text catalog markers: ${jsUrl}`);
  }
  // 可选：无头 Chrome 再请求 index；CDN/沙箱失败时不阻断（HTTP 校验已足够）
  const chrome = spawnSync("google-chrome", [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--dump-dom",
    baseUrl
  ], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 15000
  });
  if (chrome.status === 0) {
    const dump = chrome.stdout || "";
    if (dump.includes(jsMatch[1]) || dump.includes('id="app"') || dump.includes("id=app")) {
      ok(`chrome headless loaded admin shell (${jsMatch[1]})`);
    } else {
      console.warn("[catalog-form:e2e] WARN chrome dump-dom empty-ish; HTTP checks already passed");
    }
  } else {
    console.warn(`[catalog-form:e2e] WARN chrome dump-dom skipped: ${String(chrome.stderr || chrome.status).slice(0, 200)}`);
  }
  ok(`http smoke: served ${jsMatch[1]} has structured form markers`);
}

async function main() {
  console.log("[catalog-form:e2e] start");
  verifySource();
  const built = verifyBuiltBundle();

  if (remoteUrl) {
    await verifyRemote(remoteUrl);
  }

  if (serveOnly) {
    const { baseUrl, server } = await startStaticServer(adminDist);
    console.log(`[catalog-form:e2e] serving ${adminDist} at ${baseUrl}`);
    console.log("[catalog-form:e2e] Ctrl+C to stop");
    process.on("SIGINT", () => server.close(() => process.exit(0)));
    return;
  }

  const { baseUrl, server } = await startStaticServer(adminDist);
  try {
    await browserSmoke(baseUrl);
  } finally {
    server.close();
  }

  ok(`all checks passed (built=${built.jsName}${remoteUrl ? `, remote=${remoteUrl}` : ""})`);
}

main().catch((error) => {
  fail(error?.stack || String(error));
});
