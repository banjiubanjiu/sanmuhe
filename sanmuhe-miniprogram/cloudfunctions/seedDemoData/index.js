const cloud = require("wx-server-sdk");
const seed = require("./frontendSeed.json");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

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
  if (String(process.env.SEED_DEMO_ENABLED || "").toLowerCase() === "true") {
    return;
  }
  const caller = await getCaller();
  const openids = parseList(process.env.ADMIN_OPENIDS);
  const uids = parseList(process.env.ADMIN_UIDS);
  const usernames = parseList(process.env.ADMIN_USERNAMES);
  const allowed =
    (caller.openid && openids.includes(caller.openid)) ||
    (caller.uid && uids.includes(caller.uid)) ||
    (caller.username && usernames.includes(caller.username));
  if (allowed) {
    return;
  }
  const error = new Error("默认数据写入已关闭，仅管理员或显式开启 SEED_DEMO_ENABLED=true 后可执行");
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
      const data = collection === "events"
        ? { visible: false, deleted: true, seedVersion: seed.version, updatedAt: db.serverDate() }
        : { visible: false, seedVersion: seed.version, updatedAt: db.serverDate() };
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

exports.main = async () => {
  await assertSeedAllowed();
  const results = [];

  for (const [collection, docs] of Object.entries(seed.collections || {})) {
    results.push(await syncCollection(collection, docs, { deactivateMissing: true }));
  }

  results.push(await syncContentBlocks());
  results.push(await syncStoreSettings());

  return {
    ok: true,
    seedVersion: seed.version,
    results
  };
};
