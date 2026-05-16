const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const builtinEvents = [
  {
    id: "event-001",
    title: "养心茶会",
    category: "养心茶会",
    date: "05.25 周六",
    time: "14:00",
    place: "三木合・双山店",
    quota: 30,
    signed: 28,
    price: 68,
    image: "/assets/images/event-yangxin-tea.jpg",
    summary: "在茶香与静心中，慢慢安住自己",
    status: "报名中",
    deleted: false,
    visible: true,
    sort: 10
  },
  {
    id: "event-002",
    title: "学茶入门",
    category: "学茶",
    date: "06.01 周六",
    time: "10:00",
    place: "三木合・听雨店",
    quota: 50,
    signed: 45,
    price: 0,
    image: "/assets/images/event-tea-class.jpg",
    summary: "从识香、泡茶到品饮，轻松了解基础茶知识",
    status: "报名中",
    deleted: false,
    visible: true,
    sort: 20
  },
  {
    id: "event-003",
    title: "时令茶会",
    category: "时令茶会",
    date: "06.08 周六",
    time: "14:00",
    place: "三木合・柏阳毛尖",
    quota: 20,
    signed: 16,
    price: 128,
    image: "/assets/images/event-seasonal-tea.jpg",
    summary: "顺时品茶，感受节气与日常之美",
    status: "报名中",
    deleted: false,
    visible: true,
    sort: 30
  }
];

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

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after first setup.
  }
}

exports.main = async () => {
  await ensureCollection("events");
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

  const cloudEventIds = new Set(cloudEvents.map((item) => item.id).filter(Boolean));
  const fallbackEvents = builtinEvents.filter((item) => !cloudEventIds.has(item.id));

  return {
    ok: true,
    events: sortEvents(cloudEvents.concat(fallbackEvents))
  };
};
