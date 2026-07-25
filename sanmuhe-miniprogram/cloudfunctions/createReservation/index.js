const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 服务端门店主数据（与小程序 data/store.js 对齐）
 * 预约落库以服务端为准，不信任客户端传来的店名。
 */
const CANONICAL_STORE = {
  storeId: "store-hexi",
  storeName: "禾煦茶书房",
  roomId: "room-001",
  address: "佛山市禅城区石湾镇街道怡翠宏璟P9铺禾煦茶书房",
  maxPeople: 6,
  sessionMinutes: 120
};

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

async function resolveStore() {
  try {
    await ensureCollection("store_settings");
    const result = await db.collection("store_settings").where({ key: "store" }).limit(1).get();
    const row = result.data && result.data[0];
    if (row) {
      return {
        storeId: cleanText(row.storeId || row.id || CANONICAL_STORE.storeId, 40) || CANONICAL_STORE.storeId,
        storeName: cleanText(row.storeName || row.name || CANONICAL_STORE.storeName, 40) || CANONICAL_STORE.storeName,
        roomId: cleanText(row.roomId || CANONICAL_STORE.roomId, 40) || CANONICAL_STORE.roomId,
        address: cleanText(row.address || CANONICAL_STORE.address, 120) || CANONICAL_STORE.address,
        maxPeople: Math.max(1, Number(row.maxPeople) || CANONICAL_STORE.maxPeople),
        sessionMinutes: Math.max(30, Number(row.sessionMinutes) || CANONICAL_STORE.sessionMinutes)
      };
    }
  } catch (error) {
    // fall through to canonical
  }
  return Object.assign({}, CANONICAL_STORE);
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "createReservation" };
  }

  const { OPENID } = cloud.getWXContext();
  const store = await resolveStore();

  const day = cleanText(event.day, 20);
  const time = cleanText(event.time, 12);
  const endTime = cleanText(event.endTime, 12);
  const period = cleanText(event.period, 20);
  const periodLabel = cleanText(event.periodLabel, 20);
  const price = Math.max(0, Number(event.price) || 0);
  const durationMinutes = Math.max(0, Number(event.durationMinutes) || store.sessionMinutes);
  const people = Math.max(1, Math.min(store.maxPeople, Number(event.people) || 1));
  const name = cleanText(event.name, 40);
  const phone = cleanText(event.phone, 30);
  const note = cleanText(event.note, 200);
  const source = cleanText(event.source, 40);

  // 单店：roomId 默认本店茶席；名称永远用服务端门店名
  const roomId = cleanText(event.roomId, 40) || store.roomId;
  const storeId = store.storeId;
  const storeName = store.storeName;

  if (!day || !time || !name || !phone) {
    return { ok: false, message: "请补全预约信息" };
  }
  if (people > store.maxPeople) {
    return { ok: false, message: `每场限 ${store.maxPeople} 位以内` };
  }

  await ensureCollection("reservations");

  const conflict = await db.collection("reservations").where({
    storeId,
    roomId,
    day,
    time,
    status: _.nin(["已取消", "cancelled"])
  }).count();

  if (conflict.total > 0) {
    return { ok: false, message: "该时段已被预约" };
  }

  // 兼容旧冲突键（历史数据可能只有 roomId）
  if (!conflict.total) {
    const legacyConflict = await db.collection("reservations").where({
      roomId,
      day,
      time,
      status: _.nin(["已取消", "cancelled"])
    }).count();
    if (legacyConflict.total > 0) {
      return { ok: false, message: "该时段已被预约" };
    }
  }

  const addResult = await db.collection("reservations").add({
    data: {
      _openid: OPENID,
      storeId,
      storeName,
      roomId,
      // room 字段保留给列表兼容：单店阶段等于门店名
      room: storeName,
      address: store.address,
      day,
      time,
      endTime,
      period,
      periodLabel,
      price,
      durationMinutes,
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
    id: addResult._id,
    storeName,
    roomId
  };
};
