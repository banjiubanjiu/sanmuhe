const cloud = require("wx-server-sdk");
const seed = require("./frontendSeed.json");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function cleanText(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseList(value) {
  return String(value || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function requireSeedReason(event = {}) {
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const reason = cleanText(event.reason || event.auditReason || event.adminNote || data.reason || data.auditReason, 200);
  if (!reason) {
    const error = new Error("同步前台基础资料需填写操作原因");
    error.code = "INVALID_INPUT";
    throw error;
  }
  return reason;
}

function maskRef(value) {
  const text = cleanText(value, 80);
  if (!text) return "";
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text;
}

function safeJson(value, maxLength = 1000) {
  try {
    return cleanText(JSON.stringify(value || {}), maxLength);
  } catch (error) {
    return "{}";
  }
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
  if (!auth) return caller;
  try {
    const userInfo = typeof auth.getUserInfo === "function" ? auth.getUserInfo() : {};
    caller.uid = userInfo.uid || userInfo.userInfo && userInfo.userInfo.uid || "";
    caller.username = userInfo.username || userInfo.userInfo && userInfo.userInfo.username || "";
  } catch (error) {
    // Ignore and fall back to OpenID whitelist.
  }
  if (caller.uid && !caller.username && typeof auth.getEndUserInfo === "function") {
    try {
      const detail = await auth.getEndUserInfo(caller.uid);
      const info = detail.userInfo || detail.data && detail.data.userInfo || {};
      caller.username = info.username || info.email || caller.username;
    } catch (error) {
      // UID whitelist remains sufficient when detailed lookup is unavailable.
    }
  }
  return caller;
}

async function assertSeedAllowed() {
  const caller = await getCaller();
  if (String(process.env.SEED_DEMO_ENABLED || "").toLowerCase() === "true") {
    return { caller, source: "SEED_DEMO_ENABLED" };
  }
  const openids = parseList(process.env.ADMIN_OPENIDS);
  const uids = parseList(process.env.ADMIN_UIDS);
  const usernames = parseList(process.env.ADMIN_USERNAMES);
  const allowed =
    (caller.openid && openids.includes(caller.openid)) ||
    (caller.uid && uids.includes(caller.uid)) ||
    (caller.username && usernames.includes(caller.username));
  if (allowed) {
    return { caller, source: "admin_whitelist" };
  }
  const error = new Error("前台基础资料同步已关闭，仅管理员或显式开启 SEED_DEMO_ENABLED=true 后可执行");
  error.code = "SEED_DEMO_FORBIDDEN";
  throw error;
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after first setup.
  }
}

async function writeAdminAuditLog(caller, action, detail) {
  const safeDetail = detail || {};
  await ensureCollection("admin_audit_logs");
  await db.collection("admin_audit_logs").add({
    data: {
      action,
      adminOpenid: maskRef(caller.openid),
      adminUid: caller.uid ? maskRef(caller.uid) : "",
      detail: safeDetail,
      detailText: safeJson(safeDetail),
      createdAt: db.serverDate()
    }
  });
}

function keyBy(items, field) {
  return (items || []).reduce((map, item) => {
    if (item && item[field]) {
      map[item[field]] = item;
    }
    return map;
  }, {});
}

function preserveRuntimeFields(collection, existing, next) {
  const data = Object.assign({}, next, {
    seedVersion: seed.version
  });

  if (collection === "tea_products" || collection === "drinks") {
    if (existing && existing.lockedStock !== undefined) {
      data.lockedStock = existing.lockedStock;
    } else if (next.stock !== undefined) {
      data.lockedStock = 0;
    }
    if (existing && existing.soldStock !== undefined) {
      data.soldStock = existing.soldStock;
    } else if (next.stock !== undefined) {
      data.soldStock = 0;
    }
  }

  return data;
}

async function syncCollection(collection, docs, options = {}) {
  await ensureCollection(collection);
  const existingResult = await db.collection(collection).limit(1000).get();
  const existingItems = existingResult.data || [];
  const existingById = keyBy(existingItems, "id");
  const incomingIds = new Set(docs.map((item) => item.id).filter(Boolean));
  const summary = { collection, created: 0, updated: 0, deactivated: 0 };

  if (options.deactivateMissing) {
    for (const item of existingItems) {
      if (!item.id || incomingIds.has(item.id)) {
        continue;
      }
      // events：历史用 deleted；rooms：多店演示要软删除，避免后台 includeHidden 仍列出
      let data;
      if (collection === "events") {
        data = { visible: false, deleted: true, seedVersion: seed.version, updatedAt: db.serverDate() };
      } else if (collection === "rooms") {
        data = {
          visible: false,
          removed: true,
          status: "暂停预约",
          seedVersion: seed.version,
          updatedAt: db.serverDate()
        };
      } else {
        data = { visible: false, seedVersion: seed.version, updatedAt: db.serverDate() };
      }
      await db.collection(collection).doc(item._id).update({ data });
      summary.deactivated += 1;
    }
  }

  for (const doc of docs) {
    const existing = existingById[doc.id];
    const data = preserveRuntimeFields(collection, existing, doc);

    if (existing) {
      await db.collection(collection).doc(existing._id).update({
        data: Object.assign({}, data, {
          updatedAt: db.serverDate()
        })
      });
      summary.updated += 1;
      continue;
    }

    await db.collection(collection).add({
      data: Object.assign({}, data, {
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      })
    });
    summary.created += 1;
  }

  return summary;
}

async function syncContentBlocks() {
  const collection = "content_blocks";
  const docs = seed.content_blocks || [];
  await ensureCollection(collection);
  const existingResult = await db.collection(collection).where({ type: "home_carousel" }).limit(1000).get();
  const existingItems = existingResult.data || [];
  const existingByKey = keyBy(existingItems, "key");
  const incomingKeys = new Set(docs.map((item) => item.key).filter(Boolean));
  const summary = { collection, created: 0, updated: 0, deactivated: 0 };

  for (const item of existingItems) {
    if (!item.key || incomingKeys.has(item.key)) {
      continue;
    }
    await db.collection(collection).doc(item._id).update({
      data: {
        visible: false,
        seedVersion: seed.version,
        updatedAt: db.serverDate()
      }
    });
    summary.deactivated += 1;
  }

  for (const doc of docs) {
    const existing = existingByKey[doc.key];
    const data = Object.assign({}, doc, { seedVersion: seed.version });
    if (existing) {
      await db.collection(collection).doc(existing._id).update({
        data: Object.assign({}, data, {
          updatedAt: db.serverDate()
        })
      });
      summary.updated += 1;
      continue;
    }
    await db.collection(collection).add({
      data: Object.assign({}, data, {
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      })
    });
    summary.created += 1;
  }

  return summary;
}

async function syncStoreSettings() {
  const collection = "store_settings";
  await ensureCollection(collection);
  const result = await db.collection(collection).where({ key: "store" }).limit(1).get();
  const existing = result.data && result.data[0];
  const data = Object.assign({}, existing || {}, seed.store_settings || {}, {
    key: "store",
    seedVersion: seed.version,
    updatedAt: db.serverDate()
  });
  delete data._id;

  if (existing) {
    await db.collection(collection).doc(existing._id).update({ data });
    return { collection, created: 0, updated: 1 };
  }

  await db.collection(collection).add({
    data: Object.assign({}, data, {
      createdAt: db.serverDate()
    })
  });
  return { collection, created: 1, updated: 0 };
}

function summarizeResults(results) {
  return (results || []).reduce((summary, item) => {
    summary.created += Number(item.created || 0);
    summary.updated += Number(item.updated || 0);
    summary.deactivated += Number(item.deactivated || 0);
    return summary;
  }, { created: 0, updated: 0, deactivated: 0 });
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "seedDemoData" };
  }

  const reason = requireSeedReason(event);
  const auth = await assertSeedAllowed();
  const startedAt = Date.now();
  await writeAdminAuditLog(auth.caller, "syncFrontendSeedDataStarted", {
    reason,
    seedVersion: seed.version,
    source: auth.source
  });

  const results = [];

  try {
    for (const [collection, docs] of Object.entries(seed.collections || {})) {
      // rooms 以后台运营维护为准：种子只 upsert 基准条目，不因种子缺项而软删运营新建茶室
      const deactivateMissing = collection !== "rooms";
      results.push(await syncCollection(collection, docs, { deactivateMissing }));
    }

    results.push(await syncContentBlocks());
    results.push(await syncStoreSettings());

    const summary = summarizeResults(results);
    await writeAdminAuditLog(auth.caller, "syncFrontendSeedData", {
      reason,
      seedVersion: seed.version,
      source: auth.source,
      summary,
      results,
      durationMs: Date.now() - startedAt
    });

    return {
      ok: true,
      seedVersion: seed.version,
      summary,
      results
    };
  } catch (error) {
    await writeAdminAuditLog(auth.caller, "syncFrontendSeedDataFailed", {
      reason,
      seedVersion: seed.version,
      source: auth.source,
      error: cleanText(error.message || error.errMsg || "同步失败", 300),
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
};
