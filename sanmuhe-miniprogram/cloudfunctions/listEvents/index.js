const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/** 与小程序 utils/eventStatus 保持一致 */
function resolveEventStatus(item = {}) {
  const raw = String(item.status || "敬请期待").trim() || "敬请期待";
  if (raw === "已取消" || raw === "已结束" || raw === "敬请期待") {
    return raw;
  }
  const quota = Math.max(0, Number(item.quota) || 0);
  const signed = Math.max(0, Number(item.signed) || 0);
  if (quota > 0 && signed >= quota) {
    return "已满";
  }
  if (raw === "已满" || raw === "报名中") {
    return raw === "已满" ? "已满" : "报名中";
  }
  return "敬请期待";
}

function decorateEvent(item = {}) {
  const displayStatus = resolveEventStatus(item);
  const joinMap = {
    报名中: { canJoin: true, joinText: "报名", joinClass: "open" },
    已满: { canJoin: false, joinText: "已满", joinClass: "full" },
    已结束: { canJoin: false, joinText: "已结束", joinClass: "ended" },
    已取消: { canJoin: false, joinText: "已取消", joinClass: "cancelled" },
    敬请期待: { canJoin: false, joinText: "敬请期待", joinClass: "wait" }
  };
  const meta = joinMap[displayStatus] || joinMap["敬请期待"];
  return Object.assign({}, item, {
    status: String(item.status || "敬请期待").trim() || "敬请期待",
    displayStatus,
    canJoin: meta.canJoin,
    joinText: meta.joinText,
    joinClass: meta.joinClass
  });
}

function sortEvents(items) {
  return items.sort((a, b) => {
    const sortA = Number(a.sort || 9999);
    const sortB = Number(b.sort || 9999);
    if (sortA !== sortB) {
      return sortA - sortB;
    }
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "listEvents" };
  }

  let cloudEvents = [];

  try {
    const result = await db.collection("events")
      .where({ deleted: false })
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    cloudEvents = (result.data || [])
      .filter((item) => item.visible !== false && item.removed !== true)
      .filter((item) => resolveEventStatus(item) !== "已取消")
      .map(decorateEvent);
  } catch (error) {
    cloudEvents = [];
  }

  return {
    ok: true,
    events: sortEvents(cloudEvents)
  };
};
