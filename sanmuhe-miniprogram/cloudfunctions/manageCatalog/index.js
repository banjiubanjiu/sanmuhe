const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const allowedCollections = {
  drinks: "drinks",
  tea_products: "tea_products",
  rooms: "rooms",
  events: "events"
};

const writeActions = new Set(["create", "update", "delete", "restore"]);

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
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

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after the first setup.
  }
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

exports.main = async (event = {}) => {
  const action = normalizeAction(event.action);
  const collection = normalizeCollection(event.collection);

  if (!action || !collection) {
    return {
      ok: false,
      message: "参数错误：action 或 collection 不支持"
    };
  }

  try {
    const caller = await getCaller();
    const includeHidden = !!event.includeHidden;

    if (writeActions.has(action) || includeHidden) {
      assertCanWrite(caller);
    }

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
      return { ok: true, collection, id: payload.id, _id: addResult._id };
    }

    const existing = await findByBusinessId(collection, id);
    if (!existing) {
      return { ok: false, message: "数据不存在" };
    }

    if (action === "update") {
      const payload = normalizePayload(collection, event.data || {});
      delete payload.id;
      if ((collection === "drinks" || collection === "tea_products") && payload.stock !== undefined) {
        const lockedStock = Math.max(0, Number(existing.lockedStock) || 0);
        const soldStock = Math.max(0, Number(existing.soldStock) || 0);
        if (payload.stock < lockedStock + soldStock) {
          return { ok: false, message: "总库存不能小于已锁定和已售数量" };
        }
      }
      payload.updatedAt = db.serverDate();
      await db.collection(collection).doc(existing._id).update({ data: payload });
      return { ok: true, collection, id };
    }

    if (action === "delete") {
      const data = collection === "events"
        ? { deleted: true, visible: false, updatedAt: db.serverDate() }
        : { visible: false, updatedAt: db.serverDate() };
      await db.collection(collection).doc(existing._id).update({ data });
      return { ok: true, collection, id };
    }

    if (action === "restore") {
      const data = collection === "events"
        ? { deleted: false, visible: true, updatedAt: db.serverDate() }
        : { visible: true, updatedAt: db.serverDate() };
      await db.collection(collection).doc(existing._id).update({ data });
      return { ok: true, collection, id };
    }

    return { ok: false, message: "未知操作" };
  } catch (error) {
    return {
      ok: false,
      code: error.code || "MANAGE_CATALOG_ERROR",
      message: error.message || "商品和活动管理失败"
    };
  }
};
