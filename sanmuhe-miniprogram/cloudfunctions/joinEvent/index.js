const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

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
    return { ok: true, name: "joinEvent" };
  }

  const { OPENID } = cloud.getWXContext();
  const eventId = cleanText(event.eventId, 80);
  const title = cleanText(event.title, 80);
  const source = cleanText(event.source, 40);
  const name = cleanText(event.name, 40);
  const phone = cleanText(event.phone, 30);
  const note = cleanText(event.note, 200);
  const eventDate = cleanText(event.date, 40);
  const eventTime = cleanText(event.time, 20);
  const eventPlace = cleanText(event.place, 80);
  const eventImage = cleanText(event.image, 240);

  if (!eventId || !title) {
    return { ok: false, message: "活动信息无效" };
  }
  if (!name || !phone) {
    return { ok: false, message: "请填写报名联系人和手机号" };
  }

  await ensureCollection("event_signups");
  await ensureCollection("events");

  const eventResult = await db.collection("events").where({ id: eventId }).limit(1).get();
  const eventDoc = eventResult.data && eventResult.data[0];
  if (eventDoc) {
    const quota = Number(eventDoc.quota || 0);
    const signed = Number(eventDoc.signed || 0);
    if (quota > 0 && signed >= quota) {
      return { ok: false, message: "活动名额已满" };
    }
  }

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
      source,
      name,
      phone,
      note,
      date: cleanText(eventDoc && eventDoc.date, 40) || eventDate,
      time: cleanText(eventDoc && eventDoc.time, 20) || eventTime,
      place: cleanText(eventDoc && eventDoc.place, 80) || eventPlace,
      image: cleanText(eventDoc && (eventDoc.image || eventDoc.cover), 240) || eventImage,
      status: "待确认",
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  if (eventDoc) {
    await db.collection("events").doc(eventDoc._id).update({
      data: {
        signed: _.inc(1),
        updatedAt: db.serverDate()
      }
    });
  }

  return {
    ok: true,
    id: addResult._id
  };
};
