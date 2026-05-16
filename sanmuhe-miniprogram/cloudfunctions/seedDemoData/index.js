const cloud = require("wx-server-sdk");
const seed = require("./frontendSeed.json");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

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
