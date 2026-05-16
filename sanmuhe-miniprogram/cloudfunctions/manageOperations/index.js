const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanId(value, prefix) {
  const raw = cleanText(value, 80)
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return raw || `${prefix}-${Date.now()}`;
}

function toDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value.$date) {
    return toDate(value.$date);
  }
  if (value.seconds) {
    return new Date(value.seconds * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value) {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return dateKey(new Date());
}

function isActiveOrder(order) {
  return order && order.status !== "已取消" && order.payStatus !== "cancelled" && order.payStatus !== "expired";
}

function isRevenueOrder(order) {
  return isActiveOrder(order) && (order.payStatus === "paid" || ["待发货", "待自提", "已发货", "已完成"].includes(order.status));
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

function maskPhone(value) {
  const text = cleanText(value, 40);
  if (!text) {
    return "";
  }
  if (/^1\d{10}$/.test(text)) {
    return `${text.slice(0, 3)}****${text.slice(7)}`;
  }
  return text.length > 4 ? `${text.slice(0, 2)}***${text.slice(-2)}` : "***";
}

function maskOpenid(value) {
  const text = cleanText(value, 80);
  if (!text) {
    return "";
  }
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : `${text.slice(0, 3)}...`;
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

async function readCollection(collection, options = {}) {
  await ensureCollection(collection);
  let query = db.collection(collection);
  if (options.where) {
    query = query.where(options.where);
  }
  if (options.orderBy) {
    query = query.orderBy(options.orderBy, options.order || "desc");
  }
  const result = await query.limit(options.limit || 100).get();
  return result.data || [];
}

async function findRecord(collection, field, value) {
  await ensureCollection(collection);
  const result = await db.collection(collection).where({ [field]: value }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function upsertRecord(collection, identityField, identityValue, data) {
  await ensureCollection(collection);
  const existing = await findRecord(collection, identityField, identityValue);
  if (existing) {
    await db.collection(collection).doc(existing._id).update({
      data: Object.assign({}, data, {
        updatedAt: db.serverDate()
      })
    });
    return { created: false, _id: existing._id };
  }
  const addResult = await db.collection(collection).add({
    data: Object.assign({}, data, {
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    })
  });
  return { created: true, _id: addResult._id };
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

async function releaseUserCoupon(coupon) {
  if (!coupon || !coupon.userCouponId) {
    return;
  }
  try {
    await db.collection("user_coupons").doc(coupon.userCouponId).update({
      data: {
        status: "可使用",
        lockedOrderNo: "",
        lockedUntil: null,
        discount: 0,
        updatedAt: db.serverDate()
      }
    });
  } catch (error) {
    // Continue the management action; coupon state can be repaired from logs.
  }
}

function sendServiceNotice(kind, openid, payload) {
  if (!openid || !cloud.callFunction) {
    return Promise.resolve();
  }
  return cloud.callFunction({
    name: "serviceNotify",
    data: { kind, openid, payload }
  }).catch(() => null);
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
    item.eventTitle,
    item.openid,
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
    .limit(200)
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
    await releaseUserCoupon(order.coupon);
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
  await sendServiceNotice("orderShipped", order._openid, {
    orderNo: order.orderNo,
    trackingCompany: cleanText(event.trackingCompany, 80),
    trackingNo: cleanText(event.trackingNo, 80),
    status: "已发货"
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
  const existing = await getByDocId("reservations", id);
  if (!existing) {
    return { ok: false, message: "预约记录不存在" };
  }
  await db.collection("reservations").doc(id).update({
    data: {
      status,
      adminNote: cleanText(event.adminNote, 300),
      updatedAt: db.serverDate()
    }
  });
  const updated = Object.assign({}, existing || {}, { status, adminNote: cleanText(event.adminNote, 300) });
  await sendServiceNotice("reservationStatus", updated._openid, {
    room: updated.room,
    day: updated.day,
    time: updated.time,
    status,
    note: updated.adminNote || updated.note || "预约状态已更新"
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
        if (delta !== 0) {
          await db.collection("events").doc(eventDoc._id).update({
            data: {
              signed: _.inc(delta),
              updatedAt: db.serverDate()
            }
          });
        }
      }
    }
  }
  await sendServiceNotice("eventStatus", existing._openid, {
    title: existing.title,
    date: existing.date,
    time: existing.time,
    place: existing.place,
    status
  });
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

function summarizeOrders(orders) {
  const today = todayKey();
  const month = today.slice(0, 7);
  const activeOrders = orders.filter(isActiveOrder);
  const revenueOrders = orders.filter(isRevenueOrder);
  return {
    todayOrders: orders.filter((order) => dateKey(order.createdAt) === today).length,
    pendingPay: orders.filter((order) => order.status === "待支付").length,
    toShip: orders.filter((order) => order.status === "待发货").length,
    toPickup: orders.filter((order) => order.status === "待自提").length,
    afterSale: orders.filter((order) => /退款|售后|异常/.test(String(order.status || ""))).length,
    activeOrders: activeOrders.length,
    todayOrderAmount: revenueOrders
      .filter((order) => dateKey(order.createdAt) === today)
      .reduce((sum, order) => sum + number(order.total), 0),
    monthRevenue: revenueOrders
      .filter((order) => dateKey(order.createdAt).slice(0, 7) === month)
      .reduce((sum, order) => sum + number(order.total), 0),
    totalRevenue: revenueOrders.reduce((sum, order) => sum + number(order.total), 0)
  };
}

function summarizeCustomers(orders, reservations, signups) {
  const customers = {};

  function keyFor(record) {
    return record._openid || record.openid || record.phone || record.name || record._id;
  }

  function ensureCustomer(record) {
    const key = keyFor(record);
    if (!customers[key]) {
      customers[key] = {
        id: key,
        openid: record._openid || record.openid || "",
        name: record.consignee || record.name || "",
        phone: record.phone || "",
        orders: 0,
        reservations: 0,
        signups: 0,
        spend: 0,
        lastSeenAt: record.createdAt || null,
        tags: []
      };
    }
    const customer = customers[key];
    if (!customer.name && (record.consignee || record.name)) {
      customer.name = record.consignee || record.name;
    }
    if (!customer.phone && record.phone) {
      customer.phone = record.phone;
    }
    const last = toDate(customer.lastSeenAt);
    const next = toDate(record.createdAt);
    if (next && (!last || next > last)) {
      customer.lastSeenAt = record.createdAt;
    }
    return customer;
  }

  orders.forEach((order) => {
    const customer = ensureCustomer(order);
    customer.orders += 1;
    if (isRevenueOrder(order)) {
      customer.spend += number(order.total);
    }
  });
  reservations.forEach((reservation) => {
    ensureCustomer(reservation).reservations += 1;
  });
  signups.forEach((signup) => {
    ensureCustomer(signup).signups += 1;
  });

  return Object.values(customers).map((customer) => {
    const tags = [];
    if (customer.spend >= 3000) {
      tags.push("高价值");
    }
    if (customer.reservations > 0) {
      tags.push("茶室");
    }
    if (customer.signups > 0) {
      tags.push("活动");
    }
    if (!tags.length) {
      tags.push("新客");
    }
    return Object.assign({}, customer, { tags });
  }).sort((a, b) => b.spend - a.spend || String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
}

function buildRoomBoard(rooms, reservations) {
  const today = todayKey();
  const slots = ["10:00", "12:30", "15:00", "17:30", "20:00"];
  const todayReservations = reservations.filter((item) => item.day === today && item.status !== "已取消");
  return (rooms.length ? rooms : [{ id: "room-001", name: "禾熙书茶空间", capacity: "2-6人" }]).slice(0, 5).map((room) => ({
    id: room.id,
    name: room.name,
    capacity: room.capacity || "",
    slots: slots.map((slot) => {
      const booked = todayReservations.find((item) => item.roomId === room.id && item.time === slot);
      return booked ? {
        time: slot,
        status: booked.status || "已预约",
        name: booked.name || "",
        people: booked.people || 1
      } : {
        time: slot,
        status: "可预约"
      };
    })
  }));
}

async function getDashboard() {
  const [orders, reservations, signups, events, rooms] = await Promise.all([
    readCollection("orders", { orderBy: "createdAt", limit: 100 }),
    readCollection("reservations", { orderBy: "createdAt", limit: 100 }),
    readCollection("event_signups", { orderBy: "createdAt", limit: 100 }),
    readCollection("events", { orderBy: "sort", order: "asc", limit: 50 }),
    readCollection("rooms", { orderBy: "sort", order: "asc", limit: 50 })
  ]);
  const orderSummary = summarizeOrders(orders);
  const today = todayKey();
  const customers = summarizeCustomers(orders, reservations, signups);

  return {
    ok: true,
    dashboard: {
      summary: Object.assign({}, orderSummary, {
        todayReservations: reservations.filter((item) => item.day === today && item.status !== "已取消").length,
        todaySignups: signups.filter((item) => dateKey(item.createdAt) === today && item.status !== "已取消").length,
        newCustomers: customers.filter((item) => dateKey(item.lastSeenAt) === today).length,
        pendingReservations: reservations.filter((item) => item.status === "待确认").length,
        pendingSignups: signups.filter((item) => item.status === "待确认").length
      }),
      roomBoard: buildRoomBoard(rooms, reservations),
      recentReservations: reservations.slice(0, 6),
      recentSignups: signups.slice(0, 6),
      recentOrders: orders.slice(0, 6),
      events: events.slice(0, 5).filter((item) => item.deleted !== true && item.visible !== false)
    }
  };
}

async function listCustomers(event) {
  const keyword = cleanText(event.keyword, 80);
  const [orders, reservations, signups] = await Promise.all([
    readCollection("orders", { orderBy: "createdAt", limit: 200 }),
    readCollection("reservations", { orderBy: "createdAt", limit: 200 }),
    readCollection("event_signups", { orderBy: "createdAt", limit: 200 })
  ]);
  const customers = summarizeCustomers(orders, reservations, signups).filter((customer) => {
    if (!keyword) {
      return true;
    }
    return [customer.name, customer.phone, customer.openid, customer.tags.join(" ")]
      .join(" ")
      .includes(keyword);
  });
  return {
    ok: true,
    customers,
    summary: {
      totalCustomers: customers.length,
      activeCustomers: customers.filter((item) => item.orders + item.reservations + item.signups > 0).length,
      totalSpend: customers.reduce((sum, item) => sum + item.spend, 0)
    }
  };
}

function normalizeIdentity(event = {}) {
  const customerId = cleanText(event.customerId || event.id, 80);
  const identity = {
    openid: cleanText(event.openid, 80),
    phone: cleanText(event.phone || event.mobile, 40)
  };
  if (!identity.phone && /^1\d{10}$/.test(customerId)) {
    identity.phone = customerId;
  }
  if (!identity.openid && customerId && customerId !== identity.phone && customerId.length >= 12) {
    identity.openid = customerId;
  }
  return identity;
}

function identityQueries(identity, fields) {
  const queries = [];
  if (identity.openid) {
    fields.openid.forEach((field) => queries.push({ [field]: identity.openid }));
  }
  if (identity.phone) {
    fields.phone.forEach((field) => queries.push({ [field]: identity.phone }));
  }
  return queries;
}

async function findDocsByIdentity(collection, identity, fields) {
  await ensureCollection(collection);
  const docs = {};
  const queries = identityQueries(identity, fields);
  for (const where of queries) {
    const result = await db.collection(collection).where(where).limit(200).get();
    (result.data || []).forEach((doc) => {
      docs[doc._id] = doc;
    });
  }
  return Object.values(docs);
}

async function anonymizeDocs(collection, docs, data) {
  let count = 0;
  for (const doc of docs) {
    await db.collection(collection).doc(doc._id).update({
      data: Object.assign({}, data, {
        privacyDeleted: true,
        privacyDeletedAt: db.serverDate(),
        updatedAt: db.serverDate()
      })
    });
    count += 1;
  }
  return count;
}

async function removeDocs(collection, docs) {
  let count = 0;
  for (const doc of docs) {
    await db.collection(collection).doc(doc._id).remove();
    count += 1;
  }
  return count;
}

async function writeAdminAuditLog(caller, action, detail) {
  await ensureCollection("admin_audit_logs");
  await db.collection("admin_audit_logs").add({
    data: {
      action,
      adminOpenid: maskOpenid(caller.openid),
      adminUid: caller.uid ? maskOpenid(caller.uid) : "",
      detail,
      createdAt: db.serverDate()
    }
  });
}

async function deleteCustomerData(event, caller) {
  const identity = normalizeIdentity(event);
  if (!identity.openid && !identity.phone) {
    return { ok: false, message: "缺少可定位用户的 OpenID 或手机号" };
  }

  const recordFields = {
    openid: ["_openid", "openid"],
    phone: ["phone", "mobile"]
  };
  const orderDocs = await findDocsByIdentity("orders", identity, recordFields);
  const reservationDocs = await findDocsByIdentity("reservations", identity, recordFields);
  const signupDocs = await findDocsByIdentity("event_signups", identity, recordFields);
  const memberDocs = await findDocsByIdentity("members", identity, recordFields);
  const preferenceDocs = await findDocsByIdentity("subscription_preferences", identity, recordFields);
  const couponDocs = await findDocsByIdentity("user_coupons", identity, recordFields);

  const counts = {
    orders: await anonymizeDocs("orders", orderDocs, {
      _openid: "",
      openid: "",
      consignee: "已匿名",
      name: "已匿名",
      contactName: "已匿名",
      phone: "",
      mobile: "",
      address: "",
      remark: "",
      pickupNote: ""
    }),
    reservations: await anonymizeDocs("reservations", reservationDocs, {
      _openid: "",
      openid: "",
      name: "已匿名",
      customerName: "已匿名",
      phone: "",
      mobile: "",
      note: ""
    }),
    signups: await anonymizeDocs("event_signups", signupDocs, {
      _openid: "",
      openid: "",
      name: "已匿名",
      customerName: "已匿名",
      phone: "",
      mobile: "",
      note: ""
    }),
    members: await anonymizeDocs("members", memberDocs, {
      _openid: "",
      openid: "",
      name: "已匿名",
      nickname: "",
      phone: "",
      mobile: "",
      avatar: ""
    }),
    subscriptionPreferences: await removeDocs("subscription_preferences", preferenceDocs),
    userCoupons: await removeDocs("user_coupons", couponDocs)
  };

  await writeAdminAuditLog(caller, "deleteCustomerData", {
    openid: maskOpenid(identity.openid),
    phone: maskPhone(identity.phone),
    counts
  });

  return { ok: true, counts };
}

function addTrend(bucket, key, amount) {
  if (!bucket[key]) {
    bucket[key] = 0;
  }
  bucket[key] += amount;
}

async function getAnalytics() {
  const [orders, reservations, signups] = await Promise.all([
    readCollection("orders", { orderBy: "createdAt", limit: 300 }),
    readCollection("reservations", { orderBy: "createdAt", limit: 300 }),
    readCollection("event_signups", { orderBy: "createdAt", limit: 300 })
  ]);
  const revenueOrders = orders.filter(isRevenueOrder);
  const byDay = {};
  const byCategory = {};
  const topItems = {};

  revenueOrders.forEach((order) => {
    addTrend(byDay, dateKey(order.createdAt), number(order.total));
    (order.items || []).forEach((item) => {
      const category = item.type === "drink" ? "茶饮" : "茶品";
      addTrend(byCategory, category, number(item.lineTotal || item.price * item.quantity));
      if (!topItems[item.name]) {
        topItems[item.name] = { name: item.name, type: category, amount: 0, count: 0 };
      }
      topItems[item.name].amount += number(item.lineTotal || item.price * item.quantity);
      topItems[item.name].count += number(item.quantity);
    });
  });

  const trend = Object.keys(byDay).sort().slice(-14).map((key) => ({ date: key, amount: byDay[key] }));
  const categories = Object.keys(byCategory).map((name) => ({ name, amount: byCategory[name] }))
    .sort((a, b) => b.amount - a.amount);

  return {
    ok: true,
    analytics: {
      summary: {
        revenue: revenueOrders.reduce((sum, order) => sum + number(order.total), 0),
        reservations: reservations.filter((item) => item.status !== "已取消").length,
        signups: signups.filter((item) => item.status !== "已取消").length,
        averageOrder: revenueOrders.length
          ? Math.round(revenueOrders.reduce((sum, order) => sum + number(order.total), 0) / revenueOrders.length)
          : 0
      },
      trend,
      categories,
      topItems: Object.values(topItems).sort((a, b) => b.amount - a.amount).slice(0, 10)
    }
  };
}

function normalizeContent(data = {}) {
  return {
    key: cleanId(data.key, "content"),
    type: cleanText(data.type, 30) || "home_carousel",
    title: cleanText(data.title, 80),
    subtitle: cleanText(data.subtitle, 100),
    summary: cleanText(data.summary, 300),
    image: cleanText(data.image, 240),
    linkType: cleanText(data.linkType, 30),
    linkTarget: cleanText(data.linkTarget, 120),
    visible: data.visible !== false,
    sort: Math.max(0, Number(data.sort) || 0)
  };
}

async function listContent(event) {
  const type = cleanText(event.type, 30);
  const items = await readCollection("content_blocks", {
    where: type && type !== "all" ? { type } : undefined,
    orderBy: "sort",
    order: "asc",
    limit: 100
  });
  return { ok: true, items };
}

async function saveContent(event) {
  const payload = normalizeContent(event.data || {});
  await upsertRecord("content_blocks", "key", payload.key, payload);
  return { ok: true, key: payload.key };
}

async function deleteContent(event) {
  const key = cleanText(event.key || event.id, 80);
  if (!key) {
    return { ok: false, message: "缺少内容 key" };
  }
  const existing = await findRecord("content_blocks", "key", key);
  if (!existing) {
    return { ok: false, message: "内容不存在" };
  }
  await db.collection("content_blocks").doc(existing._id).update({
    data: {
      visible: false,
      updatedAt: db.serverDate()
    }
  });
  return { ok: true };
}

function normalizeCoupon(data = {}) {
  return {
    id: cleanId(data.id, "coupon"),
    name: cleanText(data.name, 80),
    description: cleanText(data.description, 160),
    amount: Math.max(0, Number(data.amount) || 0),
    threshold: Math.max(0, Number(data.threshold) || 0),
    stock: Math.max(0, Number(data.stock) || 0),
    issued: Math.max(0, Number(data.issued) || 0),
    redeemed: Math.max(0, Number(data.redeemed) || 0),
    claimLimit: Math.max(1, Number(data.claimLimit) || 1),
    startAt: cleanText(data.startAt, 30),
    endAt: cleanText(data.endAt, 30),
    status: cleanText(data.status, 20) || "领取中",
    visible: data.visible !== false
  };
}

function normalizeCampaign(data = {}) {
  return {
    id: cleanId(data.id, "campaign"),
    name: cleanText(data.name, 80),
    type: cleanText(data.type, 30) || "banner",
    summary: cleanText(data.summary, 200),
    startAt: cleanText(data.startAt, 30),
    endAt: cleanText(data.endAt, 30),
    status: cleanText(data.status, 20) || "进行中",
    visible: data.visible !== false
  };
}

async function listMarketing() {
  const [coupons, campaigns] = await Promise.all([
    readCollection("coupons", { orderBy: "createdAt", limit: 100 }),
    readCollection("marketing_campaigns", { orderBy: "createdAt", limit: 100 })
  ]);
  return { ok: true, coupons, campaigns };
}

async function saveCoupon(event) {
  const payload = normalizeCoupon(event.data || {});
  if (!payload.name || !payload.amount) {
    return { ok: false, message: "请填写优惠券名称和面额" };
  }
  await upsertRecord("coupons", "id", payload.id, payload);
  return { ok: true, id: payload.id };
}

async function saveCampaign(event) {
  const payload = normalizeCampaign(event.data || {});
  if (!payload.name) {
    return { ok: false, message: "请填写营销计划名称" };
  }
  await upsertRecord("marketing_campaigns", "id", payload.id, payload);
  return { ok: true, id: payload.id };
}

async function disableRecord(collection, id) {
  const existing = await findRecord(collection, "id", cleanText(id, 80));
  if (!existing) {
    return { ok: false, message: "数据不存在" };
  }
  await db.collection(collection).doc(existing._id).update({
    data: {
      visible: false,
      status: "已停用",
      updatedAt: db.serverDate()
    }
  });
  return { ok: true };
}

function normalizeSettings(data = {}) {
  return {
    key: "store",
    brandName: cleanText(data.brandName, 80) || "禾熙 HEXI TEA",
    slogan: cleanText(data.slogan, 120),
    storeName: cleanText(data.storeName, 80),
    address: cleanText(data.address, 160),
    phone: cleanText(data.phone, 40),
    businessHours: cleanText(data.businessHours, 160),
    reservationRule: cleanText(data.reservationRule, 300),
    memberPointRate: Math.max(0, Number(data.memberPointRate) || 1),
    levelOneName: cleanText(data.levelOneName, 20) || "雅客会员",
    levelOneMinSpend: Math.max(0, Number(data.levelOneMinSpend) || 0),
    levelOneDiscountRate: Math.min(1, Math.max(0.01, Number(data.levelOneDiscountRate) || 0.98)),
    levelTwoName: cleanText(data.levelTwoName, 20) || "臻享会员",
    levelTwoMinSpend: Math.max(0, Number(data.levelTwoMinSpend) || 1600),
    levelTwoDiscountRate: Math.min(1, Math.max(0.01, Number(data.levelTwoDiscountRate) || 0.95)),
    levelThreeName: cleanText(data.levelThreeName, 20) || "山房会员",
    levelThreeMinSpend: Math.max(0, Number(data.levelThreeMinSpend) || 5000),
    levelThreeDiscountRate: Math.min(1, Math.max(0.01, Number(data.levelThreeDiscountRate) || 0.92)),
    orderPaidTemplateId: cleanText(data.orderPaidTemplateId, 80),
    orderPaidPage: cleanText(data.orderPaidPage, 120) || "pages/profile/index",
    orderShippedTemplateId: cleanText(data.orderShippedTemplateId, 80),
    orderShippedPage: cleanText(data.orderShippedPage, 120) || "pages/profile/index",
    reservationTemplateId: cleanText(data.reservationTemplateId, 80),
    reservationNoticePage: cleanText(data.reservationNoticePage, 120) || "pages/reservation/index",
    eventTemplateId: cleanText(data.eventTemplateId, 80),
    eventNoticePage: cleanText(data.eventNoticePage, 120) || "pages/events/index",
    paymentEnabled: data.paymentEnabled !== false,
    pickupEnabled: data.pickupEnabled !== false,
    shippingEnabled: data.shippingEnabled !== false,
    orderNoticeEnabled: data.orderNoticeEnabled !== false,
    reservationNoticeEnabled: data.reservationNoticeEnabled !== false,
    eventNoticeEnabled: data.eventNoticeEnabled !== false
  };
}

async function getSettings() {
  const existing = await findRecord("store_settings", "key", "store");
  return {
    ok: true,
    settings: existing || normalizeSettings({})
  };
}

async function updateSettings(event) {
  const payload = normalizeSettings(event.data || {});
  await upsertRecord("store_settings", "key", "store", payload);
  return { ok: true, settings: payload };
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
    if (action === "getDashboard") {
      return await getDashboard();
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
    if (action === "listCustomers") {
      return await listCustomers(event);
    }
    if (action === "deleteCustomerData") {
      return await deleteCustomerData(event, caller);
    }
    if (action === "getAnalytics") {
      return await getAnalytics();
    }
    if (action === "listContent") {
      return await listContent(event);
    }
    if (action === "saveContent") {
      return await saveContent(event);
    }
    if (action === "deleteContent") {
      return await deleteContent(event);
    }
    if (action === "listMarketing") {
      return await listMarketing();
    }
    if (action === "saveCoupon") {
      return await saveCoupon(event);
    }
    if (action === "saveCampaign") {
      return await saveCampaign(event);
    }
    if (action === "disableCoupon") {
      return await disableRecord("coupons", event.id);
    }
    if (action === "disableCampaign") {
      return await disableRecord("marketing_campaigns", event.id);
    }
    if (action === "getSettings") {
      return await getSettings();
    }
    if (action === "updateSettings") {
      return await updateSettings(event);
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
