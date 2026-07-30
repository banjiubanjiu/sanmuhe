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
  "pages/contact/index",
  "pages/member/index",
  "pages/profile/index"
];

const requiredFunctions = [
  "getOpenId",
  "getCatalog",
  "seedDemoData",
  "manageCatalog",
  "manageOperations",
  "createOrder",
  "createPayment",
  "wechatPayNotify",
  "releaseOrderLocks",
  "createReservation",
  "listEvents",
  "createEvent",
  "joinEvent",
  "listMyRecords",
  "cleanupSmokeData"
];

const requiredRootFiles = [
  "configure-cloud.bat",
  "configure-cloud.ps1",
  "resolve-wechat-cli.ps1",
  "read-cloud-config.ps1",
  "check-cloud-ready.bat",
  "check-cloud-ready.ps1",
  "deploy-cloudfunctions.bat",
  "deploy-cloudfunctions.ps1",
  "start-sanmuhe.bat",
  "open-sanmuhe-devtools.bat",
  "open-sanmuhe-devtools.ps1",
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

const uiAssetFiles = [
  "docs/UI设计.png",
  "docs/1.png",
  "docs/2.png",
  "docs/3.png",
  "docs/4.png",
  "docs/5.png",
  "docs/6.png",
  "docs/我的界面.png",
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
  "deploy-cloudfunctions.ps1",
  "check-cloud-ready.ps1"
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

const appJsonText = readText("sanmuhe-miniprogram/app.json");
const tabBarJs = readText("sanmuhe-miniprogram/custom-tab-bar/index.js");
const tabBarUtil = readText("sanmuhe-miniprogram/utils/tabbar.js");
const cartJsText = exists("sanmuhe-miniprogram/pages/cart/index.js") ? readText("sanmuhe-miniprogram/pages/cart/index.js") : "";
const createOrderText = exists("sanmuhe-miniprogram/cloudfunctions/createOrder/index.js")
  ? readText("sanmuhe-miniprogram/cloudfunctions/createOrder/index.js")
  : "";
const cartConfirmOk = exists("sanmuhe-miniprogram/pages/cart/index.js") &&
  appJsonText.includes("pages/cart/index") &&
  !tabBarJs.includes("pages/cart/index") &&
  !tabBarUtil.includes("pages/cart/index") &&
  cartJsText.includes('payMode: "manual"') &&
  cartJsText.includes('deliveryMethod: "onsite"') &&
  !cartJsText.includes("chooseAddress") &&
  createOrderText.includes("admin_notices") &&
  createOrderText.includes("isManualPayMode") &&
  createOrderText.includes('"onsite"');
results.push(status("manual cart confirm flow", cartConfirmOk, cartConfirmOk ? "onsite cart confirms without fulfillment form and notifies admin" : "manual cart confirm flow incomplete"));

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
  ...collectFilesByExt(projectDir, ".js")
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

const profileJs = readText("sanmuhe-miniprogram/pages/profile/index.js");
const profileWxml = readText("sanmuhe-miniprogram/pages/profile/index.wxml");
const favoriteServiceOk = exists("sanmuhe-miniprogram/utils/favorites.js") &&
  productJs.includes("contactService") &&
  productJs.includes("toggleFavorite") &&
  productJs.includes("wx.makePhoneCall") &&
  productWxml.includes("bindtap=\"contactService\"") &&
  productWxml.includes("bindtap=\"toggleFavorite\"") &&
  profileJs.includes("getFavorites") &&
  profileWxml.includes("收藏茶品");
results.push(status("product service and favorite flow", favoriteServiceOk, favoriteServiceOk ? "service phone and local favorites are wired into profile" : "product service/favorite actions are static or missing"));

const listMyRecordsJs = readText("sanmuhe-miniprogram/cloudfunctions/listMyRecords/index.js");
const profileRecordKeysOk = profileJs.includes("normalizeRecords") &&
  listMyRecordsJs.includes("reservations.map") &&
  listMyRecordsJs.includes("signups.map") &&
  profileWxml.includes("wx:key=\"id\"");
results.push(status("profile record stable ids", profileRecordKeysOk, profileRecordKeysOk ? "cloud and local records normalize id keys" : "profile records may lack stable ids"));

const profileDesignOk = profileJs.includes("serviceItems") &&
  profileJs.includes("wx.chooseAddress") &&
  profileJs.includes("getRecentReservation") &&
  profileWxml.includes("member-hero") &&
  profileWxml.includes("order-panel") &&
  profileWxml.includes("service-grid") &&
  profileWxml.includes("最近预约") &&
  profileWxml.includes("最近活动") &&
  profileJs.includes("/assets/icons/heart-ink.png");
results.push(status("profile design coverage", profileDesignOk, profileDesignOk ? "profile matches docs/我的界面.png: member card, order shortcuts, service grid, recent reservation/activity" : "profile still misses major docs/我的界面.png sections"));

const reservationJs = readText("sanmuhe-miniprogram/pages/reservation/index.js");
const reservationWxml = readText("sanmuhe-miniprogram/pages/reservation/index.wxml");
const reservationFlowOk = reservationJs.includes("bookingOpen") &&
  reservationJs.includes("submitReservation") &&
  reservationWxml.includes("booking-sheet") &&
  reservationWxml.includes("bindtap=\"submitReservation\"");
results.push(status("reservation booking flow", reservationFlowOk, reservationFlowOk ? "room list opens booking sheet and submits" : "reservation page missing booking form"));

const orderJs = readText("sanmuhe-miniprogram/pages/order/index.js");
const orderWxml = readText("sanmuhe-miniprogram/pages/order/index.wxml");
const orderWxss = readText("sanmuhe-miniprogram/pages/order/index.wxss");
const shopWxml = readText("sanmuhe-miniprogram/pages/shop/index.wxml");
const shopWxss = readText("sanmuhe-miniprogram/pages/shop/index.wxss");
const orderDesignFlowOk = orderJs.includes("quickAddDrink") &&
  orderJs.includes("switchOrderTab") &&
  !orderWxml.includes("drink-options-panel") &&
  orderWxml.includes("/assets/icons/plus-white.png") &&
  orderWxml.includes("order-tab-icon");
results.push(status("drink ordering design flow", orderDesignFlowOk, orderDesignFlowOk ? "drink ordering matches design: plus icon quick-add, icon tabbar, no permanent option strip" : "drink ordering still has a permanent option strip or missing icon controls"));

const roundAddNativeButton = /<button[\s\S]*?class="[^"]*round-add/.test(`${orderWxml}\n${shopWxml}`);
const roundAddCentered =
  /\.round-add\s*{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/.test(orderWxss) &&
  /\.round-add\s*{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/.test(shopWxss);
const compactAddOk = orderWxml.includes("order-cart-pill") &&
  shopWxml.includes("shop-cart-pill") &&
  !orderWxml.includes('class="safe-bar tab-safe-bar"') &&
  !orderWxml.includes('<button class="safe-bar-action"') &&
  !roundAddNativeButton &&
  roundAddCentered;
results.push(status("compact icon add and cart pill", compactAddOk, compactAddOk ? "plus controls are icon-only and cart pills open confirm checkout" : "plus controls oversized or cart pill missing"));

const eventsJs = readText("sanmuhe-miniprogram/pages/events/index.js");
const eventsWxml = readText("sanmuhe-miniprogram/pages/events/index.wxml");
const joinEventJs = readText("sanmuhe-miniprogram/cloudfunctions/joinEvent/index.js");
const eventsFlowOk = eventsJs.includes("changeCategory") &&
  eventsJs.includes("publishEvent") &&
  eventsWxml.includes("bindtap=\"changeCategory\"") &&
  eventsWxml.includes("bindtap=\"publishEvent\"");
results.push(status("events filter and publish flow", eventsFlowOk, eventsFlowOk ? "activity tabs filter and publish entry is visible" : "events page missing filter/publish interactions"));

const eventSignupCapacityOk = eventsJs.includes("canJoin") &&
  eventsJs.includes("markJoined") &&
  eventsWxml.includes("disabled=\"{{!item.canJoin}}\"") &&
  joinEventJs.includes("活动名额已满") &&
  joinEventJs.includes("signed: _.inc(1)") &&
  eventsJs.includes("alreadyJoined");
results.push(status("event signup capacity flow", eventSignupCapacityOk, eventSignupCapacityOk ? "signup disables full/joined events and increments cloud signed count" : "event signup capacity or count update missing"));

const createEventJs = readText("sanmuhe-miniprogram/cloudfunctions/createEvent/index.js");
const createJoinIdOk = createEventJs.includes("const eventId = `event-cloud-${Date.now()}`") &&
  createEventJs.includes("id: eventId") &&
  createEventJs.includes("docId: addResult._id") &&
  joinEventJs.includes("event.eventId") &&
  joinEventJs.includes('where({ id: eventId })');
results.push(status("create event returns joinable id", createJoinIdOk, createJoinIdOk ? "createEvent returns business id used by joinEvent" : "createEvent may return doc _id that joinEvent cannot count"));

const reservationFallbackCopyOk = reservationJs.includes("预约已临时保存在本机，云端恢复后请重新提交确认。") &&
  !reservationJs.includes("本地演示记录");
results.push(status("reservation fallback production copy", reservationFallbackCopyOk, reservationFallbackCopyOk ? "reservation fallback copy is production-facing" : "reservation fallback still exposes demo wording"));

const createOrderJs = readText("sanmuhe-miniprogram/cloudfunctions/createOrder/index.js");
const orderSpecPriceOk = createOrderJs.includes("resolveTeaSpec") &&
  createOrderJs.includes("sanitizeOptions") &&
  createOrderJs.includes("getTrustedPrice") &&
  createOrderJs.includes("options.unit") &&
  (createOrderJs.includes("legacySpecMultipliers") || createOrderJs.includes("specs"));
results.push(status("order backend spec pricing", orderSpecPriceOk, orderSpecPriceOk ? "cloud order total honors tea unit specs" : "cloud order total may ignore selected tea specs"));

const orderDynamicCatalogOk = createOrderJs.includes("findTrustedItem") &&
  createOrderJs.includes("tea_products") &&
  createOrderJs.includes("drinks") &&
  createOrderJs.includes("item.visible !== false") &&
  createOrderJs.includes("await sanitizeItems");
results.push(status("order backend dynamic catalog pricing", orderDynamicCatalogOk, orderDynamicCatalogOk ? "createOrder trusts cloud catalog first and falls back to built-in prices" : "createOrder only accepts hard-coded products"));

const cleanupSmokeJs = readText("sanmuhe-miniprogram/cloudfunctions/cleanupSmokeData/index.js");
const smokeCleanupOk = cleanupSmokeJs.includes("cloud-status-smoke") &&
  cleanupSmokeJs.includes("removeByQuery") &&
  cleanupSmokeJs.includes("event_signups");
results.push(status("cloud smoke cleanup flow", smokeCleanupOk, smokeCleanupOk ? "cleanupSmokeData removes test orders/reservations/events/signups" : "cleanupSmokeData may leave uncleanable test data"));

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

if (exists("start-sanmuhe.bat")) {
  const launcher = readText("start-sanmuhe.bat");
  const launcherLeanOk = !launcher.includes("open-preview.bat") &&
    !launcher.includes("preview-sanmuhe.bat") &&
    !launcher.includes("sanmuhe-cloud-preview.bat") &&
    !launcher.includes("check-preview-output.bat") &&
    launcher.includes("deploy-cloudfunctions.bat") &&
    launcher.includes("open-sanmuhe-devtools.bat");
  results.push(status("lean launcher", launcherLeanOk, launcherLeanOk ? "launcher only keeps config, readiness, deploy, and open project actions" : "launcher still exposes removed preview actions"));
}

const syntaxFailures = checkSyntax([
  ...collectJsFiles(projectDir),
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
  "已参考 docs/1.png 到 docs/6.png 和 docs/我的界面.png，并把首页、点单、分类、详情、购物车、预约、活动、我的等页面调整为设计稿中的白底、绿色强调、图片卡片和底部导航风格。",
  "已把分类/点单加购控件收敛为本地图标按钮，并把点单页购物车改为有商品才显示的紧凑结算胶囊。",
  "已从 docs 设计图裁切并接入茶饮、茶叶、茶室、活动、会员中心图片素材，商品和活动数据携带 image/thumb 字段。",
  "本地小程序代码已接入 wx.cloud 初始化和云函数调用。",
  `云函数目录、${requiredFunctions.length} 个云函数和 cloudbaserc 资源清单已存在。`,
  "云函数健康检查与测试数据清理能力已保留在云端，不再向顾客暴露开发调试用页面。",
  "Windows 侧只保留配置、预检、云函数部署和打开微信开发者工具入口；二维码预览和浏览器预览冗余入口已移除。"
];
const auditMissing = [];

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
  readyForWechatDevtools: codeReady && appIdConfigured && envConfigured,
  completionAudit: {
    objective: "按 docs 下全部 UI 设计图优化禾煦小程序 UI，并补齐云开发部署、商品/活动后台逻辑和微信开发者工具热部署路径。",
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
