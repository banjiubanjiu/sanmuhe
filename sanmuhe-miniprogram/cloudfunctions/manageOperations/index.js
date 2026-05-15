const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseList(value) {
  return String(value || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAuthObject() {
  try {
    const cloudbase = require("@cloudbase/js-sdk");
    const app = cloudbase.init({});
    if (app.auth && typeof app.auth.getUserInfo === "function") {
      return app.auth;
    }
    if (typeof app.auth === "function") {
      return app.auth();
    }
  } catch (error) {
    // The function can still authorize mini program admins with ADMIN_OPENIDS.
  }
  return null;
}

async function getCaller() {
  const wxContext = cloud.getWXContext();
  const caller = {
    openid: wxContext.OPENID || "",
    uid: "",
    username: ""
  };

  const auth = getAuthObject();
  if (!auth) {
    return caller;
  }

  try {
    const userInfo = typeof auth.getUserInfo === "function" ? auth.getUserInfo() : {};
    caller.uid = userInfo.uid || userInfo.userInfo && userInfo.userInfo.uid || "";
    caller.username = userInfo.username || userInfo.userInfo && userInfo.userInfo.username || "";
  } catch (error) {
    // Ignore and try detailed user info below.
  }

  if (caller.uid && !caller.username && typeof auth.getEndUserInfo === "function") {
    try {
      const detail = await auth.getEndUserInfo(caller.uid);
      const info = detail.userInfo || detail.data && detail.data.userInfo || {};
      caller.username = info.username || info.email || caller.username;
    } catch (error) {
      // Username whitelist is optional; UID whitelist remains sufficient.
    }
  }

  return caller;
}

function assertAdmin(caller) {
  const openids = parseList(process.env.ADMIN_OPENIDS);
  const uids = parseList(process.env.ADMIN_UIDS);
  const usernames = parseList(process.env.ADMIN_USERNAMES);
  const hasWhitelist = openids.length + uids.length + usernames.length > 0;

  if (!hasWhitelist) {
    const error = new Error("未配置管理员白名单");
    error.code = "NO_ADMIN_WHITELIST";
    throw error;
  }

  if (caller.openid && openids.includes(caller.openid)) {
    return;
  }
  if (caller.uid && uids.includes(caller.uid)) {
    return;
  }
  if (caller.username && usernames.includes(caller.username)) {
    return;
  }

  const error = new Error("无权访问经营后台");
  error.code = "NO_PERMISSION";
  throw error;
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after first setup.
  }
}

async function releaseInventory(locks) {
  for (const lock of locks || []) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }
    try {
      await db.collection(lock.collection).doc(lock.docId).update({
        data: {
          lockedStock: _.inc(-lock.quantity),
          updatedAt: db.serverDate()
        }
      });
    } catch (error) {
      // Continue releasing the remaining locks.
    }
  }
}

function normalizeRecordId(value) {
  return cleanText(value, 80);
}

function matchesKeyword(item, keyword) {
  if (!keyword) {
    return true;
  }
  const haystack = [
    item.orderNo,
    item.name,
    item.phone,
    item.consignee,
    item.room,
    item.title,
    item.status
  ].join(" ");
  return haystack.indexOf(keyword) >= 0;
}

async function listCollection(collection, status, keyword) {
  await ensureCollection(collection);
  const where = {};
  if (status && status !== "all") {
    where.status = status;
  }

  const result = await db.collection(collection)
    .where(where)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return (result.data || []).filter((item) => matchesKeyword(item, keyword));
}

async function getByDocId(collection, id) {
  const result = await db.collection(collection).doc(id).get();
  return result.data || null;
}

async function getOrder(event) {
  const id = normalizeRecordId(event.orderId || event.id);
  const orderNo = cleanText(event.orderNo, 32);
  if (id) {
    try {
      const order = await getByDocId("orders", id);
      if (order) {
        return order;
      }
    } catch (error) {
      // Fall through to order number lookup.
    }
  }
  if (!orderNo) {
    return null;
  }
  const result = await db.collection("orders").where({ orderNo }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function cancelOrder(event) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  if (order.payStatus === "paid" && !event.confirmPaidCancel) {
    return { ok: false, message: "已支付订单取消前请先完成人工退款或售后确认" };
  }

  if (order.payStatus === "pending" && order.lockReleased !== true) {
    await releaseInventory(order.inventoryLocks);
  }

  await db.collection("orders").doc(order._id).update({
    data: {
      status: "已取消",
      payStatus: order.payStatus === "pending" ? "cancelled" : order.payStatus,
      lockReleased: order.payStatus === "pending" ? true : order.lockReleased,
      cancelReason: cleanText(event.reason, 160) || "管理员取消",
      adminNote: cleanText(event.adminNote, 300),
      updatedAt: db.serverDate()
    }
  });
  return { ok: true };
}

async function markShipped(event) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  await db.collection("orders").doc(order._id).update({
    data: {
      status: "已发货",
      fulfillmentStatus: "shipped",
      trackingCompany: cleanText(event.trackingCompany, 80),
      trackingNo: cleanText(event.trackingNo, 80),
      shippedAt: db.serverDate(),
      adminNote: cleanText(event.adminNote, 300),
      updatedAt: db.serverDate()
    }
  });
  return { ok: true };
}

async function markPickupDone(event) {
  const order = await getOrder(event);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  await db.collection("orders").doc(order._id).update({
    data: {
      status: "已完成",
      fulfillmentStatus: "picked_up",
      completedAt: db.serverDate(),
      adminNote: cleanText(event.adminNote, 300),
      updatedAt: db.serverDate()
    }
  });
  return { ok: true };
}

async function updateReservation(event) {
  const id = normalizeRecordId(event.reservationId || event.id);
  const status = cleanText(event.status, 20);
  if (!id || !status) {
    return { ok: false, message: "缺少预约 ID 或状态" };
  }
  await db.collection("reservations").doc(id).update({
    data: {
      status,
      adminNote: cleanText(event.adminNote, 300),
      updatedAt: db.serverDate()
    }
  });
  return { ok: true };
}

async function updateSignup(event) {
  const id = normalizeRecordId(event.signupId || event.id);
  const status = cleanText(event.status, 20);
  if (!id || !status) {
    return { ok: false, message: "缺少报名 ID 或状态" };
  }
  const existing = await getByDocId("event_signups", id);
  if (!existing) {
    return { ok: false, message: "报名记录不存在" };
  }
  await db.collection("event_signups").doc(id).update({
    data: {
      status,
      adminNote: cleanText(event.adminNote, 300),
      updatedAt: db.serverDate()
    }
  });

  if (existing.eventId && existing.status !== status) {
    const shouldRelease = status === "已取消" && existing.status !== "已取消";
    const shouldRestore = existing.status === "已取消" && status !== "已取消";
    if (shouldRelease || shouldRestore) {
      const eventResult = await db.collection("events").where({ id: existing.eventId }).limit(1).get();
      const eventDoc = eventResult.data && eventResult.data[0];
      if (eventDoc) {
        const delta = shouldRelease
          ? (Number(eventDoc.signed || 0) > 0 ? -1 : 0)
          : 1;
        if (delta === 0) {
          return { ok: true };
        }
        await db.collection("events").doc(eventDoc._id).update({
          data: {
            signed: _.inc(delta),
            updatedAt: db.serverDate()
          }
        });
      }
    }
  }
  return { ok: true };
}

async function getSummary() {
  await Promise.all([
    ensureCollection("orders"),
    ensureCollection("reservations"),
    ensureCollection("event_signups")
  ]);

  const [pendingPay, toShip, toPickup, reservations, signups] = await Promise.all([
    db.collection("orders").where({ status: "待支付" }).count(),
    db.collection("orders").where({ status: "待发货" }).count(),
    db.collection("orders").where({ status: "待自提" }).count(),
    db.collection("reservations").where({ status: "待确认" }).count(),
    db.collection("event_signups").where({ status: "待确认" }).count()
  ]);

  return {
    ok: true,
    summary: {
      pendingPay: pendingPay.total,
      toShip: toShip.total,
      toPickup: toPickup.total,
      pendingReservations: reservations.total,
      pendingSignups: signups.total
    }
  };
}

exports.main = async (event = {}) => {
  try {
    const caller = await getCaller();
    assertAdmin(caller);

    const action = cleanText(event.action, 40) || "getSummary";
    const status = cleanText(event.status, 30);
    const keyword = cleanText(event.keyword, 80);

    if (action === "getSummary") {
      return await getSummary();
    }
    if (action === "listOrders") {
      const orders = await listCollection("orders", status, keyword);
      return { ok: true, orders };
    }
    if (action === "cancelOrder") {
      return await cancelOrder(event);
    }
    if (action === "markShipped") {
      return await markShipped(event);
    }
    if (action === "markPickupDone") {
      return await markPickupDone(event);
    }
    if (action === "listReservations") {
      const reservations = await listCollection("reservations", status, keyword);
      return { ok: true, reservations };
    }
    if (action === "updateReservation") {
      return await updateReservation(event);
    }
    if (action === "listSignups") {
      const signups = await listCollection("event_signups", status, keyword);
      return { ok: true, signups };
    }
    if (action === "updateSignup") {
      return await updateSignup(event);
    }

    return { ok: false, message: "未知后台操作" };
  } catch (error) {
    return {
      ok: false,
      code: error.code || "MANAGE_OPERATIONS_ERROR",
      message: error.message || "后台操作失败"
    };
  }
};
