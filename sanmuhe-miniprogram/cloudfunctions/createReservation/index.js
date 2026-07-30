const cloud = require("wx-server-sdk");
const { sendWeComReservationNotification, sendWeComTestNotification } = require("./wecomReservationNotify");

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

const LOCK_MINUTES = Math.max(1, Number(process.env.RESERVATION_LOCK_MINUTES || process.env.ORDER_LOCK_MINUTES || 15));

function createReservationNo() {
  return `SMH-R${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
}

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

function number(value) {
  return Math.max(0, Number(value) || 0);
}

function parseList(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toMinutes(hhmm) {
  const parts = String(hhmm || "").split(":");
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 0;
  }
  return hour * 60 + minute;
}

function fromMinutes(total) {
  const hour = Math.floor(Math.max(0, total) / 60);
  const minute = Math.max(0, total) % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function resolveReservationRange(record = {}, fallbackSessionMinutes = 120) {
  const start = cleanText(record.time, 12);
  let end = cleanText(record.endTime, 12);
  const session = Math.max(30, Number(record.durationMinutes) || fallbackSessionMinutes);
  if (!end && start) {
    end = fromMinutes(toMinutes(start) + session);
  }
  return {
    start,
    end,
    startMins: toMinutes(start),
    endMins: toMinutes(end)
  };
}

function rangesOverlap(aStartMins, aEndMins, bStartMins, bEndMins) {
  // 区间左闭右开：start <= x < end
  const aStart = Number(aStartMins) || 0;
  const aEnd = Number(aEndMins) || aStart;
  const bStart = Number(bStartMins) || 0;
  const bEnd = Number(bEndMins) || bStart;
  if (aStart >= aEnd || bStart >= bEnd) {
    return false;
  }
  return aStart < bEnd && aEnd > bStart;
}

async function findConflictingReservations(day, roomId, storeId, startTime, endTime, fallbackSessionMinutes) {
  const baseQuery = {
    day,
    status: _.nin(["已取消", "cancelled"])
  };
  if (storeId) {
    baseQuery.storeId = storeId;
  }
  if (roomId) {
    baseQuery.roomId = roomId;
  }

  const result = await db.collection("reservations").where(baseQuery).get();
  const records = result.data || [];

  const newStartMins = toMinutes(startTime);
  const newEndMins = endTime ? toMinutes(endTime) : newStartMins + fallbackSessionMinutes;

  return records.filter((record) => {
    const range = resolveReservationRange(record, fallbackSessionMinutes);
    if (!range.start) {
      return false;
    }
    return rangesOverlap(newStartMins, newEndMins, range.startMins, range.endMins);
  });
}

async function listReservedSlots(day, roomId, storeId, fallbackSessionMinutes) {
  const baseQuery = {
    day,
    status: _.nin(["已取消", "cancelled"])
  };
  if (storeId) {
    baseQuery.storeId = storeId;
  }
  if (roomId) {
    baseQuery.roomId = roomId;
  }

  const result = await db.collection("reservations").where(baseQuery).get();
  const records = result.data || [];

  return records
    .map((record) => {
      const range = resolveReservationRange(record, fallbackSessionMinutes);
      if (!range.start) {
        return null;
      }
      return {
        time: range.start,
        endTime: range.end,
        durationMinutes: Math.max(30, Number(record.durationMinutes) || fallbackSessionMinutes)
      };
    })
    .filter(Boolean);
}

async function notifyAdmins(reservation = {}) {
  const notice = {
    type: "reservation_created",
    reservationId: reservation.reservationId || "",
    reservationNo: cleanText(reservation.reservationNo, 40),
    storeName: cleanText(reservation.storeName, 40),
    roomId: cleanText(reservation.roomId, 40),
    day: cleanText(reservation.day, 20),
    time: cleanText(reservation.time, 12),
    endTime: cleanText(reservation.endTime, 12),
    people: number(reservation.people),
    name: cleanText(reservation.name, 40),
    phone: cleanText(reservation.phone, 30),
    note: cleanText(reservation.note, 160),
    status: cleanText(reservation.status, 12) || "待支付",
    payStatus: cleanText(reservation.payStatus, 12) || "pending",
    read: false,
    createdAt: db.serverDate()
  };

  try {
    await ensureCollection("admin_notices");
    await db.collection("admin_notices").add({ data: notice });
  } catch (error) {
    // Notice board is best-effort; reservation creation should still succeed.
  }

  try {
    await ensureCollection("notification_logs");
    await db.collection("notification_logs").add({
      data: Object.assign({}, notice, {
        channel: "admin_notice",
        target: "admin",
        message: reservation.payStatus === "paid" || reservation.status === "已确认"
          ? `茶室预约 ${notice.day} ${notice.time} 已支付确认，${notice.name} ${notice.phone}，${notice.people} 位。`
          : `茶室预约 ${notice.day} ${notice.time} 待支付，${notice.name} ${notice.phone}，${notice.people} 位，顾客需在 ${LOCK_MINUTES} 分钟内完成支付。`
      })
    });
  } catch (error) {
    // Logging is best-effort.
  }

  return {
    adminOpenids: parseList(process.env.ADMIN_OPENIDS).length,
    staffOpenids: parseList(process.env.STAFF_OPENIDS || process.env.ADMIN_OPENIDS).length,
    noticeWritten: true
  };
}

async function notifyWeCom(reservation = {}) {
  try {
    return await sendWeComReservationNotification(reservation);
  } catch (error) {
    console.warn(`[wecom-reservation] ${error.message || "发送失败"}`);
    return {
      ok: false,
      message: error.message || "企业微信茶室预约提醒发送失败"
    };
  }
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
    return {
      ok: true,
      name: "createReservation",
      lockMinutes: LOCK_MINUTES,
      initialStatus: "待支付",
      wecomReservationNotifyConfigured: Boolean(process.env.WECOM_RESERVATION_WEBHOOK || process.env.WECOM_ORDER_WEBHOOK)
    };
  }

  if (event.action === "testWeComNotify") {
    try {
      const result = await sendWeComTestNotification();
      return Object.assign({ ok: true, name: "createReservation" }, result);
    } catch (error) {
      return {
        ok: false,
        code: "WECOM_TEST_FAILED",
        message: error && error.message ? error.message : "企业微信测试失败"
      };
    }
  }

  const store = await resolveStore();
  const storeId = store.storeId;
  const roomId = cleanText(event.roomId, 40) || store.roomId;

  if (event.action === "listReservedSlots") {
    const day = cleanText(event.day, 20);
    if (!day) {
      return { ok: false, message: "请选择日期" };
    }
    try {
      const slots = await listReservedSlots(day, roomId, storeId, store.sessionMinutes);
      return {
        ok: true,
        day,
        roomId,
        slots
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message || "读取已预约时段失败"
      };
    }
  }

  const { OPENID } = cloud.getWXContext();

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

  const storeName = store.storeName;

  if (!day || !time || !name || !phone) {
    return { ok: false, message: "请补全预约信息" };
  }
  if (people > store.maxPeople) {
    return { ok: false, message: `每场限 ${store.maxPeople} 位以内` };
  }

  await ensureCollection("reservations");

  const conflicting = await findConflictingReservations(
    day,
    roomId,
    storeId,
    time,
    endTime,
    store.sessionMinutes
  );

  if (conflicting.length > 0) {
    return { ok: false, message: "该时段已被预约或与其他预约重叠" };
  }

  const reservationNo = createReservationNo();
  const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
  const total = price;

  const addResult = await db.collection("reservations").add({
    data: {
      _openid: OPENID,
      storeId,
      storeName,
      roomId,
      // room 字段保留给列表兼容：单店阶段等于门店名
      room: storeName,
      address: store.address,
      reservationNo,
      day,
      time,
      endTime,
      period,
      periodLabel,
      price,
      total,
      durationMinutes,
      people,
      name,
      phone,
      note,
      source,
      status: "待支付",
      payStatus: "pending",
      lockedUntil,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  const reservationSnapshot = {
    reservationId: addResult._id,
    reservationNo,
    storeName,
    roomId,
    day,
    time,
    endTime,
    periodLabel,
    price,
    total,
    people,
    name,
    phone,
    note,
    status: "待支付",
    payStatus: "pending",
    lockedUntil
  };

  const [wecomNotify, adminNotify] = await Promise.all([
    notifyWeCom(reservationSnapshot),
    notifyAdmins(reservationSnapshot)
  ]);

  return {
    ok: true,
    id: addResult._id,
    reservationId: addResult._id,
    reservationNo,
    total,
    status: "待支付",
    payStatus: "pending",
    lockedUntil,
    storeName,
    roomId,
    day,
    time,
    endTime,
    periodLabel,
    people,
    price,
    wecomNotify,
    adminNotify
  };
};
