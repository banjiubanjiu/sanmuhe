const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const DASHBOARD_READ_LIMIT = 1000;
const ANALYTICS_READ_LIMIT = 1000;
const MARKETING_STATS_LIMIT = 1000;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
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
  const text = cleanText(value, 300);
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
  const text = cleanText(value, 300);
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

function assertDateRange(startAt, endAt, label) {
  const startDate = assertDateText(startAt, `${label}开始`);
  const endDate = assertDateText(endAt, `${label}结束`);
  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    const error = new Error(`${label}结束时间不能早于开始时间`);
    error.code = "INVALID_INPUT";
    throw error;
  }
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
  return isActiveOrder(order) && (order.payStatus === "paid" || ["待发货", "待自提", "已发货", "已完成"].includes(order.status));
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

function maskPhone(value) {
  const text = cleanText(value, 40);
  if (!text) {
    return "";
  }
  if (/^1\d{10}$/.test(text)) {
    return `${text.slice(0, 3)}****${text.slice(7)}`;
  }
  return text.length > 4 ? `${text.slice(0, 2)}***${text.slice(-2)}` : "***";
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

const rolePermissionMap = {
  admin: ["*"],
  operator: [
    "dashboard.read",
    "order.read",
    "order.write",
    "afterSale.read",
    "afterSale.write",
    "inventory.read",
    "inventory.write",
    "reservation.read",
    "reservation.write",
    "signup.read",
    "signup.write",
    "customer.read",
    "catalog.read",
    "catalog.write",
    "content.read",
    "content.write",
    "marketing.read",
    "marketing.write",
    "analytics.read",
    "audit.read",
    "settings.read",
    "notification.read",
    "notification.write",
    "system.read",
    "backup.read",
    "backup.create",
    "export.read"
  ],
  clerk: [
    "dashboard.read",
    "order.read",
    "order.write",
    "afterSale.read",
    "reservation.read",
    "reservation.write",
    "signup.read",
    "signup.write",
    "customer.read",
    "catalog.read",
    "inventory.read",
    "notification.read",
    "system.read"
  ]
};

const roleLabels = {
  admin: "管理员",
  operator: "运营",
  clerk: "店员"
};

const actionPermissions = {
  getAdminProfile: "dashboard.read",
  getSummary: "dashboard.read",
  getDashboard: "dashboard.read",
  globalSearch: "dashboard.read",
  listOrders: "order.read",
  cancelOrder: "order.write",
  markShipped: "order.write",
  markPickupDone: "order.write",
  listReservations: "reservation.read",
  updateReservation: "reservation.write",
  listSignups: "signup.read",
  updateSignup: "signup.write",
  checkInSignup: "signup.write",
  listCustomers: "customer.read",
  exportCustomerData: "export.read",
  deleteCustomerData: "privacy.delete",
  listAuditLogs: "audit.read",
  listInventoryLogs: "inventory.read",
  adjustInventory: "inventory.write",
  listAfterSales: "afterSale.read",
  updateAfterSale: "afterSale.write",
  getAnalytics: "analytics.read",
  listContent: "content.read",
  saveContent: "content.write",
  deleteContent: "content.write",
  listMarketing: "marketing.read",
  saveCoupon: "marketing.write",
  saveCampaign: "marketing.write",
  disableCoupon: "marketing.write",
  disableCampaign: "marketing.write",
  getSettings: "settings.read",
  updateSettings: "settings.write",
  getSystemStatus: "system.read",
  listNotificationLogs: "notification.read",
  sendTestNotice: "notification.write",
  listAdminRoles: "roles.manage",
  saveAdminRole: "roles.manage",
  listBackupLogs: "backup.read",
  getBackupDownloadUrl: "backup.read",
  createDataBackup: "backup.create"
};

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

async function getCaller() {
  const wxContext = cloud.getWXContext();
  const caller = {
    openid: wxContext.OPENID || "",
    uid: "",
    username: ""
  };

  const auth = getAuthObject();
  if (!auth) {
    return caller;
  }

  try {
    const userInfo = typeof auth.getUserInfo === "function" ? auth.getUserInfo() : {};
    caller.uid = userInfo.uid || userInfo.userInfo && userInfo.userInfo.uid || "";
    caller.username = userInfo.username || userInfo.userInfo && userInfo.userInfo.username || "";
  } catch (error) {
    // Ignore and try detailed user info below.
  }

  if (caller.uid && !caller.username && typeof auth.getEndUserInfo === "function") {
    try {
      const detail = await auth.getEndUserInfo(caller.uid);
      const info = detail.userInfo || detail.data && detail.data.userInfo || {};
      caller.username = info.username || info.email || caller.username;
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

function roleSubjectMatches(role, caller) {
  const subject = cleanText(role.subject, 120);
  if (!subject) {
    return false;
  }
  return subject === caller.uid || subject === caller.username || subject === caller.openid;
}

function normalizeRoleKey(value) {
  const key = cleanText(value, 30) || "clerk";
  return rolePermissionMap[key] ? key : "clerk";
}

function normalizePermissionList(value, roleKey) {
  const defaults = rolePermissionMap[roleKey] || rolePermissionMap.clerk;
  const source = Array.isArray(value) && value.length ? value : defaults;
  return source.map((item) => cleanText(item, 80)).filter(Boolean);
}

async function getAdminRole(caller) {
  await ensureCollection("admin_roles");
  const result = await db.collection("admin_roles")
    .limit(100)
    .get();
  const role = (result.data || []).find((item) => roleSubjectMatches(item, caller));
  if (role && role.disabled === true) {
    return {
      roleKey: "disabled",
      roleName: "已停用",
      permissions: [],
      source: "admin_roles",
      disabled: true,
      raw: role
    };
  }
  if (!role) {
    return {
      roleKey: "admin",
      roleName: roleLabels.admin,
      permissions: rolePermissionMap.admin,
      source: "whitelist"
    };
  }
  const roleKey = normalizeRoleKey(role.roleKey);
  return {
    roleKey,
    roleName: role.roleName || roleLabels[roleKey],
    permissions: normalizePermissionList(role.permissions, roleKey),
    source: "admin_roles",
    raw: role
  };
}

function requirePermission(role, permission) {
  if (hasRolePermission(role, permission)) {
    return;
  }
  const error = new Error("当前后台角色无权执行该操作");
  error.code = "ROLE_PERMISSION_DENIED";
  throw error;
}

function hasRolePermission(role, permission) {
  if (!permission) {
    return true;
  }
  const permissions = role && Array.isArray(role.permissions) ? role.permissions : [];
  if (permissions.includes("*") || permissions.includes(permission)) {
    return true;
  }
  return false;
}

async function writePermissionDeniedAudit(caller = {}, attemptedAction, requiredPermission, detail = {}) {
  try {
    await writeAdminAuditLog(caller, "permissionDenied", Object.assign({
      attemptedAction: cleanText(attemptedAction, 60),
      requiredPermission: cleanText(requiredPermission, 80),
      roleKey: cleanText(detail.role && detail.role.roleKey, 30),
      roleName: cleanText(detail.role && detail.role.roleName, 40),
      roleSource: cleanText(detail.role && detail.role.source, 40),
      reason: "权限拦截"
    }, detail.extra || {}));
  } catch (error) {
    // Permission denial should never fail the original response path.
  }
}

async function requirePermissionWithAudit(role, permission, caller, attemptedAction, extra = {}) {
  if (hasRolePermission(role, permission)) {
    return;
  }
  await writePermissionDeniedAudit(caller, attemptedAction, permission, {
    role,
    extra
  });
  const error = new Error("当前后台角色无权执行该操作");
  error.code = "ROLE_PERMISSION_DENIED";
  error.permissionDeniedAudited = true;
  throw error;
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

async function readCollection(collection, options = {}) {
  await ensureCollection(collection);
  let query = db.collection(collection);
  if (options.where) {
    query = query.where(options.where);
  }
  if (options.orderBy) {
    query = query.orderBy(options.orderBy, options.order || "desc");
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

async function releaseInventory(locks, meta = {}) {
  for (const lock of locks || []) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }
    try {
      const beforeDoc = await db.collection(lock.collection).doc(lock.docId).get();
      const before = inventorySnapshot(beforeDoc.data || {});
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

async function listCollection(collection, status, keyword, event, keywordFields = []) {
  await ensureCollection(collection);
  const where = {};
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

  if (order.payStatus === "pending" && order.lockReleased !== true) {
    await releaseInventory(order.inventoryLocks, {
      type: "admin_cancel_release",
      orderNo: order.orderNo,
      operator: "admin",
      note: reason
    });
    await releaseUserCoupon(order.coupon);
  }

  await db.collection("orders").doc(order._id).update({
    data: {
      status: "已取消",
      payStatus: order.payStatus === "pending" ? "cancelled" : order.payStatus,
      lockReleased: order.payStatus === "pending" ? true : order.lockReleased,
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
      payStatus: order.payStatus === "pending" ? "cancelled" : order.payStatus,
      lockReleased: order.payStatus === "pending" ? true : order.lockReleased
    }, ["status", "payStatus", "lockReleased"])
  });
  return { ok: true };
}

async function markShipped(event, caller) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  const trackingCompany = cleanText(event.trackingCompany, 80);
  const trackingNo = cleanText(event.trackingNo, 80);
  if (order.status !== "待发货") {
    return { ok: false, message: "只有待发货订单可以标记发货" };
  }
  if (!trackingNo) {
    return { ok: false, message: "标记发货需填写快递单号" };
  }
  await db.collection("orders").doc(order._id).update({
    data: {
      status: "已发货",
      fulfillmentStatus: "shipped",
      trackingCompany,
      trackingNo,
      shippedAt: db.serverDate(),
      shippedBy: callerLabel(caller),
      adminNote: cleanText(event.adminNote, 300),
      updatedAt: db.serverDate()
    }
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
    changes: auditDiff(order, {
      status: "已发货",
      fulfillmentStatus: "shipped",
      trackingCompany,
      trackingNo
    }, ["status", "fulfillmentStatus", "trackingCompany", "trackingNo"])
  });
  return { ok: true };
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

async function updateReservation(event, caller) {
  const id = normalizeRecordId(event.reservationId || event.id);
  const status = cleanText(event.status, 20);
  if (!id || !status) {
    return { ok: false, message: "缺少预约 ID 或状态" };
  }
  const allowedStatuses = ["待确认", "已确认", "已完成", "已取消"];
  if (!allowedStatuses.includes(status)) {
    return { ok: false, message: "预约状态不支持" };
  }
  const adminNote = cleanText(event.adminNote, 300);
  if (status === "已取消" && !adminNote) {
    return { ok: false, message: "取消预约需填写原因" };
  }
  const existing = await getByDocId("reservations", id);
  if (!existing) {
    return { ok: false, message: "预约记录不存在" };
  }
  await db.collection("reservations").doc(id).update({
    data: {
      status,
      adminNote,
      updatedBy: callerLabel(caller),
      updatedAt: db.serverDate()
    }
  });
  const updated = Object.assign({}, existing || {}, { status, adminNote });
  await sendServiceNotice("reservationStatus", updated._openid, {
    room: updated.room,
    day: updated.day,
    time: updated.time,
    status,
    note: updated.adminNote || updated.note || "预约状态已更新"
  });
  await writeAdminAuditLog(caller, "updateReservation", {
    reservationId: id,
    status,
    previousStatus: existing.status,
    changes: auditDiff(existing, {
      status,
      adminNote
    }, ["status", "adminNote"])
  });
  return { ok: true };
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
  await Promise.all([
    ensureCollection("orders"),
    ensureCollection("reservations"),
    ensureCollection("event_signups")
  ]);

  const [pendingPay, toShip, toPickup, reservations, signups] = await Promise.all([
    db.collection("orders").where({ status: "待支付" }).count(),
    db.collection("orders").where({ status: "待发货" }).count(),
    db.collection("orders").where({ status: "待自提" }).count(),
    db.collection("reservations").where({ status: "待确认" }).count(),
    db.collection("event_signups").where({ status: "待确认" }).count()
  ]);

  return {
    ok: true,
    summary: {
      pendingPay: pendingPay.total,
      toShip: toShip.total,
      toPickup: toPickup.total,
      pendingReservations: reservations.total,
      pendingSignups: signups.total
    }
  };
}

function summarizeOrders(orders) {
  const today = todayKey();
  const month = today.slice(0, 7);
  const activeOrders = orders.filter(isActiveOrder);
  const revenueOrders = orders.filter(isRevenueOrder);
  return {
    todayOrders: orders.filter((order) => dateKey(order.createdAt) === today).length,
    pendingPay: orders.filter((order) => order.status === "待支付").length,
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
  const [orders, reservations, signups, events, rooms] = await Promise.all([
    readCollection("orders", { orderBy: "createdAt", limit: DASHBOARD_READ_LIMIT }),
    readCollection("reservations", { orderBy: "createdAt", limit: DASHBOARD_READ_LIMIT }),
    readCollection("event_signups", { orderBy: "createdAt", limit: DASHBOARD_READ_LIMIT }),
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
        pendingReservations: reservations.filter((item) => item.status === "待确认").length,
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
}

async function listCustomers(event) {
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

async function globalSearch(event, role) {
  const keyword = cleanText(event.keyword, 80);
  if (keyword.length < 2) {
    return { ok: true, keyword, groups: [], message: "请输入至少 2 个字符" };
  }
  const searchEvent = { keyword, page: 1, pageSize: 5 };
  const tasks = [
    {
      permission: "order.read",
      run: async () => {
        const result = await readCollectionPage("orders", {
          keyword,
          keywordFields: ["orderNo", "name", "contactName", "consignee", "phone", "mobile", "status"],
          orderBy: "createdAt",
          event: searchEvent
        });
        return searchGroup("orders", "orders", "订单", result, result.items.map((order) => searchItem(
          order._id,
          `订单 ${order.orderNo || order._id}`,
          compactSearchText([maskName(order.name || order.contactName || order.consignee), maskPhone(order.phone || order.mobile), `¥${number(order.total)}`]),
          order.status || order.payStatus,
          dateKey(order.createdAt),
          keyword
        )));
      }
    },
    {
      permission: "afterSale.read",
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
      permission: "reservation.read",
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
      permission: "signup.read",
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
      permission: "customer.read",
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
      permission: "inventory.read",
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
      permission: "audit.read",
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
      permission: "notification.read",
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
    if (!hasRolePermission(role, task.permission)) {
      continue;
    }
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
    room: "禾熙书茶空间",
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

async function listAdminRoles() {
  await ensureCollection("admin_roles");
  const roles = await readCollection("admin_roles", { orderBy: "createdAt", limit: 100 });
  return {
    ok: true,
    roles,
    presets: Object.keys(rolePermissionMap).map((key) => ({
      key,
      label: roleLabels[key],
      permissions: rolePermissionMap[key]
    }))
  };
}

async function saveAdminRole(event, caller) {
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const reason = requireAuditReason(event, "保存角色权限");
  const roleKey = normalizeRoleKey(data.roleKey);
  const payload = {
    id: cleanId(data.id || data.subject || data.username || data.uid || data.openid, "role"),
    subject: cleanText(data.subject || data.username || data.uid || data.openid, 120),
    subjectType: cleanText(data.subjectType, 20) || "username",
    displayName: cleanText(data.displayName, 80),
    roleKey,
    roleName: roleLabels[roleKey],
    permissions: normalizePermissionList(data.permissions, roleKey),
    disabled: data.disabled === true
  };
  if (!payload.subject) {
    return { ok: false, message: "请填写角色账号标识" };
  }
  const existing = await findRecord("admin_roles", "id", payload.id);
  await upsertRecord("admin_roles", "id", payload.id, payload);
  await writeAdminAuditLog(caller, "saveAdminRole", {
    subject: payload.subject,
    subjectType: payload.subjectType,
    displayName: payload.displayName,
    roleKey: payload.roleKey,
    disabled: payload.disabled,
    reason,
    changes: auditDiff(existing || {}, payload, ["subject", "subjectType", "displayName", "roleKey", "roleName", "permissions", "disabled"])
  });
  return { ok: true, role: payload };
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
  const [auditCount, notificationCount, backupCount, roleCount, latestBackupResult, catalogCounts] = await Promise.all([
    countCollection("admin_audit_logs"),
    countCollection("notification_logs"),
    countCollection("data_backup_logs"),
    countCollection("admin_roles"),
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
    ),
    statusItem(
      "adminRoles",
      "角色权限",
      roleCount ? "ok" : "warn",
      roleCount ? `已配置 ${roleCount} 个角色` : "未配置角色时，白名单账号默认按管理员处理"
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
    reason
  });
  return {
    ok: true,
    url,
    cloudPath: record.cloudPath || "",
    size: record.size || 0,
    expireIn: 7200
  };
}

function adminProfile(role) {
  return {
    roleKey: role.roleKey,
    roleName: role.roleName,
    permissions: role.permissions || [],
    source: role.source || "admin_roles",
    disabled: role.disabled === true
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
  try {
    const upload = await cloud.uploadFile({ cloudPath, fileContent });
    await ensureCollection("data_backup_logs");
    await db.collection("data_backup_logs").add({
      data: {
        cloudPath,
        fileId: upload.fileID || upload.fileId || "",
        size: fileContent.length,
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

function addTrend(bucket, key, amount) {
  if (!bucket[key]) {
    bucket[key] = 0;
  }
  bucket[key] += amount;
}

async function getAnalytics() {
  const [orders, reservations, signups] = await Promise.all([
    readCollection("orders", { orderBy: "createdAt", limit: ANALYTICS_READ_LIMIT }),
    readCollection("reservations", { orderBy: "createdAt", limit: ANALYTICS_READ_LIMIT }),
    readCollection("event_signups", { orderBy: "createdAt", limit: ANALYTICS_READ_LIMIT })
  ]);
  const revenueOrders = orders.filter(isRevenueOrder);
  const byDay = {};
  const byCategory = {};
  const topItems = {};

  revenueOrders.forEach((order) => {
    addTrend(byDay, dateKey(order.createdAt), number(order.total));
    (order.items || []).forEach((item) => {
      const category = item.type === "drink" ? "茶饮" : "茶品";
      addTrend(byCategory, category, number(item.lineTotal || item.price * item.quantity));
      if (!topItems[item.name]) {
        topItems[item.name] = { name: item.name, type: category, amount: 0, count: 0 };
      }
      topItems[item.name].amount += number(item.lineTotal || item.price * item.quantity);
      topItems[item.name].count += number(item.quantity);
    });
  });

  const trend = Object.keys(byDay).sort().slice(-14).map((key) => ({ date: key, amount: byDay[key] }));
  const categories = Object.keys(byCategory).map((name) => ({ name, amount: byCategory[name] }))
    .sort((a, b) => b.amount - a.amount);

  return {
    ok: true,
    analytics: {
      summary: {
        revenue: revenueOrders.reduce((sum, order) => sum + number(order.total), 0),
        orders: revenueOrders.length,
        totalOrders: orders.length,
        reservations: reservations.filter((item) => item.status !== "已取消").length,
        signups: signups.filter((item) => item.status !== "已取消").length,
        averageOrder: revenueOrders.length
          ? Math.round(revenueOrders.reduce((sum, order) => sum + number(order.total), 0) / revenueOrders.length)
          : 0
      },
      trend,
      categories,
      topItems: Object.values(topItems).sort((a, b) => b.amount - a.amount).slice(0, 10),
      scope: {
        limit: ANALYTICS_READ_LIMIT,
        ordersRead: orders.length,
        reservationsRead: reservations.length,
        signupsRead: signups.length,
        limited: orders.length >= ANALYTICS_READ_LIMIT || reservations.length >= ANALYTICS_READ_LIMIT || signups.length >= ANALYTICS_READ_LIMIT
      }
    }
  };
}

function normalizeContent(data = {}) {
  return {
    key: cleanId(data.key, "content"),
    type: cleanText(data.type, 30) || "home_carousel",
    title: cleanText(data.title, 80),
    subtitle: cleanText(data.subtitle, 100),
    summary: cleanText(data.summary, 300),
    image: cleanText(data.image, 240),
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

function normalizeCoupon(data = {}) {
  return {
    id: cleanId(data.id, "coupon"),
    name: cleanText(data.name, 80),
    description: cleanText(data.description, 160),
    amount: Math.max(0, Number(data.amount) || 0),
    threshold: Math.max(0, Number(data.threshold) || 0),
    stock: Math.max(0, Number(data.stock) || 0),
    issued: Math.max(0, Number(data.issued) || 0),
    redeemed: Math.max(0, Number(data.redeemed) || 0),
    claimLimit: Math.max(1, Number(data.claimLimit) || 1),
    startAt: cleanText(data.startAt, 30),
    endAt: cleanText(data.endAt, 30),
    status: cleanText(data.status, 20) || "领取中",
    visible: data.visible !== false
  };
}

function normalizeCampaign(data = {}) {
  return {
    id: cleanId(data.id, "campaign"),
    name: cleanText(data.name, 80),
    type: cleanText(data.type, 30) || "banner",
    summary: cleanText(data.summary, 200),
    startAt: cleanText(data.startAt, 30),
    endAt: cleanText(data.endAt, 30),
    status: cleanText(data.status, 20) || "进行中",
    visible: data.visible !== false
  };
}

async function listMarketing() {
  const [coupons, campaigns, userCoupons, orders] = await Promise.all([
    readCollection("coupons", { orderBy: "createdAt", limit: 100 }),
    readCollection("marketing_campaigns", { orderBy: "createdAt", limit: 100 }),
    readCollection("user_coupons", { orderBy: "createdAt", limit: MARKETING_STATS_LIMIT }),
    readCollection("orders", { orderBy: "createdAt", limit: MARKETING_STATS_LIMIT })
  ]);
  const couponStats = coupons.map((coupon) => {
    const claims = userCoupons.filter((item) => item.couponId === coupon.id);
    const redeemed = claims.filter((item) => item.status === "已使用");
    const couponOrders = orders.filter((order) => order.coupon && order.coupon.couponId === coupon.id && isRevenueOrder(order));
    const orderAmount = couponOrders.reduce((sum, order) => sum + number(order.total), 0);
    return {
      id: coupon.id,
      name: coupon.name,
      claimed: claims.length,
      redeemed: redeemed.length,
      available: claims.filter((item) => item.status === "可使用").length,
      locked: claims.filter((item) => item.status === "锁定中").length,
      redeemRate: claims.length ? Math.round((redeemed.length / claims.length) * 1000) / 10 : 0,
      orderAmount,
      discountAmount: couponOrders.reduce((sum, order) => sum + number(order.couponDiscount || order.coupon && order.coupon.discount), 0)
    };
  });
  return {
    ok: true,
    coupons,
    campaigns,
    couponStats,
    scope: {
      limit: MARKETING_STATS_LIMIT,
      couponsRead: coupons.length,
      campaignsRead: campaigns.length,
      userCouponsRead: userCoupons.length,
      ordersRead: orders.length,
      limited: userCoupons.length >= MARKETING_STATS_LIMIT || orders.length >= MARKETING_STATS_LIMIT
    }
  };
}

async function saveCoupon(event, caller) {
  const data = event.data || {};
  const payload = normalizeCoupon(event.data || {});
  if (!payload.name || !payload.amount) {
    return { ok: false, message: "请填写优惠券名称和面额" };
  }
  if (payload.threshold > 0 && payload.amount > payload.threshold) {
    return { ok: false, message: "优惠金额不能大于使用门槛" };
  }
  assertDateRange(payload.startAt, payload.endAt, "优惠券");
  const existing = await findRecord("coupons", "id", payload.id);
  if (existing) {
    if (data.issued === undefined) {
      payload.issued = number(existing.issued);
    }
    if (data.redeemed === undefined) {
      payload.redeemed = number(existing.redeemed);
    }
  }
  if (payload.redeemed > payload.issued) {
    return { ok: false, message: "优惠券核销数不能大于领取数" };
  }
  if (payload.stock > 0 && payload.issued > payload.stock) {
    return { ok: false, message: "优惠券库存不能小于已领取数量，0 表示不限量" };
  }
  await upsertRecord("coupons", "id", payload.id, payload);
  await writeAdminAuditLog(caller, "saveCoupon", {
    id: payload.id,
    name: payload.name,
    amount: payload.amount,
    stock: payload.stock,
    changes: auditDiff(existing || {}, payload, ["name", "description", "amount", "threshold", "stock", "claimLimit", "startAt", "endAt", "status", "visible"])
  });
  return { ok: true, id: payload.id };
}

async function saveCampaign(event, caller) {
  const payload = normalizeCampaign(event.data || {});
  if (!payload.name) {
    return { ok: false, message: "请填写营销计划名称" };
  }
  assertDateRange(payload.startAt, payload.endAt, "营销计划");
  const existing = await findRecord("marketing_campaigns", "id", payload.id);
  await upsertRecord("marketing_campaigns", "id", payload.id, payload);
  await writeAdminAuditLog(caller, "saveCampaign", {
    id: payload.id,
    name: payload.name,
    status: payload.status,
    changes: auditDiff(existing || {}, payload, ["name", "type", "summary", "startAt", "endAt", "status", "visible"])
  });
  return { ok: true, id: payload.id };
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
    brandName: cleanText(data.brandName, 80) || "禾熙 HEXI TEA",
    slogan: cleanText(data.slogan, 120),
    storeName: cleanText(data.storeName, 80),
    address: cleanText(data.address, 160),
    phone: cleanText(data.phone, 40),
    businessHours: cleanText(data.businessHours, 160),
    reservationRule: cleanText(data.reservationRule, 300),
    memberPointRate: Math.max(0, Number(data.memberPointRate) || 1),
    levelOneName: cleanText(data.levelOneName, 20) || "雅客会员",
    levelOneMinSpend: Math.max(0, Number(data.levelOneMinSpend) || 0),
    levelOneDiscountRate: Math.min(1, Math.max(0.01, Number(data.levelOneDiscountRate) || 0.98)),
    levelTwoName: cleanText(data.levelTwoName, 20) || "臻享会员",
    levelTwoMinSpend: Math.max(0, Number(data.levelTwoMinSpend) || 1600),
    levelTwoDiscountRate: Math.min(1, Math.max(0.01, Number(data.levelTwoDiscountRate) || 0.95)),
    levelThreeName: cleanText(data.levelThreeName, 20) || "山房会员",
    levelThreeMinSpend: Math.max(0, Number(data.levelThreeMinSpend) || 5000),
    levelThreeDiscountRate: Math.min(1, Math.max(0.01, Number(data.levelThreeDiscountRate) || 0.92)),
    orderPaidTemplateId: cleanText(data.orderPaidTemplateId, 80),
    orderPaidPage: cleanText(data.orderPaidPage, 120) || "pages/profile/index",
    orderShippedTemplateId: cleanText(data.orderShippedTemplateId, 80),
    orderShippedPage: cleanText(data.orderShippedPage, 120) || "pages/profile/index",
    reservationTemplateId: cleanText(data.reservationTemplateId, 80),
    reservationNoticePage: cleanText(data.reservationNoticePage, 120) || "pages/reservation/index",
    eventTemplateId: cleanText(data.eventTemplateId, 80),
    eventNoticePage: cleanText(data.eventNoticePage, 120) || "pages/events/index",
    paymentEnabled: data.paymentEnabled !== false,
    pickupEnabled: data.pickupEnabled !== false,
    shippingEnabled: data.shippingEnabled !== false,
    orderNoticeEnabled: data.orderNoticeEnabled !== false,
    reservationNoticeEnabled: data.reservationNoticeEnabled !== false,
    eventNoticeEnabled: data.eventNoticeEnabled !== false
  };
}

async function getSettings() {
  const existing = await findRecord("store_settings", "key", "store");
  return {
    ok: true,
    settings: existing || normalizeSettings({})
  };
}

function validateSettingsInput(data = {}, payload = {}) {
  [
    ["memberPointRate", "积分倍率", 0, undefined],
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
    ["reservationNoticePage", "预约通知跳转页"],
    ["eventNoticePage", "活动通知跳转页"]
  ].forEach(([field, label]) => assertSafeTextRef(payload[field], label));
}

async function updateSettings(event, caller) {
  const existing = await findRecord("store_settings", "key", "store");
  const data = event.data || {};
  const reason = requireAuditReason(event, "保存系统设置");
  const payload = normalizeSettings(data);
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
      "memberPointRate",
      "paymentEnabled",
      "orderNoticeEnabled",
      "reservationNoticeEnabled",
      "eventNoticeEnabled"
    ])
  });
  return { ok: true, settings: payload };
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "manageOperations" };
  }

  const action = cleanText(event.action, 40) || "getSummary";
  let caller = { openid: "", uid: "", username: "" };
  try {
    caller = await getCaller();
    assertAdmin(caller);
    const role = await getAdminRole(caller);

    await requirePermissionWithAudit(role, actionPermissions[action], caller, action);
    if (event.exportAll) {
      await requirePermissionWithAudit(role, "export.read", caller, action, { exportAll: true });
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
        admin: adminProfile(role)
      };
    }
    if (action === "getSummary") {
      return await getSummary();
    }
    if (action === "getDashboard") {
      return await getDashboard();
    }
    if (action === "globalSearch") {
      return await globalSearch(event, role);
    }
    if (action === "listOrders") {
      const result = await listCollection("orders", status, keyword, event, ["orderNo", "name", "contactName", "consignee", "phone", "mobile", "status"]);
      await writeExportAuditLog(caller, event, action, "订单", result.page);
      return { ok: true, orders: result.items, page: result.page };
    }
    if (action === "cancelOrder") {
      return await cancelOrder(event, caller);
    }
    if (action === "markShipped") {
      return await markShipped(event, caller);
    }
    if (action === "markPickupDone") {
      return await markPickupDone(event, caller);
    }
    if (action === "listReservations") {
      const result = await listCollection("reservations", status, keyword, event, ["room", "roomName", "name", "customerName", "phone", "mobile", "status"]);
      await writeExportAuditLog(caller, event, action, "预约", result.page);
      return { ok: true, reservations: result.items, page: result.page };
    }
    if (action === "updateReservation") {
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
    if (action === "listAfterSales") {
      const response = await listAfterSales(event);
      await writeExportAuditLog(caller, event, action, "售后", response.page);
      return response;
    }
    if (action === "updateAfterSale") {
      return await updateAfterSale(event, caller);
    }
    if (action === "getAnalytics") {
      return await getAnalytics();
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
    if (action === "listMarketing") {
      return await listMarketing();
    }
    if (action === "saveCoupon") {
      return await saveCoupon(event, caller);
    }
    if (action === "saveCampaign") {
      return await saveCampaign(event, caller);
    }
    if (action === "disableCoupon") {
      return await disableRecord("coupons", event.id, caller);
    }
    if (action === "disableCampaign") {
      return await disableRecord("marketing_campaigns", event.id, caller);
    }
    if (action === "getSettings") {
      return await getSettings();
    }
    if (action === "updateSettings") {
      return await updateSettings(event, caller);
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
    if (action === "listAdminRoles") {
      return await listAdminRoles();
    }
    if (action === "saveAdminRole") {
      return await saveAdminRole(event, caller);
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
    if ((error.code === "NO_PERMISSION" || error.code === "ROLE_PERMISSION_DENIED") && !error.permissionDeniedAudited) {
      await writePermissionDeniedAudit(caller, action, "", {
        extra: {
          code: error.code || "",
          message: error.message || ""
        }
      });
    }
    return {
      ok: false,
      code: error.code || "MANAGE_OPERATIONS_ERROR",
      message: error.message || "后台操作失败"
    };
  }
};
