const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const allowedCollections = {
  drinks: "drinks",
  tea_products: "tea_products",
  rooms: "rooms",
  events: "events",
  /** 商品类别：茶叶/堂饮共用「类别 + 商品」模型 */
  product_categories: "product_categories"
};

const PRODUCT_CATEGORY_CHANNELS = new Set(["tea_products", "drinks"]);
const IMAGE_FIELDS = new Set(["image", "thumb", "detailImage"]);
/** cloud:// fileID 前缀约 80 字，后台上传路径常超过 120 */
const IMAGE_REF_MAX = 500;

const writeActions = new Set(["create", "update", "delete", "restore", "remove"]);

/**
 * 列表内存缓存：CloudBase 实例复用，热启动直接命中，避免切集合每次都查库。
 * TTL 30s（对齐前端 SWR 缓存）；写操作后立即失效。
 */
const CATALOG_LIST_CACHE_TTL = 30 * 1000;
const catalogListCache = {};

function invalidateCatalogListCache(collection) {
  if (collection) delete catalogListCache[collection];
}

function getCachedCatalogList(collection) {
  const cached = catalogListCache[collection];
  if (cached && Date.now() - cached.at < CATALOG_LIST_CACHE_TTL) {
    return cached.items;
  }
  return null;
}

function setCachedCatalogList(collection, items) {
  catalogListCache[collection] = { items, at: Date.now() };
}
function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanAuditReason(event = {}) {
  const data = event.data && typeof event.data === "object" ? event.data : {};
  return cleanText(event.reason || event.auditReason || event.adminNote || data.reason || data.auditReason, 200);
}

function requireAuditReason(event = {}, label = "关键资料操作") {
  const reason = cleanAuditReason(event);
  if (!reason) {
    invalidInput(`${label}需填写操作原因`);
  }
  return reason;
}

function invalidInput(message) {
  const error = new Error(message);
  error.code = "INVALID_INPUT";
  throw error;
}

function assertSafeTextRef(value, label) {
  const text = cleanText(value, IMAGE_REF_MAX);
  if (!text) {
    return;
  }
  if (/[\r\n]/.test(text) || /^(javascript|data|vbscript):/i.test(text)) {
    invalidInput(`${label}格式不安全`);
  }
}

function assertImageRef(value, label) {
  const text = cleanText(value, IMAGE_REF_MAX);
  if (!text) {
    return;
  }
  assertSafeTextRef(text, label);
  if (!/^(cloud:\/\/|https?:\/\/|\/assets\/)/.test(text)) {
    invalidInput(`${label}需填写云存储 fileID、HTTP(S) 地址或 /assets/ 本地图片路径`);
  }
}

function assertOptionalNumber(value, label, options = {}) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    invalidInput(`${label}必须是数字`);
  }
  if (options.min !== undefined && number < options.min) {
    invalidInput(`${label}不能小于 ${options.min}`);
  }
  if (options.max !== undefined && number > options.max) {
    invalidInput(`${label}不能大于 ${options.max}`);
  }
}

function normalizeAction(action) {
  const value = cleanText(action, 20) || "list";
  return ["list", "get", "create", "update", "delete", "restore", "remove"].includes(value) ? value : "";
}

/** 已软删除（列表默认不展示） */
function isRemovedItem(item) {
  return !!(item && item.removed === true);
}

/** 已下架但未删除（含活动历史用 deleted 表示下架） */
function isOffShelfItem(item) {
  if (!item || isRemovedItem(item)) return false;
  return item.visible === false || item.deleted === true;
}

function normalizeCollection(collection) {
  return allowedCollections[cleanText(collection, 40)] || "";
}

function parseList(value) {
  return String(value || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function callerLabel(caller = {}) {
  return caller.username || caller.uid || caller.openid || "admin";
}

function maskOpenid(value) {
  const text = cleanText(value, 80);
  if (!text) {
    return "";
  }
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : `${text.slice(0, 3)}...`;
}

function getAuthObject() {
  try {
    const cloudbase = require("@cloudbase/js-sdk");
    const app = cloudbase.init({});
    if (app.auth && typeof app.auth.getUserInfo === "function") {
      return app.auth;
    }
    if (typeof app.auth === "function") {
      return app.auth();
    }
  } catch (error) {
    // Mini program admins can still be authorized with ADMIN_OPENIDS.
  }
  return null;
}

/** Reject empty / SDK placeholder identities so they never authorize or wipe real caller. */
function usableIdentity(value, maxLength = 120) {
  const text = cleanText(value, maxLength);
  if (!text) {
    return "";
  }
  if (/^(anonymous|null|undefined)$/i.test(text)) {
    return "";
  }
  return text;
}

function firstIdentity(...values) {
  for (const value of values) {
    const text = usableIdentity(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function parseContextEnvironment(context = {}) {
  const raw = context.environment || context.environ || "";
  if (!raw) {
    return {};
  }
  if (typeof raw === "object") {
    return raw;
  }
  try {
    const text = String(raw).trim();
    if (!text) {
      return {};
    }
    if (text.startsWith("{")) {
      return JSON.parse(text);
    }
    return text.split("&").reduce((result, pair) => {
      const index = pair.indexOf("=");
      if (index < 0) {
        return result;
      }
      const key = decodeURIComponent(pair.slice(0, index));
      const value = decodeURIComponent(pair.slice(index + 1));
      result[key] = value;
      return result;
    }, {});
  } catch (error) {
    return {};
  }
}

async function getCaller(context = {}) {
  const wxContext = cloud.getWXContext() || {};
  const contextUser = context && context.userInfo && typeof context.userInfo === "object"
    ? context.userInfo
    : {};
  const nestedUser = contextUser.userInfo && typeof contextUser.userInfo === "object"
    ? contextUser.userInfo
    : {};
  const envInfo = parseContextEnvironment(context);

  // Prefer request-scoped identity. Never let in-function js-sdk session wipe a real caller.
  const caller = {
    openid: firstIdentity(
      wxContext.OPENID,
      wxContext.FROM_OPENID,
      contextUser.openId,
      contextUser.openid
    ),
    uid: firstIdentity(
      contextUser.uid,
      contextUser.userId,
      contextUser.customUserId,
      nestedUser.uid,
      nestedUser.userId,
      wxContext.TCB_UUID,
      wxContext.UUID,
      envInfo.uid,
      envInfo.userId,
      envInfo.TCB_UUID
    ),
    username: firstIdentity(
      contextUser.username,
      contextUser.name,
      nestedUser.username,
      nestedUser.name,
      envInfo.username,
      envInfo.name
    )
  };

  const auth = getAuthObject();
  if (!auth) {
    return caller;
  }

  try {
    const userInfo = typeof auth.getUserInfo === "function" ? auth.getUserInfo() : {};
    const nested = userInfo && userInfo.userInfo && typeof userInfo.userInfo === "object"
      ? userInfo.userInfo
      : {};
    if (!caller.uid) {
      caller.uid = firstIdentity(userInfo.uid, nested.uid);
    }
    if (!caller.username) {
      caller.username = firstIdentity(userInfo.username, nested.username, userInfo.email, nested.email);
    }
  } catch (error) {
    // Ignore and try detailed user info below.
  }

  if (caller.uid && !caller.username && typeof auth.getEndUserInfo === "function") {
    try {
      const detail = await auth.getEndUserInfo(caller.uid);
      const info = detail.userInfo || detail.data && detail.data.userInfo || {};
      caller.username = firstIdentity(info.username, info.email, caller.username);
    } catch (error) {
      // UID whitelist remains sufficient when detail lookup is unavailable.
    }
  }

  return caller;
}

function assertCanWrite(caller) {
  const openids = parseList(process.env.ADMIN_OPENIDS);
  const uids = parseList(process.env.ADMIN_UIDS);
  const usernames = parseList(process.env.ADMIN_USERNAMES);
  const hasWhitelist = openids.length + uids.length + usernames.length > 0;

  if (!hasWhitelist) {
    const error = new Error("未配置管理员白名单");
    error.code = "NO_ADMIN_WHITELIST";
    throw error;
  }

  if (caller.openid && openids.includes(caller.openid)) {
    return;
  }
  if (caller.uid && uids.includes(caller.uid)) {
    return;
  }
  if (caller.username && usernames.includes(caller.username)) {
    return;
  }

  const error = new Error("无权修改商品和活动数据");
  error.code = "NO_PERMISSION";
  throw error;
}

async function writePermissionDeniedAudit(caller = {}, attemptedAction, collection = "") {
  try {
    await writeAdminAuditLog(caller, "accessDenied", {
      attemptedAction: cleanText(attemptedAction, 60),
      collection: cleanText(collection, 40),
      reason: "管理员白名单拦截"
    });
  } catch (error) {
    // Access denial should never fail the original response path.
  }
}

function auditValue(value) {
  if (value && typeof value === "object") {
    if (value.$date || value.seconds) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(auditValue);
    }
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = auditValue(value[key]);
      return result;
    }, {});
  }
  return value === undefined ? null : value;
}

function auditDiff(before = {}, after = {}, keys = []) {
  return keys.reduce((changes, key) => {
    const oldValue = auditValue(before[key]);
    const newValue = auditValue(after[key]);
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { before: oldValue, after: newValue };
    }
    return changes;
  }, {});
}

function changedSensitiveCatalogFields(existing = {}, payload = {}) {
  const fields = ["price", "stock", "lockedStock", "soldStock", "quota", "signed", "status", "visible", "deleted"];
  return fields.filter((field) => {
    if (payload[field] === undefined) {
      return false;
    }
    return JSON.stringify(auditValue(existing[field])) !== JSON.stringify(auditValue(payload[field]));
  });
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after the first setup.
  }
}

async function writeAdminAuditLog(caller, action, detail) {
  await ensureCollection("admin_audit_logs");
  await db.collection("admin_audit_logs").add({
    data: {
      action,
      adminOpenid: maskOpenid(caller.openid),
      adminUid: caller.uid ? maskOpenid(caller.uid) : "",
      detail,
      createdAt: db.serverDate()
    }
  });
}

async function findByBusinessId(collection, id) {
  const result = await db.collection(collection).where({ id }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

function normalizePayload(collection, payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const data = {};
  const stringFields = [
    "id",
    "name",
    "title",
    "category",
    "channel",
    "serviceType",
    "notes",
    "badge",
    "color",
    "unit",
    "origin",
    "roast",
    "taste",
    "detail",
    "capacity",
    "floor",
    "date",
    "time",
    "place",
    "summary",
    "status",
    "image",
    "detailImage",
    "thumb",
    "tagline",
    "brewStyle",
    "storeId",
    "categoryId",
    "groupName",
    "subtitle"
  ];

  for (const field of stringFields) {
    if (source[field] !== undefined) {
      const max = IMAGE_FIELDS.has(field)
        ? IMAGE_REF_MAX
        : (field === "summary" || field === "detail" ? 500 : 120);
      data[field] = cleanText(source[field], max);
    }
  }

  // 商品后台只有一个主图入口；即使旧版后台仍提交旧 thumb，也以新主图为准。
  if ((collection === "tea_products" || collection === "drinks") && data.image) {
    data.thumb = data.image;
  }

  // 多图：images 数组（第一张即主图，由前端保证顺序；旧数据无 images 时回退单图）
  if (Array.isArray(source.images)) {
    const imageList = source.images
      .map((item) => cleanText(item, IMAGE_REF_MAX))
      .filter(Boolean)
      .slice(0, 9);
    imageList.forEach((item) => assertImageRef(item, "商品图片"));
    if (imageList.length) {
      data.images = imageList;
      data.image = imageList[0];
      if (collection === "tea_products" || collection === "drinks") {
        data.thumb = imageList[0];
      }
    } else {
      data.images = [];
    }
  }

  if (source.price !== undefined) {
    data.price = Math.max(0, Number(source.price) || 0);
  }
  if (source.stock !== undefined) {
    data.stock = Math.max(0, Number(source.stock) || 0);
  }
  if (source.lockedStock !== undefined) {
    data.lockedStock = Math.max(0, Number(source.lockedStock) || 0);
  }
  if (source.soldStock !== undefined) {
    data.soldStock = Math.max(0, Number(source.soldStock) || 0);
  }
  if (source.quota !== undefined) {
    data.quota = Math.max(1, Math.min(999, Number(source.quota) || 1));
  }
  if (source.signed !== undefined) {
    data.signed = Math.max(0, Math.min(999, Number(source.signed) || 0));
  }
  if (source.sort !== undefined) {
    data.sort = Math.max(0, Number(source.sort) || 0);
  }
  if (source.visible !== undefined) {
    data.visible = !!source.visible;
  }
  if (source.deleted !== undefined) {
    data.deleted = !!source.deleted;
  }
  if (Array.isArray(source.features)) {
    data.features = source.features.slice(0, 8).map((item) => cleanText(item, 40)).filter(Boolean);
  }
  if (Array.isArray(source.teaGroups)) {
    data.teaGroups = source.teaGroups.slice(0, 8).map((group) => {
      if (!group || typeof group !== "object") {
        return null;
      }
      const name = cleanText(group.name || group.label, 40);
      const options = Array.isArray(group.options)
        ? group.options.slice(0, 12).map((item) => cleanText(item && item.name ? item.name : item, 40)).filter(Boolean)
        : [];
      if (!options.length) {
        return null;
      }
      return {
        name: name || "本席可选",
        options
      };
    }).filter(Boolean);
  }
  if (Array.isArray(source.specs)) {
    data.specs = source.specs.slice(0, 12).map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const label = cleanText(item.label || item.unit, 40);
      if (!label) {
        return null;
      }
      const spec = {
        label,
        weight: cleanText(item.weight, 20),
        price: Math.max(0, Number(item.price) || 0),
        // 每规格各自库存（行业默认：独立 SKU 库存）
        stock: Math.max(0, Number(item.stock) || 0)
      };
      if (item.lockedStock !== undefined) {
        spec.lockedStock = Math.max(0, Number(item.lockedStock) || 0);
      }
      if (item.soldStock !== undefined) {
        spec.soldStock = Math.max(0, Number(item.soldStock) || 0);
      }
      return spec;
    }).filter(Boolean);
    // 商品层库存汇总，便于列表展示与兼容旧逻辑
    if (collection === "tea_products" && data.specs.length) {
      data.stock = data.specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.stock) || 0), 0);
      data.lockedStock = data.specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.lockedStock) || 0), 0);
      data.soldStock = data.specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.soldStock) || 0), 0);
    }
  }
  if (source.year !== undefined) {
    data.year = cleanText(source.year, 20);
  }

  if (collection !== "events" && data.visible === undefined) {
    data.visible = true;
  }
  if (data.removed === undefined) {
    data.removed = false;
  }
  if (collection === "events") {
    if (data.deleted === undefined) {
      data.deleted = false;
    }
    if (data.visible === undefined) {
      data.visible = true;
    }
  }

  return data;
}

function validateCatalogPayload(collection, payload, source = {}, options = {}) {
  const isCreate = options.isCreate === true;
  const existing = options.existing || {};
  const hasNameField = source.name !== undefined || source.title !== undefined;

  if ((isCreate || hasNameField) && !cleanText(payload.name || payload.title, 120)) {
    invalidInput(collection === "events" ? "请填写活动标题" : "请填写名称");
  }

  [
    ["price", "价格", 0, undefined],
    ["stock", "库存", 0, undefined],
    ["lockedStock", "锁定库存", 0, undefined],
    ["soldStock", "已售库存", 0, undefined],
    ["quota", "活动名额", 1, 999],
    ["signed", "已报名人数", 0, 999],
    ["sort", "排序", 0, undefined]
  ].forEach(([field, label, min, max]) => {
    assertOptionalNumber(source[field], label, { min, max });
  });

  ["image", "thumb", "detailImage"].forEach((field) => {
    if (source[field] !== undefined) {
      assertImageRef(payload[field], field === "detailImage" ? "详情图片" : "图片地址");
    }
  });

  if (collection === "product_categories") {
    const channel = cleanText(payload.channel || existing.channel, 40);
    if ((isCreate || source.channel !== undefined) && !PRODUCT_CATEGORY_CHANNELS.has(channel)) {
      invalidInput("类别渠道须为 tea_products（茶叶）或 drinks（堂饮）");
    }
    if (isCreate || hasNameField) {
      if (!cleanText(payload.name, 40)) {
        invalidInput("请填写类别名称");
      }
    }
  }

  if (collection === "events") {
    const quota = payload.quota !== undefined ? payload.quota : Number(existing.quota || 1);
    const signed = payload.signed !== undefined ? payload.signed : Number(existing.signed || 0);
    if (signed > quota) {
      invalidInput("已报名不能大于名额");
    }
  }
}

function withInventory(item) {
  if (!item) {
    return item;
  }
  let next = item;
  // 茶叶：规格各自库存，附带 availableStock
  if (Array.isArray(item.specs) && item.specs.length) {
    const specs = item.specs.map((spec) => {
      if (!spec || typeof spec !== "object") return spec;
      if (spec.stock === undefined || spec.stock === null || spec.stock === "") {
        return spec;
      }
      const stock = Math.max(0, Number(spec.stock) || 0);
      const lockedStock = Math.max(0, Number(spec.lockedStock) || 0);
      const soldStock = Math.max(0, Number(spec.soldStock) || 0);
      return Object.assign({}, spec, {
        stock,
        lockedStock,
        soldStock,
        availableStock: Math.max(0, stock - lockedStock - soldStock)
      });
    });
    const totalStock = specs.reduce((sum, spec) => sum + Math.max(0, Number(spec && spec.stock) || 0), 0);
    const totalLocked = specs.reduce((sum, spec) => sum + Math.max(0, Number(spec && spec.lockedStock) || 0), 0);
    const totalSold = specs.reduce((sum, spec) => sum + Math.max(0, Number(spec && spec.soldStock) || 0), 0);
    const hasSpecStock = specs.some((spec) => spec && spec.stock !== undefined && spec.stock !== null && spec.stock !== "");
    next = Object.assign({}, item, {
      specs,
      stock: hasSpecStock ? totalStock : item.stock,
      lockedStock: hasSpecStock ? totalLocked : item.lockedStock,
      soldStock: hasSpecStock ? totalSold : item.soldStock
    });
  }
  if (next.stock === undefined || next.stock === null || next.stock === "") {
    return next;
  }
  const stock = Math.max(0, Number(next.stock) || 0);
  const lockedStock = Math.max(0, Number(next.lockedStock) || 0);
  const soldStock = Math.max(0, Number(next.soldStock) || 0);
  return Object.assign({}, next, {
    stock,
    lockedStock,
    soldStock,
    availableStock: Math.max(0, stock - lockedStock - soldStock)
  });
}

function sortCatalog(items) {
  return items.sort((a, b) => {
    const sortA = Number(a.sort || 9999);
    const sortB = Number(b.sort || 9999);
    if (sortA !== sortB) {
      return sortA - sortB;
    }
    return String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""), "zh-Hans-CN");
  });
}

async function listItems(collection, options) {
  // 热启动缓存命中：直接返回，避免每次切换都查库（腾讯云官方实例复用建议）
  const cached = getCachedCatalogList(collection);
  if (cached) {
    return cached;
  }
  await ensureCollection(collection);
  const result = await db.collection(collection).limit(100).get();
  const includeHidden = options && options.includeHidden;
  const includeRemoved = options && options.includeRemoved;
  const items = (result.data || []).filter((item) => {
    // 软删除：默认不进列表（行业：删除后列表不再展示）
    if (isRemovedItem(item) && !includeRemoved) {
      return false;
    }
    if (includeHidden) {
      return true;
    }
    if (collection === "events") {
      return item.deleted !== true && item.visible !== false;
    }
    return item.visible !== false;
  }).map(withInventory);
  const sorted = sortCatalog(items);
  setCachedCatalogList(collection, sorted);
  return sorted;
}

exports.main = async (event = {}, context = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "manageCatalog" };
  }

  const action = normalizeAction(event.action);
  const collection = normalizeCollection(event.collection);

  if (!action || !collection) {
    return {
      ok: false,
      message: "参数错误：action 或 collection 不支持"
    };
  }

  let caller = { openid: "", uid: "", username: "" };
  try {
    caller = await getCaller(context);
    const includeHidden = !!event.includeHidden;
    const includeRemoved = !!event.includeRemoved;

    if (writeActions.has(action) || includeHidden || includeRemoved) {
      try {
        assertCanWrite(caller);
      } catch (error) {
        await writePermissionDeniedAudit(caller, action, collection);
        error.permissionDeniedAudited = true;
        throw error;
      }
    }

    if (action === "list") {
      const items = await listItems(collection, { includeHidden, includeRemoved });
      return { ok: true, collection, items };
    }

    const id = cleanText(event.id || (event.data && event.data.id), 80);
    if (!id && action !== "create") {
      return { ok: false, message: "缺少数据 id" };
    }

    await ensureCollection(collection);

    if (action === "get") {
      const item = await findByBusinessId(collection, id);
      if (item && isRemovedItem(item) && !event.includeRemoved) {
        return { ok: false, collection, item: null };
      }
      if (item && item.visible === false && !event.includeHidden && !event.includeRemoved) {
        return { ok: false, collection, item: null };
      }
      return { ok: !!item, collection, item: item ? withInventory(item) : null };
    }

    if (action === "create") {
      const payload = normalizePayload(collection, event.data || {});
      payload.id = payload.id || `${collection}-${Date.now()}`;
      validateCatalogPayload(collection, payload, event.data || {}, { isCreate: true });
      payload._openid = caller.openid || caller.uid || "";
      if ((collection === "drinks" || collection === "tea_products") && payload.stock !== undefined) {
        payload.lockedStock = payload.lockedStock || 0;
        payload.soldStock = payload.soldStock || 0;
      }
      payload.createdAt = db.serverDate();
      payload.updatedAt = db.serverDate();

      const existing = await findByBusinessId(collection, payload.id);
      if (existing) {
        return { ok: false, message: "同 ID 数据已存在" };
      }

      const addResult = await db.collection(collection).add({ data: payload });
      await writeAdminAuditLog(caller, "catalog.create", {
        collection,
        id: payload.id,
        name: payload.name || payload.title || "",
        operator: callerLabel(caller),
        changes: auditDiff({}, payload, Object.keys(payload).filter((field) => !["createdAt", "updatedAt"].includes(field)))
      });
      invalidateCatalogListCache(collection);
      return { ok: true, collection, id: payload.id, _id: addResult._id };
    }

    const existing = await findByBusinessId(collection, id);
    if (!existing) {
      return { ok: false, message: "数据不存在" };
    }

    if (action === "update") {
      const payload = normalizePayload(collection, event.data || {});
      delete payload.id;
      // 茶叶规格库存：保留各规格已锁定/已售，只改运营填写的 stock
      if (collection === "tea_products" && Array.isArray(payload.specs) && Array.isArray(existing.specs)) {
        const existingByLabel = {};
        existing.specs.forEach((spec) => {
          if (spec && spec.label) existingByLabel[String(spec.label)] = spec;
        });
        payload.specs = payload.specs.map((spec) => {
          const prev = existingByLabel[spec.label] || {};
          const lockedStock = Math.max(0, Number(prev.lockedStock) || 0);
          const soldStock = Math.max(0, Number(prev.soldStock) || 0);
          const stock = Math.max(0, Number(spec.stock) || 0);
          if (stock < lockedStock + soldStock) {
            invalidInput(`规格「${spec.label}」库存不能小于已锁定+已售（${lockedStock + soldStock}）`);
          }
          return Object.assign({}, spec, { lockedStock, soldStock, stock });
        });
        payload.stock = payload.specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.stock) || 0), 0);
        payload.lockedStock = payload.specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.lockedStock) || 0), 0);
        payload.soldStock = payload.specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.soldStock) || 0), 0);
      }
      validateCatalogPayload(collection, payload, event.data || {}, { existing });
      const sensitiveFields = changedSensitiveCatalogFields(existing, payload);
      const reason = sensitiveFields.length ? requireAuditReason(event, "修改价格、库存、名额或状态") : cleanAuditReason(event);
      if ((collection === "drinks" || collection === "tea_products") && payload.stock !== undefined) {
        const lockedStock = Math.max(0, Number(payload.lockedStock !== undefined ? payload.lockedStock : existing.lockedStock) || 0);
        const soldStock = Math.max(0, Number(payload.soldStock !== undefined ? payload.soldStock : existing.soldStock) || 0);
        if (payload.stock < lockedStock + soldStock) {
          return { ok: false, message: "总库存不能小于已锁定和已售数量" };
        }
      }
      payload.updatedAt = db.serverDate();
      await db.collection(collection).doc(existing._id).update({ data: payload });
      await writeAdminAuditLog(caller, "catalog.update", {
        collection,
        id,
        name: existing.name || existing.title || "",
        fields: Object.keys(payload).filter((field) => field !== "updatedAt"),
        reason,
        sensitiveFields,
        changes: auditDiff(existing, Object.assign({}, existing, payload), Object.keys(payload).filter((field) => field !== "updatedAt"))
      });
      invalidateCatalogListCache(collection);
      return { ok: true, collection, id };
    }

    if (action === "delete") {
      // 下架：前台不可见，列表仍可见，可恢复（行业：下架 ≠ 删除）
      if (isRemovedItem(existing)) {
        return { ok: false, message: "资料已删除，无法下架；如需再用请重新创建" };
      }
      const reason = requireAuditReason(event, "下架商品、茶室或活动");
      const data = collection === "events"
        ? { deleted: true, visible: false, updatedAt: db.serverDate() }
        : { visible: false, updatedAt: db.serverDate() };
      await db.collection(collection).doc(existing._id).update({ data });
      await writeAdminAuditLog(caller, "catalog.delete", {
        collection,
        id,
        name: existing.name || existing.title || "",
        reason,
        changes: auditDiff(existing, Object.assign({}, existing, data), Object.keys(data).filter((field) => field !== "updatedAt"))
      });
      invalidateCatalogListCache(collection);
      return { ok: true, collection, id };
    }

    if (action === "restore") {
      // 恢复上架：仅针对未软删除的下架资料
      if (isRemovedItem(existing)) {
        return { ok: false, message: "已删除的资料不可恢复上架，请重新创建" };
      }
      const reason = requireAuditReason(event, "恢复商品、茶室或活动");
      const data = collection === "events"
        ? { deleted: false, visible: true, updatedAt: db.serverDate() }
        : { visible: true, updatedAt: db.serverDate() };
      await db.collection(collection).doc(existing._id).update({ data });
      await writeAdminAuditLog(caller, "catalog.restore", {
        collection,
        id,
        name: existing.name || existing.title || "",
        reason,
        changes: auditDiff(existing, Object.assign({}, existing, data), Object.keys(data).filter((field) => field !== "updatedAt"))
      });
      invalidateCatalogListCache(collection);
      return { ok: true, collection, id };
    }

    if (action === "remove") {
      // 软删除：须先下架；列表默认不再展示；历史订单快照不受影响
      if (isRemovedItem(existing)) {
        return { ok: true, collection, id, alreadyRemoved: true };
      }
      if (!isOffShelfItem(existing)) {
        return { ok: false, message: "请先下架后再删除" };
      }
      const reason = requireAuditReason(event, "删除商品、茶室或活动");
      const data = {
        removed: true,
        visible: false,
        updatedAt: db.serverDate()
      };
      // 活动端本来用 deleted 过滤前台，一并打上避免露出
      if (collection === "events") {
        data.deleted = true;
      }
      await db.collection(collection).doc(existing._id).update({ data });
      await writeAdminAuditLog(caller, "catalog.remove", {
        collection,
        id,
        name: existing.name || existing.title || "",
        reason,
        changes: auditDiff(existing, Object.assign({}, existing, data), Object.keys(data).filter((field) => field !== "updatedAt"))
      });
      invalidateCatalogListCache(collection);
      return { ok: true, collection, id };
    }

    return { ok: false, message: "未知操作" };
  } catch (error) {
    if (error.code === "NO_PERMISSION" && !error.permissionDeniedAudited) {
      await writePermissionDeniedAudit(caller, action, collection);
    }
    return {
      ok: false,
      code: error.code || "MANAGE_CATALOG_ERROR",
      message: error.message || "商品和活动管理失败"
    };
  }
};
