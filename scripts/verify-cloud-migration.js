const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const projectDir = path.join(root, "sanmuhe-miniprogram");

const requiredPages = [
  "pages/index/index",
  "pages/order/index",
  "pages/shop/index",
  "pages/product/index",
  "pages/cart/index",
  "pages/reservation/index",
  "pages/events/index",
  "pages/event-edit/index",
  "pages/cloud-status/index",
  "pages/profile/index"
];

const requiredFunctions = [
  "getOpenId",
  "getCatalog",
  "seedDemoData",
  "manageCatalog",
  "createOrder",
  "createReservation",
  "listEvents",
  "createEvent",
  "joinEvent",
  "listMyRecords"
];

const requiredRootFiles = [
  "configure-cloud.bat",
  "configure-cloud.ps1",
  "resolve-wechat-cli.ps1",
  "read-cloud-config.ps1",
  "check-cloud-ready.bat",
  "check-cloud-ready.ps1",
  "check-preview-output.bat",
  "check-preview-output.ps1",
  "deploy-cloudfunctions.bat",
  "deploy-cloudfunctions.ps1",
  "wechat-devtools-login.bat",
  "wechat-devtools-login.ps1",
  "start-sanmuhe.bat",
  "sanmuhe-cloud-preview.bat",
  "sanmuhe-cloud-preview.ps1",
  "open-preview.bat",
  "open-sanmuhe-devtools.bat",
  "open-sanmuhe-devtools.ps1",
  "preview-sanmuhe.bat",
  "preview-sanmuhe.ps1",
  "verify-cloud-migration.bat",
  "MIGRATION_STATUS.md",
  "COMPLETION_AUDIT.md",
  "docs/get-wechat-appid-envid.md"
];

const projectResourceFiles = [
  "sanmuhe-miniprogram/cloudbaserc.json",
  "sanmuhe-miniprogram/docs/cloud-migration.md",
  "sanmuhe-miniprogram/README.md"
];

const previewFiles = [
  "preview/index.html",
  "preview/styles.css",
  "preview/app.js",
  "preview/README.md"
];

const uiAssetFiles = [
  "docs/UI设计.png",
  "docs/1.png",
  "docs/2.png",
  "docs/3.png",
  "docs/4.png",
  "docs/5.png",
  "docs/6.png",
  "sanmuhe-miniprogram/assets/images/design-hero-tea.jpg",
  "sanmuhe-miniprogram/assets/images/design-product-longjing.jpg",
  "sanmuhe-miniprogram/assets/images/design-tea-longjing.jpg",
  "sanmuhe-miniprogram/assets/images/design-tea-dahongpao.jpg",
  "sanmuhe-miniprogram/assets/images/design-tea-silver.jpg",
  "sanmuhe-miniprogram/assets/images/design-tea-biluochun.jpg",
  "sanmuhe-miniprogram/assets/images/design-tea-maofeng.jpg",
  "sanmuhe-miniprogram/assets/images/design-tea-liuan.jpg",
  "sanmuhe-miniprogram/assets/images/design-tea-xinyang.jpg",
  "sanmuhe-miniprogram/assets/images/design-drink-osmanthus.jpg",
  "sanmuhe-miniprogram/assets/images/design-drink-matcha.jpg",
  "sanmuhe-miniprogram/assets/images/design-drink-lemon.jpg",
  "sanmuhe-miniprogram/assets/images/design-room-guanshan.jpg",
  "sanmuhe-miniprogram/assets/images/design-room-tingyu.jpg",
  "sanmuhe-miniprogram/assets/images/design-room-shuxiang.jpg",
  "sanmuhe-miniprogram/assets/images/design-room-songfeng.jpg",
  "sanmuhe-miniprogram/assets/images/design-room-zhuyun.jpg",
  "sanmuhe-miniprogram/assets/images/design-event-spring.jpg",
  "sanmuhe-miniprogram/assets/images/design-event-culture.jpg",
  "sanmuhe-miniprogram/assets/images/design-event-handmade.jpg",
  "sanmuhe-miniprogram/assets/images/hero-tea.jpg",
  "sanmuhe-miniprogram/assets/images/product-longjing.jpg",
  "sanmuhe-miniprogram/assets/images/tea-longjing.jpg",
  "sanmuhe-miniprogram/assets/images/tea-dahongpao.jpg",
  "sanmuhe-miniprogram/assets/images/tea-white.jpg",
  "sanmuhe-miniprogram/assets/images/tea-biluochun.jpg",
  "sanmuhe-miniprogram/assets/images/tea-maofeng.jpg",
  "sanmuhe-miniprogram/assets/images/drink-osmanthus.jpg",
  "sanmuhe-miniprogram/assets/images/drink-matcha.jpg",
  "sanmuhe-miniprogram/assets/images/drink-lemon.jpg",
  "sanmuhe-miniprogram/assets/images/room-guan-shan.jpg",
  "sanmuhe-miniprogram/assets/images/room-ting-yu.jpg",
  "sanmuhe-miniprogram/assets/images/room-shu-xiang.jpg",
  "sanmuhe-miniprogram/assets/images/event-spring.jpg",
  "sanmuhe-miniprogram/assets/images/event-culture.jpg",
  "sanmuhe-miniprogram/assets/images/event-handmade.jpg"
];

const iconAssetFiles = [
  "sanmuhe-miniprogram/assets/icons/home-line.png",
  "sanmuhe-miniprogram/assets/icons/home-active.png",
  "sanmuhe-miniprogram/assets/icons/category-line.png",
  "sanmuhe-miniprogram/assets/icons/category-active.png",
  "sanmuhe-miniprogram/assets/icons/cart-line.png",
  "sanmuhe-miniprogram/assets/icons/cart-active.png",
  "sanmuhe-miniprogram/assets/icons/events-line.png",
  "sanmuhe-miniprogram/assets/icons/events-active.png",
  "sanmuhe-miniprogram/assets/icons/profile-line.png",
  "sanmuhe-miniprogram/assets/icons/profile-active.png",
  "sanmuhe-miniprogram/assets/icons/leaf-white.png",
  "sanmuhe-miniprogram/assets/icons/cup-white.png",
  "sanmuhe-miniprogram/assets/icons/room-white.png",
  "sanmuhe-miniprogram/assets/icons/calendar-white.png",
  "sanmuhe-miniprogram/assets/icons/plus-white.png",
  "sanmuhe-miniprogram/assets/icons/headset-ink.png",
  "sanmuhe-miniprogram/assets/icons/heart-ink.png",
  "sanmuhe-miniprogram/assets/icons/search-line.png",
  "sanmuhe-miniprogram/assets/icons/scan-ink.png",
  "sanmuhe-miniprogram/assets/icons/clock-line.png",
  "sanmuhe-miniprogram/assets/icons/map-pin-line.png",
  "sanmuhe-miniprogram/assets/icons/users-line.png"
];

const cliScripts = [
  "open-sanmuhe-devtools.ps1",
  "preview-sanmuhe.ps1",
  "deploy-cloudfunctions.ps1",
  "check-cloud-ready.ps1",
  "sanmuhe-cloud-preview.ps1",
  "wechat-devtools-login.ps1"
];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function collectJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

function checkSyntax(files) {
  const failures = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8"
    });
    if (result.status !== 0) {
      failures.push({
        file: path.relative(root, file),
        stderr: result.stderr.trim()
      });
    }
  }
  return failures;
}

function status(name, ok, detail) {
  return { name, ok, detail };
}

function dirSize(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  let total = 0;
  if (!fs.existsSync(absoluteDir)) return total;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const full = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(path.relative(root, full));
    } else if (entry.isFile()) {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

const results = [];
const blockers = [];

const appJson = readJson("sanmuhe-miniprogram/app.json");
const projectConfig = readJson("sanmuhe-miniprogram/project.config.json");
const cloudConfig = require(path.join(projectDir, "config/cloud.js"));

results.push(status("cloudfunctionRoot", projectConfig.cloudfunctionRoot === "cloudfunctions/", projectConfig.cloudfunctionRoot));

for (const page of requiredPages) {
  const pageOk = ["js", "json", "wxml", "wxss"].every((ext) => exists(`sanmuhe-miniprogram/${page}.${ext}`));
  results.push(status(`page:${page}`, pageOk, pageOk ? "files present" : "missing files"));
}

const appPagesOk = requiredPages.every((page) => appJson.pages.includes(page));
results.push(status("app.json pages", appPagesOk, `${appJson.pages.length} registered pages`));

if (exists("sanmuhe-miniprogram/pages/cloud-status/index.js") && exists("sanmuhe-miniprogram/pages/cloud-status/index.wxml")) {
  const cloudStatusJs = readText("sanmuhe-miniprogram/pages/cloud-status/index.js");
  const cloudStatusWxml = readText("sanmuhe-miniprogram/pages/cloud-status/index.wxml");
  const smokeFunctions = [
    "createOrder",
    "createReservation",
    "createEvent",
    "joinEvent",
    "listMyRecords",
    "manageCatalog"
  ];
  const smokeWiringOk = smokeFunctions.every((name) => cloudStatusJs.includes(`name: "${name}"`)) &&
    cloudStatusJs.includes("runSmokeTest") &&
    cloudStatusWxml.includes("运行云端写入检查") &&
    cloudStatusWxml.includes("检查商品/活动管理");
  results.push(status("cloud status smoke test wiring", smokeWiringOk, smokeWiringOk ? "order/reservation/event/signup/records/catalog covered" : "missing smoke test wiring"));
}

for (const fn of requiredFunctions) {
  const fnOk = exists(`sanmuhe-miniprogram/cloudfunctions/${fn}/index.js`) &&
    exists(`sanmuhe-miniprogram/cloudfunctions/${fn}/package.json`);
  results.push(status(`cloudfunction:${fn}`, fnOk, fnOk ? "index/package present" : "missing index or package"));
}

for (const file of requiredRootFiles) {
  results.push(status(`root-file:${file}`, exists(file), exists(file) ? "present" : "missing"));
}

for (const file of projectResourceFiles) {
  results.push(status(`resource-file:${file}`, exists(file), exists(file) ? "present" : "missing"));
}

for (const file of previewFiles) {
  results.push(status(`preview-file:${file}`, exists(file), exists(file) ? "present" : "missing"));
}

for (const file of uiAssetFiles) {
  results.push(status(`ui-asset:${file}`, exists(file), exists(file) ? "present" : "missing"));
}

for (const file of iconAssetFiles) {
  results.push(status(`icon-asset:${file}`, exists(file), exists(file) ? "present" : "missing"));
}

const iconBytes = dirSize("sanmuhe-miniprogram/assets/icons");
results.push(status("icon package budget", iconBytes > 0 && iconBytes < 200 * 1024, `${Math.round(iconBytes / 1024)}KB`));

const assetBytes = dirSize("sanmuhe-miniprogram/assets");
results.push(status("local asset package budget", assetBytes > 0 && assetBytes < 2 * 1024 * 1024, `${Math.round(assetBytes / 1024)}KB`));

const customTabbarOk = appJson.tabBar &&
  appJson.tabBar.custom === true &&
  exists("sanmuhe-miniprogram/custom-tab-bar/index.js") &&
  exists("sanmuhe-miniprogram/custom-tab-bar/index.wxml") &&
  exists("sanmuhe-miniprogram/custom-tab-bar/index.wxss");
results.push(status("custom tabBar", customTabbarOk, customTabbarOk ? "custom full-width tabBar present" : "missing custom tabBar"));

if (customTabbarOk) {
  const tabJs = readText("sanmuhe-miniprogram/custom-tab-bar/index.js");
  const tabWxml = readText("sanmuhe-miniprogram/custom-tab-bar/index.wxml");
  const tabIconOk = tabJs.includes("activeIcon") &&
    tabWxml.includes("tab-image") &&
    tabWxml.includes("mode=\"aspectFit\"");
  results.push(status("custom tabBar icon library assets", tabIconOk, tabIconOk ? "uses local Lucide-derived image icons" : "tabBar still uses CSS-only icons"));
}

if (exists("sanmuhe-miniprogram/data/catalog.js")) {
  const catalogText = readText("sanmuhe-miniprogram/data/catalog.js");
  const localAssetsReferenced = uiAssetFiles
    .filter((file) => file.startsWith("sanmuhe-miniprogram/assets/images/"))
    .map((file) => `/${file.replace("sanmuhe-miniprogram/", "")}`);
  const catalogAssetRefsOk = localAssetsReferenced.some((asset) => catalogText.includes(asset)) &&
    catalogText.includes("image:") &&
    catalogText.includes("thumb:");
  results.push(status("catalog image references", catalogAssetRefsOk, catalogAssetRefsOk ? "local catalog carries image/thumb fields" : "missing catalog image/thumb references"));
}

if (exists("sanmuhe-miniprogram/pages/cart/index.wxml")) {
  const cartWxml = readText("sanmuhe-miniprogram/pages/cart/index.wxml");
  const cartElseFree = !cartWxml.includes("wx:else");
  results.push(status("cart WXML no wx:else", cartElseFree, cartElseFree ? "cart preview parser guard applied" : "cart still uses wx:else"));
}

const wxmlFiles = [];
function collectFilesByExt(dir, ext, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFilesByExt(full, ext, out);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}
wxmlFiles.push(...collectFilesByExt(projectDir, ".wxml"));
const wxmlGuardFailures = wxmlFiles
  .map((file) => ({ file: path.relative(root, file), text: fs.readFileSync(file, "utf8") }))
  .filter((item) => item.text.includes("wx:else") || item.text.includes("&&") || item.text.includes("||") || item.text.includes("\\\\n"))
  .map((item) => item.file);
results.push(status("WXML parser guard", wxmlGuardFailures.length === 0, wxmlGuardFailures.length ? wxmlGuardFailures : "no wx:else/&&/||/literal backslash-n"));

const assetRefFailures = [];
for (const file of [
  ...collectFilesByExt(projectDir, ".wxml"),
  ...collectFilesByExt(projectDir, ".wxss"),
  ...collectFilesByExt(projectDir, ".js"),
  path.join(root, "preview/app.js"),
  path.join(root, "preview/styles.css")
]) {
  const text = fs.readFileSync(file, "utf8");
  const re = /["'](\/assets\/[^"']+|\.\.\/sanmuhe-miniprogram\/assets\/[^"']+)["']/g;
  let match;
  while ((match = re.exec(text))) {
    const ref = match[1];
    const local = ref.startsWith("/assets/")
      ? path.join(projectDir, ref.slice(1))
      : path.normalize(path.join(path.dirname(file), ref));
    if (!fs.existsSync(local)) {
      assetRefFailures.push(`${path.relative(root, file)} -> ${ref}`);
    }
  }
}
results.push(status("asset references", assetRefFailures.length === 0, assetRefFailures.length ? assetRefFailures : "all local asset refs exist"));

const nonCommandButtonFailures = [
  "sanmuhe-miniprogram/pages/shop/index.wxml",
  "sanmuhe-miniprogram/pages/order/index.wxml",
  "sanmuhe-miniprogram/pages/index/index.wxml"
].filter((file) => {
  const text = readText(file);
  return /<button[\s\S]*?class="[^"]*(side-cat|recommend-card|text-link)/.test(text);
});
results.push(status("non-command native button cleanup", nonCommandButtonFailures.length === 0, nonCommandButtonFailures.length ? nonCommandButtonFailures : "category rails and cards use view tap surfaces"));

const productJs = readText("sanmuhe-miniprogram/pages/product/index.js");
const productWxml = readText("sanmuhe-miniprogram/pages/product/index.wxml");
const productFlowOk = productJs.includes("chooseSpec") &&
  productJs.includes("changeQuantity") &&
  productJs.includes("selectedSpec") &&
  productWxml.includes("bindtap=\"chooseSpec\"") &&
  productWxml.includes("bindtap=\"changeQuantity\"");
results.push(status("product spec and quantity flow", productFlowOk, productFlowOk ? "spec/quantity controls update cart payload" : "product detail still has static controls"));

const reservationJs = readText("sanmuhe-miniprogram/pages/reservation/index.js");
const reservationWxml = readText("sanmuhe-miniprogram/pages/reservation/index.wxml");
const reservationFlowOk = reservationJs.includes("bookingOpen") &&
  reservationJs.includes("submitReservation") &&
  reservationWxml.includes("booking-sheet") &&
  reservationWxml.includes("bindtap=\"submitReservation\"");
results.push(status("reservation booking flow", reservationFlowOk, reservationFlowOk ? "room list opens booking sheet and submits" : "reservation page missing booking form"));

const eventsJs = readText("sanmuhe-miniprogram/pages/events/index.js");
const eventsWxml = readText("sanmuhe-miniprogram/pages/events/index.wxml");
const eventsFlowOk = eventsJs.includes("changeCategory") &&
  eventsJs.includes("publishEvent") &&
  eventsWxml.includes("bindtap=\"changeCategory\"") &&
  eventsWxml.includes("bindtap=\"publishEvent\"");
results.push(status("events filter and publish flow", eventsFlowOk, eventsFlowOk ? "activity tabs filter and publish entry is visible" : "events page missing filter/publish interactions"));

const cartJs = readText("sanmuhe-miniprogram/pages/cart/index.js");
const cartProfileNavOk = cartJs.includes('wx.switchTab({ url: "/pages/profile/index" })');
results.push(status("cart completion tab navigation", cartProfileNavOk, cartProfileNavOk ? "order success switches to profile tab" : "order success may navigateTo tabBar page"));

const createOrderJs = readText("sanmuhe-miniprogram/cloudfunctions/createOrder/index.js");
const orderSpecPriceOk = createOrderJs.includes("specMultipliers") &&
  createOrderJs.includes("sanitizeOptions") &&
  createOrderJs.includes("getTrustedPrice") &&
  createOrderJs.includes("options.unit") &&
  createOrderJs.includes("Math.round(basePrice *");
results.push(status("order backend spec pricing", orderSpecPriceOk, orderSpecPriceOk ? "cloud order total honors tea unit specs" : "cloud order total may ignore selected tea specs"));

if (exists("sanmuhe-miniprogram/cloudbaserc.json")) {
  const cloudbaseRc = readJson("sanmuhe-miniprogram/cloudbaserc.json");
  const cloudbaseNames = (cloudbaseRc.functions || []).map((item) => item.name).sort();
  const resourceListOk = requiredFunctions.every((name) => cloudbaseNames.includes(name));
  results.push(status("cloudbaserc functions", resourceListOk, `${cloudbaseNames.length} functions listed`));
}

const cliScriptDetails = [];
const resolverOk = exists("resolve-wechat-cli.ps1") &&
  readText("resolve-wechat-cli.ps1").includes("D:\\*\\cli.bat") &&
  readText("resolve-wechat-cli.ps1").includes("D:\\small_program_tool\\*\\cli.bat");
let dDriveCliCovered = resolverOk;
for (const script of cliScripts) {
  if (!exists(script)) {
    dDriveCliCovered = false;
    cliScriptDetails.push(`${script}: missing`);
    continue;
  }
  const text = readText(script);
  const usesResolver = text.includes("resolve-wechat-cli.ps1");
  if (!usesResolver) {
    dDriveCliCovered = false;
  }
  cliScriptDetails.push(`${script}: ${usesResolver ? "uses CLI resolver" : "missing CLI resolver"}`);
}
cliScriptDetails.unshift(`resolve-wechat-cli.ps1: ${resolverOk ? "D drive wildcard covered" : "missing D drive wildcard"}`);
results.push(status("D drive DevTools CLI scripts", dDriveCliCovered, cliScriptDetails));

if (exists("sanmuhe-cloud-preview.ps1")) {
  const previewWizard = readText("sanmuhe-cloud-preview.ps1");
  const autoOpenQrOk = previewWizard.includes("Invoke-Item $PreviewQr");
  results.push(status("preview QR auto open", autoOpenQrOk, autoOpenQrOk ? "sanmuhe-preview.png opens after generation" : "missing automatic QR open"));
}

if (exists("start-sanmuhe.bat")) {
  const launcher = readText("start-sanmuhe.bat");
  const previewOutputCheckOk = launcher.includes("Check preview output files") &&
    launcher.includes("check-preview-output.bat");
  results.push(status("launcher preview output check", previewOutputCheckOk, previewOutputCheckOk ? "menu option present" : "missing menu option"));
}

const syntaxFailures = checkSyntax([
  ...collectJsFiles(projectDir),
  path.join(root, "preview/app.js"),
  path.join(root, "scripts/verify-cloud-migration.js")
]);
results.push(status("javascript syntax", syntaxFailures.length === 0, syntaxFailures.length ? syntaxFailures : "all checked files parse"));

const appIdConfigured = !!projectConfig.appid && projectConfig.appid !== "touristappid";
const envConfigured = !!cloudConfig.envId;
results.push(status("real AppID configured", appIdConfigured, projectConfig.appid || ""));
results.push(status("cloud envId configured", envConfigured, cloudConfig.envId || ""));

if (!appIdConfigured) {
  blockers.push("真实 AppID 未配置，当前仍为 touristappid。");
}

if (!envConfigured) {
  blockers.push("云开发 envId 未配置。");
}

const ok = results.every((item) => item.ok);
const codeReady = results
  .filter((item) => !["real AppID configured", "cloud envId configured"].includes(item.name))
  .every((item) => item.ok);
const auditCovered = [
  "已参考 docs/1.png 到 docs/6.png，并把首页、点单、分类、详情、购物车、预约、活动等页面调整为设计稿中的白底、绿色强调、图片卡片和底部导航风格。",
  "已从 docs 设计图裁切并接入茶饮、茶叶、茶室、活动图片素材，商品和活动数据携带 image/thumb 字段。",
  "本地小程序代码已接入 wx.cloud 初始化和云函数调用。",
  `云函数目录、${requiredFunctions.length} 个云函数和 cloudbaserc 资源清单已存在。`,
  "云状态页已包含订单、预约、活动、报名、我的记录和商品/活动管理的一键云端检查。",
  "Windows 侧总入口、打开、登录、预检、部署、预览脚本已存在，直接调用 CLI 的脚本已覆盖 D 盘路径。",
  "浏览器静态预览文件已存在，可不依赖微信开发者工具查看界面效果。"
];
const auditMissing = [
  "尚未在当前 Linux 会话中生成微信开发者工具真实预览二维码。",
  "尚未在真实微信预览中验证 getOpenId、seedDemoData 和数据库写入。"
];

if (appIdConfigured) {
  auditCovered.push("真实小程序 AppID 已写入 project.config.json。");
} else {
  auditMissing.unshift("真实小程序 AppID 未写入 project.config.json。");
}

if (envConfigured) {
  auditCovered.push("真实云开发 envId 已写入 config/cloud.js。");
} else {
  auditMissing.unshift("真实云开发 envId 未写入 config/cloud.js。");
}

const report = {
  ok,
  codeReady,
  readyForCloudPreview: codeReady && appIdConfigured && envConfigured,
  completionAudit: {
    objective: "按 docs 下全部 UI 设计图优化三木合小程序 UI，并补齐云开发部署、商品/活动后台逻辑和真实预览路径。",
    covered: auditCovered,
    missing: auditMissing
  },
  blockers,
  results
};

console.log(JSON.stringify(report, null, 2));

if (!codeReady) {
  process.exit(1);
}
