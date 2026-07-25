const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

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
    cloudEvents = (result.data || []).filter((item) => item.visible !== false);
  } catch (error) {
    cloudEvents = [];
  }

  return {
    ok: true,
    events: sortEvents(cloudEvents)
  };
};
