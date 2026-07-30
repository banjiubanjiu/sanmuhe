const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const SMOKE_SOURCE = "cloud-status-smoke";

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after first setup.
  }
}

async function removeByQuery(collection, query) {
  await ensureCollection(collection);
  const result = await db.collection(collection).where(query).limit(100).get();
  const docs = result.data || [];
  let removed = 0;

  for (const doc of docs) {
    if (!doc._id) {
      continue;
    }
    await db.collection(collection).doc(doc._id).remove();
    removed += 1;
  }

  return removed;
}

async function removeTitlePrefix(collection, openid) {
  try {
    return await removeByQuery(collection, {
      _openid: openid,
      title: db.RegExp({
        regexp: "^云开发检查",
        options: ""
      })
    });
  } catch (error) {
    return 0;
  }
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "cleanupSmokeData" };
  }

  const { OPENID } = cloud.getWXContext();
  const details = [];

  const cleanupJobs = [
    ["orders", { _openid: OPENID, source: SMOKE_SOURCE }],
    ["orders", { _openid: OPENID, remark: "开发阶段自动检查" }],
    ["reservations", { _openid: OPENID, source: SMOKE_SOURCE }],
    ["reservations", { _openid: OPENID, note: "开发阶段自动检查" }],
    ["events", { _openid: OPENID, source: SMOKE_SOURCE }],
    ["events", { _openid: OPENID, summary: "开发阶段自动检查活动" }],
    ["event_signups", { _openid: OPENID, source: SMOKE_SOURCE }]
  ];

  for (const [collection, query] of cleanupJobs) {
    const removed = await removeByQuery(collection, query);
    if (removed > 0) {
      details.push({ collection, removed });
    }
  }

  const legacySignupRemoved = await removeTitlePrefix("event_signups", OPENID);
  if (legacySignupRemoved > 0) {
    details.push({ collection: "event_signups", removed: legacySignupRemoved });
  }

  return {
    ok: true,
    details,
    removed: details.reduce((sum, item) => sum + item.removed, 0)
  };
};
