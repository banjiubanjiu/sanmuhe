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
  events: "events"
};

const writeActions = new Set(["create", "update", "delete", "restore"]);
const rolePermissionMap = {
  admin: ["*"],
  operator: ["catalog.read", "catalog.write"],
  clerk: ["catalog.read"]
};
const roleLabels = {
  admin: "管理员",
  operator: "运营",
  clerk: "店员"
};

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
  const text = cleanText(value, 300);
  if (!text) {
    return;
  }
  if (/[\r\n]/.test(text) || /^(javascript|data|vbscript):/i.test(text)) {
    invalidInput(`${label}格式不安全`);
  }
}

function assertImageRef(value, label) {
  const text = cleanText(value, 300);
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
  return ["list", "get", "create", "update", "delete", "restore"].includes(value) ? value : "";
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

async function getCaller(context = {}) {
  const wxContext = cloud.getWXContext();
  const contextUser = context && context.userInfo && typeof context.userInfo === "object"
    ? context.userInfo
    : {};
  const caller = {
    openid: wxContext.OPENID || "",
    uid: cleanText(contextUser.uid || contextUser.userId, 120),
    username: cleanText(contextUser.username || contextUser.userInfo && contextUser.userInfo.username, 120)
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

function roleSubjectMatches(role, caller) {
  const subject = cleanText(role.subject, 120);
  return subject && (subject === caller.uid || subject === caller.username || subject === caller.openid);
}

function normalizeRoleKey(value) {
  const key = cleanText(value, 30) || "clerk";
  return rolePermissionMap[key] ? key : "clerk";
}

async function getAdminRole(caller) {
  await ensureCollection("admin_roles");
  const result = await db.collection("admin_roles")
    .limit(100)
    .get();
  const role = (result.data || []).find((item) => roleSubjectMatches(item, caller));
  if (role && role.disabled === true) {
    return { roleKey: "disabled", roleName: "已停用", permissions: [], disabled: true };
  }
  if (!role) {
    return { roleKey: "admin", roleName: roleLabels.admin, permissions: rolePermissionMap.admin };
  }
  const roleKey = normalizeRoleKey(role.roleKey);
  return {
    roleKey,
    roleName: role.roleName || roleLabels[roleKey],
    permissions: Array.isArray(role.permissions) && role.permissions.length ? role.permissions : rolePermissionMap[roleKey]
  };
}

function requirePermission(role, permission) {
  const permissions = role && Array.isArray(role.permissions) ? role.permissions : [];
  if (permissions.includes("*") || permissions.includes(permission)) {
    return;
  }
  const error = new Error("当前后台角色无权修改商品和活动数据");
  error.code = "ROLE_PERMISSION_DENIED";
  throw error;
}

function hasRolePermission(role, permission) {
  if (!permission) {
    return true;
  }
  const permissions = role && Array.isArray(role.permissions) ? role.permissions : [];
  return permissions.includes("*") || permissions.includes(permission);
}

async function writePermissionDeniedAudit(caller = {}, attemptedAction, requiredPermission, detail = {}) {
  try {
    await writeAdminAuditLog(caller, "permissionDenied", {
      attemptedAction: cleanText(attemptedAction, 60),
      requiredPermission: cleanText(requiredPermission, 80),
      collection: cleanText(detail.collection, 40),
      roleKey: cleanText(detail.role && detail.role.roleKey, 30),
      roleName: cleanText(detail.role && detail.role.roleName, 40),
      reason: "权限拦截"
    });
  } catch (error) {
    // Permission denial should never fail the original response path.
  }
}

async function requirePermissionWithAudit(role, permission, caller, attemptedAction, detail = {}) {
  if (hasRolePermission(role, permission)) {
    return;
  }
  await writePermissionDeniedAudit(caller, attemptedAction, permission, Object.assign({}, detail, { role }));
  const error = new Error("当前后台角色无权修改商品和活动数据");
  error.code = "ROLE_PERMISSION_DENIED";
  error.permissionDeniedAudited = true;
  throw error;
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
    "thumb"
  ];

  for (const field of stringFields) {
    if (source[field] !== undefined) {
      data[field] = cleanText(source[field], field === "summary" || field === "detail" ? 500 : 120);
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
  if (Array.isArray(source.temps)) {
    data.temps = source.temps.slice(0, 8).map((item) => cleanText(item, 20)).filter(Boolean);
  }
  if (Array.isArray(source.sugars)) {
    data.sugars = source.sugars.slice(0, 8).map((item) => cleanText(item, 20)).filter(Boolean);
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
      return {
        label,
        weight: cleanText(item.weight, 20),
        price: Math.max(0, Number(item.price) || 0),
        stockUnits: Math.max(1, Number(item.stockUnits) || 1)
      };
    }).filter(Boolean);
  }
  if (source.year !== undefined) {
    data.year = cleanText(source.year, 20);
  }

  if (collection !== "events" && data.visible === undefined) {
    data.visible = true;
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

  if (collection === "events") {
    const quota = payload.quota !== undefined ? payload.quota : Number(existing.quota || 1);
    const signed = payload.signed !== undefined ? payload.signed : Number(existing.signed || 0);
    if (signed > quota) {
      invalidInput("已报名不能大于名额");
    }
  }
}

function withInventory(item) {
  if (!item || item.stock === undefined || item.stock === null || item.stock === "") {
    return item;
  }
  const stock = Math.max(0, Number(item.stock) || 0);
  const lockedStock = Math.max(0, Number(item.lockedStock) || 0);
  const soldStock = Math.max(0, Number(item.soldStock) || 0);
  return Object.assign({}, item, {
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
  await ensureCollection(collection);
  const result = await db.collection(collection).limit(100).get();
  const includeHidden = options && options.includeHidden;
  const items = (result.data || []).filter((item) => {
    if (includeHidden) {
      return true;
    }
    if (collection === "events") {
      return item.deleted !== true && item.visible !== false;
    }
    return item.visible !== false;
  }).map(withInventory);
  return sortCatalog(items);
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

    if (writeActions.has(action) || includeHidden) {
      try {
        assertCanWrite(caller);
      } catch (error) {
        await writePermissionDeniedAudit(caller, action, "catalog.write", {
          collection,
          role: { roleKey: "not-admin", roleName: "非管理员" }
        });
        error.permissionDeniedAudited = true;
        throw error;
      }
    }
    const role = await getAdminRole(caller);
    await requirePermissionWithAudit(role, writeActions.has(action) ? "catalog.write" : "catalog.read", caller, action, { collection });

    if (action === "list") {
      const items = await listItems(collection, { includeHidden });
      return { ok: true, collection, items };
    }

    const id = cleanText(event.id || (event.data && event.data.id), 80);
    if (!id && action !== "create") {
      return { ok: false, message: "缺少数据 id" };
    }

    await ensureCollection(collection);

    if (action === "get") {
      const item = await findByBusinessId(collection, id);
      if (item && item.visible === false && !event.includeHidden) {
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
      return { ok: true, collection, id: payload.id, _id: addResult._id };
    }

    const existing = await findByBusinessId(collection, id);
    if (!existing) {
      return { ok: false, message: "数据不存在" };
    }

    if (action === "update") {
      const payload = normalizePayload(collection, event.data || {});
      delete payload.id;
      validateCatalogPayload(collection, payload, event.data || {}, { existing });
      const sensitiveFields = changedSensitiveCatalogFields(existing, payload);
      const reason = sensitiveFields.length ? requireAuditReason(event, "修改价格、库存、名额或状态") : cleanAuditReason(event);
      if ((collection === "drinks" || collection === "tea_products") && payload.stock !== undefined) {
        const lockedStock = Math.max(0, Number(existing.lockedStock) || 0);
        const soldStock = Math.max(0, Number(existing.soldStock) || 0);
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
      return { ok: true, collection, id };
    }

    if (action === "delete") {
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
      return { ok: true, collection, id };
    }

    if (action === "restore") {
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
      return { ok: true, collection, id };
    }

    return { ok: false, message: "未知操作" };
  } catch (error) {
    if ((error.code === "NO_PERMISSION" || error.code === "ROLE_PERMISSION_DENIED") && !error.permissionDeniedAudited) {
      await writePermissionDeniedAudit(caller, action, "", { collection });
    }
    return {
      ok: false,
      code: error.code || "MANAGE_CATALOG_ERROR",
      message: error.message || "商品和活动管理失败"
    };
  }
};
