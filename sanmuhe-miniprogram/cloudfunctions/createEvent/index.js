const cloud = require("wx-server-sdk");

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

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "createEvent" };
  }

  const { OPENID } = cloud.getWXContext();
  const title = cleanText(event.title, 60);
  const category = cleanText(event.category, 20) || "茶会";
  const date = cleanText(event.date, 30);
  const time = cleanText(event.time, 20);
  const place = cleanText(event.place, 80) || "禾煦书茶空间";
  const quota = Math.max(1, Math.min(999, Number(event.quota) || 1));
  const price = Math.max(0, Number(event.price) || 0);
  const summary = cleanText(event.summary, 300);
  const image = cleanText(event.image, 160) || "/assets/images/event-seasonal-tea.jpg";
  const source = cleanText(event.source, 40);

  if (!title || !date || !time || !summary) {
    return { ok: false, message: "请补全活动信息" };
  }

  await ensureCollection("events");
  const eventId = `event-cloud-${Date.now()}`;
  const addResult = await db.collection("events").add({
    data: {
      _openid: OPENID,
      id: eventId,
      title,
      category,
      date,
      time,
      place,
      quota,
      signed: 0,
      price,
      image,
      summary,
      source,
      status: "新发布",
      deleted: false,
      visible: true,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  return {
    ok: true,
    id: eventId,
    docId: addResult._id
  };
};
