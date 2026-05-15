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

function parseAdmins() {
  return String(process.env.ADMIN_OPENIDS || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertCanWrite(openid) {
  const admins = parseAdmins();
  if (admins.length && !admins.includes(openid)) {
    const error = new Error("无权修改商品和活动数据");
    error.code = "NO_PERMISSION";
    throw error;
  }
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

async function listItems(collection) {
  await ensureCollection(collection);
  const result = await db.collection(collection).limit(100).get();
  const items = (result.data || []).filter((item) => {
    if (collection === "events") {
      return item.deleted !== true && item.visible !== false;
    }
    return item.visible !== false;
  });
  return sortCatalog(items);
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const action = normalizeAction(event.action);
  const collection = normalizeCollection(event.collection);

  if (!action || !collection) {
    return {
      ok: false,
      message: "参数错误：action 或 collection 不支持"
    };
  }

  try {
    if (writeActions.has(action)) {
      assertCanWrite(OPENID);
    }

    if (action === "list") {
      const items = await listItems(collection);
      return { ok: true, collection, items };
    }

    const id = cleanText(event.id || (event.data && event.data.id), 80);
    if (!id && action !== "create") {
      return { ok: false, message: "缺少数据 id" };
    }

    await ensureCollection(collection);

    if (action === "get") {
      const item = await findByBusinessId(collection, id);
      return { ok: !!item, collection, item: item || null };
    }

    if (action === "create") {
      const payload = normalizePayload(collection, event.data || {});
      payload.id = payload.id || `${collection}-${Date.now()}`;
      payload._openid = OPENID;
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
