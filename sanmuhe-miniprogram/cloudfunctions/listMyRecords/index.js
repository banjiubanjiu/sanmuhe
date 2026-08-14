const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const https = require("https");
const querystring = require("querystring");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/** 快递100官方要求同一运单查询间隔至少 30 分钟，避免高频查询导致锁单 */
const LOGISTICS_QUERY_MIN_INTERVAL_MS = 30 * 60 * 1000;

/** 微信运力编码 / 中文 → 快递100 com */
const KUAIDI100_COM_MAP = {
  SF: "shunfeng",
  顺丰: "shunfeng",
  顺丰速运: "shunfeng",
  STO: "shentong",
  申通: "shentong",
  申通快递: "shentong",
  YTO: "yuantong",
  圆通: "yuantong",
  圆通速递: "yuantong",
  ZTO: "zhongtong",
  中通: "zhongtong",
  中通快递: "zhongtong",
  YD: "yunda",
  韵达: "yunda",
  韵达快递: "yunda",
  韵达速递: "yunda",
  EMS: "ems",
  邮政: "ems",
  中国邮政: "ems",
  JD: "jd",
  京东: "jd",
  京东物流: "jd",
  JTSD: "jtexpress",
  极兔: "jtexpress",
  极兔速递: "jtexpress",
  DBL: "debangwuliu",
  德邦: "debangwuliu",
  HTKY: "huitongkuaidi",
  百世: "huitongkuaidi",
  UC: "youshuwuliu",
  ANE: "annengwuliu",
  CNSD: "cainiao"
};

const ACTIVE_ORDER_STATUSES = ["已付款", "制作中", "待确认", "待发货", "待自提", "已发货", "异常待处理", "支付异常待处理"];
const AFTER_SALE_STATUSES = ["申请售后", "审核中", "处理中", "已退款", "已拒绝", "已关闭"];

async function loadReservationBookingPolicy() {
  const fallbackHours = Math.max(1, Number(process.env.RESERVATION_CANCEL_ADVANCE_HOURS || 12));
  const fallbackLock = Math.max(1, Number(process.env.RESERVATION_LOCK_MINUTES || process.env.ORDER_LOCK_MINUTES || 15));
  try {
    const result = await db.collection("store_settings").where({ key: "store" }).limit(1).get();
    const row = result.data && result.data[0] ? result.data[0] : null;
    return {
      cancelAdvanceHours: Math.max(1, Math.min(168, Number(row && row.reservationCancelAdvanceHours) || fallbackHours)),
      lockMinutes: Math.max(1, Math.min(120, Number(row && row.reservationLockMinutes) || fallbackLock))
    };
  } catch (error) {
    return { cancelAdvanceHours: fallbackHours, lockMinutes: fallbackLock };
  }
}
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
  "shippingPayMode",
  "freightCollect",
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
  "trackingCompanyCode",
  "trackingNo",
  "logisticsState",
  "logisticsTraces",
  "logisticsUpdatedAt",
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
  const orderNo = cleanText(
    event.orderNo || event.merchantTradeNo || event.merchant_trade_no || event.outTradeNo || event.out_trade_no,
    64
  );
  // 微信「订单发货通知」跳转附带 transaction_id，据此定位本地订单
  const transactionId = cleanText(event.transactionId || event.transaction_id, 64);
  const queries = [];
  if (orderId) {
    queries.push({ _id: orderId });
  }
  if (orderNo) {
    queries.push({ orderNo });
  }
  if (transactionId) {
    queries.push({ transactionId });
  }
  if (!queries.length) {
    return null;
  }
  // 按优先级逐条件回退，微信跳转同时带 orderNo 与 transaction_id 时也能兜底
  for (const where of queries) {
    const result = await db.collection("orders")
      .where(Object.assign({ _openid: openid }, where))
      .limit(1)
      .get();
    if (result.data && result.data[0]) {
      return result.data[0];
    }
  }
  return null;
}

function inventorySnapshot(item = {}) {
  return {
    stock: Math.max(0, Number(item.stock) || 0),
    lockedStock: Math.max(0, Number(item.lockedStock) || 0),
    soldStock: Math.max(0, Number(item.soldStock) || 0)
  };
}

function applySpecInventoryDelta(item, specLabel, deltaLocked) {
  const specs = Array.isArray(item.specs) ? item.specs.map((spec) => Object.assign({}, spec)) : [];
  if (!specs.length) return null;
  const label = String(specLabel || "").trim();
  let index = specs.findIndex((spec) => String(spec.label || "").trim() === label);
  if (index < 0) index = 0;
  const current = specs[index] || {};
  specs[index] = Object.assign({}, current, {
    stock: Math.max(0, Number(current.stock) || 0),
    lockedStock: Math.max(0, Math.max(0, Number(current.lockedStock) || 0) + deltaLocked),
    soldStock: Math.max(0, Number(current.soldStock) || 0)
  });
  return {
    specs,
    stock: specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.stock) || 0), 0),
    lockedStock: specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.lockedStock) || 0), 0),
    soldStock: specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.soldStock) || 0), 0)
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
      const item = latest.data || {};
      const useSpec = lock.mode === "spec"
        || (Array.isArray(item.specs)
          && item.specs.some((spec) => spec && spec.stock !== undefined && spec.stock !== null && spec.stock !== "")
          && lock.specLabel);
      if (useSpec) {
        const beforeSpec = (item.specs || []).find((spec) => String(spec.label || "").trim() === String(lock.specLabel || "").trim()) || {};
        const beforeLocked = Math.max(0, Number(beforeSpec.lockedStock) || 0);
        const quantity = Math.min(beforeLocked, Math.max(0, Number(lock.quantity) || 0));
        if (quantity <= 0) continue;
        const next = applySpecInventoryDelta(item, lock.specLabel, -quantity);
        if (next) {
          await db.collection(lock.collection).doc(lock.docId).update({
            data: {
              specs: next.specs,
              stock: next.stock,
              lockedStock: next.lockedStock,
              soldStock: next.soldStock,
              updatedAt: db.serverDate()
            }
          });
        }
        await writeInventoryLog({
          collection: lock.collection,
          docId: lock.docId,
          itemId: lock.id || "",
          itemName: lock.specLabel ? `${lock.name || ""} / ${lock.specLabel}` : (lock.name || ""),
          type: "customer_cancel_release",
          quantity,
          beforeStock: Math.max(0, Number(beforeSpec.stock) || 0),
          afterStock: Math.max(0, Number(beforeSpec.stock) || 0),
          beforeLockedStock: beforeLocked,
          afterLockedStock: Math.max(0, beforeLocked - quantity),
          beforeSoldStock: Math.max(0, Number(beforeSpec.soldStock) || 0),
          afterSoldStock: Math.max(0, Number(beforeSpec.soldStock) || 0),
          orderNo: order.orderNo || "",
          note: "顾客取消未支付订单，释放规格库存锁定"
        });
        continue;
      }
      const before = inventorySnapshot(item);
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

function resolveKuaidi100Com(order = {}) {
  const candidates = [
    order.trackingCompanyCode,
    order.expressCompany,
    order.trackingCompany
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const raw = cleanText(candidates[i], 40);
    if (!raw) {
      continue;
    }
    if (KUAIDI100_COM_MAP[raw]) {
      return KUAIDI100_COM_MAP[raw];
    }
    const upper = raw.toUpperCase();
    if (KUAIDI100_COM_MAP[upper]) {
      return KUAIDI100_COM_MAP[upper];
    }
    // 已是快递100编码
    if (/^[a-z][a-z0-9]+$/.test(raw)) {
      return raw;
    }
  }
  return "";
}

function postForm(hostname, path, form) {
  const body = querystring.stringify(form);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (error) {
          reject(new Error("物流接口返回无法解析"));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error("物流查询超时"));
    });
    req.write(body);
    req.end();
  });
}

/**
 * 快递100 实时查询
 * 环境变量：KUAIDI100_CUSTOMER、KUAIDI100_KEY
 * 文档：sign = MD5(param + key + customer).toUpperCase()
 */
async function queryKuaidi100(com, num, phone) {
  const customer = String(process.env.KUAIDI100_CUSTOMER || "").trim();
  const key = String(process.env.KUAIDI100_KEY || "").trim();
  if (!customer || !key) {
    return {
      ok: false,
      configured: false,
      message: "物流查询未配置（请在 listMyRecords 环境变量填写 KUAIDI100_CUSTOMER / KUAIDI100_KEY）"
    };
  }
  if (!com || !num) {
    return { ok: false, configured: true, message: "缺少快递公司或运单号" };
  }

  const paramObj = { com, num, resultv2: "1" };
  // 顺丰等常要求收/寄件人手机后四位
  const phoneDigits = String(phone || "").replace(/\D/g, "");
  if (phoneDigits.length >= 4) {
    paramObj.phone = phoneDigits.slice(-4);
  }
  const param = JSON.stringify(paramObj);
  const sign = crypto.createHash("md5").update(param + key + customer).digest("hex").toUpperCase();

  let data;
  try {
    data = await postForm("poll.kuaidi100.com", "/poll/query.do", {
      customer,
      sign,
      param
    });
  } catch (error) {
    return {
      ok: false,
      configured: true,
      message: (error && error.message) || "物流查询失败"
    };
  }

  if (String(data.status) !== "200" && !Array.isArray(data.data)) {
    return {
      ok: false,
      configured: true,
      message: data.message || data.returnCode || "暂无轨迹",
      raw: data
    };
  }

  const traces = (data.data || []).map((item) => ({
    time: item.time || item.ftime || "",
    context: item.context || item.status || "",
    status: item.statusCode || item.status || ""
  }));

  return {
    ok: true,
    configured: true,
    com: data.com || com,
    nu: data.nu || num,
    state: data.state || data.condition || "",
    ischeck: data.ischeck,
    traces
  };
}

async function queryLogistics(event, openid) {
  const order = await findOwnOrder(event, openid);
  if (!order) {
    return { ok: false, message: "订单不存在" };
  }
  if (order.deliveryMethod !== "shipping") {
    return { ok: false, message: "非快递订单无物流轨迹" };
  }
  if (!order.trackingNo) {
    return {
      ok: true,
      pending: true,
      message: "商家尚未填写运单号",
      trackingCompany: order.trackingCompany || "",
      trackingNo: "",
      traces: []
    };
  }

  const com = resolveKuaidi100Com(order);
  const queryKey = `${com}:${order.trackingNo}`;
  const lastAttemptValue = order.logisticsQueryAttemptAt || order.logisticsUpdatedAt;
  const lastAttemptAt = lastAttemptValue ? new Date(lastAttemptValue).getTime() : 0;
  const previousQueryKey = String(order.logisticsQueryKey || "").trim();
  const isSameQuery = !previousQueryKey || previousQueryKey === queryKey;
  const elapsed = lastAttemptAt && Number.isFinite(lastAttemptAt) ? Date.now() - lastAttemptAt : Infinity;
  const remainingMs = Math.max(0, LOGISTICS_QUERY_MIN_INTERVAL_MS - elapsed);

  // 即使客户端传 force，也不能绕过快递100的 30 分钟限频要求。
  if (isSameQuery && remainingMs > 0) {
    const retryAfterSeconds = Math.ceil(remainingMs / 1000);
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    const traces = Array.isArray(order.logisticsTraces) ? order.logisticsTraces : [];
    if (traces.length) {
      return {
        ok: true,
        cached: true,
        message: `物流数据已缓存，约 ${remainingMinutes} 分钟后可再次查询`,
        retryAfterSeconds,
        nextRefreshAt: new Date(Date.now() + remainingMs).toISOString(),
        trackingCompany: order.trackingCompany || "",
        trackingNo: order.trackingNo,
        state: order.logisticsState || "",
        traces
      };
    }
    return {
      ok: true,
      cached: true,
      pending: true,
      message: "物流信息更新中，请稍后再查看",
      retryAfterSeconds,
      nextRefreshAt: new Date(Date.now() + remainingMs).toISOString(),
      trackingCompany: order.trackingCompany || "",
      trackingNo: order.trackingNo,
      traces: []
    };
  }

  // 查询前记录尝试时间，避免多个客户端并发重复请求同一运单。
  try {
    await db.collection("orders").doc(order._id).update({
      data: {
        logisticsQueryAttemptAt: db.serverDate(),
        logisticsQueryKey: queryKey,
        updatedAt: db.serverDate()
      }
    });
  } catch (error) {
    // 记录失败不阻断本次查询；快递100仍有自身限流保护。
  }

  const result = await queryKuaidi100(com, order.trackingNo, order.phone);
  if (!result.ok) {
    try {
      await db.collection("orders").doc(order._id).update({
        data: {
          logisticsLastError: result.message || "查询失败",
          logisticsQueryAttemptAt: db.serverDate(),
          logisticsQueryKey: queryKey,
          updatedAt: db.serverDate()
        }
      });
    } catch (error) {
      // 错误状态缓存失败不影响返回。
    }
    return {
      ok: false,
      configured: result.configured !== false,
      message: result.message || "查询失败",
      retryAfterSeconds: Math.ceil(LOGISTICS_QUERY_MIN_INTERVAL_MS / 1000),
      trackingCompany: order.trackingCompany || "",
      trackingNo: order.trackingNo,
      traces: order.logisticsTraces || []
    };
  }

  try {
    await db.collection("orders").doc(order._id).update({
      data: {
        logisticsState: result.state || "",
        logisticsTraces: result.traces,
        logisticsCom: result.com || com,
        logisticsLastError: "",
        logisticsQueryAttemptAt: db.serverDate(),
        logisticsQueryKey: queryKey,
        logisticsUpdatedAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
  } catch (error) {
    // 缓存失败不影响返回
  }

  return {
    ok: true,
    cached: false,
    retryAfterSeconds: Math.ceil(LOGISTICS_QUERY_MIN_INTERVAL_MS / 1000),
    trackingCompany: order.trackingCompany || "",
    trackingNo: order.trackingNo,
    state: result.state || "",
    traces: result.traces
  };
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
    if (event.action === "queryLogistics") {
      return await queryLogistics(event, OPENID);
    }

    const [orders, orderSummary, reservations, signups, coupons, member, wallet, bookingPolicy] = await Promise.all([
      getMine("orders", OPENID, { required: true }),
      getOrderSummary(OPENID),
      getMine("reservations", OPENID),
      getMine("event_signups", OPENID),
      getMyCoupons(OPENID),
      getMember(OPENID),
      getWallet(OPENID),
      loadReservationBookingPolicy()
    ]);

    return {
      ok: true,
      orders: orders.map(publicOrder),
      orderSummary,
      reservations: reservations.map((item) => Object.assign({ id: item._id }, item)),
      signups: signups.map((item) => Object.assign({ id: item._id }, item)),
      coupons,
      member,
      wallet: member ? wallet : null,
      cancelAdvanceHours: bookingPolicy.cancelAdvanceHours,
      lockMinutes: bookingPolicy.lockMinutes
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
