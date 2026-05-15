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

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const eventId = cleanText(event.eventId, 80);
  const title = cleanText(event.title, 80);

  if (!eventId || !title) {
    return { ok: false, message: "活动信息无效" };
  }

  await ensureCollection("event_signups");

  const existing = await db.collection("event_signups").where({
    _openid: OPENID,
    eventId
  }).count();

  if (existing.total > 0) {
    return { ok: false, message: "你已经报名过该活动" };
  }

  const addResult = await db.collection("event_signups").add({
    data: {
      _openid: OPENID,
      eventId,
      title,
      status: "待确认",
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  return {
    ok: true,
    id: addResult._id
  };
};
