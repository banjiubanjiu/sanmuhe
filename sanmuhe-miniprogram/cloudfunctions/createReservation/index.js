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
    return { ok: true, name: "createReservation" };
  }

  const { OPENID } = cloud.getWXContext();
  const roomId = cleanText(event.roomId, 40);
  const room = cleanText(event.room, 40);
  const day = cleanText(event.day, 20);
  const time = cleanText(event.time, 12);
  const people = Math.max(1, Math.min(12, Number(event.people) || 1));
  const name = cleanText(event.name, 40);
  const phone = cleanText(event.phone, 30);
  const note = cleanText(event.note, 200);
  const source = cleanText(event.source, 40);

  if (!roomId || !room || !day || !time || !name || !phone) {
    return { ok: false, message: "请补全预约信息" };
  }

  await ensureCollection("reservations");

  const conflict = await db.collection("reservations").where({
    roomId,
    day,
    time,
    status: _.nin(["已取消", "cancelled"])
  }).count();

  if (conflict.total > 0) {
    return { ok: false, message: "该茶室时段已被预约" };
  }

  const addResult = await db.collection("reservations").add({
    data: {
      _openid: OPENID,
      roomId,
      room,
      day,
      time,
      people,
      name,
      phone,
      note,
      source,
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
