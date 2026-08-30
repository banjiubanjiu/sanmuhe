const cloud = require("wx-server-sdk");
const { hydrateEnv } = require("./secrets");
const crypto = require("crypto");
const { buildAnalytics, normalizeRangeDays } = require("./analytics");
const {
  uploadExpressShipping,
  uploadPickupOrOnsiteShipping,
  uploadVirtualShipping,
  shippingResultFields,
  resolveExpressCompanyCode,
  buildItemDescFromItems,
  COMMON_EXPRESS_OPTIONS,
  setMsgJumpPath,
  queryIsTradeManaged,
  queryConfirmationCompleted,
  wxGetUnlimited,
  wxGetShareQr
} = require("./wechatShipping");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const DASHBOARD_READ_LIMIT = 1000;
const ANALYTICS_READ_LIMIT = 1000;
const ORDER_ALERT_READ_LIMIT = 50;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function requireAuditReason(event = {}, label = "高风险操作") {
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const reason = cleanText(event.reason || event.auditReason || event.adminNote || data.reason || data.auditReason, 200);
  if (!reason) {
    const error = new Error(`${label}需填写操作原因`);
    error.code = "INVALID_INPUT";
    throw error;
  }
  return reason;
}

function assertSafeTextRef(value, label) {
  const text = cleanText(value, 500);
  if (!text) {
    return;
  }
  if (/[\r\n]/.test(text) || /^(javascript|data|vbscript):/i.test(text)) {
    const error = new Error(`${label}格式不安全`);
    error.code = "INVALID_INPUT";
    throw error;
  }
}

function assertImageRef(value, label) {
  const text = cleanText(value, 500);
  if (!text) {
    return;
  }
  assertSafeTextRef(text, label);
  if (!/^(cloud:\/\/|https?:\/\/|\/|\.\/|\.\.\/|[A-Za-z0-9_./-]+\.(png|jpe?g|webp|gif|svg))/.test(text)) {
    const error = new Error(`${label}需填写云存储 fileID、HTTP(S) 地址或小程序本地图片路径`);
    error.code = "INVALID_INPUT";
    throw error;
  }
}

function assertDateText(value, label) {
  const text = cleanText(value, 30);
  if (!text) {
    return null;
  }
  const date = toDate(text);
  if (!date) {
    const error = new Error(`${label}日期格式不正确`);
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && dateKey(date) !== text) {
    const error = new Error(`${label}日期不存在`);
    error.code = "INVALID_INPUT";
    throw error;
  }
  return date;
}

function assertPhoneText(value, label) {
  const text = cleanText(value, 40);
  if (!text) {
    return;
  }
  if (!/^[0-9+\-\s()]{6,30}$/.test(text)) {
    const error = new Error(`${label}格式不正确`);
    error.code = "INVALID_INPUT";
    throw error;
  }
}

function assertOptionalNumber(value, label, options = {}) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const error = new Error(`${label}必须是数字`);
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (options.min !== undefined && number < options.min) {
    const error = new Error(`${label}不能小于 ${options.min}`);
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (options.max !== undefined && number > options.max) {
    const error = new Error(`${label}不能大于 ${options.max}`);
    error.code = "INVALID_INPUT";
    throw error;
  }
}

function cleanId(value, prefix) {
  const raw = cleanText(value, 80)
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return raw || `${prefix}-${Date.now()}`;
}

function toDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value.$date) {
    return toDate(value.$date);
  }
  if (value.seconds) {
    return new Date(value.seconds * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value) {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return dateKey(new Date());
}

function isActiveOrder(order) {
  return order && order.status !== "已取消" && order.payStatus !== "cancelled" && order.payStatus !== "expired";
}

function isRevenueOrder(order) {
  return isActiveOrder(order) && (order.payStatus === "paid" || ["已付款", "制作中", "待发货", "待自提", "已发货", "已完成"].includes(order.status));
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

function money(value) {
  return (Math.max(0, Number(value) || 0) / 100).toFixed(2);
}

/** 门店后台履约需要完整手机号（自提核销等），不再脱敏 */
function maskPhone(value) {
  return cleanText(value, 40);
}

function maskOpenid(value) {
  const text = cleanText(value, 80);
  if (!text) {
    return "";
  }
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : `${text.slice(0, 3)}...`;
}

function maskName(value) {
  const text = cleanText(value, 40);
  if (!text) {
    return "";
  }
  if (text === "已匿名") {
    return text;
  }
  return text.length <= 1 ? "*" : `${text.slice(0, 1)}*`;
}

function maskTrackingNo(value) {
  const text = cleanText(value, 80);
  if (!text) {
    return "";
  }
  return text.length > 6 ? `${text.slice(0, 2)}***${text.slice(-4)}` : "***";
}

function maskAuditScalar(key, value) {
  if (value === undefined || value === null || value === "") {
    return value === undefined ? null : value;
  }
  if (/^(phone|mobile)$/i.test(key)) {
    return maskPhone(value);
  }
  if (/^(_openid|openid)$/i.test(key)) {
    return maskOpenid(value);
  }
  if (/^(consignee|contactName|customerName|recipientName|receiverName)$/i.test(key)) {
    return maskName(value);
  }
  if (/^(address|remark)$/i.test(key)) {
    return "已脱敏";
  }
  if (/^trackingNo$/i.test(key)) {
    return maskTrackingNo(value);
  }
  return value;
}

function redactAuditValue(key, value) {
  const sensitive = /^(phone|mobile|_openid|openid|consignee|contactName|customerName|recipientName|receiverName|address|remark|trackingNo)$/i.test(key);
  if (sensitive && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value).reduce((result, childKey) => {
      result[childKey] = maskAuditScalar(key, value[childKey]);
      return result;
    }, {});
  }
  if (sensitive) {
    return maskAuditScalar(key, value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(key, item));
  }
  if (value && typeof value === "object") {
    return redactAuditDetail(value);
  }
  return value;
}

function redactAuditDetail(detail = {}) {
  return Object.keys(detail || {}).reduce((result, key) => {
    result[key] = redactAuditValue(key, detail[key]);
    return result;
  }, {});
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

// 白名单账号统一拥有全部后台能力；这里仅维护合法 action，避免未知调用进入业务分支。
const allowedActions = new Set([
  "getAdminProfile",
  "getSummary",
  "getDashboard",
  "globalSearch",
  "listOrders",
  "listPaidOrderAlerts",
  "listStoreVoiceAlerts",
  "cancelOrder",
  "confirmManualOrder",
  "markShipped",
  "retryWxShipping",
  "listExpressCompanies",
  "markPickupDone",
  "markPreparingDone",
  "listReservations",
  "updateReservation",
  "afterSaleRefundReservation",
  "listSignups",
  "updateSignup",
  "checkInSignup",
  "listCustomers",
  "listRecharges",
  "exportCustomerData",
  "deleteCustomerData",
  "listAuditLogs",
  "listInventoryLogs",
  "adjustInventory",
  "adjustMemberBalance",
  "listGiftBoxPlans",
  "saveGiftBoxPlan",
  "removeGiftBoxPlan",
  "listAfterSales",
  "updateAfterSale",
  "getAnalytics",
  "listContent",
  "saveContent",
  "deleteContent",
  "getSettings",
  "updateSettings",
  "listMembershipPlans",
  "saveMembershipPlan",
  "removeMembershipPlan",
  "getWxShippingStatus",
  "setWxShippingJumpPath",
  "generateTableQr",
  "listTableQrs",
  "downloadTableQrFile",
  "getShareQr",
  "downloadShareQrFile",
  "getSystemStatus",
  "listNotificationLogs",
  "sendTestNotice",
  "listBackupLogs",
  "getBackupDownloadUrl",
  "createDataBackup"
]);

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
    // The function can still authorize mini program admins with ADMIN_OPENIDS.
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
    // CloudBase may pass "KEY=value&..." or JSON.
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

  // Prefer request-scoped identity (web login / mini program). Never start from empty
  // and never let in-function @cloudbase/js-sdk session wipe a real caller.
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

  // 身份已由请求上下文提供（后台登录/小程序 openid）时，不再加载 24MB 的
  // @cloudbase/js-sdk（冷启动提速）；仅当完全无身份时才走 SDK 兜底。
  const auth = caller.uid || caller.openid || caller.username ? null : getAuthObject();
  if (!auth) {
    return caller;
  }

  try {
    const userInfo = typeof auth.getUserInfo === "function" ? auth.getUserInfo() : {};
    const nested = userInfo && userInfo.userInfo && typeof userInfo.userInfo === "object"
      ? userInfo.userInfo
      : {};
    // Fill blanks only — empty/anonymous SDK state must not clear context identity.
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
      // Username whitelist is optional; UID whitelist remains sufficient.
    }
  }

  return caller;
}

function assertAdmin(caller) {
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

  const error = new Error("无权访问经营后台");
  error.code = "NO_PERMISSION";
  throw error;
}

async function writeAccessDeniedAudit(caller = {}, attemptedAction, error = {}) {
  try {
    await writeAdminAuditLog(caller, "accessDenied", {
      attemptedAction: cleanText(attemptedAction, 60),
      code: cleanText(error.code, 40),
      message: cleanText(error.message, 160),
      reason: "管理员白名单拦截"
    });
  } catch (auditError) {
    // Access denial should never fail the original response path.
  }
}

function auditValue(value) {
  if (value && typeof value === "object") {
    if (value.$date || value.seconds) {
      const date = toDate(value);
      return date ? date.toISOString() : "";
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

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after first setup.
  }
}

/**
 * 只读接口的进程内短缓存：切页/轮询免重复全量查询。
 * 秒级 TTL 不影响数据新鲜度（后台操作仍是实时读取）。
 */
const __adminCache = new Map();

function adminCache(key, ttlMs, loader) {
  const hit = __adminCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) {
    return hit.value;
  }
  const valuePromise = Promise.resolve().then(loader);
  __adminCache.set(key, { at: now, value: valuePromise });
  valuePromise.catch(() => {
    // 失败不缓存，允许下次重试
    if (__adminCache.get(key) && __adminCache.get(key).value === valuePromise) {
      __adminCache.delete(key);
    }
  });
  return valuePromise;
}

async function readCollection(collection, options = {}) {
  await ensureCollection(collection);
  let query = db.collection(collection);
  if (options.where) {
    query = query.where(options.where);
  }
  if (options.orderBy) {
    query = query.orderBy(options.orderBy, options.order || "desc");
  }
  if (options.field) {
    query = query.field(options.field);
  }
  const result = await query.limit(options.limit || 100).get();
  return result.data || [];
}

async function findRecord(collection, field, value) {
  await ensureCollection(collection);
  const result = await db.collection(collection).where({ [field]: value }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function upsertRecord(collection, identityField, identityValue, data) {
  await ensureCollection(collection);
  const existing = await findRecord(collection, identityField, identityValue);
  if (existing) {
    await db.collection(collection).doc(existing._id).update({
      data: Object.assign({}, data, {
        updatedAt: db.serverDate()
      })
    });
    return { created: false, _id: existing._id };
  }
  const addResult = await db.collection(collection).add({
    data: Object.assign({}, data, {
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    })
  });
  return { created: true, _id: addResult._id };
}

async function writeInventoryLog(entry = {}) {
  await ensureCollection("inventory_logs");
  await db.collection("inventory_logs").add({
    data: Object.assign({
      collection: "",
      docId: "",
      itemId: "",
      itemName: "",
      type: "",
      quantity: 0,
      beforeStock: null,
      afterStock: null,
      beforeLockedStock: null,
      afterLockedStock: null,
      beforeSoldStock: null,
      afterSoldStock: null,
      orderNo: "",
      operator: "system",
      note: "",
      createdAt: db.serverDate()
    }, entry)
  });
}

function inventorySnapshot(item = {}) {
  return {
    stock: Math.max(0, Number(item.stock) || 0),
    lockedStock: Math.max(0, Number(item.lockedStock) || 0),
    soldStock: Math.max(0, Number(item.soldStock) || 0)
  };
}

function applySpecInventoryDelta(item, specLabel, deltaLocked, deltaSold, deltaStock = 0) {
  const specs = Array.isArray(item.specs) ? item.specs.map((spec) => Object.assign({}, spec)) : [];
  if (!specs.length) return null;
  const label = String(specLabel || "").trim();
  let index = specs.findIndex((spec) => String(spec.label || "").trim() === label);
  if (index < 0) index = 0;
  const current = specs[index] || {};
  specs[index] = Object.assign({}, current, {
    stock: Math.max(0, Math.max(0, Number(current.stock) || 0) + deltaStock),
    lockedStock: Math.max(0, Math.max(0, Number(current.lockedStock) || 0) + deltaLocked),
    soldStock: Math.max(0, Math.max(0, Number(current.soldStock) || 0) + deltaSold)
  });
  return {
    specs,
    stock: specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.stock) || 0), 0),
    lockedStock: specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.lockedStock) || 0), 0),
    soldStock: specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.soldStock) || 0), 0)
  };
}

function usesSpecInventory(item, lock = {}) {
  return lock.mode === "spec"
    || (Array.isArray(item.specs)
      && item.specs.some((spec) => spec && spec.stock !== undefined && spec.stock !== null && spec.stock !== "")
      && !!lock.specLabel);
}

async function releaseInventory(locks, meta = {}) {
  for (const lock of locks || []) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }
    try {
      const beforeDoc = await db.collection(lock.collection).doc(lock.docId).get();
      const item = beforeDoc.data || {};
      if (usesSpecInventory(item, lock)) {
        const beforeSpec = (item.specs || []).find((spec) => String(spec.label || "").trim() === String(lock.specLabel || "").trim()) || {};
        const before = {
          stock: Math.max(0, Number(beforeSpec.stock) || 0),
          lockedStock: Math.max(0, Number(beforeSpec.lockedStock) || 0),
          soldStock: Math.max(0, Number(beforeSpec.soldStock) || 0)
        };
        const next = applySpecInventoryDelta(item, lock.specLabel, -lock.quantity, 0);
        if (next) {
          await db.collection(lock.collection).doc(lock.docId).update({
            data: {
              specs: next.specs,
              stock: next.stock,
              lockedStock: next.lockedStock,
              soldStock: next.soldStock,
              updatedAt: db.serverDate()
            }
          });
        }
        await writeInventoryLog({
          collection: lock.collection,
          docId: lock.docId,
          itemId: lock.id || "",
          itemName: lock.specLabel ? `${lock.name || ""} / ${lock.specLabel}` : (lock.name || ""),
          type: meta.type || "release",
          quantity: lock.quantity,
          beforeStock: before.stock,
          afterStock: before.stock,
          beforeLockedStock: before.lockedStock,
          afterLockedStock: Math.max(0, before.lockedStock - lock.quantity),
          beforeSoldStock: before.soldStock,
          afterSoldStock: before.soldStock,
          orderNo: meta.orderNo || "",
          operator: meta.operator || "system",
          note: meta.note || "释放规格库存"
        });
        continue;
      }
      const before = inventorySnapshot(item);
      await db.collection(lock.collection).doc(lock.docId).update({
        data: {
          lockedStock: _.inc(-lock.quantity),
          updatedAt: db.serverDate()
        }
      });
      await writeInventoryLog({
        collection: lock.collection,
        docId: lock.docId,
        itemId: lock.id || "",
        itemName: lock.name || "",
        type: meta.type || "release",
        quantity: lock.quantity,
        beforeStock: before.stock,
        afterStock: before.stock,
        beforeLockedStock: before.lockedStock,
        afterLockedStock: Math.max(0, before.lockedStock - lock.quantity),
        beforeSoldStock: before.soldStock,
        afterSoldStock: before.soldStock,
        orderNo: meta.orderNo || "",
        operator: meta.operator || "system",
        note: meta.note || ""
      });
    } catch (error) {
      // Continue releasing the remaining locks.
    }
  }
}

async function confirmInventory(locks, orderNo, operator = "admin") {
  for (const lock of locks || []) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }
    const latest = await db.collection(lock.collection).doc(lock.docId).get();
    const item = latest.data || {};
    if (usesSpecInventory(item, lock)) {
      const beforeSpec = (item.specs || []).find((spec) => String(spec.label || "").trim() === String(lock.specLabel || "").trim()) || {};
      const before = {
        stock: Math.max(0, Number(beforeSpec.stock) || 0),
        lockedStock: Math.max(0, Number(beforeSpec.lockedStock) || 0),
        soldStock: Math.max(0, Number(beforeSpec.soldStock) || 0)
      };
      const next = applySpecInventoryDelta(item, lock.specLabel, -lock.quantity, lock.quantity);
      if (next) {
        await db.collection(lock.collection).doc(lock.docId).update({
          data: {
            specs: next.specs,
            stock: next.stock,
            lockedStock: next.lockedStock,
            soldStock: next.soldStock,
            updatedAt: db.serverDate()
          }
        });
      }
      await writeInventoryLog({
        collection: lock.collection,
        docId: lock.docId,
        itemId: lock.id || "",
        itemName: lock.specLabel ? `${lock.name || ""} / ${lock.specLabel}` : (lock.name || ""),
        type: "manual_confirm",
        quantity: lock.quantity,
        beforeStock: before.stock,
        afterStock: before.stock,
        beforeLockedStock: before.lockedStock,
        afterLockedStock: Math.max(0, before.lockedStock - lock.quantity),
        beforeSoldStock: before.soldStock,
        afterSoldStock: before.soldStock + lock.quantity,
        orderNo,
        operator,
        note: "管理员确认免支付订单，规格库存转为已售"
      });
      continue;
    }
    const before = inventorySnapshot(item);
    await db.collection(lock.collection).doc(lock.docId).update({
      data: {
        lockedStock: _.inc(-lock.quantity),
        soldStock: _.inc(lock.quantity),
        updatedAt: db.serverDate()
      }
    });
    await writeInventoryLog({
      collection: lock.collection,
      docId: lock.docId,
      itemId: lock.id || "",
      itemName: lock.name || "",
      type: "manual_confirm",
      quantity: lock.quantity,
      beforeStock: before.stock,
      afterStock: before.stock,
      beforeLockedStock: before.lockedStock,
      afterLockedStock: Math.max(0, before.lockedStock - lock.quantity),
      beforeSoldStock: before.soldStock,
      afterSoldStock: before.soldStock + lock.quantity,
      orderNo,
      operator,
      note: "管理员确认免支付订单，库存转为已售"
    });
  }
}

async function markCouponUsed(order) {
  if (!order || !order.coupon || !order.coupon.userCouponId) {
    return;
  }
  try {
    await ensureCollection("user_coupons");
    await db.collection("user_coupons").doc(order.coupon.userCouponId).update({
      data: {
        status: "已使用",
        usedOrderId: order._id,
        usedOrderNo: order.orderNo,
        usedAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
  } catch (error) {
    // Coupon usage is best-effort after order confirm.
  }
}

function isOpenInventoryOrder(order) {
  if (!order || order.lockReleased === true) {
    return false;
  }
  return order.payStatus === "pending" || order.payStatus === "manual";
}

function getManualFulfillmentStatus(order) {
  if (order && order.deliveryMethod === "shipping") {
    return "待发货";
  }
  // 堂饮：确认后记为已付款；自提：待自提
  if (order && order.deliveryMethod === "onsite") {
    return "已付款";
  }
  return "待自提";
}

async function releaseUserCoupon(coupon) {
  if (!coupon || !coupon.userCouponId) {
    return;
  }
  try {
    await db.collection("user_coupons").doc(coupon.userCouponId).update({
      data: {
        status: "可使用",
        lockedOrderNo: "",
        lockedUntil: null,
        discount: 0,
        updatedAt: db.serverDate()
      }
    });
  } catch (error) {
    // Continue the management action; coupon state can be repaired from logs.
  }
}

function sendServiceNotice(kind, openid, payload) {
  if (!openid || !cloud.callFunction) {
    return Promise.resolve();
  }
  return cloud.callFunction({
    name: "serviceNotify",
    data: { kind, openid, payload }
  }).catch(() => null);
}

function normalizeRecordId(value) {
  return cleanText(value, 80);
}

function matchesKeyword(item, keyword) {
  if (!keyword) {
    return true;
  }
  const haystack = [
    item.orderNo,
    item.name,
    item.phone,
    item.consignee,
    item.room,
    item.title,
    item.eventTitle,
    item.openid,
    item.status
  ].join(" ");
  return haystack.indexOf(keyword) >= 0;
}

function pageOptions(event = {}) {
  const page = Math.max(1, Math.floor(Number(event.page) || 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(Number(event.pageSize || event.limit) || 20)));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function pageMeta(total, options) {
  return {
    page: options.page,
    pageSize: options.pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / options.pageSize))
  };
}

function paginateArray(items, event = {}) {
  const options = pageOptions(event);
  return {
    items: items.slice(options.offset, options.offset + options.pageSize),
    page: pageMeta(items.length, options)
  };
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordCommand(keyword, fields = []) {
  if (!keyword || !fields.length) {
    return null;
  }
  const regex = db.RegExp({
    regexp: escapeRegExp(keyword),
    options: "i"
  });
  return _.or(fields.map((field) => ({ [field]: regex })));
}

function composeWhere(baseWhere = {}, keyword, keywordFields = []) {
  const clauses = [];
  if (baseWhere && Object.keys(baseWhere).length) {
    clauses.push(baseWhere);
  }
  const keywordWhere = keywordCommand(keyword, keywordFields);
  if (keywordWhere) {
    clauses.push(keywordWhere);
  }
  if (clauses.length === 0) {
    return {};
  }
  return clauses.length === 1 ? clauses[0] : _.and(clauses);
}

async function readCollectionPage(collection, options = {}) {
  await ensureCollection(collection);
  const paging = pageOptions(options.event || {});
  const where = composeWhere(options.where || {}, options.keyword || "", options.keywordFields || []);
  const base = () => {
    let query = db.collection(collection);
    if (where && (Object.keys(where).length || where._internalType)) {
      query = query.where(where);
    }
    return query;
  };
  const countResult = await base().count();
  let query = base();
  if (options.orderBy) {
    query = query.orderBy(options.orderBy, options.order || "desc");
  }
  const result = await query.skip(paging.offset).limit(paging.pageSize).get();
  return {
    items: result.data || [],
    page: pageMeta(countResult.total || 0, paging)
  };
}

async function listCollection(collection, status, keyword, event, keywordFields = [], extraWhere = {}) {
  await ensureCollection(collection);
  const where = Object.assign({}, extraWhere || {});
  if (status && status !== "all") {
    where.status = status;
  }
  const result = await readCollectionPage(collection, {
    where,
    keyword,
    keywordFields,
    orderBy: "createdAt",
    event
  });
  return result;
}

/**
 * 订单业务线：dinein（堂饮点单）| retail（茶叶商城）
 * 优先 bizType 一等字段；历史单回退 source / deliveryMethod / 商品 type。
 */
function normalizeOrderBizType(value) {
  const text = cleanText(value, 20).toLowerCase();
  if (!text || text === "all" || text === "全部") {
    return "";
  }
  if (["dinein", "dine-in", "onsite", "tea-menu", "堂饮", "点单", "堂饮点单", "茶单"].includes(text)) {
    return "dinein";
  }
  if (["retail", "mall", "shop", "ecommerce", "商城", "茶叶", "茶叶商城", "零售"].includes(text)) {
    return "retail";
  }
  return "";
}

function resolveOrderBizType(order = {}) {
  const explicit = normalizeOrderBizType(order.bizType || order.orderBizType || order.line);
  if (explicit) {
    return explicit;
  }
  const source = cleanText(order.source, 40).toLowerCase();
  if (source === "dinein-tea-menu" || source === "onsite-cart" || source === "cart-confirm") {
    return "dinein";
  }
  if (source === "retail-tea-catalog") {
    return "retail";
  }
  const method = cleanText(order.deliveryMethod, 20).toLowerCase();
  if (method === "onsite") {
    return "dinein";
  }
  if (method === "pickup" || method === "shipping") {
    return "retail";
  }
  const items = Array.isArray(order.items) ? order.items : [];
  const hasDrink = items.some((item) => item && item.type === "drink");
  const hasTea = items.some((item) => item && item.type === "tea");
  if (hasDrink && !hasTea) {
    return "dinein";
  }
  if (hasTea && !hasDrink) {
    return "retail";
  }
  return "retail";
}

function orderBizLabel(bizType) {
  return bizType === "dinein" ? "堂饮点单" : bizType === "retail" ? "茶叶商城" : "普通订单";
}

function orderFulfillmentLabel(order = {}) {
  const method = cleanText(order.deliveryMethod, 20).toLowerCase();
  if (method === "shipping") {
    if (order.freightCollect || order.shippingPayMode === "collect") {
      return "快递到付";
    }
    return "快递预付";
  }
  if (method === "onsite") {
    return "现场点单";
  }
  if (method === "pickup") {
    return "到店自提";
  }
  return cleanText(order.deliveryMethod, 20) || "—";
}

/** 列表/筛选：兼容无 bizType 的历史单 */
function buildOrderBizWhere(bizType) {
  const normalized = normalizeOrderBizType(bizType);
  if (normalized === "dinein") {
    return _.or([
      { bizType: "dinein" },
      { source: _.in(["dinein-tea-menu", "onsite-cart", "cart-confirm"]) },
      { deliveryMethod: "onsite" }
    ]);
  }
  if (normalized === "retail") {
    return _.or([
      { bizType: "retail" },
      { source: "retail-tea-catalog" },
      { deliveryMethod: _.in(["pickup", "shipping"]) }
    ]);
  }
  return null;
}

function enrichOrderForAdmin(order = {}) {
  if (!order || typeof order !== "object") {
    return order;
  }
  const bizType = resolveOrderBizType(order);
  return Object.assign({}, order, {
    bizType,
    bizLabel: orderBizLabel(bizType),
    fulfillmentLabel: orderFulfillmentLabel(order)
  });
}

/**
 * 店员待办队列状态（按业务线）
 * - dinein：已付/制作中/待确认（店内交付）
 * - retail：待发货/待自提
 * - 全部：上述 + 待支付（防漏单）
 */
function todoStatusesForBiz(bizType) {
  const normalized = normalizeOrderBizType(bizType);
  if (normalized === "dinein") {
    return ["已付款", "制作中", "待确认"];
  }
  if (normalized === "retail") {
    return ["待发货", "待自提"];
  }
  return ["待支付", "待确认", "已付款", "制作中", "待发货", "待自提"];
}

function parseStatusList(event = {}) {
  if (Array.isArray(event.statuses)) {
    return event.statuses.map((item) => cleanText(item, 40)).filter(Boolean);
  }
  if (Array.isArray(event.statusIn)) {
    return event.statusIn.map((item) => cleanText(item, 40)).filter(Boolean);
  }
  const raw = cleanText(event.statuses || event.statusIn, 200);
  if (raw && raw.includes(",")) {
    return raw.split(",").map((item) => cleanText(item, 40)).filter(Boolean);
  }
  return [];
}

function buildOrderStatusWhere(event = {}, bizType = "") {
  const queue = cleanText(event.queue || event.orderQueue || event.view, 20).toLowerCase();
  const single = cleanText(event.status, 40);
  const list = parseStatusList(event);

  if (queue === "todo" || queue === "work" || queue === "pending") {
    // 待办队列：固定多状态；若前端同时传了单状态则收窄（少见）
    const todo = todoStatusesForBiz(bizType);
    if (single && single !== "all" && todo.includes(single)) {
      return { status: single };
    }
    return { status: _.in(todo) };
  }

  if (list.length === 1) {
    return { status: list[0] };
  }
  if (list.length > 1) {
    return { status: _.in(list) };
  }
  if (single && single !== "all") {
    return { status: single };
  }
  return null;
}

async function listOrdersForAdmin(event = {}) {
  await ensureCollection("orders");
  const keyword = cleanText(event.keyword, 80);
  const bizType = normalizeOrderBizType(event.bizType || event.orderBizType || event.line);
  const queue = cleanText(event.queue || event.orderQueue || event.view, 20).toLowerCase();
  const clauses = [];
  const statusWhere = buildOrderStatusWhere(event, bizType);
  if (statusWhere) {
    clauses.push(statusWhere);
  }
  const bizWhere = buildOrderBizWhere(bizType);
  if (bizWhere) {
    clauses.push(bizWhere);
  }
  const where = clauses.length === 0 ? {} : (clauses.length === 1 ? clauses[0] : _.and(clauses));
  const result = await readCollectionPage("orders", {
    where,
    keyword,
    keywordFields: [
      "orderNo",
      "name",
      "contactName",
      "consignee",
      "phone",
      "mobile",
      "pickupNote",
      "remark",
      "status",
      "tableNo",
      "source",
      "bizType"
    ],
    orderBy: "createdAt",
    event
  });
  const isTodo = queue === "todo" || queue === "work" || queue === "pending";
  const appliedStatuses = isTodo
    ? todoStatusesForBiz(bizType)
    : (parseStatusList(event).length
      ? parseStatusList(event)
      : (cleanText(event.status, 40) && cleanText(event.status, 40) !== "all" ? [cleanText(event.status, 40)] : []));

  // 待办为空时给前端展示「库里其实有单」，避免误以为数据丢了
  let allTotal = null;
  if (isTodo) {
    try {
      const bizOnly = buildOrderBizWhere(bizType);
      let countQuery = db.collection("orders");
      if (bizOnly) {
        countQuery = countQuery.where(bizOnly);
      }
      const countResult = await countQuery.count();
      allTotal = Number(countResult.total || 0);
    } catch (error) {
      allTotal = null;
    }
  }

  return {
    items: (result.items || []).map(enrichOrderForAdmin),
    page: result.page,
    meta: {
      queue: queue || "",
      bizType: bizType || "",
      statuses: appliedStatuses,
      todoTotal: Number(result.page && result.page.total) || 0,
      allTotal
    }
  };
}

async function listPaidOrderAlerts() {
  // 兼容旧后台：只返回已付款商品单
  const full = await listStoreVoiceAlerts();
  return {
    ok: true,
    alerts: (full.alerts || []).filter((item) => item.kind === "order_paid"),
    serverTime: full.serverTime
  };
}

/**
 * 店内语音播报数据源：
 * - order_new：待支付/新下单
 * - order_paid：已支付
 * - recharge：会员充值入账
 */
async function listStoreVoiceAlerts() {
  await ensureCollection("orders");
  await ensureCollection("recharge_orders");

  let orderRows = [];
  try {
    const paidResult = await db.collection("orders")
      .orderBy("paidAt", "desc")
      .limit(ORDER_ALERT_READ_LIMIT)
      .get();
    orderRows = orderRows.concat(paidResult.data || []);
  } catch (error) {
    // paidAt 索引缺失时降级
  }

  try {
    const createdResult = await db.collection("orders")
      .orderBy("createdAt", "desc")
      .limit(ORDER_ALERT_READ_LIMIT)
      .get();
    const existing = new Set(orderRows.map((row) => row._id));
    (createdResult.data || []).forEach((row) => {
      if (!existing.has(row._id)) {
        orderRows.push(row);
      }
    });
  } catch (error) {
    // createdAt 排序失败则忽略
  }

  const alerts = [];

  orderRows.forEach((order) => {
    if (!order) return;
    const orderNo = cleanText(order.orderNo, 40);
    const tableNo = cleanText(order.tableNo, 20);
    const deliveryMethod = cleanText(order.deliveryMethod, 20);
    const status = cleanText(order.status, 30);
    const total = number(order.total);
    const id = cleanText(order._id, 80);
    const paidAt = toDate(order.paidAt);
    const createdAt = toDate(order.createdAt) || paidAt;

    if (order.payStatus === "paid" && paidAt) {
      alerts.push({
        id,
        kind: "order_paid",
        orderNo,
        tableNo,
        deliveryMethod,
        status,
        total,
        eventAt: paidAt.toISOString(),
        paidAt: paidAt.toISOString()
      });
      return;
    }

    // 未支付新单：用于「新订单」语音（余额已付不会走到这里）
    if (
      (order.payStatus === "pending" || status === "待支付" || status === "待确认")
      && order.payStatus !== "paid"
      && createdAt
    ) {
      // 待确认且未付：到店单；待支付：待微信付款
      alerts.push({
        id,
        kind: "order_new",
        orderNo,
        tableNo,
        deliveryMethod,
        status,
        total,
        eventAt: createdAt.toISOString(),
        paidAt: createdAt.toISOString()
      });
    }
  });

  try {
    const rechargeResult = await db.collection("recharge_orders")
      .orderBy("updatedAt", "desc")
      .limit(30)
      .get();
    (rechargeResult.data || []).forEach((row) => {
      if (!row || row.payStatus !== "paid") return;
      const eventAt = toDate(row.paidAt) || toDate(row.updatedAt) || toDate(row.createdAt);
      if (!eventAt) return;
      alerts.push({
        id: cleanText(row._id, 80),
        kind: "recharge",
        orderNo: cleanText(row.orderNo, 40),
        tableNo: "",
        deliveryMethod: "",
        status: "已支付",
        total: Math.max(0, Math.round(Number(row.payAmountFen) || 0)) / 100,
        planTitle: cleanText(row.planTitle, 40),
        eventAt: eventAt.toISOString(),
        paidAt: eventAt.toISOString()
      });
    });
  } catch (error) {
    try {
      const rechargeResult = await db.collection("recharge_orders")
        .orderBy("createdAt", "desc")
        .limit(30)
        .get();
      (rechargeResult.data || []).forEach((row) => {
        if (!row || row.payStatus !== "paid") return;
        const eventAt = toDate(row.paidAt) || toDate(row.createdAt);
        if (!eventAt) return;
        alerts.push({
          id: cleanText(row._id, 80),
          kind: "recharge",
          orderNo: cleanText(row.orderNo, 40),
          tableNo: "",
          deliveryMethod: "",
          status: "已支付",
          total: Math.max(0, Math.round(Number(row.payAmountFen) || 0)) / 100,
          planTitle: cleanText(row.planTitle, 40),
          eventAt: eventAt.toISOString(),
          paidAt: eventAt.toISOString()
        });
      });
    } catch (innerError) {
      // recharge 集合或索引不可用时跳过
    }
  }

  alerts.sort((left, right) => new Date(left.eventAt || left.paidAt).getTime() - new Date(right.eventAt || right.paidAt).getTime());

  return {
    ok: true,
    alerts,
    serverTime: new Date().toISOString()
  };
}

async function getByDocId(collection, id) {
  const result = await db.collection(collection).doc(id).get();
  return result.data || null;
}

async function getOrder(event) {
  const id = normalizeRecordId(event.orderId || event.id);
  const orderNo = cleanText(event.orderNo, 32);
  if (id) {
    try {
      const order = await getByDocId("orders", id);
      if (order) {
        return order;
      }
    } catch (error) {
      // Fall through to order number lookup.
    }
  }
  if (!orderNo) {
    return null;
  }
  const result = await db.collection("orders").where({ orderNo }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function cancelOrder(event, caller) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  if (order.status === "已取消") {
    return { ok: false, message: "订单已取消，无需重复操作" };
  }
  if (order.status === "已完成") {
    return { ok: false, message: "已完成订单请走售后处理，不能直接取消" };
  }
  const reason = cleanText(event.reason, 160);
  if (!reason) {
    return { ok: false, message: "取消订单需填写原因" };
  }
  if (order.payStatus === "paid" && !event.confirmPaidCancel) {
    return { ok: false, message: "已支付订单取消前请先完成人工退款或售后确认" };
  }

  const shouldRelease = isOpenInventoryOrder(order);
  if (shouldRelease) {
    await releaseInventory(order.inventoryLocks, {
      type: "admin_cancel_release",
      orderNo: order.orderNo,
      operator: "admin",
      note: reason
    });
    await releaseUserCoupon(order.coupon);
  }

  const nextPayStatus = (order.payStatus === "pending" || order.payStatus === "manual")
    ? "cancelled"
    : order.payStatus;

  await db.collection("orders").doc(order._id).update({
    data: {
      status: "已取消",
      payStatus: nextPayStatus,
      lockReleased: shouldRelease ? true : order.lockReleased,
      cancelReason: reason,
      adminNote: cleanText(event.adminNote, 300),
      cancelledBy: callerLabel(caller),
      updatedAt: db.serverDate()
    }
  });
  await writeAdminAuditLog(caller, "cancelOrder", {
    orderNo: order.orderNo,
    payStatus: order.payStatus,
    reason,
    changes: auditDiff(order, {
      status: "已取消",
      payStatus: nextPayStatus,
      lockReleased: shouldRelease ? true : order.lockReleased
    }, ["status", "payStatus", "lockReleased"])
  });
  return { ok: true };
}

async function confirmManualOrder(event, caller) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  if (order.status !== "待确认" || order.payStatus !== "manual") {
    return { ok: false, message: "只有待确认的免支付订单可以确认" };
  }

  const claim = await db.collection("orders").where({
    _id: order._id,
    status: "待确认",
    payStatus: "manual"
  }).update({
    data: {
      payStatus: "confirming",
      updatedAt: db.serverDate()
    }
  });
  if (!claim.updated) {
    return { ok: false, message: "订单状态已变化，请刷新后重试" };
  }

  try {
    if (order.lockReleased !== true) {
      await confirmInventory(order.inventoryLocks, order.orderNo, callerLabel(caller));
    }
    await markCouponUsed(order);
    const nextStatus = getManualFulfillmentStatus(order);
    await db.collection("orders").doc(order._id).update({
      data: {
        status: nextStatus,
        payStatus: "manual_confirmed",
        payMode: "manual",
        lockReleased: true,
        confirmedAt: db.serverDate(),
        confirmedBy: callerLabel(caller),
        adminNote: cleanText(event.adminNote, 300),
        updatedAt: db.serverDate()
      }
    });
    await writeAdminAuditLog(caller, "confirmManualOrder", {
      orderNo: order.orderNo,
      nextStatus,
      changes: auditDiff(order, {
        status: nextStatus,
        payStatus: "manual_confirmed",
        lockReleased: true
      }, ["status", "payStatus", "lockReleased"])
    });
    return { ok: true, status: nextStatus };
  } catch (error) {
    await db.collection("orders").doc(order._id).update({
      data: {
        status: "待确认",
        payStatus: "manual",
        updatedAt: db.serverDate()
      }
    });
    return { ok: false, message: error.message || "确认订单失败" };
  }
}

async function markShipped(event, caller) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  const trackingCompanyRaw = cleanText(event.trackingCompany || event.expressCompany, 80);
  const trackingCompanyCode = resolveExpressCompanyCode(trackingCompanyRaw);
  const trackingCompany = trackingCompanyCode || trackingCompanyRaw;
  const trackingNo = cleanText(event.trackingNo, 80);
  if (order.status !== "待发货") {
    return { ok: false, message: "只有待发货订单可以标记发货" };
  }
  if (!trackingNo) {
    return { ok: false, message: "标记发货需填写快递单号" };
  }
  if (!trackingCompany) {
    return { ok: false, message: "请选择快递公司" };
  }

  // 微信支付订单：先同步微信发货信息（失败不阻断本地发货，但会标记错误便于重试）
  let wxShipping = { ok: true, skipped: true, errmsg: "non-wechat or no transaction" };
  const needsWx =
    order.payMode === "wechat" ||
    order.transactionId ||
    order.payStatus === "paid";
  if (needsWx && (order.transactionId || order.orderNo)) {
    wxShipping = await uploadExpressShipping(cloud, Object.assign({}, order, {
      trackingCompany,
      trackingNo
    }), {
      trackingNo,
      expressCompany: trackingCompany,
      force: false
    });
  }

  const wxFields = shippingResultFields(wxShipping);
  await db.collection("orders").doc(order._id).update({
    data: Object.assign({
      status: "已发货",
      fulfillmentStatus: "shipped",
      trackingCompany,
      trackingCompanyCode: trackingCompanyCode || trackingCompany,
      trackingNo,
      shippedAt: db.serverDate(),
      shippedBy: callerLabel(caller),
      adminNote: cleanText(event.adminNote, 300),
      updatedAt: db.serverDate()
    }, wxFields, {
      // shippingResultFields 用 Date；云库统一 serverDate 写时间戳字段
      wxShippingUploadedAt: wxFields.wxShippingUploaded ? db.serverDate() : order.wxShippingUploadedAt || null,
      wxShippingLastAttemptAt: db.serverDate()
    })
  });
  await sendServiceNotice("orderShipped", order._openid, {
    orderNo: order.orderNo,
    trackingCompany,
    trackingNo,
    status: "已发货"
  });
  await writeAdminAuditLog(caller, "markShipped", {
    orderNo: order.orderNo,
    trackingCompany,
    trackingNo,
    wxShippingOk: Boolean(wxShipping.ok),
    wxShippingError: wxShipping.ok ? "" : (wxShipping.errmsg || ""),
    changes: auditDiff(order, {
      status: "已发货",
      fulfillmentStatus: "shipped",
      trackingCompany,
      trackingNo
    }, ["status", "fulfillmentStatus", "trackingCompany", "trackingNo"])
  });
  return {
    ok: true,
    wxShipping: {
      ok: Boolean(wxShipping.ok),
      skipped: Boolean(wxShipping.skipped),
      message: wxShipping.ok
        ? (wxShipping.skipped ? "微信侧已发货或无需重复上传" : "已同步微信发货信息")
        : (wxShipping.errmsg || "微信发货同步失败，可稍后重试")
    }
  };
}

/**
 * 手动重试微信发货信息上传（快递 / 自提 / 虚拟均可按订单类型）
 */
async function retryWxShipping(event, caller) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  if (!order.transactionId && !order.orderNo) {
    return { ok: false, message: "订单缺少微信支付信息，无法同步" };
  }

  let result;
  const method = String(order.deliveryMethod || "");
  if (method === "shipping" || order.trackingNo) {
    if (!order.trackingNo) {
      return { ok: false, message: "快递订单需先填写快递单号再同步" };
    }
    result = await uploadExpressShipping(cloud, order, {
      trackingNo: order.trackingNo,
      expressCompany: order.trackingCompanyCode || order.trackingCompany,
      force: true
    });
  } else if (method === "pickup" || method === "onsite") {
    result = await uploadPickupOrOnsiteShipping(cloud, order, { force: true });
  } else {
    result = await uploadVirtualShipping(
      cloud,
      order,
      buildItemDescFromItems(order.items, "禾煦商品"),
      { force: true }
    );
  }

  const wxFields = shippingResultFields(result);
  await db.collection("orders").doc(order._id).update({
    data: Object.assign({}, wxFields, {
      wxShippingUploadedAt: wxFields.wxShippingUploaded ? db.serverDate() : order.wxShippingUploadedAt || null,
      wxShippingLastAttemptAt: db.serverDate(),
      updatedAt: db.serverDate()
    })
  });
  await writeAdminAuditLog(caller, "retryWxShipping", {
    orderNo: order.orderNo,
    wxShippingOk: Boolean(result.ok),
    wxShippingError: result.ok ? "" : (result.errmsg || "")
  });
  return {
    ok: Boolean(result.ok),
    message: result.ok
      ? (result.skipped ? "微信侧已是发货状态" : "微信发货信息已同步")
      : (result.errmsg || "同步失败"),
    wxShipping: result
  };
}

async function markPickupDone(event, caller) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  if (order.status !== "待自提") {
    return { ok: false, message: "只有待自提订单可以标记完成自提" };
  }
  await db.collection("orders").doc(order._id).update({
    data: {
      status: "已完成",
      fulfillmentStatus: "picked_up",
      completedAt: db.serverDate(),
      completedBy: callerLabel(caller),
      adminNote: cleanText(event.adminNote, 300),
      updatedAt: db.serverDate()
    }
  });
  await writeAdminAuditLog(caller, "markPickupDone", {
    orderNo: order.orderNo,
    changes: auditDiff(order, {
      status: "已完成",
      fulfillmentStatus: "picked_up"
    }, ["status", "fulfillmentStatus"])
  });
  return { ok: true };
}

/** 堂饮已付款/历史制作中 → 已完成（可选，口头交付后不强制） */
async function markPreparingDone(event, caller) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  if (order.status !== "已付款" && order.status !== "制作中") {
    return { ok: false, message: "只有已付款订单可以标记完成" };
  }
  await db.collection("orders").doc(order._id).update({
    data: {
      status: "已完成",
      fulfillmentStatus: "served",
      completedAt: db.serverDate(),
      completedBy: callerLabel(caller),
      adminNote: cleanText(event.adminNote, 300),
      updatedAt: db.serverDate()
    }
  });
  await writeAdminAuditLog(caller, "markPreparingDone", {
    orderNo: order.orderNo,
    changes: auditDiff(order, {
      status: "已完成",
      fulfillmentStatus: "served"
    }, ["status", "fulfillmentStatus"])
  });
  return { ok: true };
}

/** 环境变量兜底；运行时优先读 store_settings.reservationCancelAdvanceHours */
const RESERVATION_CANCEL_ADVANCE_HOURS_FALLBACK = Math.max(
  1,
  Number(process.env.RESERVATION_CANCEL_ADVANCE_HOURS || 12)
);

function reservationIsPaid(row = {}) {
  return (
    row.payStatus === "paid" ||
    row.payStatus === "partial_refunded" ||
    row.payStatus === "paid_retained" ||
    Boolean(row.transactionId)
  );
}

function reservationIsFullyRefunded(row = {}) {
  return row.payStatus === "refunded";
}

function getReservationStartMs(reservation = {}) {
  const day = cleanText(reservation.day, 20);
  const time = cleanText(reservation.time, 12);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,2}:\d{2}$/.test(time)) {
    return NaN;
  }
  const start = new Date(`${day}T${time.padStart(5, "0")}:00+08:00`);
  return start.getTime();
}

/** 是否仍在「提前 N 小时」免费取消窗口内 */
function reservationInAutoRefundWindow(reservation = {}, advanceHours = RESERVATION_CANCEL_ADVANCE_HOURS_FALLBACK, nowMs = Date.now()) {
  const startMs = getReservationStartMs(reservation);
  if (!Number.isFinite(startMs)) {
    return false;
  }
  const hours = Math.max(1, Number(advanceHours) || RESERVATION_CANCEL_ADVANCE_HOURS_FALLBACK);
  return startMs - nowMs >= hours * 60 * 60 * 1000;
}

function reservationPaidTotalYuan(row = {}) {
  return Math.max(0, Number(row.total != null ? row.total : row.price) || 0);
}

function reservationAlreadyRefundedYuan(row = {}) {
  return Math.max(0, Number(row.refundAmount) || 0);
}

function reservationRemainingRefundYuan(row = {}) {
  return Math.max(0, Math.round((reservationPaidTotalYuan(row) - reservationAlreadyRefundedYuan(row)) * 100) / 100);
}

/**
 * 后台预约状态机（业务状态与支付分离）
 * 待支付 → 已取消
 * 已确认(已付) → 已完成 | 未到店 | 已取消(须指定退款)
 * 异常待处理(已付) → 已确认 | 已取消
 * 已完成 → 默认可读；售后全额退款不改业务状态（afterSaleRefund）
 * 已取消 / 未到店 → 终态
 */
function evaluateAdminReservationTransition(existing = {}, nextStatus, options = {}) {
  const from = cleanText(existing.status, 20) || "待支付";
  const paid = reservationIsPaid(existing);
  const refundMode = cleanText(options.refundMode, 20).toLowerCase(); // full | none | auto | merchant | partial
  const advanceHours = Math.max(1, Number(options.advanceHours) || RESERVATION_CANCEL_ADVANCE_HOURS_FALLBACK);
  const remainingYuan = reservationRemainingRefundYuan(existing);
  const requestedRefundYuan =
    options.refundAmount != null && options.refundAmount !== ""
      ? Math.round(Number(options.refundAmount) * 100) / 100
      : null;

  if (from === "已取消" || from === "未到店") {
    return { ok: false, message: `终态「${from}」不可再变更` };
  }
  if (nextStatus === "待支付") {
    return { ok: false, message: "不能手动将预约设为待支付" };
  }

  if (nextStatus === "已确认") {
    if (from === "异常待处理" && paid) {
      return { ok: true, needRefund: false, advanceHours };
    }
    return {
      ok: false,
      message: "「已确认」仅由支付成功写入；未支付不可手动确认。已付异常单可从「异常待处理」恢复"
    };
  }

  if (nextStatus === "已完成") {
    if (from !== "已确认" && from !== "待确认") {
      return { ok: false, message: "仅「已确认」预约可标记服务完成" };
    }
    if (!paid) {
      return { ok: false, message: "未支付预约不能标记服务完成" };
    }
    return { ok: true, needRefund: false, advanceHours };
  }

  if (nextStatus === "未到店") {
    if (from !== "已确认" && from !== "待确认") {
      return { ok: false, message: "仅「已确认」预约可标记未到店" };
    }
    if (!paid) {
      return { ok: false, message: "未支付预约请直接取消，不要标未到店" };
    }
    return { ok: true, needRefund: false, advanceHours };
  }

  if (nextStatus === "已取消") {
    if (from === "已完成") {
      return {
        ok: false,
        message: "已完成预约不可改回取消；如需退款请使用「售后退款」"
      };
    }
    if (!["待支付", "已确认", "待确认", "异常待处理"].includes(from)) {
      return { ok: false, message: `当前状态「${from}」不可取消` };
    }
    if (!paid) {
      return { ok: true, needRefund: false, refundMode: "none", advanceHours };
    }
    if (reservationIsFullyRefunded(existing) || remainingYuan <= 0) {
      return { ok: true, needRefund: false, refundMode: refundMode || "none", advanceHours };
    }
    if (!refundMode || !["full", "none", "auto", "merchant", "partial"].includes(refundMode)) {
      return {
        ok: false,
        code: "REFUND_MODE_REQUIRED",
        message: "已支付预约取消须指定退款方式：full / none / auto / merchant / partial",
        advanceHours,
        remainingRefundYuan: remainingYuan,
        inAutoRefundWindow: reservationInAutoRefundWindow(existing, advanceHours)
      };
    }

    let needRefund = false;
    let refundAmountYuan = null;
    if (refundMode === "full" || refundMode === "merchant") {
      needRefund = true;
      refundAmountYuan = remainingYuan;
    } else if (refundMode === "none") {
      needRefund = false;
    } else if (refundMode === "auto") {
      needRefund = reservationInAutoRefundWindow(existing, advanceHours);
      if (needRefund) {
        refundAmountYuan = remainingYuan;
      }
    } else if (refundMode === "partial") {
      if (requestedRefundYuan == null || !Number.isFinite(requestedRefundYuan) || requestedRefundYuan <= 0) {
        return {
          ok: false,
          code: "REFUND_AMOUNT_REQUIRED",
          message: "部分退款须填写退款金额（元）",
          remainingRefundYuan: remainingYuan
        };
      }
      if (requestedRefundYuan > remainingYuan + 0.001) {
        return {
          ok: false,
          message: `退款金额不能超过可退余额 ¥${remainingYuan}`,
          remainingRefundYuan: remainingYuan
        };
      }
      needRefund = true;
      refundAmountYuan = Math.min(remainingYuan, requestedRefundYuan);
    }

    return {
      ok: true,
      needRefund,
      refundMode,
      refundAmountYuan,
      advanceHours,
      remainingRefundYuan: remainingYuan,
      inAutoRefundWindow: reservationInAutoRefundWindow(existing, advanceHours)
    };
  }

  return { ok: false, message: `不支持的目标状态：${nextStatus}` };
}

async function requestAdminReservationRefund(reservation, reason, caller, options = {}) {
  try {
    const payload = {
      action: "refundReservation",
      adminRefund: true,
      source: "manageOperations",
      reservationId: reservation._id,
      reservationNo: reservation.reservationNo,
      reason: reason || "管理后台取消退款",
      operator: callerLabel(caller)
    };
    if (options.refundAmountYuan != null && Number.isFinite(Number(options.refundAmountYuan))) {
      payload.refundAmount = Number(options.refundAmountYuan);
    }
    const result = await cloud.callFunction({
      name: "createPayment",
      data: payload
    });
    const body = result && result.result ? result.result : result;
    if (!body || body.ok === false) {
      return {
        ok: false,
        message: (body && body.message) || "退款发起失败"
      };
    }
    return Object.assign({ ok: true }, body);
  } catch (error) {
    return {
      ok: false,
      message: (error && error.message) || "退款调用失败"
    };
  }
}

/**
 * 已完成预约：售后退款（全额或部分，不改业务状态）
 */
async function afterSaleRefundReservation(event, caller) {
  const id = normalizeRecordId(event.reservationId || event.id);
  const adminNote = cleanText(event.adminNote || event.reason, 300);
  const refundMode = cleanText(event.refundMode, 20).toLowerCase() || "full";
  const requestedYuan =
    event.refundAmount != null && event.refundAmount !== ""
      ? Math.round(Number(event.refundAmount) * 100) / 100
      : null;

  if (!id) {
    return { ok: false, message: "缺少预约 ID" };
  }
  if (!adminNote) {
    return { ok: false, message: "售后退款需填写原因" };
  }
  if (!["full", "partial"].includes(refundMode)) {
    return { ok: false, message: "售后退款方式仅支持 full 或 partial" };
  }

  const existing = await getByDocId("reservations", id);
  if (!existing) {
    return { ok: false, message: "预约记录不存在" };
  }
  if (existing.status !== "已完成") {
    return { ok: false, message: "仅「已完成」预约可走售后退款；未完成请用取消并选退款方式" };
  }
  if (!reservationIsPaid(existing) && existing.payStatus !== "partial_refunded") {
    return { ok: false, message: "该预约未支付，无需退款" };
  }
  if (reservationIsFullyRefunded(existing)) {
    return { ok: true, alreadyRefunded: true, message: "已全额退款" };
  }

  const remainingYuan = reservationRemainingRefundYuan(existing);
  if (remainingYuan <= 0) {
    return { ok: true, alreadyRefunded: true, message: "无可退余额" };
  }

  let refundAmountYuan = remainingYuan;
  if (refundMode === "partial") {
    if (requestedYuan == null || !Number.isFinite(requestedYuan) || requestedYuan <= 0) {
      return { ok: false, message: "部分退款须填写退款金额（元）", remainingRefundYuan: remainingYuan };
    }
    if (requestedYuan > remainingYuan + 0.001) {
      return { ok: false, message: `退款金额不能超过可退余额 ¥${remainingYuan}`, remainingRefundYuan: remainingYuan };
    }
    refundAmountYuan = requestedYuan;
  }

  await db.collection("reservations").doc(id).update({
    data: {
      payStatus: "refunding",
      adminNote,
      cancellationReason: adminNote,
      cancelledBy: "admin_aftersale",
      afterSaleRefund: true,
      afterSaleRefundMode: refundMode,
      updatedBy: callerLabel(caller),
      updatedAt: db.serverDate()
    }
  });

  const refundResult = await requestAdminReservationRefund(existing, adminNote, caller, {
    refundAmountYuan
  });
  if (!refundResult.ok) {
    await db.collection("reservations").doc(id).update({
      data: {
        refundError: cleanText(refundResult.message, 300),
        refundLastAttemptAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    await writeAdminAuditLog(caller, "afterSaleRefundReservation", {
      reservationId: id,
      ok: false,
      message: refundResult.message,
      reason: adminNote,
      refundMode,
      refundAmountYuan
    });
    return {
      ok: true,
      reservationId: id,
      status: existing.status,
      payStatus: "refunding",
      refund: refundResult,
      message: "已发起售后，退款处理中；若未到账请人工跟进",
      warning: refundResult.message
    };
  }

  await writeAdminAuditLog(caller, "afterSaleRefundReservation", {
    reservationId: id,
    ok: true,
    reason: adminNote,
    refundMode,
    refundAmountYuan,
    refund: refundResult
  });
  await sendServiceNotice("reservationStatus", existing._openid, {
    room: existing.room || existing.storeName,
    day: existing.day,
    time: existing.time,
    status: "已完成",
    note: `售后退款¥${refundAmountYuan}：${adminNote}`
  });

  const isPartial = refundMode === "partial" && refundAmountYuan < remainingYuan - 0.001;
  return {
    ok: true,
    reservationId: id,
    status: existing.status,
    payStatus: refundResult.payStatus || (isPartial ? "partial_refunded" : "refunded"),
    refund: refundResult,
    refundAmount: refundAmountYuan,
    message: isPartial
      ? `售后部分退款 ¥${refundAmountYuan} 已发起`
      : "售后全额退款已发起，款项原路返回"
  };
}

async function updateReservation(event, caller) {
  if (event.afterSaleRefund === true || event.action === "afterSaleRefundReservation") {
    return afterSaleRefundReservation(event, caller);
  }

  const id = normalizeRecordId(event.reservationId || event.id);
  const status = cleanText(event.status, 20);
  if (!id || !status) {
    return { ok: false, message: "缺少预约 ID 或状态" };
  }
  const allowedStatuses = ["已确认", "已完成", "已取消", "未到店"];
  if (!allowedStatuses.includes(status)) {
    return { ok: false, message: "预约状态不支持（允许：已确认、已完成、已取消、未到店）" };
  }

  const adminNote = cleanText(event.adminNote || event.reason, 300);
  if ((status === "已取消" || status === "未到店") && !adminNote) {
    return { ok: false, message: status === "已取消" ? "取消预约需填写原因" : "标记未到店需填写备注" };
  }

  const existing = await getByDocId("reservations", id);
  if (!existing) {
    return { ok: false, message: "预约记录不存在" };
  }

  const policySettings = await loadReservationPolicySettings();
  const refundMode = cleanText(event.refundMode, 20).toLowerCase();
  const policy = evaluateAdminReservationTransition(existing, status, {
    refundMode,
    refundAmount: event.refundAmount,
    advanceHours: policySettings.cancelAdvanceHours
  });
  if (!policy.ok) {
    return {
      ok: false,
      code: policy.code,
      message: policy.message,
      advanceHours: policy.advanceHours,
      remainingRefundYuan: policy.remainingRefundYuan,
      inAutoRefundWindow: policy.inAutoRefundWindow
    };
  }

  const paid = reservationIsPaid(existing);
  const nextPayStatus = (() => {
    if (status === "已取消") {
      if (!paid) {
        return existing.payStatus === "pending" || !existing.payStatus ? "cancelled" : existing.payStatus;
      }
      if (policy.needRefund) {
        return "refunding";
      }
      return existing.payStatus === "paid" || existing.payStatus === "partial_refunded"
        ? "paid_retained"
        : existing.payStatus || "paid";
    }
    if (status === "未到店") {
      return existing.payStatus || "paid";
    }
    return existing.payStatus || "";
  })();

  const patch = {
    status,
    adminNote,
    updatedBy: callerLabel(caller),
    updatedAt: db.serverDate()
  };
  if (status === "已取消") {
    patch.cancellationReason = adminNote;
    patch.cancelledBy = "admin";
    patch.cancelledAt = db.serverDate();
    patch.cancelRefundMode = policy.refundMode || refundMode || "none";
    if (policy.refundAmountYuan != null) {
      patch.cancelRefundAmount = policy.refundAmountYuan;
    }
    patch.payStatus = nextPayStatus;
  }
  if (status === "未到店") {
    patch.noShowAt = db.serverDate();
    patch.noShowBy = callerLabel(caller);
    patch.noShowNote = adminNote;
  }
  if (status === "已完成") {
    patch.completedAt = db.serverDate();
    patch.completedBy = callerLabel(caller);
  }
  if (status === "已确认" && existing.status === "异常待处理") {
    patch.payStatus = "paid";
    patch.exceptionResolvedAt = db.serverDate();
    patch.exceptionResolvedBy = callerLabel(caller);
  }

  await db.collection("reservations").doc(id).update({ data: patch });

  let refundResult = null;
  if (policy.needRefund) {
    refundResult = await requestAdminReservationRefund(existing, adminNote, caller, {
      refundAmountYuan: policy.refundAmountYuan
    });
    if (!refundResult.ok) {
      await db.collection("reservations").doc(id).update({
        data: {
          refundError: cleanText(refundResult.message, 300),
          refundLastAttemptAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    }
  }

  const updated = Object.assign({}, existing || {}, patch);
  await sendServiceNotice("reservationStatus", updated._openid, {
    room: updated.room || updated.storeName,
    day: updated.day,
    time: updated.time,
    status,
    note: updated.adminNote || updated.note || "预约状态已更新"
  });
  await writeAdminAuditLog(caller, "updateReservation", {
    reservationId: id,
    status,
    previousStatus: existing.status,
    refundMode: policy.refundMode || refundMode || "",
    refundAmountYuan: policy.refundAmountYuan != null ? policy.refundAmountYuan : null,
    needRefund: Boolean(policy.needRefund),
    refundOk: refundResult ? refundResult.ok : null,
    changes: auditDiff(existing, {
      status,
      adminNote,
      payStatus: patch.payStatus
    }, ["status", "adminNote", "payStatus"])
  });

  let message = "状态已更新";
  if (status === "已取消") {
    if (policy.needRefund) {
      const amt = policy.refundAmountYuan;
      const partial = policy.refundMode === "partial";
      if (refundResult && refundResult.ok) {
        message = partial && amt != null
          ? `预约已取消，部分退款 ¥${amt} 将原路返回`
          : "预约已取消，退款将原路返回";
      } else {
        message = "预约已取消，退款处理中（若未到账请人工跟进）";
      }
    } else if (paid) {
      message = "预约已取消，按所选策略不退款（时段已释放）";
    } else {
      message = "预约已取消，时段已释放";
    }
  } else if (status === "未到店") {
    message = "已标记未到店，预付款不退（可按门店政策人工处理）";
  } else if (status === "已完成") {
    message = "已标记服务完成";
  } else if (status === "已确认") {
    message = "异常预约已恢复为已确认";
  }

  return {
    ok: true,
    reservationId: id,
    status,
    payStatus: patch.payStatus || existing.payStatus || "",
    needRefund: Boolean(policy.needRefund),
    refund: refundResult,
    refundAmount: policy.refundAmountYuan,
    advanceHours: policySettings.cancelAdvanceHours,
    message,
    warning: refundResult && !refundResult.ok ? refundResult.message : ""
  };
}

async function updateSignup(event, caller) {
  const id = normalizeRecordId(event.signupId || event.id);
  const status = cleanText(event.status, 20);
  if (!id || !status) {
    return { ok: false, message: "缺少报名 ID 或状态" };
  }
  const allowedStatuses = ["待确认", "已确认", "已到场", "未到场", "已完成", "已取消"];
  if (!allowedStatuses.includes(status)) {
    return { ok: false, message: "报名状态不支持" };
  }
  const adminNote = cleanText(event.adminNote, 300);
  if (status === "已取消" && !adminNote) {
    return { ok: false, message: "取消报名需填写原因" };
  }
  const existing = await getByDocId("event_signups", id);
  if (!existing) {
    return { ok: false, message: "报名记录不存在" };
  }
  await db.collection("event_signups").doc(id).update({
    data: {
      status,
      adminNote,
      updatedBy: callerLabel(caller),
      updatedAt: db.serverDate()
    }
  });

  if (existing.eventId && existing.status !== status) {
    const shouldRelease = status === "已取消" && existing.status !== "已取消";
    const shouldRestore = existing.status === "已取消" && status !== "已取消";
    if (shouldRelease || shouldRestore) {
      const eventResult = await db.collection("events").where({ id: existing.eventId }).limit(1).get();
      const eventDoc = eventResult.data && eventResult.data[0];
      if (eventDoc) {
        const delta = shouldRelease
          ? (Number(eventDoc.signed || 0) > 0 ? -1 : 0)
          : 1;
        if (delta !== 0) {
          await db.collection("events").doc(eventDoc._id).update({
            data: {
              signed: _.inc(delta),
              updatedAt: db.serverDate()
            }
          });
        }
      }
    }
  }
  await sendServiceNotice("eventStatus", existing._openid, {
    title: existing.title,
    date: existing.date,
    time: existing.time,
    place: existing.place,
    status
  });
  await writeAdminAuditLog(caller, "updateSignup", {
    signupId: id,
    eventId: existing.eventId || "",
    status,
    previousStatus: existing.status,
    changes: auditDiff(existing, {
      status,
      adminNote
    }, ["status", "adminNote"])
  });
  return { ok: true };
}

async function checkInSignup(event, caller) {
  const status = cleanText(event.status, 20);
  if (!["已到场", "未到场"].includes(status)) {
    return { ok: false, message: "报名核销状态只能是已到场或未到场" };
  }
  return await updateSignup(Object.assign({}, event, { status }), caller);
}

async function getSummary() {
  return adminCache("summary", 2000, async () => {
    await Promise.all([
      ensureCollection("orders"),
      ensureCollection("reservations"),
      ensureCollection("event_signups")
    ]);

    const [pendingPay, pendingConfirm, toShip, toPickup, reservations, signups] = await Promise.all([
      db.collection("orders").where({ status: "待支付" }).count(),
      db.collection("orders").where({ status: "待确认" }).count(),
      db.collection("orders").where({ status: "待发货" }).count(),
      db.collection("orders").where({ status: "待自提" }).count(),
      db.collection("reservations").where({ status: "待支付" }).count(),
      db.collection("event_signups").where({ status: "待确认" }).count()
    ]);

    return {
      ok: true,
      summary: {
        pendingPay: pendingPay.total,
        pendingConfirm: pendingConfirm.total,
        toShip: toShip.total,
        toPickup: toPickup.total,
        pendingReservations: reservations.total,
        pendingSignups: signups.total
      }
    };
  });
}

function summarizeOrders(orders) {
  const today = todayKey();
  const month = today.slice(0, 7);
  const activeOrders = orders.filter(isActiveOrder);
  const revenueOrders = orders.filter(isRevenueOrder);
  return {
    todayOrders: orders.filter((order) => dateKey(order.createdAt) === today).length,
    pendingPay: orders.filter((order) => order.status === "待支付").length,
    pendingConfirm: orders.filter((order) => order.status === "待确认").length,
    toShip: orders.filter((order) => order.status === "待发货").length,
    toPickup: orders.filter((order) => order.status === "待自提").length,
    afterSale: orders.filter((order) => /退款|售后|异常/.test(String(order.status || ""))).length,
    activeOrders: activeOrders.length,
    todayOrderAmount: revenueOrders
      .filter((order) => dateKey(order.createdAt) === today)
      .reduce((sum, order) => sum + number(order.total), 0),
    monthRevenue: revenueOrders
      .filter((order) => dateKey(order.createdAt).slice(0, 7) === month)
      .reduce((sum, order) => sum + number(order.total), 0),
    totalRevenue: revenueOrders.reduce((sum, order) => sum + number(order.total), 0)
  };
}

function summarizeCustomers(orders, reservations, signups) {
  const customers = {};

  function keyFor(record) {
    return record._openid || record.openid || record.phone || record.mobile || record.consignee || record.contactName || record.customerName || record.name || record._id;
  }

  function activityTime(record) {
    return record.afterSaleUpdatedAt || record.completedAt || record.shippedAt || record.paidAt || record.payAt || record.paymentAt || record.updatedAt || record.createdAt || null;
  }

  function activityRank(activity) {
    const date = toDate(activity.time);
    return date ? date.getTime() : 0;
  }

  function pushActivity(customer, activity) {
    if (!activity.time) {
      return;
    }
    customer.recentActivity.push(activity);
  }

  function ensureCustomer(record) {
    const key = keyFor(record);
    if (!customers[key]) {
      customers[key] = {
        id: key,
        openid: record._openid || record.openid || "",
        name: record.consignee || record.contactName || record.customerName || record.name || "",
        phone: record.phone || record.mobile || "",
        orders: 0,
        reservations: 0,
        signups: 0,
        spend: 0,
        lastSeenAt: record.createdAt || null,
        tags: [],
        recentActivity: []
      };
    }
    const customer = customers[key];
    if (!customer.name && (record.consignee || record.contactName || record.customerName || record.name)) {
      customer.name = record.consignee || record.contactName || record.customerName || record.name;
    }
    if (!customer.phone && (record.phone || record.mobile)) {
      customer.phone = record.phone || record.mobile;
    }
    const last = toDate(customer.lastSeenAt);
    const next = toDate(activityTime(record));
    if (next && (!last || next > last)) {
      customer.lastSeenAt = activityTime(record);
    }
    return customer;
  }

  orders.forEach((order) => {
    const customer = ensureCustomer(order);
    customer.orders += 1;
    if (isRevenueOrder(order)) {
      customer.spend += number(order.total);
    }
    pushActivity(customer, {
      type: "order",
      title: order.orderNo ? `订单 ${order.orderNo}` : "订单记录",
      status: order.status || order.payStatus || "",
      amount: number(order.total),
      meta: compactSearchText([order.deliveryMethod === "shipping" ? "快递" : order.deliveryMethod === "pickup" ? "到店自提" : "", order.payStatus, order.afterSaleStatus]),
      time: activityTime(order),
      refId: order._id || order.orderNo || ""
    });
  });
  reservations.forEach((reservation) => {
    const customer = ensureCustomer(reservation);
    customer.reservations += 1;
    pushActivity(customer, {
      type: "reservation",
      title: reservation.roomName || reservation.room || "茶室预约",
      status: reservation.status || "",
      meta: compactSearchText([reservation.day || reservation.date, reservation.time || reservation.slot, reservation.people ? `${reservation.people} 人` : ""]),
      time: activityTime(reservation),
      refId: reservation._id || ""
    });
  });
  signups.forEach((signup) => {
    const customer = ensureCustomer(signup);
    customer.signups += 1;
    pushActivity(customer, {
      type: "signup",
      title: signup.eventTitle || signup.title || "活动报名",
      status: signup.status || "",
      meta: compactSearchText([signup.date || signup.day, signup.time, signup.people ? `${signup.people} 人` : ""]),
      time: activityTime(signup),
      refId: signup._id || ""
    });
  });

  return Object.values(customers).map((customer) => {
    const tags = [];
    if (customer.spend >= 3000) {
      tags.push("高价值");
    }
    if (customer.reservations > 0) {
      tags.push("茶室");
    }
    if (customer.signups > 0) {
      tags.push("活动");
    }
    if (!tags.length) {
      tags.push("新客");
    }
    const recentActivity = customer.recentActivity
      .sort((a, b) => activityRank(b) - activityRank(a))
      .slice(0, 8);
    return Object.assign({}, customer, { tags, recentActivity });
  }).sort((a, b) => b.spend - a.spend || String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
}

function buildRoomBoard(rooms, reservations) {
  const today = todayKey();
  const slots = ["10:00", "12:30", "15:00", "17:30", "20:00"];
  const todayReservations = reservations.filter((item) => item.day === today && item.status !== "已取消");
  return rooms.filter((room) => room.deleted !== true && room.visible !== false).slice(0, 5).map((room) => ({
    id: room.id,
    name: room.name,
    capacity: room.capacity || "",
    slots: slots.map((slot) => {
      const booked = todayReservations.find((item) => item.roomId === room.id && item.time === slot);
      return booked ? {
        time: slot,
        status: booked.status || "已预约",
        name: booked.name || "",
        people: booked.people || 1
      } : {
        time: slot,
        status: "可预约"
      };
    })
  }));
}

async function getDashboard() {
  return adminCache("dashboard", 4000, async () => {
    // 字段裁剪：首页只需要汇总/近况字段，避免整条订单（含 items 大字段）全量回传
    const ORDER_PROJECTION = {
      _openid: true, orderNo: true, status: true, payStatus: true, total: true,
      createdAt: true, updatedAt: true, paidAt: true, payAt: true, paymentAt: true,
      completedAt: true, shippedAt: true, afterSaleUpdatedAt: true, afterSaleStatus: true,
      consignee: true, name: true, phone: true, mobile: true, contactName: true
    };
    const RESERVATION_PROJECTION = {
      _openid: true, name: true, customerName: true, phone: true, mobile: true,
      day: true, date: true, time: true, roomId: true, room: true, roomName: true,
      status: true, people: true, count: true, createdAt: true, updatedAt: true, paidAt: true
    };
    const SIGNUP_PROJECTION = {
      _openid: true, eventTitle: true, title: true, name: true, customerName: true,
      phone: true, mobile: true, status: true, people: true, count: true, createdAt: true
    };
    const [orders, reservations, signups, events, rooms] = await Promise.all([
      readCollection("orders", { orderBy: "createdAt", limit: DASHBOARD_READ_LIMIT, field: ORDER_PROJECTION }),
      readCollection("reservations", { orderBy: "createdAt", limit: DASHBOARD_READ_LIMIT, field: RESERVATION_PROJECTION }),
      readCollection("event_signups", { orderBy: "createdAt", limit: DASHBOARD_READ_LIMIT, field: SIGNUP_PROJECTION }),
      readCollection("events", { orderBy: "sort", order: "asc", limit: 50 }),
      readCollection("rooms", { orderBy: "sort", order: "asc", limit: 50 })
    ]);
    const orderSummary = summarizeOrders(orders);
    const today = todayKey();
    const customers = summarizeCustomers(orders, reservations, signups);

    return {
      ok: true,
      dashboard: {
        summary: Object.assign({}, orderSummary, {
          todayReservations: reservations.filter((item) => item.day === today && item.status !== "已取消").length,
          todaySignups: signups.filter((item) => dateKey(item.createdAt) === today && item.status !== "已取消").length,
          newCustomers: customers.filter((item) => dateKey(item.lastSeenAt) === today).length,
          pendingReservations: reservations.filter((item) => item.status === "待支付" || item.status === "待确认").length,
          pendingSignups: signups.filter((item) => item.status === "待确认").length
        }),
        roomBoard: buildRoomBoard(rooms, reservations),
        recentReservations: reservations.slice(0, 6),
        recentSignups: signups.slice(0, 6),
        recentOrders: orders.slice(0, 6),
        events: events.slice(0, 5).filter((item) => item.deleted !== true && item.visible !== false),
        dataScope: {
          limit: DASHBOARD_READ_LIMIT,
          ordersRead: orders.length,
          reservationsRead: reservations.length,
          signupsRead: signups.length,
          limited: orders.length >= DASHBOARD_READ_LIMIT || reservations.length >= DASHBOARD_READ_LIMIT || signups.length >= DASHBOARD_READ_LIMIT
        }
      }
    };
  });
}

function recordTimeRank(value) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

function memberRecordTime(record = {}) {
  return record.lastPaidAt || record.updatedAt || record.createdAt || null;
}

function rechargeRecordTime(record = {}) {
  return record.paidAt || record.updatedAt || record.createdAt || null;
}

function ledgerRecordTime(record = {}) {
  return record.createdAt || record.updatedAt || null;
}

function ledgerTypeLabel(type) {
  const labels = {
    wechat_recharge: "微信充值",
    test_recharge: "模拟充值",
    reservation_payment: "余额支付",
    recharge_refund: "充值退款",
    balance_adjustment: "余额调整"
  };
  return labels[type] || "余额变动";
}

function ledgerSignedFen(record = {}) {
  const amountFen = number(record.amountFen);
  return /payment|consume|spend|debit/i.test(String(record.type || "")) ? -amountFen : amountFen;
}

function summarizeMembers(members, wallets, recharges, ledger, orders) {
  const activeMembers = new Map();
  (members || []).forEach((member) => {
    if (!member || member.status !== "active" || !member.phone) {
      return;
    }
    const key = member._openid || member._id;
    const saved = activeMembers.get(key);
    if (!saved || recordTimeRank(memberRecordTime(member)) > recordTimeRank(memberRecordTime(saved))) {
      activeMembers.set(key, member);
    }
  });

  const walletsByOpenid = new Map();
  const walletsByMemberId = new Map();
  (wallets || []).forEach((wallet) => {
    if (wallet._openid) walletsByOpenid.set(wallet._openid, wallet);
    if (wallet.memberId) walletsByMemberId.set(wallet.memberId, wallet);
  });

  const rechargesByOpenid = new Map();
  const rechargesByMemberId = new Map();
  (recharges || []).forEach((recharge) => {
    if (recharge._openid) {
      const rows = rechargesByOpenid.get(recharge._openid) || [];
      rows.push(recharge);
      rechargesByOpenid.set(recharge._openid, rows);
    }
    if (recharge.memberId) {
      const rows = rechargesByMemberId.get(recharge.memberId) || [];
      rows.push(recharge);
      rechargesByMemberId.set(recharge.memberId, rows);
    }
  });

  const ledgerByOpenid = new Map();
  const ledgerByMemberId = new Map();
  const ledgerByWalletId = new Map();
  (ledger || []).forEach((entry) => {
    if (entry._openid) {
      const rows = ledgerByOpenid.get(entry._openid) || [];
      rows.push(entry);
      ledgerByOpenid.set(entry._openid, rows);
    }
    if (entry.memberId) {
      const rows = ledgerByMemberId.get(entry.memberId) || [];
      rows.push(entry);
      ledgerByMemberId.set(entry.memberId, rows);
    }
    if (entry.walletId) {
      const rows = ledgerByWalletId.get(entry.walletId) || [];
      rows.push(entry);
      ledgerByWalletId.set(entry.walletId, rows);
    }
  });

  const ordersByOpenid = new Map();
  (orders || []).filter(isRevenueOrder).forEach((order) => {
    if (!order._openid) return;
    const rows = ordersByOpenid.get(order._openid) || [];
    rows.push(order);
    ordersByOpenid.set(order._openid, rows);
  });

  return Array.from(activeMembers.values()).map((member) => {
    const openid = member._openid || "";
    const memberId = member._id || "";
    const wallet = walletsByOpenid.get(openid) || walletsByMemberId.get(memberId) || {};
    const memberRecharges = Array.from(new Map([
      ...(rechargesByOpenid.get(openid) || []),
      ...(rechargesByMemberId.get(memberId) || [])
    ].map((row) => [row._id || row.orderNo, row])).values());
    const memberLedger = Array.from(new Map([
      ...(ledgerByOpenid.get(openid) || []),
      ...(ledgerByMemberId.get(memberId) || []),
      ...(ledgerByWalletId.get(wallet._id) || [])
    ].map((row) => [row._id, row])).values());
    const memberOrders = (ordersByOpenid.get(openid) || [])
      .sort((a, b) => recordTimeRank(b.paidAt || b.updatedAt || b.createdAt) - recordTimeRank(a.paidAt || a.updatedAt || a.createdAt));
    const orderSpend = memberOrders.reduce((sum, order) => sum + number(order.total), 0);
    const latestRechargeAt = memberRecharges.reduce((latest, row) => Math.max(latest, recordTimeRank(rechargeRecordTime(row))), 0);
    const latestOrderAt = memberOrders.reduce((latest, row) => Math.max(latest, recordTimeRank(row.paidAt || row.updatedAt || row.createdAt)), 0);
    const latestAt = Math.max(recordTimeRank(memberRecordTime(member)), latestRechargeAt, latestOrderAt);

    return {
      id: openid || memberId,
      memberId,
      openid,
      name: member.name || "禾煦会员",
      phone: member.phone || "",
      cardNo: member.cardNo || "",
      levelName: member.tier || "雅客会员",
      status: member.status || "active",
      points: number(member.points),
      spend: Math.max(number(member.totalSpend), orderSpend),
      totalSpend: Math.max(number(member.totalSpend), orderSpend),
      orders: Math.max(number(member.paidOrders), memberOrders.length),
      joinedAt: member.agreementAcceptedAt || member.createdAt || null,
      latestAt: latestAt ? new Date(latestAt) : memberRecordTime(member),
      balance: number(wallet.balanceFen) / 100,
      principalBalance: number(wallet.principalBalanceFen) / 100,
      bonusBalance: number(wallet.bonusBalanceFen) / 100,
      recentRecharges: memberRecharges
        .sort((a, b) => recordTimeRank(rechargeRecordTime(b)) - recordTimeRank(rechargeRecordTime(a)))
        .slice(0, 6)
        .map((row) => ({
          id: row._id || row.orderNo,
          orderNo: row.orderNo || "",
          title: row.planTitle || "会员充值",
          principal: number(row.principalFen) / 100,
          bonus: number(row.bonusFen) / 100,
          credit: number(row.creditFen) / 100,
          status: row.payStatus || row.status || "pending",
          time: rechargeRecordTime(row)
        })),
      recentOrders: memberOrders.slice(0, 6).map((row) => ({
        id: row._id || row.orderNo,
        orderNo: row.orderNo || "",
        amount: number(row.total),
        status: row.status || row.payStatus || "",
        time: row.paidAt || row.updatedAt || row.createdAt || null
      })),
      walletLedger: memberLedger
        .sort((a, b) => recordTimeRank(ledgerRecordTime(b)) - recordTimeRank(ledgerRecordTime(a)))
        .slice(0, 8)
        .map((row) => ({
          id: row._id || "",
          type: row.type || "",
          label: ledgerTypeLabel(row.type),
          amount: ledgerSignedFen(row) / 100,
          balanceAfter: row.balanceAfterFen === undefined || row.balanceAfterFen === null ? null : number(row.balanceAfterFen) / 100,
          status: row.status || "",
          time: ledgerRecordTime(row)
        }))
    };
  }).sort((a, b) => recordTimeRank(b.latestAt) - recordTimeRank(a.latestAt) || b.totalSpend - a.totalSpend);
}

/**
 * 充值记录列表（会员储值流水）。用于后台资金核对：
 * 含微信支付单号 transactionId、支付状态、发货信息上传状态（wxShippingUploaded/Error），
 * 可定位「已支付但资金未结算」的充值单（微信侧冻结）。
 */
async function listRecharges(event) {
  const status = cleanText(event.status, 20);
  const where = {};
  if (status && status !== "all") {
    where.status = status;
  }
  const result = await readCollectionPage("recharge_orders", {
    where,
    keyword: cleanText(event.keyword, 80),
    keywordFields: ["orderNo", "rechargeNo", "planTitle", "transactionId"],
    orderBy: "createdAt",
    event
  });

  // 批量补全会员昵称/手机号
  const memberIds = [...new Set((result.items || []).map((row) => row.memberId || "" ).filter(Boolean))];
  const memberMap = {};
  if (memberIds.length) {
    try {
      const memberRes = await db.collection("members").where({ _id: _.in(memberIds) }).limit(100).get();
      (memberRes.data || []).forEach((member) => {
        memberMap[member._id] = member;
      });
    } catch (error) {
      // 会员信息缺失不阻断列表
    }
  }
  const recharges = (result.items || []).map((row) => Object.assign({}, row, {
    memberName: (memberMap[row.memberId] && (memberMap[row.memberId].nickName || memberMap[row.memberId].nickname)) || "",
    memberPhone: (memberMap[row.memberId] && memberMap[row.memberId].phone) || ""
  }));

  return {
    ok: true,
    recharges,
    page: result.page,
    summary: await summarizeRecharges(status)
  };
}

/** 充值汇总（按当前筛选状态）：总额/本月/微信支付/潜在冻结（微信支付且发货未上传） */
async function summarizeRecharges(status) {
  const where = {};
  if (status && status !== "all") {
    where.status = status;
  }
  let rows = [];
  try {
    const res = await db.collection("recharge_orders").where(where).limit(1000).get();
    rows = res.data || [];
  } catch (error) {
    rows = [];
  }
  const paid = rows.filter((row) => row.payStatus === "paid");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const pickAmount = (row) => Math.max(0, Number(row.payAmountFen ?? row.principalFen) || 0);
  const sumFen = (list) => list.reduce((sum, row) => sum + pickAmount(row), 0);
  return {
    totalCount: rows.length,
    paidCount: paid.length,
    totalRechargeFen: sumFen(paid),
    monthRechargeFen: sumFen(paid.filter((row) => recordTimeRank(rechargeRecordTime(row)) >= monthStart)),
    wechatRechargeFen: sumFen(paid.filter((row) => row.transactionId)),
    // 潜在冻结：微信支付、已支付、发货信息未成功上传且未标记跳过
    frozenPendingFen: sumFen(paid.filter((row) => row.transactionId && row.wxShippingUploaded !== true && row.wxShippingSkip !== true))
  };
}

async function listMembers(event) {
  const pageKey = `${cleanText(event.keyword, 80)||""}:${Number(event.page)||1}:${Number(event.pageSize)||20}`;
  return adminCache(`members:${pageKey}`, 3000, async () => {
    const keyword = cleanText(event.keyword, 80).toLowerCase();
    const [members, wallets, recharges, ledger, orders] = await Promise.all([
      readCollection("members", { limit: 1000 }),
      readCollection("wallet_accounts", { limit: 1000 }),
      readCollection("recharge_orders", { orderBy: "createdAt", limit: 1000 }),
      readCollection("wallet_ledger", { orderBy: "createdAt", limit: 1000 }),
      readCollection("orders", { orderBy: "createdAt", limit: 1000 })
    ]);
    const allMembers = summarizeMembers(members, wallets, recharges, ledger, orders);
    const filtered = allMembers.filter((member) => {
      if (!keyword) return true;
      return [member.name, member.phone, member.cardNo, member.levelName, member.openid]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
    const currentMonth = todayKey().slice(0, 7);
    const memberOpenids = new Set(allMembers.map((item) => item.openid).filter(Boolean));
    const memberIds = new Set(allMembers.map((item) => item.memberId).filter(Boolean));
    const monthRecharge = (recharges || []).filter((row) => {
      const belongsToMember = memberOpenids.has(row._openid) || memberIds.has(row.memberId);
      return belongsToMember && row.payStatus === "paid" && dateKey(row.paidAt || row.updatedAt).slice(0, 7) === currentMonth;
    }).reduce((sum, row) => sum + number(row.principalFen), 0) / 100;
    const paged = paginateArray(filtered, event);
    return {
      ok: true,
      customers: paged.items,
      page: paged.page,
      summary: {
        totalMembers: allMembers.length,
        totalBalance: allMembers.reduce((sum, member) => sum + number(member.balance), 0),
        monthRecharge,
        matchedMembers: filtered.length
      },
      scope: {
        limit: 1000,
        limited: [members, wallets, recharges, ledger, orders].some((rows) => rows.length >= 1000)
      }
    };
  });
}

async function listCustomers(event) {
  if (event.memberOnly === true) {
    return await listMembers(event);
  }
  const keyword = cleanText(event.keyword, 80);
  const [orders, reservations, signups] = await Promise.all([
    readCollection("orders", { orderBy: "createdAt", limit: 1000 }),
    readCollection("reservations", { orderBy: "createdAt", limit: 1000 }),
    readCollection("event_signups", { orderBy: "createdAt", limit: 1000 })
  ]);
  const customers = summarizeCustomers(orders, reservations, signups).filter((customer) => {
    if (!keyword) {
      return true;
    }
    return [customer.name, customer.phone, customer.openid, customer.tags.join(" ")]
      .join(" ")
      .includes(keyword);
  });
  const paged = paginateArray(customers, event);
  return {
    ok: true,
    customers: paged.items,
    page: paged.page,
    summary: {
      totalCustomers: customers.length,
      activeCustomers: customers.filter((item) => item.orders + item.reservations + item.signups > 0).length,
      totalSpend: customers.reduce((sum, item) => sum + item.spend, 0)
    }
  };
}

async function listAuditLogs(event) {
  const keyword = cleanText(event.keyword, 80);
  const result = await readCollectionPage("admin_audit_logs", {
    keyword,
    keywordFields: ["action", "adminOpenid", "adminUid", "detailText"],
    orderBy: "createdAt",
    event
  });
  return {
    ok: true,
    logs: result.items,
    page: result.page
  };
}

async function listInventoryLogs(event) {
  const keyword = cleanText(event.keyword, 80);
  const result = await readCollectionPage("inventory_logs", {
    keyword,
    keywordFields: ["itemName", "itemId", "type", "orderNo", "operator", "note"],
    orderBy: "createdAt",
    event
  });
  return {
    ok: true,
    logs: result.items,
    page: result.page
  };
}

async function listNotificationLogs(event) {
  const keyword = cleanText(event.keyword, 80);
  const result = await readCollectionPage("notification_logs", {
    keyword,
    keywordFields: ["kind", "openid", "templateId", "status", "reason", "error"],
    orderBy: "createdAt",
    event
  });
  return {
    ok: true,
    logs: result.items,
    page: result.page
  };
}

function compactSearchText(parts) {
  return parts.map((item) => cleanText(item, 120)).filter(Boolean).join(" · ");
}

function searchItem(id, title, subtitle, status, meta, keyword) {
  return {
    id: cleanText(id, 80),
    title: cleanText(title, 120) || "未命名记录",
    subtitle: cleanText(subtitle, 180),
    status: cleanText(status, 40),
    meta: cleanText(meta, 80),
    keyword
  };
}

function searchGroup(key, tab, label, result, items) {
  return {
    key,
    tab,
    label,
    total: result.page?.total || items.length,
    items
  };
}

async function globalSearch(event) {
  const keyword = cleanText(event.keyword, 80);
  if (keyword.length < 2) {
    return { ok: true, keyword, groups: [], message: "请输入至少 2 个字符" };
  }
  const searchEvent = { keyword, page: 1, pageSize: 5 };
  const tasks = [
    {
      run: async () => {
        const result = await readCollectionPage("orders", {
          keyword,
          keywordFields: [
            "orderNo",
            "name",
            "contactName",
            "consignee",
            "phone",
            "mobile",
            "pickupNote",
            "remark",
            "status"
          ],
          orderBy: "createdAt",
          event: searchEvent
        });
        return searchGroup("orders", "orders", "订单", result, result.items.map((order) => searchItem(
          order._id,
          `订单 ${order.orderNo || order._id}`,
          compactSearchText([
            order.consignee || order.name || order.contactName,
            order.phone || order.mobile,
            `¥${number(order.total)}`
          ]),
          order.status || order.payStatus,
          dateKey(order.createdAt),
          keyword
        )));
      }
    },
    {
      run: async () => {
        const result = await listAfterSales(searchEvent);
        return searchGroup("afterSales", "afterSales", "售后", { page: result.page }, (result.orders || []).map((order) => searchItem(
          order._id,
          `售后 ${order.orderNo || order._id}`,
          compactSearchText([maskName(order.name || order.contactName || order.consignee), maskPhone(order.phone || order.mobile), order.afterSaleReason]),
          order.afterSaleStatus || order.status,
          order.refundAmount ? `¥${number(order.refundAmount)}` : "",
          keyword
        )));
      }
    },
    {
      run: async () => {
        const result = await readCollectionPage("reservations", {
          keyword,
          keywordFields: ["room", "roomName", "name", "customerName", "phone", "mobile", "status"],
          orderBy: "createdAt",
          event: searchEvent
        });
        return searchGroup("reservations", "reservations", "预约", result, result.items.map((reservation) => searchItem(
          reservation._id,
          compactSearchText([reservation.roomName || reservation.room || "茶室预约", reservation.day || reservation.date, reservation.time || reservation.slot]),
          compactSearchText([maskName(reservation.name || reservation.customerName), maskPhone(reservation.phone || reservation.mobile), reservation.people ? `${reservation.people} 人` : ""]),
          reservation.status,
          dateKey(reservation.createdAt),
          keyword
        )));
      }
    },
    {
      run: async () => {
        const result = await readCollectionPage("event_signups", {
          keyword,
          keywordFields: ["eventTitle", "title", "name", "customerName", "phone", "mobile", "status"],
          orderBy: "createdAt",
          event: searchEvent
        });
        return searchGroup("signups", "signups", "活动报名", result, result.items.map((signup) => searchItem(
          signup._id,
          signup.eventTitle || signup.title || "活动报名",
          compactSearchText([maskName(signup.name || signup.customerName), maskPhone(signup.phone || signup.mobile), signup.date || signup.day]),
          signup.status,
          dateKey(signup.createdAt),
          keyword
        )));
      }
    },
    {
      run: async () => {
        const result = await listCustomers(searchEvent);
        return searchGroup("customers", "customers", "用户", result, (result.customers || []).map((customer) => searchItem(
          customer.id,
          maskName(customer.name) || maskPhone(customer.phone) || maskOpenid(customer.openid || customer.id),
          compactSearchText([`消费 ¥${number(customer.spend)}`, `订单 ${number(customer.orders)}`, `预约 ${number(customer.reservations)}`, `报名 ${number(customer.signups)}`]),
          Array.isArray(customer.tags) ? customer.tags.join("、") : customer.tag,
          dateKey(customer.lastSeenAt),
          keyword
        )));
      }
    },
    {
      run: async () => {
        const result = await readCollectionPage("inventory_logs", {
          keyword,
          keywordFields: ["itemName", "itemId", "type", "orderNo", "operator", "note"],
          orderBy: "createdAt",
          event: searchEvent
        });
        return searchGroup("inventory", "inventory", "库存流水", result, result.items.map((log) => searchItem(
          log._id,
          log.itemName || log.itemId || "库存流水",
          compactSearchText([log.type, log.orderNo, log.note]),
          log.quantity ? `${Number(log.quantity) > 0 ? "+" : ""}${log.quantity}` : "",
          dateKey(log.createdAt),
          keyword
        )));
      }
    },
    {
      run: async () => {
        const result = await readCollectionPage("admin_audit_logs", {
          keyword,
          keywordFields: ["action", "adminOpenid", "adminUid", "detailText"],
          orderBy: "createdAt",
          event: searchEvent
        });
        return searchGroup("audit", "audit", "审计日志", result, result.items.map((log) => searchItem(
          log._id,
          log.action || "后台操作",
          compactSearchText([log.adminUsername || log.adminUid || maskOpenid(log.adminOpenid), log.detailText]),
          log.status || "",
          dateKey(log.createdAt),
          keyword
        )));
      }
    },
    {
      run: async () => {
        const result = await readCollectionPage("notification_logs", {
          keyword,
          keywordFields: ["kind", "openid", "templateId", "status", "reason", "error"],
          orderBy: "createdAt",
          event: searchEvent
        });
        return searchGroup("notifications", "notifications", "通知日志", result, result.items.map((log) => searchItem(
          log._id,
          log.kind || "订阅消息",
          compactSearchText([maskOpenid(log.openid), log.reason || log.error]),
          log.status,
          dateKey(log.createdAt),
          keyword
        )));
      }
    }
  ];
  const groups = [];
  for (const task of tasks) {
    const group = await task.run();
    if (group.items.length || group.total) {
      groups.push(group);
    }
  }
  return { ok: true, keyword, groups };
}

async function sendTestNotice(event, caller) {
  const kind = cleanText(event.kind, 40) || "reservationStatus";
  const openid = cleanText(event.openid, 80);
  if (!openid) {
    return { ok: false, message: "请填写接收通知的 OpenID" };
  }
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {
    room: "禾煦书茶空间",
    day: todayKey(),
    time: "15:00",
    status: "测试通知",
    note: "后台测试发送"
  };
  const result = await cloud.callFunction({
    name: "serviceNotify",
    data: { kind, openid, payload }
  });
  await writeAdminAuditLog(caller, "sendTestNotice", {
    kind,
    openid: maskOpenid(openid),
    ok: result.result && result.result.ok !== false
  });
  return result.result || { ok: true };
}

function statusItem(key, label, status, detail, action) {
  return { key, label, status, detail, action: action || "" };
}

function envMissing(keys) {
  return keys.filter((key) => !process.env[key]);
}

function backupTruncatedCollections(record = {}) {
  if (Array.isArray(record.truncatedCollections)) {
    return record.truncatedCollections.filter(Boolean);
  }
  const truncated = record.truncated || {};
  return Object.keys(truncated).filter((collection) => truncated[collection]);
}

function hasBackupCompleteness(record = {}) {
  return Array.isArray(record.truncatedCollections)
    || record.truncated && typeof record.truncated === "object"
    || record.totals && typeof record.totals === "object";
}

async function countCollection(name) {
  const result = await countCollectionStatus(name);
  return result.count;
}

async function countCollectionStatus(name) {
  await ensureCollection(name);
  try {
    const result = await db.collection(name).count();
    return { ok: true, count: result.total || 0 };
  } catch (error) {
    return { ok: false, count: 0, error: cleanText(error.message || String(error), 120) };
  }
}

const DEFAULT_HEALTH_FUNCTIONS = [
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

function callWithTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(`${label} 健康检查超时`);
        error.code = "HEALTH_TIMEOUT";
        reject(error);
      }, timeoutMs);
    })
  ]);
}

async function checkFunctionHealth(name, timeoutMs) {
  const startedAt = Date.now();
  try {
    const result = await callWithTimeout(
      cloud.callFunction({
        name,
        data: { action: "health" }
      }),
      timeoutMs,
      name
    );
    const payload = result && result.result ? result.result : {};
    if (payload.ok === true) {
      return {
        name,
        ok: true,
        durationMs: Date.now() - startedAt,
        message: cleanText(payload.message || payload.name || "可调用", 180),
        paymentConfig: payload.paymentConfig || null
      };
    }
    return {
      name,
      ok: false,
      durationMs: Date.now() - startedAt,
      message: cleanText(payload.message || payload.code || "health 未返回 ok", 160)
    };
  } catch (error) {
    return {
      name,
      ok: false,
      durationMs: Date.now() - startedAt,
      message: cleanText(error.message || String(error), 160)
    };
  }
}

async function checkCloudFunctionHealth(requiredFunctions) {
  const source = Array.isArray(requiredFunctions) && requiredFunctions.length
    ? requiredFunctions
    : DEFAULT_HEALTH_FUNCTIONS;
  const names = Array.from(new Set(source
    .map((item) => cleanText(item, 60))
    .filter(Boolean)
    .filter((item) => item !== "wechatPayNotify")));
  const results = await Promise.all(names.map((name) => checkFunctionHealth(name, 2500)));
  return {
    total: names.length,
    passed: results.filter((item) => item.ok),
    failed: results.filter((item) => !item.ok),
    results
  };
}

async function getSystemStatus(event = {}) {
  const settingsResult = await getSettings();
  const settings = settingsResult.settings || {};
  const packageInfo = event.packageInfo || {};
  const payKeys = [
    "WECHAT_PAY_APPID",
    "WECHAT_PAY_MCH_ID",
    "WECHAT_PAY_CERT_SERIAL_NO",
    "WECHAT_PAY_PRIVATE_KEY",
    "WECHAT_PAY_API_V3_KEY",
    "WECHAT_PAY_NOTIFY_URL"
  ];
  const templateItems = [
    ["orderPaidTemplateId", "订单支付通知", settings.orderNoticeEnabled !== false],
    ["orderShippedTemplateId", "订单发货通知", settings.orderNoticeEnabled !== false],
    ["staffOrderTemplateId", "店员新订单提醒", settings.staffOrderNoticeEnabled !== false],
    ["reservationTemplateId", "预约状态通知", settings.reservationNoticeEnabled !== false],
    ["eventTemplateId", "活动报名通知", settings.eventNoticeEnabled !== false]
  ];
  const templateMissing = templateItems
    .filter((item) => item[2] && !settings[item[0]])
    .map((item) => item[1]);
  const payMissing = envMissing(payKeys);
  const requiredStoreFields = ["brandName", "storeName", "phone", "address", "businessHours"];
  const missingStoreFields = requiredStoreFields.filter((field) => !settings[field]);
  const ignored = Array.isArray(packageInfo.ignored) ? packageInfo.ignored : [];
  const ignoreExpected = ["admin", "admin-src", "node_modules", "package-lock.json", "package.json", "vite.config.mjs"];
  const ignoreMissing = ignoreExpected.filter((item) => !ignored.includes(item));
  const catalogCollections = [
    ["tea_products", "茶叶"],
    ["drinks", "茶饮"],
    ["rooms", "茶室"],
    ["content_blocks", "首页内容"],
    ["events", "活动"]
  ];
  const [auditCount, notificationCount, backupCount, latestBackupResult, catalogCounts] = await Promise.all([
    countCollection("admin_audit_logs"),
    countCollection("notification_logs"),
    countCollection("data_backup_logs"),
    readCollection("data_backup_logs", { orderBy: "createdAt", limit: 1 }),
    Promise.all(catalogCollections.map(async ([collection, label]) => ({
      collection,
      label,
      ...(await countCollectionStatus(collection))
    })))
  ]);
  const unreadableCatalogCollections = catalogCounts.filter((item) => item.ok === false);
  const emptyCatalogCollections = catalogCounts.filter((item) => item.count <= 0);
  const latestBackup = latestBackupResult[0] || null;
  const latestBackupTruncated = backupTruncatedCollections(latestBackup || {});
  const latestBackupReady = latestBackup && latestBackup.status === "success" && latestBackup.fileId;
  const functionHealth = await checkCloudFunctionHealth(packageInfo.requiredFunctions);
  const createPaymentHealth = functionHealth.results.find((item) => item.name === "createPayment");
  const createPaymentConfig = createPaymentHealth && createPaymentHealth.paymentConfig || null;

  const checks = [
    statusItem(
      "adminWhitelist",
      "管理员白名单",
      parseList(process.env.ADMIN_OPENIDS).length + parseList(process.env.ADMIN_UIDS).length + parseList(process.env.ADMIN_USERNAMES).length > 0 ? "ok" : "error",
      "ADMIN_OPENIDS / ADMIN_UIDS / ADMIN_USERNAMES 至少配置一项"
    ),
    statusItem(
      "paymentConfig",
      "微信支付配置",
      settings.paymentEnabled === false ? "ok" : createPaymentConfig ? createPaymentConfig.ready ? "ok" : "warn" : payMissing.length ? "warn" : "ok",
      settings.paymentEnabled === false
        ? "后台已关闭支付"
        : createPaymentConfig
          ? createPaymentConfig.ready
            ? "createPayment 支付下单环境变量完整；回调 API v3 密钥仍按支付回调函数环境校验"
            : `createPayment 缺少：${createPaymentConfig.missing.join("、")}`
          : payMissing.length ? `管理函数未检测到：${payMissing.join("、")}。如变量仅配置在 createPayment，请以支付函数环境为准。` : "支付相关环境变量完整"
    ),
    statusItem(
      "cloudFunctions",
      "云函数可用性",
      functionHealth.failed.length ? "error" : "ok",
      functionHealth.failed.length
        ? `异常 ${functionHealth.failed.length}/${functionHealth.total}：${functionHealth.failed.map((item) => `${item.name} ${item.message}`).join("；")}`
        : `已检测 ${functionHealth.passed.length}/${functionHealth.total} 个云函数；微信支付回调为 HTTP 入口，按支付配置单独校验`
    ),
    statusItem(
      "noticeTemplates",
      "订阅消息模板",
      templateMissing.length ? "warn" : "ok",
      templateMissing.length ? `缺少：${templateMissing.join("、")}` : "启用的订阅消息模板已配置"
    ),
    statusItem(
      "packageSize",
      "小程序包体配置",
      ignoreMissing.length ? "warn" : "ok",
      ignoreMissing.length ? `project.config.json 需忽略：${ignoreMissing.join("、")}` : `后台、依赖和构建工具已排除；预览包体上限 ${packageInfo.sourceSizeLimit || "2MB"}`
    ),
    statusItem(
      "storeCompleteness",
      "后台配置完整度",
      missingStoreFields.length ? "warn" : "ok",
      missingStoreFields.length ? `缺少门店字段：${missingStoreFields.join("、")}` : "门店基础资料完整"
    ),
    statusItem(
      "frontendCatalog",
      "前台资料云端数据",
      unreadableCatalogCollections.length ? "error" : emptyCatalogCollections.length ? "warn" : "ok",
      unreadableCatalogCollections.length
        ? `云端资料集合读取失败：${unreadableCatalogCollections.map((item) => `${item.label}${item.error ? `（${item.error}）` : ""}`).join("、")}`
        : emptyCatalogCollections.length
        ? `云端缺少：${emptyCatalogCollections.map((item) => item.label).join("、")}。上线前应由后台保存或导入，避免依赖本地兜底数据。`
        : catalogCounts.map((item) => `${item.label} ${item.count}`).join("；")
    ),
    statusItem(
      "operationLogs",
      "关键日志集合",
      "ok",
      `审计 ${auditCount} 条；通知 ${notificationCount} 条；备份 ${backupCount} 条`
    ),
    statusItem(
      "backupRecovery",
      "最近备份可恢复",
      latestBackupReady && latestBackupTruncated.length === 0 && hasBackupCompleteness(latestBackup) ? "ok" : "warn",
      latestBackup
        ? latestBackupReady
          ? latestBackupTruncated.length
            ? `最近备份可下载，但可能截断：${latestBackupTruncated.join("、")}`
            : hasBackupCompleteness(latestBackup)
              ? `最近备份完整：${latestBackup.cloudPath || latestBackup.fileId}`
              : `最近备份可下载；旧记录未包含完整性校验，建议重新创建一次备份`
          : `最近备份不可直接下载：${latestBackup.error || "缺少云文件 ID"}`
        : "暂无成功备份，建议上线前先创建一次云端备份"
    )
  ];
  return {
    ok: true,
    checks,
    functionHealth,
    summary: {
      ok: checks.filter((item) => item.status === "ok").length,
      warn: checks.filter((item) => item.status === "warn").length,
      error: checks.filter((item) => item.status === "error").length
    }
  };
}

async function adjustInventory(event, caller) {
  const collection = cleanText(event.collection, 40);
  if (!["tea_products", "drinks"].includes(collection)) {
    return { ok: false, message: "只能调整茶叶或茶饮库存" };
  }
  const id = cleanText(event.id || event.itemId, 80);
  const delta = Number(event.delta);
  const note = cleanText(event.note || event.reason, 180);
  if (!id || !Number.isFinite(delta) || delta === 0) {
    return { ok: false, message: "缺少商品 ID 或库存调整数量" };
  }
  if (!note) {
    return { ok: false, message: "人工调整库存需填写原因" };
  }
  const existing = await findRecord(collection, "id", id);
  if (!existing) {
    return { ok: false, message: "商品不存在" };
  }
  const specLabel = cleanText(event.specLabel || event.spec || "", 40);
  const hasSpecStock = Array.isArray(existing.specs)
    && existing.specs.some((spec) => spec && spec.stock !== undefined && spec.stock !== null && spec.stock !== "");
  if (collection === "tea_products" && hasSpecStock) {
    const targetLabel = specLabel
      || String((existing.specs.find((spec) => Number(spec.stock) >= 0) || existing.specs[0] || {}).label || "").trim();
    const beforeSpec = existing.specs.find((spec) => String(spec.label || "").trim() === targetLabel) || existing.specs[0] || {};
    const before = {
      stock: Math.max(0, Number(beforeSpec.stock) || 0),
      lockedStock: Math.max(0, Number(beforeSpec.lockedStock) || 0),
      soldStock: Math.max(0, Number(beforeSpec.soldStock) || 0)
    };
    const afterStock = before.stock + delta;
    if (afterStock < before.lockedStock + before.soldStock) {
      return { ok: false, message: "调整后该规格库存不能小于已锁定和已售数量" };
    }
    const next = applySpecInventoryDelta(existing, targetLabel, 0, 0, delta);
    if (!next) {
      return { ok: false, message: "规格库存更新失败" };
    }
    await db.collection(collection).doc(existing._id).update({
      data: {
        specs: next.specs,
        stock: next.stock,
        lockedStock: next.lockedStock,
        soldStock: next.soldStock,
        updatedAt: db.serverDate()
      }
    });
    await writeInventoryLog({
      collection,
      docId: existing._id,
      itemId: existing.id,
      itemName: `${existing.name || existing.id} / ${targetLabel}`,
      type: "manual_adjust",
      quantity: delta,
      beforeStock: before.stock,
      afterStock,
      beforeLockedStock: before.lockedStock,
      afterLockedStock: before.lockedStock,
      beforeSoldStock: before.soldStock,
      afterSoldStock: before.soldStock,
      operator: callerLabel(caller),
      note: note + (targetLabel ? `（规格 ${targetLabel}）` : "")
    });
    await writeAdminAuditLog(caller, "adjustInventory", {
      collection,
      id,
      specLabel: targetLabel,
      delta,
      beforeStock: before.stock,
      afterStock,
      note
    });
    return { ok: true, beforeStock: before.stock, afterStock, specLabel: targetLabel };
  }

  const before = inventorySnapshot(existing);
  const afterStock = before.stock + delta;
  if (afterStock < before.lockedStock + before.soldStock) {
    return { ok: false, message: "调整后总库存不能小于已锁定和已售数量" };
  }
  await db.collection(collection).doc(existing._id).update({
    data: {
      stock: afterStock,
      updatedAt: db.serverDate()
    }
  });
  await writeInventoryLog({
    collection,
    docId: existing._id,
    itemId: existing.id,
    itemName: existing.name || existing.title || existing.id,
    type: "manual_adjust",
    quantity: delta,
    beforeStock: before.stock,
    afterStock,
    beforeLockedStock: before.lockedStock,
    afterLockedStock: before.lockedStock,
    beforeSoldStock: before.soldStock,
    afterSoldStock: before.soldStock,
    operator: callerLabel(caller),
    note
  });
  await writeAdminAuditLog(caller, "adjustInventory", {
    collection,
    id,
    delta,
    beforeStock: before.stock,
    afterStock,
    note
  });
  return { ok: true, beforeStock: before.stock, afterStock };
}

/**
 * 会员余额手动调整（如礼盒等非目录商品柜台扣款）。
 * direction: debit=扣减（默认）/ credit=增加（补偿/赠送）。
 * 与小程序余额支付同一口径：赠送金优先按比例拆分、CAS 防并发、幂等流水。
 */
async function adjustMemberBalance(event, caller) {
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const memberId = cleanText(data.memberId || event.memberId, 64);
  const openid = cleanText(data.openid || event.openid, 64);
  const amountYuan = Number(data.amountYuan != null ? data.amountYuan : event.amountYuan);
  const direction = cleanText(data.direction || event.direction, 10) === "credit" ? "credit" : "debit";
  const reason = cleanText(data.reason || event.reason || event.auditReason, 200);
  const requestId = cleanText(data.requestId || event.requestId, 64);

  if (!memberId) {
    return { ok: false, message: "缺少会员 ID" };
  }
  if (!Number.isFinite(amountYuan) || amountYuan <= 0 || amountYuan > 1000000) {
    return { ok: false, message: "请输入有效的调整金额（0.01 ~ 1,000,000）" };
  }
  if (!reason) {
    return { ok: false, message: "余额调整需填写原因（如：礼盒 398 元，非目录商品）" };
  }
  if (!requestId) {
    return { ok: false, message: "缺少操作凭证（requestId），请重试" };
  }

  await Promise.all([ensureCollection("wallet_accounts"), ensureCollection("wallet_ledger")]);

  let member = null;
  if (memberId) {
    const memberResult = await db.collection("members").doc(memberId).get().catch(() => null);
    member = memberResult && memberResult.data;
  }
  if (!member && openid) {
    const mres = await db.collection("members").where({ _openid: openid }).limit(1).get().catch(() => null);
    member = mres && mres.data && mres.data[0];
  }
  if (!member || member.status !== "active") {
    return { ok: false, message: "会员不存在或已停用" };
  }

  let wallet = null;
  if (member._openid) {
    const wres = await db.collection("wallet_accounts")
      .where({ _openid: member._openid, status: "active" })
      .limit(1)
      .get();
    wallet = wres.data && wres.data[0];
  }
  if (!wallet && member.walletId) {
    const wres = await db.collection("wallet_accounts").doc(member.walletId).get().catch(() => null);
    wallet = wres && wres.data;
  }
  if (!wallet) {
    return { ok: false, message: "未找到该会员的余额账户（可能尚未开通会员钱包）" };
  }

  const amountFen = Math.round(amountYuan * 100);
  const walletId = wallet._id;
  const ledgerId = `manual_${requestId}`;

  // 幂等：同一 requestId 已处理则直接返回，避免重复扣款
  const existing = await db.collection("wallet_ledger").doc(ledgerId).get().catch(() => null);
  if (existing && existing.data && existing.data.status === "posted") {
    return {
      ok: true,
      idempotent: true,
      balanceFen: number(existing.data.balanceAfterFen),
      balance: money(number(existing.data.balanceAfterFen))
    };
  }

  const currentBalanceFen = number(wallet.balanceFen);
  const principalNow = number(wallet.principalBalanceFen);
  const bonusNow = number(wallet.bonusBalanceFen);
  let principalFen = 0;
  let bonusFen = 0;
  let balanceAfterFen = 0;

  if (direction === "debit") {
    const debit = splitWalletDebit({ principalBalanceFen: principalNow, bonusBalanceFen: bonusNow }, amountFen);
    principalFen = -debit.principalFen;
    bonusFen = -debit.bonusFen;
    balanceAfterFen = currentBalanceFen - amountFen;
  } else {
    // 手动增加默认计入赠送金
    bonusFen = amountFen;
    balanceAfterFen = currentBalanceFen + amountFen;
  }

  // CAS 更新：余额未变化才允许扣减，防并发双花
  const claim = await db.collection("wallet_accounts").where({
    _id: walletId,
    status: "active",
    balanceFen: currentBalanceFen
  }).update({
    data: direction === "debit"
      ? {
        balanceFen: _.inc(-amountFen),
        principalBalanceFen: _.inc(principalFen),
        bonusBalanceFen: _.inc(bonusFen),
        totalSpentFen: _.inc(amountFen),
        updatedAt: db.serverDate()
      }
      : {
        balanceFen: _.inc(amountFen),
        bonusBalanceFen: _.inc(amountFen),
        totalBonusFen: _.inc(amountFen),
        updatedAt: db.serverDate()
      }
  });
  if (!claim || !claim.stats || number(claim.stats.updated) <= 0) {
    return { ok: false, message: "会员余额已发生变化，请刷新后重试" };
  }

  try {
    await db.collection("wallet_ledger").doc(ledgerId).set({
      data: {
        _openid: member._openid || "",
        walletId,
        memberId,
        type: "balance_adjustment",
        direction,
        amountFen: direction === "debit" ? -amountFen : amountFen,
        principalFen,
        bonusFen,
        status: "posted",
        balanceAfterFen,
        reason,
        adminUid: caller.uid || "",
        adminName: caller.username || "",
        requestId,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
  } catch (ledgerError) {
    // 流水写入失败则回滚余额，避免只扣钱不落账
    try {
      await db.collection("wallet_accounts").doc(walletId).update({
        data: direction === "debit"
          ? {
            balanceFen: _.inc(amountFen),
            principalBalanceFen: _.inc(-principalFen),
            bonusBalanceFen: _.inc(-bonusFen),
            totalSpentFen: _.inc(-amountFen),
            updatedAt: db.serverDate()
          }
          : {
            balanceFen: _.inc(-amountFen),
            bonusBalanceFen: _.inc(-amountFen),
            totalBonusFen: _.inc(-amountFen),
            updatedAt: db.serverDate()
          }
      });
    } catch (rollbackError) {
      // 保留原始错误
    }
    return { ok: false, message: "流水写入失败，已回滚，请重试" };
  }

  await writeAdminAuditLog(caller, "adjustMemberBalance", {
    memberId,
    memberName: cleanText(member.name || member.nickName || member.nickname, 40),
    phone: cleanText(member.phone, 20),
    direction,
    amountYuan,
    reason,
    balanceAfterFen,
    requestId
  });

  return {
    ok: true,
    balanceFen: balanceAfterFen,
    balance: money(balanceAfterFen),
    requestId
  };
}

/** 余额扣减拆分：赠送金优先，按比例分摊（与小程序余额支付同一口径）。 */
function splitWalletDebit(wallet, amountFen) {
  const principal = Math.max(0, number(wallet.principalBalanceFen));
  const bonus = Math.max(0, number(wallet.bonusBalanceFen));
  const balance = principal + bonus;
  if (balance < amountFen) {
    throw new Error("会员余额不足，无法扣减");
  }
  if (!amountFen || !balance) {
    return { principalFen: 0, bonusFen: 0 };
  }
  let principalFen = Math.round(amountFen * principal / balance);
  let bonusFen = amountFen - principalFen;
  if (principalFen > principal) {
    principalFen = principal;
    bonusFen = amountFen - principalFen;
  }
  if (bonusFen > bonus) {
    bonusFen = bonus;
    principalFen = amountFen - bonusFen;
  }
  return { principalFen, bonusFen };
}

async function listAfterSales(event) {
  const status = cleanText(event.status, 30);
  const keyword = cleanText(event.keyword, 80);
  const orders = await readCollection("orders", { orderBy: "createdAt", limit: 1000 });
  const items = orders.filter((order) => {
    const afterSaleStatus = order.afterSaleStatus || order.afterSale && order.afterSale.status || "";
    if (!afterSaleStatus && !/退款|售后|异常/.test(String(order.status || ""))) {
      return false;
    }
    if (status && status !== "all" && afterSaleStatus !== status) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return [
      order.orderNo,
      order.consignee,
      order.name,
      order.phone,
      afterSaleStatus,
      order.afterSaleReason,
      order.afterSaleNote
    ].join(" ").includes(keyword);
  });
  const paged = paginateArray(items, event);
  return { ok: true, orders: paged.items, page: paged.page };
}

/** 自选礼盒配置列表（后台商品管理 → 礼盒） */
async function listGiftBoxPlans() {
  await ensureCollection("gift_box_plans");
  const rows = await readCollection("gift_box_plans", { orderBy: "sort", order: "asc", limit: 100 });
  return {
    ok: true,
    plans: (rows || []).filter((plan) => plan.removed !== true).map((plan) => ({
      _id: plan._id,
      id: plan.id,
      name: plan.name || "",
      description: plan.description || "",
      images: Array.isArray(plan.images) ? plan.images : (plan.image ? [plan.image] : []),
      image: plan.image || (plan.images && plan.images[0]) || "",
      category: plan.category || "礼盒",
      priceMode: plan.priceMode || "per_brew",
      boxFeeFen: Math.max(0, Number(plan.boxFeeFen) || 0),
      selection: plan.selection || {},
      stock: Math.max(0, Number(plan.stock) || 0),
      lockedStock: Math.max(0, Number(plan.lockedStock) || 0),
      soldStock: Math.max(0, Number(plan.soldStock) || 0),
      pool: Array.isArray(plan.pool) ? plan.pool : [],
      visible: plan.visible !== false,
      sort: Number(plan.sort) || 0,
      removed: plan.removed === true,
      createdAt: plan.createdAt || null,
      updatedAt: plan.updatedAt || null
    }))
  };
}

/** 保存自选礼盒配置（新建/编辑） */
async function saveGiftBoxPlan(event, caller) {
  const data = event.data && typeof event.data === "object" ? event.data : event;
  const id = cleanText(data.id || data.planId, 40);
  const name = cleanText(data.name, 60);
  const description = cleanText(data.description, 1000);
  const priceMode = data.priceMode === "whole_box" ? "whole_box" : "per_brew";
  const boxFeeFen = Math.max(0, Math.round(Number(data.boxFeeFen) || 0));
  const selection = data.selection && typeof data.selection === "object" ? data.selection : {};
  const pool = Array.isArray(data.pool) ? data.pool : [];
  const stock = Math.max(0, Math.round(Number(data.stock) || 0));
  const visible = data.visible !== false;
  const sort = Math.max(0, Number(data.sort) || 0);
  const images = Array.isArray(data.images) ? data.images.map((v) => cleanText(v, 500)).filter(Boolean) : [];

  if (!name) {
    return { ok: false, message: "请填写礼盒名称" };
  }
  const mode = selection.mode === "double" ? "double" : "single";
  const minTypes = Math.max(1, Math.min(9, Number(selection.minTypes) || (mode === "double" ? 2 : 1)));
  const maxTypes = Math.max(minTypes, Math.min(9, Number(selection.maxTypes) || minTypes));
  const brewsPerType = Math.max(1, Math.min(99, Number(selection.brewsPerType) || 1));
  const allowDuplicate = selection.allowDuplicate === true;
  const note = cleanText(selection.note, 200);
  if (!pool.length) {
    return { ok: false, message: "请至少添加一款可选茶品" };
  }
  for (const tea of pool) {
    if (!cleanText(tea.teaId, 40)) {
      return { ok: false, message: "茶池条目缺少 teaId" };
    }
    if (Math.round(Number(tea.priceFen) || 0) <= 0) {
      return { ok: false, message: `茶池「${cleanText(tea.name, 20)}」价格需大于 0` };
    }
  }

  await ensureCollection("gift_box_plans");
  const normalized = {
    id,
    name,
    description,
    images,
    image: images[0] || "",
    category: cleanText(data.category, 20) || "礼盒",
    priceMode,
    boxFeeFen,
    selection: {
      mode,
      minTypes,
      maxTypes,
      brewsPerType,
      allowDuplicate,
      note
    },
    stock,
    lockedStock: 0,
    soldStock: 0,
    pool: pool.map((tea) => ({
      teaId: cleanText(tea.teaId, 40),
      name: cleanText(tea.name, 60),
      priceFen: Math.max(0, Math.round(Number(tea.priceFen) || 0))
    })),
    visible,
    sort,
    removed: false,
    updatedAt: db.serverDate()
  };

  let planId = "";
  if (id) {
    const existing = await db.collection("gift_box_plans").where({ id }).limit(1).get().catch(() => null);
    const row = existing && existing.data && existing.data[0];
    if (row) {
      planId = row._id;
      // 保存时保留已锁定/已售库存，避免覆盖丢失
      normalized.lockedStock = Math.max(0, Number(row.lockedStock) || 0);
      normalized.soldStock = Math.max(0, Number(row.soldStock) || 0);
      await db.collection("gift_box_plans").doc(row._id).update({ data: normalized });
    }
  }
  if (!planId) {
    const addResult = await db.collection("gift_box_plans").add({
      data: Object.assign({}, normalized, {
        id: id || `giftbox-${Date.now().toString(36)}`,
        createdAt: db.serverDate()
      })
    });
    planId = addResult._id;
  }

  await writeAdminAuditLog(caller, "saveGiftBoxPlan", {
    id: normalized.id,
    name,
    priceMode,
    poolCount: pool.length,
    visible
  });
  return { ok: true, planId, id: normalized.id };
}

/** 删除自选礼盒配置（软删） */
async function removeGiftBoxPlan(event, caller) {
  const id = cleanText(event.id || (event.data && event.data.id), 40);
  const reason = cleanText(event.reason || event.auditReason || (event.data && event.data.reason), 200);
  if (!id) {
    return { ok: false, message: "缺少礼盒 ID" };
  }
  if (!reason) {
    return { ok: false, message: "删除礼盒需填写原因" };
  }
  await ensureCollection("gift_box_plans");
  const existing = await db.collection("gift_box_plans").where({ id }).limit(1).get().catch(() => null);
  const row = existing && existing.data && existing.data[0];
  if (!row) {
    return { ok: false, message: "礼盒不存在" };
  }
  await db.collection("gift_box_plans").doc(row._id).update({
    data: { removed: true, updatedAt: db.serverDate() }
  });
  await writeAdminAuditLog(caller, "removeGiftBoxPlan", {
    id,
    name: cleanText(row.name, 60),
    reason
  });
  return { ok: true };
}

async function updateAfterSale(event, caller) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  const afterSaleStatus = cleanText(event.afterSaleStatus || event.status, 30) || "处理中";
  const allowedStatuses = ["申请售后", "审核中", "处理中", "已退款", "已拒绝", "已关闭"];
  if (!allowedStatuses.includes(afterSaleStatus)) {
    return { ok: false, message: "售后状态不支持" };
  }
  if (event.refundAmount !== undefined && event.refundAmount !== "" && !Number.isFinite(Number(event.refundAmount))) {
    return { ok: false, message: "退款金额必须是数字" };
  }
  const refundAmount = Math.max(0, Number(event.refundAmount) || 0);
  const orderTotal = Math.max(0, Number(order.total) || 0);
  if (refundAmount > orderTotal) {
    return { ok: false, message: "退款金额不能大于订单金额" };
  }
  const afterSaleReason = cleanText(event.reason || event.afterSaleReason, 160);
  const afterSaleNote = cleanText(event.note || event.afterSaleNote, 300);
  if (afterSaleStatus === "已退款" && refundAmount <= 0) {
    return { ok: false, message: "标记已退款时需填写退款金额" };
  }
  if (["已退款", "已拒绝"].includes(afterSaleStatus) && !afterSaleReason && !afterSaleNote) {
    return { ok: false, message: "退款或拒绝售后需填写处理原因" };
  }
  await db.collection("orders").doc(order._id).update({
    data: {
      afterSaleStatus,
      afterSaleReason,
      afterSaleNote,
      refundAmount,
      afterSaleUpdatedBy: callerLabel(caller),
      afterSaleUpdatedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });
  await writeAdminAuditLog(caller, "updateAfterSale", {
    orderNo: order.orderNo,
    afterSaleStatus,
    refundAmount,
    afterSaleReason,
    changes: auditDiff(order, {
      afterSaleStatus,
      afterSaleReason,
      afterSaleNote,
      refundAmount
    }, ["afterSaleStatus", "afterSaleReason", "afterSaleNote", "refundAmount"])
  });
  return { ok: true };
}

function normalizeIdentity(event = {}) {
  const customerId = cleanText(event.customerId || event.id, 80);
  const identity = {
    openid: cleanText(event.openid, 80),
    phone: cleanText(event.phone || event.mobile, 40)
  };
  if (!identity.phone && /^1\d{10}$/.test(customerId)) {
    identity.phone = customerId;
  }
  if (!identity.openid && customerId && customerId !== identity.phone && customerId.length >= 12) {
    identity.openid = customerId;
  }
  return identity;
}

function identityQueries(identity, fields) {
  const queries = [];
  if (identity.openid) {
    fields.openid.forEach((field) => queries.push({ [field]: identity.openid }));
  }
  if (identity.phone) {
    fields.phone.forEach((field) => queries.push({ [field]: identity.phone }));
  }
  return queries;
}

async function findDocsByIdentity(collection, identity, fields) {
  await ensureCollection(collection);
  const docs = {};
  const queries = identityQueries(identity, fields);
  for (const where of queries) {
    const result = await db.collection(collection).where(where).limit(200).get();
    (result.data || []).forEach((doc) => {
      docs[doc._id] = doc;
    });
  }
  return Object.values(docs);
}

async function anonymizeDocs(collection, docs, data) {
  let count = 0;
  for (const doc of docs) {
    await db.collection(collection).doc(doc._id).update({
      data: Object.assign({}, data, {
        privacyDeleted: true,
        privacyDeletedAt: db.serverDate(),
        updatedAt: db.serverDate()
      })
    });
    count += 1;
  }
  return count;
}

async function removeDocs(collection, docs) {
  let count = 0;
  for (const doc of docs) {
    await db.collection(collection).doc(doc._id).remove();
    count += 1;
  }
  return count;
}

async function writeAdminAuditLog(caller, action, detail) {
  const safeDetail = redactAuditDetail(detail || {});
  const detailText = cleanText(JSON.stringify(safeDetail), 1000);
  await ensureCollection("admin_audit_logs");
  await db.collection("admin_audit_logs").add({
    data: {
      action,
      adminOpenid: maskOpenid(caller.openid),
      adminUid: caller.uid ? maskOpenid(caller.uid) : "",
      detail: safeDetail,
      detailText,
      createdAt: db.serverDate()
    }
  });
}

async function writeExportAuditLog(caller, event, sourceAction, label, page = {}) {
  if (!event.exportAll || pageOptions(event).page !== 1) {
    return;
  }
  await writeAdminAuditLog(caller, "exportCsv", {
    sourceAction,
    label,
    reason: cleanText(event.exportReason || event.reason, 200),
    status: cleanText(event.status, 30),
    hasKeyword: Boolean(cleanText(event.keyword, 80)),
    total: Number(page.total || 0),
    pageSize: Number(page.pageSize || event.pageSize || 0)
  });
}

async function deleteCustomerData(event, caller) {
  const identity = normalizeIdentity(event);
  if (!identity.openid && !identity.phone) {
    return { ok: false, message: "缺少可定位用户的 OpenID 或手机号" };
  }
  const reason = cleanText(event.reason, 200);
  if (!reason) {
    return { ok: false, message: "删除个人数据需填写原因" };
  }

  const recordFields = {
    openid: ["_openid", "openid"],
    phone: ["phone", "mobile"]
  };
  const orderDocs = await findDocsByIdentity("orders", identity, recordFields);
  const reservationDocs = await findDocsByIdentity("reservations", identity, recordFields);
  const signupDocs = await findDocsByIdentity("event_signups", identity, recordFields);
  const memberDocs = await findDocsByIdentity("members", identity, recordFields);
  const preferenceDocs = await findDocsByIdentity("subscription_preferences", identity, recordFields);
  const couponDocs = await findDocsByIdentity("user_coupons", identity, recordFields);

  const counts = {
    orders: await anonymizeDocs("orders", orderDocs, {
      _openid: "",
      openid: "",
      consignee: "已匿名",
      name: "已匿名",
      contactName: "已匿名",
      phone: "",
      mobile: "",
      address: "",
      remark: "",
      pickupNote: ""
    }),
    reservations: await anonymizeDocs("reservations", reservationDocs, {
      _openid: "",
      openid: "",
      name: "已匿名",
      customerName: "已匿名",
      phone: "",
      mobile: "",
      note: ""
    }),
    signups: await anonymizeDocs("event_signups", signupDocs, {
      _openid: "",
      openid: "",
      name: "已匿名",
      customerName: "已匿名",
      phone: "",
      mobile: "",
      note: ""
    }),
    members: await anonymizeDocs("members", memberDocs, {
      _openid: "",
      openid: "",
      name: "已匿名",
      nickname: "",
      phone: "",
      mobile: "",
      avatar: ""
    }),
    subscriptionPreferences: await removeDocs("subscription_preferences", preferenceDocs),
    userCoupons: await removeDocs("user_coupons", couponDocs)
  };

  await writeAdminAuditLog(caller, "deleteCustomerData", {
    openid: maskOpenid(identity.openid),
    phone: maskPhone(identity.phone),
    reason,
    counts
  });

  return { ok: true, counts };
}

async function exportCustomerData(event, caller) {
  const identity = normalizeIdentity(event);
  if (!identity.openid && !identity.phone) {
    return { ok: false, message: "缺少可定位用户的 OpenID 或手机号" };
  }
  const reason = cleanText(event.reason, 200);
  if (!reason) {
    return { ok: false, message: "导出用户数据需填写原因" };
  }

  const recordFields = {
    openid: ["_openid", "openid"],
    phone: ["phone", "mobile"]
  };
  const [orders, reservations, signups, members, subscriptionPreferences, userCoupons] = await Promise.all([
    findDocsByIdentity("orders", identity, recordFields),
    findDocsByIdentity("reservations", identity, recordFields),
    findDocsByIdentity("event_signups", identity, recordFields),
    findDocsByIdentity("members", identity, recordFields),
    findDocsByIdentity("subscription_preferences", identity, recordFields),
    findDocsByIdentity("user_coupons", identity, recordFields)
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    identity: {
      openid: identity.openid,
      phone: identity.phone
    },
    orders,
    reservations,
    signups,
    members,
    subscriptionPreferences,
    userCoupons
  };
  await writeAdminAuditLog(caller, "exportCustomerData", {
    openid: maskOpenid(identity.openid),
    phone: maskPhone(identity.phone),
    reason,
    counts: {
      orders: orders.length,
      reservations: reservations.length,
      signups: signups.length,
      members: members.length,
      subscriptionPreferences: subscriptionPreferences.length,
      userCoupons: userCoupons.length
    }
  });
  return { ok: true, data };
}

const backupCollections = [
  "orders",
  "reservations",
  "event_signups",
  "members",
  "tea_products",
  "drinks",
  "rooms",
  "events",
  "content_blocks",
  "coupons",
  "user_coupons",
  "store_settings",
  "admin_audit_logs",
  "notification_logs",
  "inventory_logs"
];

async function readBackupCollection(collection, limit) {
  await ensureCollection(collection);
  const countResult = await db.collection(collection).count();
  const result = await db.collection(collection).limit(limit).get();
  const items = result.data || [];
  const total = Number(countResult.total || 0);
  return {
    items,
    total,
    truncated: total > items.length
  };
}

async function listBackupLogs(event = {}) {
  const result = await readCollectionPage("data_backup_logs", {
    keyword: cleanText(event.keyword, 80),
    keywordFields: ["cloudPath", "status", "operator", "error"],
    orderBy: "createdAt",
    event
  });
  return { ok: true, logs: result.items, page: result.page };
}

async function getBackupDownloadUrl(event, caller) {
  const reason = requireAuditReason(event, "下载数据备份");
  const id = cleanText(event.id, 120);
  const cloudPath = cleanText(event.cloudPath, 240);
  let record = null;
  if (id) {
    try {
      record = await getByDocId("data_backup_logs", id);
    } catch (error) {
      record = null;
    }
  }
  if (!record && cloudPath) {
    record = await findRecord("data_backup_logs", "cloudPath", cloudPath);
  }
  if (!record) {
    return { ok: false, message: "备份记录不存在" };
  }
  const fileId = record.fileId || record.fileID || "";
  if (record.status !== "success" || !fileId) {
    return { ok: false, message: "该备份没有可下载的云文件" };
  }
  const result = await cloud.getTempFileURL({
    fileList: [fileId]
  });
  const item = result.fileList && result.fileList[0] || {};
  const url = item.tempFileURL || item.download_url || "";
  if (!url || item.status && item.status !== 0) {
    return { ok: false, message: item.errMsg || "获取备份下载链接失败" };
  }
  await writeAdminAuditLog(caller, "getBackupDownloadUrl", {
    cloudPath: record.cloudPath || "",
    size: record.size || 0,
    checksum: record.checksum || "",
    reason
  });
  return {
    ok: true,
    url,
    cloudPath: record.cloudPath || "",
    size: record.size || 0,
    checksum: record.checksum || "",
    expireIn: 7200
  };
}

function adminProfile() {
  return {
    roleKey: "admin",
    roleName: "管理员",
    permissions: ["*"],
    source: "admin_whitelist",
    disabled: false
  };
}

async function createDataBackup(event, caller) {
  const reason = requireAuditReason(event, "创建数据备份");
  const limit = Math.min(1000, Math.max(50, Number(event.limit) || 500));
  const selected = Array.isArray(event.collections) && event.collections.length
    ? event.collections.map((item) => cleanText(item, 60)).filter((item) => backupCollections.includes(item))
    : backupCollections;
  const exported = {};
  const counts = {};
  const totals = {};
  const truncated = {};
  for (const collection of selected) {
    const backup = await readBackupCollection(collection, limit);
    exported[collection] = backup.items;
    counts[collection] = backup.items.length;
    totals[collection] = backup.total;
    truncated[collection] = backup.truncated;
  }
  const truncatedCollections = Object.keys(truncated).filter((collection) => truncated[collection]);
  const fileName = `backup-${Date.now()}.json`;
  const cloudPath = `admin-backups/${fileName}`;
  const payload = {
    exportedAt: new Date().toISOString(),
    operator: callerLabel(caller),
    limit,
    counts,
    totals,
    truncated,
    truncatedCollections,
    data: exported
  };
  const fileContent = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const checksum = sha256(fileContent);
  try {
    const upload = await cloud.uploadFile({ cloudPath, fileContent });
    await ensureCollection("data_backup_logs");
    await db.collection("data_backup_logs").add({
      data: {
        cloudPath,
        fileId: upload.fileID || upload.fileId || "",
        size: fileContent.length,
        checksum,
        counts,
        totals,
        truncated,
        truncatedCollections,
        limit,
        operator: callerLabel(caller),
        reason,
        status: "success",
        createdAt: db.serverDate()
      }
    });
    await writeAdminAuditLog(caller, "createDataBackup", {
      cloudPath,
      size: fileContent.length,
      checksum,
      counts,
      totals,
      truncated,
      truncatedCollections,
      reason
    });
    return {
      ok: true,
      cloudPath,
      fileId: upload.fileID || upload.fileId || "",
      size: fileContent.length,
      checksum,
      counts,
      totals,
      truncated,
      truncatedCollections
    };
  } catch (error) {
    await ensureCollection("data_backup_logs");
    await db.collection("data_backup_logs").add({
      data: {
        cloudPath,
        size: fileContent.length,
        checksum,
        counts,
        totals,
        truncated,
        truncatedCollections,
        limit,
        operator: callerLabel(caller),
        reason,
        status: "failed",
        error: error.message || String(error),
        createdAt: db.serverDate()
      }
    });
    return { ok: false, message: error.message || "备份上传失败" };
  }
}

async function getAnalytics(event = {}) {
  const rangeDays = normalizeRangeDays(event.rangeDays);
  const [orders, reservations, signups] = await Promise.all([
    readCollection("orders", { orderBy: "createdAt", limit: ANALYTICS_READ_LIMIT }),
    readCollection("reservations", { orderBy: "createdAt", limit: ANALYTICS_READ_LIMIT }),
    readCollection("event_signups", { orderBy: "createdAt", limit: ANALYTICS_READ_LIMIT })
  ]);

  return {
    ok: true,
    analytics: buildAnalytics({
      orders,
      reservations,
      signups,
      rangeDays,
      readLimit: ANALYTICS_READ_LIMIT
    })
  };
}

function normalizeContent(data = {}) {
  return {
    key: cleanId(data.key, "content"),
    type: cleanText(data.type, 30) || "home_carousel",
    title: cleanText(data.title, 80),
    subtitle: cleanText(data.subtitle, 100),
    summary: cleanText(data.summary, 300),
    image: cleanText(data.image, 500),
    linkType: cleanText(data.linkType, 30),
    linkTarget: cleanText(data.linkTarget, 120),
    visible: data.visible !== false,
    sort: Math.max(0, Number(data.sort) || 0)
  };
}

async function listContent(event) {
  const type = cleanText(event.type, 30);
  const items = await readCollection("content_blocks", {
    where: type && type !== "all" ? { type } : undefined,
    orderBy: "sort",
    order: "asc",
    limit: 100
  });
  return { ok: true, items };
}

async function saveContent(event, caller) {
  const payload = normalizeContent(event.data || {});
  assertImageRef(payload.image, "内容图片");
  assertSafeTextRef(payload.linkTarget, "内容跳转目标");
  const existing = await findRecord("content_blocks", "key", payload.key);
  await upsertRecord("content_blocks", "key", payload.key, payload);
  await writeAdminAuditLog(caller, "saveContent", {
    key: payload.key,
    type: payload.type,
    title: payload.title,
    changes: auditDiff(existing || {}, payload, ["type", "title", "subtitle", "summary", "image", "linkType", "linkTarget", "visible", "sort"])
  });
  return { ok: true, key: payload.key };
}

async function deleteContent(event, caller) {
  const key = cleanText(event.key || event.id, 80);
  if (!key) {
    return { ok: false, message: "缺少内容 key" };
  }
  const existing = await findRecord("content_blocks", "key", key);
  if (!existing) {
    return { ok: false, message: "内容不存在" };
  }
  await db.collection("content_blocks").doc(existing._id).update({
    data: {
      visible: false,
      updatedAt: db.serverDate()
    }
  });
  await writeAdminAuditLog(caller, "deleteContent", {
    key,
    title: existing.title || "",
    changes: auditDiff(existing, { visible: false }, ["visible"])
  });
  return { ok: true };
}


async function disableRecord(collection, id, caller) {
  const existing = await findRecord(collection, "id", cleanText(id, 80));
  if (!existing) {
    return { ok: false, message: "数据不存在" };
  }
  await db.collection(collection).doc(existing._id).update({
    data: {
      visible: false,
      status: "已停用",
      updatedAt: db.serverDate()
    }
  });
  await writeAdminAuditLog(caller, "disableRecord", {
    collection,
    id: cleanText(id, 80),
    name: existing.name || existing.title || "",
    changes: auditDiff(existing, { visible: false, status: "已停用" }, ["visible", "status"])
  });
  return { ok: true };
}

function normalizeSettings(data = {}) {
  return {
    key: "store",
    brandName: cleanText(data.brandName, 80) || "禾煦 HEXU TEA",
    slogan: cleanText(data.slogan, 120),
    storeName: cleanText(data.storeName, 80),
    address: cleanText(data.address, 160),
    phone: cleanText(data.phone, 40),
    businessHours: cleanText(data.businessHours, 160),
    reservationRule: cleanText(data.reservationRule, 300),
    /** 已支付预约：用户自助全额退须至少提前 N 小时（1–168） */
    reservationCancelAdvanceHours: Math.max(
      1,
      Math.min(168, Number(data.reservationCancelAdvanceHours) || Number(process.env.RESERVATION_CANCEL_ADVANCE_HOURS) || 12)
    ),
    /** 待支付预约锁单分钟数（1–120） */
    reservationLockMinutes: Math.max(
      1,
      Math.min(120, Number(data.reservationLockMinutes) || Number(process.env.RESERVATION_LOCK_MINUTES) || 15)
    ),
    /**
     * 已确认预约：结束后宽限 N 分钟自动标「已完成」（0–1440）
     * 0 = 一到结束时间即收尾
     */
    reservationAutoCompleteGraceMinutes: (() => {
      const raw = data.reservationAutoCompleteGraceMinutes;
      const parsed = Number(raw);
      const fallback = Number(process.env.RESERVATION_AUTO_COMPLETE_GRACE_MINUTES || 60);
      const value = raw !== "" && raw != null && Number.isFinite(parsed) ? parsed : fallback;
      return Math.max(0, Math.min(24 * 60, Number.isFinite(value) ? value : 60));
    })(),
    /** 预约计价与时段（方案 A：规则在设置，不在商品价） */
    bookingOpenTime: cleanText(data.bookingOpenTime, 8) || "10:00",
    bookingCloseTime: cleanText(data.bookingCloseTime, 8) || "21:30",
    bookingMinDurationMinutes: Math.max(30, Math.min(480, Number(data.bookingMinDurationMinutes) || 120)),
    bookingSlotStepMinutes: Math.max(15, Math.min(60, Number(data.bookingSlotStepMinutes) || 30)),
    bookingMaxPeople: Math.max(1, Math.min(30, Number(data.bookingMaxPeople) || 6)),
    bookingDayLabel: cleanText(data.bookingDayLabel, 20) || "日间",
    bookingDayStart: cleanText(data.bookingDayStart, 8) || "10:00",
    bookingDayEnd: cleanText(data.bookingDayEnd, 8) || "19:30",
    bookingDayBasePrice: Math.max(0, Number(data.bookingDayBasePrice) || 188),
    bookingEveningLabel: cleanText(data.bookingEveningLabel, 20) || "晚间",
    bookingEveningStart: cleanText(data.bookingEveningStart, 8) || "19:30",
    bookingEveningEnd: cleanText(data.bookingEveningEnd, 8) || "21:30",
    bookingEveningBasePrice: Math.max(0, Number(data.bookingEveningBasePrice) || 208),
    bookingHalfHourPrice: Math.max(0, Number(data.bookingHalfHourPrice) || 30),
    bookingGiftTeaCups: Math.max(0, Math.min(20, Number(data.bookingGiftTeaCups) || 2)),
    bookingGiftTeaValueYuan: Math.max(0, Number(data.bookingGiftTeaValueYuan) || 78),
    bookingGiftTeaCopy: cleanText(data.bookingGiftTeaCopy, 80) || "含赠 2 泡茶（价值 ¥78）",
    memberPointRate: Math.max(0, Number(data.memberPointRate) || 1),
    levelOneName: cleanText(data.levelOneName, 20) || "雅客会员",
    levelOneMinSpend: Math.max(0, Number(data.levelOneMinSpend) || 0),
    levelOneDiscountRate: Math.min(1, Math.max(0.01, Number(data.levelOneDiscountRate) || 1)),
    levelTwoName: cleanText(data.levelTwoName, 20) || "臻享会员",
    levelTwoMinSpend: Math.max(0, Number(data.levelTwoMinSpend) || 1600),
    levelTwoDiscountRate: Math.min(1, Math.max(0.01, Number(data.levelTwoDiscountRate) || 1)),
    levelThreeName: cleanText(data.levelThreeName, 20) || "山房会员",
    levelThreeMinSpend: Math.max(0, Number(data.levelThreeMinSpend) || 5000),
    levelThreeDiscountRate: Math.min(1, Math.max(0.01, Number(data.levelThreeDiscountRate) || 1)),
    orderPaidTemplateId: cleanText(data.orderPaidTemplateId, 80),
    orderPaidPage: cleanText(data.orderPaidPage, 120) || "pages/profile/index",
    orderShippedTemplateId: cleanText(data.orderShippedTemplateId, 80),
    orderShippedPage: cleanText(data.orderShippedPage, 120) || "pages/profile/index",
    /**
     * 微信「发货信息管理」发货通知/确认收货提醒的跳转路径（set_msg_jump_path）。
     * 微信会自动附加 transaction_id、merchant_id、merchant_trade_no 参数，
     * 落地页 pages/order-detail/index 据此解析本地订单。
     */
    wxShippingJumpPath: cleanText(data.wxShippingJumpPath, 300) || "pages/order-detail/index",
    /** 该跳转路径是否已成功同步到微信侧（set_msg_jump_path 成功一次即为 true） */
    wxShippingJumpPathSynced: data.wxShippingJumpPathSynced === true,
    /** 同步失败时保留的期望路径（未生效，成功后会清空） */
    wxShippingJumpPathPending: cleanText(data.wxShippingJumpPathPending, 300) || "",
    /** 最近一次同步的错误信息 */
    wxShippingJumpPathError: cleanText(data.wxShippingJumpPathError, 300),
    staffOrderTemplateId: cleanText(data.staffOrderTemplateId, 80),
    staffOrderPage: cleanText(data.staffOrderPage, 120) || "pages/profile/index",
    // JSON 字符串，例如 {"character_string1":"orderNo","thing2":"itemSummary","amount3":"total","time4":"time"}
    staffOrderTemplateMap: cleanText(data.staffOrderTemplateMap, 500),
    reservationTemplateId: cleanText(data.reservationTemplateId, 80),
    reservationNoticePage: cleanText(data.reservationNoticePage, 120) || "pages/reservation/index",
    eventTemplateId: cleanText(data.eventTemplateId, 80),
    eventNoticePage: cleanText(data.eventNoticePage, 120) || "pages/events/index",
    paymentEnabled: data.paymentEnabled !== false,
    pickupEnabled: data.pickupEnabled !== false,
    shippingEnabled: data.shippingEnabled !== false,
    orderNoticeEnabled: data.orderNoticeEnabled !== false,
    staffOrderNoticeEnabled: data.staffOrderNoticeEnabled !== false,
    reservationNoticeEnabled: data.reservationNoticeEnabled !== false,
    eventNoticeEnabled: data.eventNoticeEnabled !== false
  };
}

async function getSettings() {
  const existing = await findRecord("store_settings", "key", "store");
  // 始终经 normalize 补齐新字段默认值
  return {
    ok: true,
    settings: normalizeSettings(existing || {})
  };
}

async function loadReservationPolicySettings() {
  try {
    const result = await getSettings();
    const s = (result && result.settings) || {};
    return {
      cancelAdvanceHours: Math.max(1, Math.min(168, Number(s.reservationCancelAdvanceHours) || 12)),
      lockMinutes: Math.max(1, Math.min(120, Number(s.reservationLockMinutes) || 15))
    };
  } catch (error) {
    return {
      cancelAdvanceHours: Math.max(1, Number(process.env.RESERVATION_CANCEL_ADVANCE_HOURS || 12)),
      lockMinutes: Math.max(1, Number(process.env.RESERVATION_LOCK_MINUTES || 15))
    };
  }
}

function validateSettingsInput(data = {}, payload = {}) {
  [
    ["memberPointRate", "积分倍率", 0, undefined],
    ["reservationCancelAdvanceHours", "预约取消提前小时", 1, 168],
    ["reservationLockMinutes", "预约支付锁单分钟", 1, 120],
    ["reservationAutoCompleteGraceMinutes", "预约自动完成宽限分钟", 0, 1440],
    ["bookingMinDurationMinutes", "预约最短时长（分钟）", 30, 480],
    ["bookingSlotStepMinutes", "预约时段步长（分钟）", 15, 60],
    ["bookingMaxPeople", "预约每场人数上限", 1, 30],
    ["bookingDayBasePrice", "日间满时长基础价", 0, undefined],
    ["bookingEveningBasePrice", "晚间满时长基础价", 0, undefined],
    ["bookingHalfHourPrice", "加时每步长价格", 0, undefined],
    ["bookingGiftTeaCups", "赠茶泡数", 0, 20],
    ["bookingGiftTeaValueYuan", "赠茶价值", 0, undefined],
    ["levelOneMinSpend", "一档会员门槛", 0, undefined],
    ["levelTwoMinSpend", "二档会员门槛", 0, undefined],
    ["levelThreeMinSpend", "三档会员门槛", 0, undefined],
    ["levelOneDiscountRate", "一档会员折扣", 0.01, 1],
    ["levelTwoDiscountRate", "二档会员折扣", 0.01, 1],
    ["levelThreeDiscountRate", "三档会员折扣", 0.01, 1]
  ].forEach(([field, label, min, max]) => {
    assertOptionalNumber(data[field], label, { min, max });
  });
  if (payload.levelTwoMinSpend < payload.levelOneMinSpend || payload.levelThreeMinSpend < payload.levelTwoMinSpend) {
    const error = new Error("会员等级门槛需按一档、二档、三档递增");
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (payload.levelTwoDiscountRate > payload.levelOneDiscountRate || payload.levelThreeDiscountRate > payload.levelTwoDiscountRate) {
    const error = new Error("高等级会员折扣率不能高于低等级会员");
    error.code = "INVALID_INPUT";
    throw error;
  }
  [
    ["orderPaidPage", "支付成功跳转页"],
    ["orderShippedPage", "发货通知跳转页"],
    ["wxShippingJumpPath", "微信发货通知跳转页"],
    ["staffOrderPage", "店员新订单跳转页"],
    ["reservationNoticePage", "预约通知跳转页"],
    ["eventNoticePage", "活动通知跳转页"]
  ].forEach(([field, label]) => assertSafeTextRef(payload[field], label));
  if (payload.wxShippingJumpPath && !/^[a-zA-Z0-9_/.-]+$/.test(payload.wxShippingJumpPath)) {
    const error = new Error("微信发货通知跳转页必须是合法的小程序页面路径");
    error.code = "INVALID_INPUT";
    throw error;
  }
}

async function updateSettings(event, caller) {
  const existing = await findRecord("store_settings", "key", "store");
  const data = event.data || {};
  const reason = requireAuditReason(event, "保存系统设置");
  const payload = normalizeSettings(data);
  // 前端设置表单不含同步标记：跳转路径未变时保留微信侧同步状态，避免被保存动作覆盖
  if (
    existing &&
    existing.wxShippingJumpPathSynced === true &&
    payload.wxShippingJumpPath === (existing.wxShippingJumpPath || "pages/order-detail/index")
  ) {
    payload.wxShippingJumpPathSynced = true;
  }
  if (existing) {
    payload.wxShippingJumpPathPending = cleanText(existing.wxShippingJumpPathPending, 300) || "";
    payload.wxShippingJumpPathError = cleanText(existing.wxShippingJumpPathError, 300) || "";
    payload.wxShippingJumpPathSyncedAt = existing.wxShippingJumpPathSyncedAt || null;
    payload.wxShippingJumpPathLastAttemptAt = existing.wxShippingJumpPathLastAttemptAt || null;
  }
  assertPhoneText(payload.phone, "门店电话");
  validateSettingsInput(data, payload);
  await upsertRecord("store_settings", "key", "store", payload);
  await writeAdminAuditLog(caller, "updateSettings", {
    brandName: payload.brandName,
    storeName: payload.storeName,
    paymentEnabled: payload.paymentEnabled,
    orderNoticeEnabled: payload.orderNoticeEnabled,
    reservationNoticeEnabled: payload.reservationNoticeEnabled,
    eventNoticeEnabled: payload.eventNoticeEnabled,
    reason,
    changes: auditDiff(existing || {}, payload, [
      "brandName",
      "storeName",
      "address",
      "phone",
      "businessHours",
      "reservationRule",
      "reservationCancelAdvanceHours",
      "reservationLockMinutes",
      "reservationAutoCompleteGraceMinutes",
      "bookingOpenTime",
      "bookingCloseTime",
      "bookingMinDurationMinutes",
      "bookingSlotStepMinutes",
      "bookingMaxPeople",
      "bookingDayBasePrice",
      "bookingEveningBasePrice",
      "bookingHalfHourPrice",
      "memberPointRate",
      "paymentEnabled",
      "orderNoticeEnabled",
      "reservationNoticeEnabled",
      "eventNoticeEnabled"
    ])
  });
  return { ok: true, settings: payload };
}

/**
 * 查询微信「发货信息管理」接入状态（诊断用，不改数据）。
 * 返回：是否已开通发货信息管理、是否已完成交易结算管理确认、当前跳转路径与同步状态。
 */
async function getWxShippingStatus(event, caller) {
  const settingsResult = await getSettings();
  const settings = settingsResult.settings || {};
  const [managedResult, confirmResult] = await Promise.all([
    queryIsTradeManaged(cloud).catch((error) => ({ ok: false, errmsg: String((error && error.message) || error) })),
    queryConfirmationCompleted(cloud).catch((error) => ({ ok: false, errmsg: String((error && error.message) || error) }))
  ]);
  const status = {
    ok: Boolean(managedResult && managedResult.ok && confirmResult && confirmResult.ok),
    isTradeManaged: Boolean(managedResult && (managedResult.isTradeManaged || managedResult.is_trade_managed)),
    tradeManageAppid: (managedResult && (managedResult.tradeManageAppid || managedResult.trade_manage_appid)) || "",
    isOfflineOrder: Boolean(managedResult && (managedResult.isOfflineOrder || managedResult.is_offline_order)),
    confirmationCompleted: Boolean(confirmResult && (confirmResult.confirmationCompleted || confirmResult.completed || confirmResult.is_confirmation_completed)),
    jumpPath: settings.wxShippingJumpPath || "pages/order-detail/index",
    jumpPathSynced: settings.wxShippingJumpPathSynced === true,
    pendingPath: settings.wxShippingJumpPathPending || "",
    jumpPathError: settings.wxShippingJumpPathError || "",
    managedError: managedResult && !managedResult.ok ? (managedResult.errmsg || "") : "",
    confirmError: confirmResult && !confirmResult.ok ? (confirmResult.errmsg || "") : ""
  };
  if (caller && caller.uid) {
    try {
      await writeAdminAuditLog(caller, "getWxShippingStatus", {
        isTradeManaged: status.isTradeManaged,
        confirmationCompleted: status.confirmationCompleted,
        jumpPath: status.jumpPath
      });
    } catch (error) {
      // 诊断查询的审计是尽力而为
    }
  }
  return { ok: true, status };
}

/** 金额元 → 分（支持两位小数） */
function yuanToFen(yuan) {
  return Math.round(Number(yuan || 0) * 100);
}

function serializeMembershipPlan(item) {
  const principalFen = Math.round(number(item.principalFen));
  const bonusFen = Math.round(number(item.bonusFen));
  const totalFen = Math.round(number(item.totalFen) || principalFen + bonusFen);
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    principalFen,
    bonusFen,
    totalFen,
    principalYuan: (principalFen / 100).toFixed(2),
    bonusYuan: (bonusFen / 100).toFixed(2),
    totalYuan: (totalFen / 100).toFixed(2),
    sortOrder: number(item.sortOrder),
    enabled: item.enabled !== false,
    updatedAt: item.updatedAt ? String(item.updatedAt) : ""
  };
}

/** 后台管理用：返回全部档位（含停用），按排序号升序 */
async function listMembershipPlans() {
  await ensureCollection("membership_plans");
  const result = await db.collection("membership_plans")
    .orderBy("sortOrder", "asc")
    .limit(50)
    .get();
  return { ok: true, plans: (result.data || []).map((item) => serializeMembershipPlan(item)) };
}

/**
 * 保存充值档位（新增或更新）。金额以元为单位提交，云端转分存储；
 * 前台 memberCenter 只展示 enabled 档位，保存后前台充值页自动同步。
 */
async function saveMembershipPlan(event, caller) {
  const data = event.data || {};
  const reason = requireAuditReason(event, "保存会员充值档位");
  const id = cleanText(data.id, 80);
  const title = cleanText(data.title, 40);
  const description = cleanText(data.description, 120);
  const principalYuan = Number(data.principalYuan);
  const bonusYuan = Number(data.bonusYuan);
  const sortOrder = Number(data.sortOrder);
  const enabled = data.enabled !== false;

  if (!title) {
    const error = new Error("档位名称不能为空");
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (!Number.isFinite(principalYuan) || principalYuan <= 0) {
    const error = new Error("充值金额必须大于 0");
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (!Number.isFinite(bonusYuan) || bonusYuan < 0) {
    const error = new Error("赠送金额不能小于 0");
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (principalYuan * 100 !== yuanToFen(principalYuan) || bonusYuan * 100 !== yuanToFen(bonusYuan)) {
    const error = new Error("金额最多保留两位小数");
    error.code = "INVALID_INPUT";
    throw error;
  }

  const principalFen = yuanToFen(principalYuan);
  const bonusFen = yuanToFen(bonusYuan);
  const totalFen = principalFen + bonusFen;
  const nextSort = Number.isFinite(sortOrder) && sortOrder >= 0
    ? Math.round(sortOrder)
    : (Math.floor(Date.now() / 1000) % 100000);

  let targetId = id;
  if (targetId) {
    await ensureCollection("membership_plans");
    const existing = await findRecord("membership_plans", "id", targetId);
    if (existing) {
      await db.collection("membership_plans").doc(existing._id).update({
        data: {
          title,
          description,
          principalFen,
          bonusFen,
          totalFen,
          sortOrder: nextSort,
          enabled,
          updatedAt: db.serverDate()
        }
      });
      await writeAdminAuditLog(caller, "saveMembershipPlan", {
        id: targetId,
        title,
        principalFen,
        bonusFen,
        enabled,
        reason
      });
      return { ok: true, plan: serializeMembershipPlan(Object.assign({}, existing, {
        title, description, principalFen, bonusFen, totalFen, sortOrder: nextSort, enabled
      })) };
    }
  }

  targetId = targetId || `recharge-${Date.now().toString(36)}`;
  await ensureCollection("membership_plans");
  const doc = {
    id: targetId,
    title,
    description,
    principalFen,
    bonusFen,
    totalFen,
    sortOrder: nextSort,
    enabled,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };
  const added = await db.collection("membership_plans").add({ data: doc });
  await writeAdminAuditLog(caller, "saveMembershipPlan", {
    id: targetId,
    title,
    principalFen,
    bonusFen,
    enabled,
    reason
  });
  return { ok: true, plan: serializeMembershipPlan(Object.assign({}, doc, { _id: added._id })) };
}

/** 停用档位（软删除，保留历史充值记录可追溯） */
async function removeMembershipPlan(event, caller) {
  const id = cleanText(event.data && event.data.id, 80);
  if (!id) {
    const error = new Error("缺少档位 ID");
    error.code = "INVALID_INPUT";
    throw error;
  }
  const reason = requireAuditReason(event, "停用会员充值档位");
  await ensureCollection("membership_plans");
  const existing = await findRecord("membership_plans", "id", id);
  if (existing) {
    await db.collection("membership_plans").doc(existing._id).update({
      data: {
        enabled: false,
        updatedAt: db.serverDate()
      }
    });
  }
  await writeAdminAuditLog(caller, "removeMembershipPlan", { id, reason });
  return { ok: true };
}

/**
 * 将「订单发货通知」跳转路径同步到微信（set_msg_jump_path，全局设置一次生效）。
 * 微信会在 path 后自动附加 transaction_id、merchant_id、merchant_trade_no，
 * 小程序 pages/order-detail/index 据此解析本地订单并展示物流/售后。
 */
async function setWxShippingJumpPath(event, caller) {
  const settingsResult = await getSettings();
  const settings = settingsResult.settings || {};
  const path = cleanText(event.path || settings.wxShippingJumpPath, 300).replace(/^\/+/, "");
  if (!path || !/^[a-zA-Z0-9_/.-]+$/.test(path)) {
    return { ok: false, message: "跳转路径不合法" };
  }

  const result = await setMsgJumpPath(cloud, path);
  const errcode = result && (result.errcode !== undefined ? result.errcode : result.errCode);
  const errmsg = (result && (result.errmsg || result.errMsg)) || "";
  const ok = Number(errcode) === 0;

  const settingsPatch = Object.assign({}, settings, {
    wxShippingJumpPathError: ok ? "" : cleanText(errmsg || "同步失败", 300),
    wxShippingJumpPathLastAttemptAt: new Date()
  });
  if (ok) {
    // 成功：应用新路径并清空待同步项
    settingsPatch.wxShippingJumpPath = path;
    settingsPatch.wxShippingJumpPathSynced = true;
    settingsPatch.wxShippingJumpPathSyncedAt = new Date();
    settingsPatch.wxShippingJumpPathPending = "";
  } else {
    // 失败：保留微信侧仍在生效的旧路径，仅记录期望路径供后台展示重试
    settingsPatch.wxShippingJumpPathPending = path;
  }
  await upsertRecord("store_settings", "key", "store", settingsPatch);

  await writeAdminAuditLog(caller, "setWxShippingJumpPath", {
    path,
    wxShippingOk: ok,
    wxShippingErrcode: errcode,
    wxShippingError: ok ? "" : (errmsg || ""),
    changes: auditDiff(settings, settingsPatch, ["wxShippingJumpPath", "wxShippingJumpPathSynced"])
  });

  return {
    ok,
    message: ok ? "发货通知跳转路径已同步到微信" : (errmsg || "同步失败，请检查云函数 openapi 权限与发货信息管理开通状态"),
    errcode: errcode,
    status: {
      jumpPath: path,
      jumpPathSynced: ok
    }
  };
}

/** cloud://envId.bucket/path → https://bucket.tcb.qcloud.la/path */
function fileIdToHttps(fileId) {
  const m = String(fileId || "").match(/^cloud:\/\/([^.]+)\.([^/]+)\/(.+)$/);
  if (!m) {
    return String(fileId || "");
  }
  return `https://${m[2]}.tcb.qcloud.la/${m[3]}`;
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // 已存在则忽略
  }
}

async function upsertTableQr(tableNo, fileID) {
  await ensureCollection("table_qrs");
  const exist = await db.collection("table_qrs").where({ tableNo }).limit(1).get();
  if (exist.data && exist.data.length) {
    await db.collection("table_qrs").doc(exist.data[0]._id).update({
      data: { fileID, updatedAt: db.serverDate() }
    });
    return;
  }
  await db.collection("table_qrs").add({
    data: { tableNo, fileID, createdAt: db.serverDate(), updatedAt: db.serverDate() }
  });
}

/**
 * 生成桌面小程序码（wxacode.getUnlimited，page=pages/order/index，scene=t=<桌号>）。
 * 图片存云存储 mp-assets/table-qr/，元数据落库 table_qrs。
 */
async function generateTableQr(event, caller) {
  const tables = (Array.isArray(event.tables) ? event.tables : [])
    .map((t) => cleanText(t, 20))
    .filter(Boolean);
  if (!tables.length) {
    return { ok: false, message: "请提供桌号列表（如 [\"01\",\"02\"]）" };
  }
  if (tables.length > 30) {
    return { ok: false, message: "单次最多生成 30 个桌码" };
  }

  const results = [];
  const errors = [];
  for (const tableNo of tables) {
    try {
      const qr = await wxGetUnlimited(cloud, tableNo);
      if (!qr.ok) {
        errors.push(`桌${tableNo}: ${qr.errmsg || "生成失败"}`);
        continue;
      }
      const cloudPath = `mp-assets/table-qr/table-${tableNo}.png`;
      const up = await cloud.uploadFile({ cloudPath, fileContent: qr.buffer });
      await upsertTableQr(tableNo, up.fileID);
      results.push({ tableNo, fileID: up.fileID, url: fileIdToHttps(up.fileID) });
    } catch (error) {
      errors.push(`桌${tableNo}: ${error.message || error}`);
    }
  }

  await writeAdminAuditLog(caller, "generateTableQr", {
    tables: tables.join(","),
    okCount: results.length,
    failCount: errors.length,
    errors: errors.join(" | ") || ""
  });
  return { ok: results.length > 0, results, errors };
}

/** 列出已生成的桌码（table_qrs 集合）。 */
async function listTableQrs() {
  await ensureCollection("table_qrs");
  const result = await db.collection("table_qrs").orderBy("tableNo", "asc").limit(50).get();
  return {
    ok: true,
    qrs: (result.data || []).map((r) => ({
      tableNo: r.tableNo,
      fileID: r.fileID,
      url: fileIdToHttps(r.fileID),
      updatedAt: r.updatedAt || null
    }))
  };
}

/**
 * 桌码图片下载：云函数读取文件返回 base64，绕开云存储 CDN 的浏览器 CORS 限制。
 * 二维码 PNG 体积小，单次返回不会触达云函数响应上限。
 */
async function downloadTableQrFile(event) {
  const fileID = cleanText(event.data && event.data.fileID, 500);
  const tableNo = cleanText(event.data && event.data.tableNo, 10);
  if (!fileID || fileID.indexOf("cloud://") !== 0) {
    return { ok: false, message: "缺少有效的桌码文件" };
  }
  let result;
  try {
    result = await cloud.downloadFile({ fileID });
  } catch (error) {
    return { ok: false, message: "文件读取失败，请重新生成桌码" };
  }
  const buffer = result && result.fileContent;
  if (!buffer) {
    return { ok: false, message: "文件内容为空" };
  }
  return {
    ok: true,
    contentType: "image/png",
    base64: Buffer.from(buffer).toString("base64"),
    fileName: `禾煦桌码-${tableNo || "qr"}.png`
  };
}

/** 朋友分享码：scene=share → 首页；生成后固定覆盖上传到 mp-assets/share/share-qr.png */
async function getShareQr(event, caller) {
  const cloudPath = "mp-assets/share/share-qr.png";
  const qr = await wxGetShareQr(cloud);
  if (!qr.ok) {
    return { ok: false, message: qr.errmsg || "分享码生成失败" };
  }
  let up;
  try {
    up = await cloud.uploadFile({ cloudPath, fileContent: qr.buffer });
  } catch (error) {
    return { ok: false, message: `分享码上传失败：${error.message || error}` };
  }
  const fileID = up.fileID || "";
  let url = "";
  if (fileID) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: [fileID] });
      url = (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) || "";
    } catch (error) {
      url = "";
    }
  }
  await writeAdminAuditLog(caller, "getShareQr", {
    ok: Boolean(fileID),
    message: url ? "分享码已生成" : "分享码已生成但取临时链接失败"
  });
  return { ok: Boolean(fileID), fileID, url, scene: "share" };
}

/** 下载分享码（base64，绕开云存储 CORS） */
async function downloadShareQrFile(event) {
  const fileID = cleanText(event.data && event.data.fileID, 500);
  if (!fileID || fileID.indexOf("cloud://") !== 0) {
    return { ok: false, message: "缺少有效的分享码文件" };
  }
  let result;
  try {
    result = await cloud.downloadFile({ fileID });
  } catch (error) {
    return { ok: false, message: "文件读取失败，请重新生成分享码" };
  }
  const buffer = result && result.fileContent;
  if (!buffer) {
    return { ok: false, message: "文件内容为空" };
  }
  return {
    ok: true,
    contentType: "image/png",
    base64: Buffer.from(buffer).toString("base64"),
    fileName: "禾煦朋友分享码.png"
  };
}

exports.main = async (event = {}, context = {}) => {
  await hydrateEnv(cloud);
  if (event.action === "health") {
    return { ok: true, name: "manageOperations" };
  }

  const action = cleanText(event.action, 40) || "getSummary";
  let caller = { openid: "", uid: "", username: "" };
  try {
    caller = await getCaller(context);
    assertAdmin(caller);

    if (!allowedActions.has(action)) {
      await writeAdminAuditLog(caller, "unknownAction", {
        attemptedAction: action
      });
      return { ok: false, message: "未知后台操作" };
    }

    if (event.exportAll) {
      const exportReason = cleanText(event.exportReason || event.reason, 200);
      if (!exportReason) {
        return { ok: false, message: "导出 CSV 需填写原因" };
      }
      event.exportReason = exportReason;
    }
    const status = cleanText(event.status, 30);
    const keyword = cleanText(event.keyword, 80);

    if (action === "getAdminProfile") {
      return {
        ok: true,
        admin: adminProfile()
      };
    }
    if (action === "getSummary") {
      return await getSummary();
    }
    if (action === "getDashboard") {
      return await getDashboard();
    }
    if (action === "globalSearch") {
      return await globalSearch(event);
    }
    if (action === "listOrders") {
      // 支持：业务线 bizType（dinein/retail）、状态、订单号/姓名/手机/桌号/备注
      const result = await listOrdersForAdmin(event);
      await writeExportAuditLog(caller, event, action, "订单", result.page);
      return { ok: true, orders: result.items, page: result.page };
    }
    if (action === "listPaidOrderAlerts") {
      return await listPaidOrderAlerts();
    }
    if (action === "listStoreVoiceAlerts") {
      return await listStoreVoiceAlerts();
    }
    if (action === "cancelOrder") {
      return await cancelOrder(event, caller);
    }
    if (action === "confirmManualOrder") {
      return await confirmManualOrder(event, caller);
    }
    if (action === "markShipped") {
      return await markShipped(event, caller);
    }
    if (action === "retryWxShipping") {
      return await retryWxShipping(event, caller);
    }
    if (action === "listExpressCompanies") {
      return { ok: true, companies: COMMON_EXPRESS_OPTIONS };
    }
    if (action === "markPickupDone") {
      return await markPickupDone(event, caller);
    }
    if (action === "markPreparingDone") {
      return await markPreparingDone(event, caller);
    }
    if (action === "listReservations") {
      const day = cleanText(event.day || event.date, 20);
      const startDay = cleanText(event.startDay, 20);
      const endDay = cleanText(event.endDay, 20);
      const extraWhere = {};
      // 与小程序落库 day 字段对齐（YYYY-MM-DD）；支持单日或日期范围（周视图）
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        extraWhere.day = day;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(startDay) && /^\d{4}-\d{2}-\d{2}$/.test(endDay)) {
        extraWhere.day = _.gte(startDay).and(_.lte(endDay));
      }
      // 当日工作台需要拉齐更多条，避免半页截断导致台历缺席
      if ((extraWhere.day && !event.pageSize)) {
        event = Object.assign({}, event, { pageSize: 100 });
      }
      const result = await listCollection(
        "reservations",
        status,
        keyword,
        event,
        ["room", "roomName", "name", "customerName", "phone", "mobile", "status", "reservationNo"],
        extraWhere
      );
      await writeExportAuditLog(caller, event, action, "预约", result.page);
      return { ok: true, reservations: result.items, page: result.page };
    }
    if (action === "updateReservation") {
      return await updateReservation(event, caller);
    }
    if (action === "afterSaleRefundReservation") {
      return await updateReservation(event, caller);
    }
    if (action === "listSignups") {
      const result = await listCollection("event_signups", status, keyword, event, ["eventTitle", "title", "name", "customerName", "phone", "mobile", "status"]);
      await writeExportAuditLog(caller, event, action, "活动报名", result.page);
      return { ok: true, signups: result.items, page: result.page };
    }
    if (action === "updateSignup") {
      return await updateSignup(event, caller);
    }
    if (action === "checkInSignup") {
      return await checkInSignup(event, caller);
    }
    if (action === "listCustomers") {
      const response = await listCustomers(event);
      await writeExportAuditLog(caller, event, action, "用户", response.page);
      return response;
    }
    if (action === "listRecharges") {
      const response = await listRecharges(event);
      await writeExportAuditLog(caller, event, action, "充值记录", response.page);
      return response;
    }
    if (action === "deleteCustomerData") {
      return await deleteCustomerData(event, caller);
    }
    if (action === "exportCustomerData") {
      return await exportCustomerData(event, caller);
    }
    if (action === "listAuditLogs") {
      const response = await listAuditLogs(event);
      await writeExportAuditLog(caller, event, action, "审计日志", response.page);
      return response;
    }
    if (action === "listInventoryLogs") {
      const response = await listInventoryLogs(event);
      await writeExportAuditLog(caller, event, action, "库存流水", response.page);
      return response;
    }
    if (action === "adjustInventory") {
      return await adjustInventory(event, caller);
    }
    if (action === "adjustMemberBalance") {
      return await adjustMemberBalance(event, caller);
    }
    if (action === "listGiftBoxPlans") {
      return await listGiftBoxPlans();
    }
    if (action === "saveGiftBoxPlan") {
      return await saveGiftBoxPlan(event, caller);
    }
    if (action === "removeGiftBoxPlan") {
      return await removeGiftBoxPlan(event, caller);
    }
    if (action === "listAfterSales") {
      const response = await listAfterSales(event);
      await writeExportAuditLog(caller, event, action, "售后", response.page);
      return response;
    }
    if (action === "updateAfterSale") {
      return await updateAfterSale(event, caller);
    }
    if (action === "getAnalytics") {
      return await getAnalytics(event);
    }
    if (action === "listContent") {
      return await listContent(event);
    }
    if (action === "saveContent") {
      return await saveContent(event, caller);
    }
    if (action === "deleteContent") {
      return await deleteContent(event, caller);
    }
    if (action === "getSettings") {
      return await getSettings();
    }
    if (action === "updateSettings") {
      return await updateSettings(event, caller);
    }
    if (action === "listMembershipPlans") {
      return await listMembershipPlans();
    }
    if (action === "saveMembershipPlan") {
      return await saveMembershipPlan(event, caller);
    }
    if (action === "removeMembershipPlan") {
      return await removeMembershipPlan(event, caller);
    }
    if (action === "getWxShippingStatus") {
      return await getWxShippingStatus(event, caller);
    }
    if (action === "setWxShippingJumpPath") {
      return await setWxShippingJumpPath(event, caller);
    }
    if (action === "generateTableQr") {
      return await generateTableQr(event, caller);
    }
    if (action === "listTableQrs") {
      return await listTableQrs();
    }
    if (action === "downloadTableQrFile") {
      return await downloadTableQrFile(event);
    }
    if (action === "getShareQr") {
      return await getShareQr(event, caller);
    }
    if (action === "downloadShareQrFile") {
      return await downloadShareQrFile(event);
    }
    if (action === "getSystemStatus") {
      return await getSystemStatus(event);
    }
    if (action === "listNotificationLogs") {
      const response = await listNotificationLogs(event);
      await writeExportAuditLog(caller, event, action, "通知日志", response.page);
      return response;
    }
    if (action === "sendTestNotice") {
      return await sendTestNotice(event, caller);
    }
    if (action === "listBackupLogs") {
      return await listBackupLogs(event);
    }
    if (action === "getBackupDownloadUrl") {
      return await getBackupDownloadUrl(event, caller);
    }
    if (action === "createDataBackup") {
      return await createDataBackup(event, caller);
    }

    return { ok: false, message: "未知后台操作" };
  } catch (error) {
    if (error.code === "NO_PERMISSION") {
      await writeAccessDeniedAudit(caller, action, error);
    }
    return {
      ok: false,
      code: error.code || "MANAGE_OPERATIONS_ERROR",
      message: error.message || "后台操作失败"
    };
  }
};
