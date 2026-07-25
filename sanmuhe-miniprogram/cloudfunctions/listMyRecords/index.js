const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const ACTIVE_ORDER_STATUSES = ["待确认", "待发货", "待自提", "已发货", "异常待处理", "支付异常待处理"];
const AFTER_SALE_STATUSES = ["申请售后", "审核中", "处理中", "已退款", "已拒绝", "已关闭"];
const PUBLIC_ORDER_FIELDS = [
  "_id",
  "orderNo",
  "status",
  "payStatus",
  "payMode",
  "deliveryMethod",
  "items",
  "subtotal",
  "discount",
  "shippingFee",
  "total",
  "consignee",
  "name",
  "phone",
  "address",
  "province",
  "city",
  "district",
  "detailAddress",
  "tableNo",
  "pickupNote",
  "remark",
  "trackingCompany",
  "trackingNo",
  "fulfillmentStatus",
  "afterSaleStatus",
  "afterSaleReason",
  "afterSaleNote",
  "refundAmount",
  "cancelReason",
  "pointsEarned",
  "lockedUntil",
  "createdAt",
  "updatedAt",
  "paidAt",
  "confirmedAt",
  "shippedAt",
  "completedAt",
  "cancelledAt",
  "afterSaleUpdatedAt"
];

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

function publicOrder(item = {}) {
  const order = PUBLIC_ORDER_FIELDS.reduce((result, field) => {
    if (item[field] !== undefined) {
      result[field] = item[field];
    }
    return result;
  }, {});
  order.id = item._id || item.orderNo || "";
  order.paymentStarted = item.payStatus === "pending" && Boolean(item.prepayId);
  return order;
}

async function getMine(collection, openid, options = {}) {
  await ensureCollection(collection);
  try {
    const result = await db.collection(collection)
      .where({ _openid: openid })
      .orderBy("createdAt", "desc")
      .limit(options.limit || 30)
      .get();
    return result.data || [];
  } catch (error) {
    if (options.required) {
      throw error;
    }
    return [];
  }
}

function paging(event = {}) {
  const page = Math.max(1, Math.floor(Number(event.page) || 1));
  const pageSize = Math.min(20, Math.max(5, Math.floor(Number(event.pageSize) || 10)));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function orderWhere(openid, tab) {
  const where = { _openid: openid };
  if (tab === "pending") {
    where.status = "待支付";
  } else if (tab === "active") {
    where.status = _.in(ACTIVE_ORDER_STATUSES);
  } else if (tab === "completed") {
    where.status = _.in(["已完成", "已取消"]);
  } else if (tab === "afterSale") {
    where.afterSaleStatus = _.in(AFTER_SALE_STATUSES);
  }
  return where;
}

async function countOrders(openid, tab) {
  const result = await db.collection("orders").where(orderWhere(openid, tab)).count();
  return Math.max(0, Number(result.total) || 0);
}

async function getOrderSummary(openid) {
  await ensureCollection("orders");
  const [all, pending, active, completed, afterSale] = await Promise.all([
    countOrders(openid, "all"),
    countOrders(openid, "pending"),
    countOrders(openid, "active"),
    countOrders(openid, "completed"),
    countOrders(openid, "afterSale")
  ]);
  return { all, pending, active, completed, afterSale };
}

async function listOrders(event, openid) {
  await ensureCollection("orders");
  const tab = ["all", "pending", "active", "completed", "afterSale"].includes(event.tab) ? event.tab : "all";
  const page = paging(event);
  const where = orderWhere(openid, tab);
  const totalResult = await db.collection("orders").where(where).count();
  const result = await db.collection("orders")
    .where(where)
    .orderBy("createdAt", "desc")
    .skip(page.offset)
    .limit(page.pageSize)
    .get();
  const total = Math.max(0, Number(totalResult.total) || 0);
  return {
    ok: true,
    orders: (result.data || []).map(publicOrder),
    page: {
      page: page.page,
      pageSize: page.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / page.pageSize)),
      hasMore: page.offset + (result.data || []).length < total
    }
  };
}

async function findOwnOrder(event, openid) {
  const orderId = cleanText(event.orderId || event.id, 80);
  const orderNo = cleanText(event.orderNo, 40);
  if (!orderId && !orderNo) {
    return null;
  }
  const where = { _openid: openid };
  if (orderId) {
    where._id = orderId;
  } else {
    where.orderNo = orderNo;
  }
  const result = await db.collection("orders").where(where).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

function inventorySnapshot(item = {}) {
  return {
    stock: Math.max(0, Number(item.stock) || 0),
    lockedStock: Math.max(0, Number(item.lockedStock) || 0),
    soldStock: Math.max(0, Number(item.soldStock) || 0)
  };
}

async function writeInventoryLog(entry = {}) {
  try {
    await ensureCollection("inventory_logs");
    await db.collection("inventory_logs").add({
      data: Object.assign({
        collection: "",
        docId: "",
        itemId: "",
        itemName: "",
        type: "",
        quantity: 0,
        beforeStock: null,
        afterStock: null,
        beforeLockedStock: null,
        afterLockedStock: null,
        beforeSoldStock: null,
        afterSoldStock: null,
        orderNo: "",
        operator: "customer",
        note: "",
        createdAt: db.serverDate()
      }, entry)
    });
  } catch (error) {
    // The cancellation remains authoritative; inventory logs are supporting evidence.
  }
}

async function releaseInventory(locks, order) {
  for (const lock of locks || []) {
    if (!lock.docId || !lock.collection || Number(lock.quantity) <= 0) {
      continue;
    }
    try {
      const latest = await db.collection(lock.collection).doc(lock.docId).get();
      const before = inventorySnapshot(latest.data || {});
      const quantity = Math.min(before.lockedStock, Math.max(0, Number(lock.quantity) || 0));
      if (quantity <= 0) {
        continue;
      }
      await db.collection(lock.collection).doc(lock.docId).update({
        data: {
          lockedStock: _.inc(-quantity),
          updatedAt: db.serverDate()
        }
      });
      await writeInventoryLog({
        collection: lock.collection,
        docId: lock.docId,
        itemId: lock.id || "",
        itemName: lock.name || "",
        type: "customer_cancel_release",
        quantity,
        beforeStock: before.stock,
        afterStock: before.stock,
        beforeLockedStock: before.lockedStock,
        afterLockedStock: Math.max(0, before.lockedStock - quantity),
        beforeSoldStock: before.soldStock,
        afterSoldStock: before.soldStock,
        orderNo: order.orderNo || "",
        note: "顾客取消未支付订单，释放库存锁定"
      });
    } catch (error) {
      // Continue releasing any remaining inventory locks.
    }
  }
}

async function releaseUserCoupon(order) {
  const coupon = order && order.coupon;
  if (!coupon || !coupon.userCouponId) {
    return;
  }
  try {
    await db.collection("user_coupons").where({
      _id: coupon.userCouponId,
      _openid: order._openid,
      status: "已锁定",
      lockedOrderNo: order.orderNo
    }).update({
      data: {
        status: "可使用",
        lockedOrderNo: "",
        lockedUntil: null,
        discount: 0,
        updatedAt: db.serverDate()
      }
    });
  } catch (error) {
    // The order cancellation should still complete; coupon state can be reconciled from the order.
  }
}

async function cancelOwnOrder(event, openid) {
  const order = await findOwnOrder(event, openid);
  if (!order) {
    return { ok: false, message: "订单不存在或已更新" };
  }
  if (!["待支付", "待确认"].includes(order.status) || order.payStatus === "paid") {
    return { ok: false, message: "当前订单不能直接取消，可申请售后或联系门店" };
  }
  if (order.payStatus === "pending" && order.prepayId) {
    return { ok: false, message: "支付结果正在确认，请稍后刷新订单状态" };
  }
  const reason = cleanText(event.reason, 160) || "顾客主动取消";
  const shouldRelease = order.lockReleased !== true && ["pending", "manual"].includes(order.payStatus);
  const nextPayStatus = ["pending", "manual"].includes(order.payStatus) ? "cancelled" : order.payStatus;
  const cancelWhere = {
    _id: order._id,
    _openid: openid,
    status: order.status,
    payStatus: order.payStatus
  };
  if (order.payStatus === "pending") {
    cancelWhere.prepayId = _.exists(false);
  }
  const claim = await db.collection("orders").where(cancelWhere).update({
    data: {
      status: "已取消",
      payStatus: nextPayStatus,
      lockReleased: shouldRelease ? true : order.lockReleased,
      cancelReason: reason,
      cancelledBy: "customer",
      cancelledAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });
  if (!claim.updated) {
    return { ok: false, message: "订单状态已变化，请刷新后重试" };
  }
  if (shouldRelease) {
    await releaseInventory(order.inventoryLocks, order);
    await releaseUserCoupon(order);
  }
  return { ok: true, message: "订单已取消" };
}

async function applyAfterSale(event, openid) {
  const order = await findOwnOrder(event, openid);
  if (!order) {
    return { ok: false, message: "订单不存在或已更新" };
  }
  if (["待支付", "待确认", "已取消"].includes(order.status)) {
    return { ok: false, message: "当前订单不能申请售后" };
  }
  if (order.afterSaleStatus === "已退款") {
    return { ok: false, message: "该订单已完成退款" };
  }
  if (order.afterSaleStatus && !["已退款", "已拒绝", "已关闭"].includes(order.afterSaleStatus)) {
    return { ok: false, message: "已有售后申请正在处理中" };
  }
  const reason = cleanText(event.reason, 160);
  if (!reason) {
    return { ok: false, message: "请填写售后原因" };
  }
  const where = {
    _id: order._id,
    _openid: openid,
    status: order.status
  };
  if (order.afterSaleStatus) {
    where.afterSaleStatus = order.afterSaleStatus;
  }
  const claim = await db.collection("orders").where(where).update({
    data: {
      afterSaleStatus: "申请售后",
      afterSaleReason: reason,
      afterSaleNote: "",
      refundAmount: 0,
      afterSaleRequestedBy: "customer",
      afterSaleUpdatedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });
  if (!claim.updated) {
    return { ok: false, message: "订单状态已变化，请刷新后重试" };
  }
  return { ok: true, message: "售后申请已提交" };
}

async function confirmReceipt(event, openid) {
  const order = await findOwnOrder(event, openid);
  if (!order) {
    return { ok: false, message: "订单不存在或已更新" };
  }
  if (order.deliveryMethod !== "shipping" || order.status !== "已发货") {
    return { ok: false, message: "当前订单不能确认收货" };
  }
  const claim = await db.collection("orders").where({
    _id: order._id,
    _openid: openid,
    status: "已发货"
  }).update({
    data: {
      status: "已完成",
      fulfillmentStatus: "delivered",
      completedBy: "customer",
      completedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });
  if (!claim.updated) {
    return { ok: false, message: "订单状态已变化，请刷新后重试" };
  }
  return { ok: true, message: "已确认收货" };
}

async function getMyCoupons(openid) {
  await ensureCollection("user_coupons");
  try {
    const result = await db.collection("user_coupons")
      .where({ _openid: openid })
      .orderBy("claimedAt", "desc")
      .limit(20)
      .get();
    return (result.data || []).map((item) => Object.assign({ id: item._id }, item));
  } catch (error) {
    return [];
  }
}

async function getMember(openid) {
  await ensureCollection("members");
  try {
    const result = await db.collection("members").where({ _openid: openid }).limit(1).get();
    const member = result.data && result.data[0] ? result.data[0] : null;
    if (!member || member.status !== "active" || !member.phone) {
      return null;
    }
    return {
      status: "active",
      name: member.name || "禾煦会员",
      tier: member.tier || "雅客会员",
      cardNo: member.cardNo || "",
      phoneMasked: `${String(member.phone).slice(0, 3)}****${String(member.phone).slice(-4)}`,
      points: Math.max(0, Number(member.points) || 0)
    };
  } catch (error) {
    return null;
  }
}

async function getWallet(openid) {
  await ensureCollection("wallet_accounts");
  try {
    const result = await db.collection("wallet_accounts").where({ _openid: openid }).limit(1).get();
    const wallet = result.data && result.data[0];
    if (!wallet) {
      return null;
    }
    return {
      balanceFen: Math.max(0, Math.round(Number(wallet.balanceFen) || 0)),
      balance: (Math.max(0, Math.round(Number(wallet.balanceFen) || 0)) / 100).toFixed(2),
      status: wallet.status || "active"
    };
  } catch (error) {
    return null;
  }
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "listMyRecords" };
  }

  const { OPENID } = cloud.getWXContext();
  try {
    if (event.action === "listOrders") {
      return await listOrders(event, OPENID);
    }
    if (event.action === "getOrder") {
      const order = await findOwnOrder(event, OPENID);
      return order
        ? { ok: true, order: publicOrder(order) }
        : { ok: false, message: "订单不存在或已更新" };
    }
    if (event.action === "cancelOrder") {
      return await cancelOwnOrder(event, OPENID);
    }
    if (event.action === "applyAfterSale") {
      return await applyAfterSale(event, OPENID);
    }
    if (event.action === "confirmReceipt") {
      return await confirmReceipt(event, OPENID);
    }

    const [orders, orderSummary, reservations, signups, coupons, member, wallet] = await Promise.all([
      getMine("orders", OPENID, { required: true }),
      getOrderSummary(OPENID),
      getMine("reservations", OPENID),
      getMine("event_signups", OPENID),
      getMyCoupons(OPENID),
      getMember(OPENID),
      getWallet(OPENID)
    ]);

    return {
      ok: true,
      orders: orders.map(publicOrder),
      orderSummary,
      reservations: reservations.map((item) => Object.assign({ id: item._id }, item)),
      signups: signups.map((item) => Object.assign({ id: item._id }, item)),
      coupons,
      member,
      wallet: member ? wallet : null
    };
  } catch (error) {
    console.error("listMyRecords failed", {
      action: event.action || "profile",
      message: error && error.message ? error.message : String(error)
    });
    return {
      ok: false,
      message: "订单服务暂时不可用，请稍后重试"
    };
  }
};
