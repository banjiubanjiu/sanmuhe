const http = require("http");
const crypto = require("crypto");
const cloud = require("wx-server-sdk");
const { hydrateEnv } = require("./secrets");
const {
  sendWeComOrderNotification,
  sendWeComRechargeNotification
} = require("./wecomOrderNotify");
const { sendWeComReservationNotification } = require("./wecomReservationNotify");
const {
  uploadPickupOrOnsiteShipping,
  uploadVirtualShipping,
  shippingResultFields
} = require("./wechatShipping");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const DEFAULT_MEMBER_LEVELS = [
  { tier: "雅客会员", minSpend: 0, discountRate: 1 },
  { tier: "臻享会员", minSpend: 1600, discountRate: 1 },
  { tier: "山房会员", minSpend: 5000, discountRate: 1 }
];

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected.
  }
}

function normalizePem(value) {
  let text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (!text.includes("-----BEGIN") && /^[A-Za-z0-9+/=\s]+$/.test(text) && text.length > 80) {
    try {
      const decoded = Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) {
        text = decoded;
      }
    } catch (error) {
      // keep original
    }
  }
  text = text.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (text.includes("-----BEGIN") && !text.includes("\n")) {
    text = text
      .replace(/-----BEGIN ([A-Z0-9 ]+)-----/g, "-----BEGIN $1-----\n")
      .replace(/-----END ([A-Z0-9 ]+)-----/g, "\n-----END $1-----");
    const match = text.match(/-----BEGIN [A-Z0-9 ]+-----\n([\s\S]*?)\n-----END [A-Z0-9 ]+-----/);
    if (match) {
      const body = match[1].replace(/\s+/g, "");
      const wrapped = body.match(/.{1,64}/g).join("\n");
      text = text.replace(match[1], wrapped);
    }
  }
  if (text.includes("-----BEGIN") && text.includes("\n")) {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const begin = lines[0];
    const end = lines[lines.length - 1];
    if (begin.startsWith("-----BEGIN") && end.startsWith("-----END")) {
      const body = lines.slice(1, -1).join("").replace(/\s+/g, "");
      const wrapped = body.match(/.{1,64}/g) || [];
      text = [begin, ...wrapped, end].join("\n");
    }
  }
  return text.trim();
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function getHeader(headers, name) {
  return headers[String(name || "").toLowerCase()] || "";
}

function getPlatformKey() {
  const key = process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY || process.env.WECHAT_PAY_PLATFORM_CERTIFICATE;
  if (!key) {
    throw new Error("未配置微信支付平台公钥或平台证书，无法验签");
  }
  return normalizePem(key);
}

function verifyNotify(headers, rawBody) {
  const timestamp = getHeader(headers, "Wechatpay-Timestamp");
  const nonce = getHeader(headers, "Wechatpay-Nonce");
  const signature = getHeader(headers, "Wechatpay-Signature");
  const platformKey = getPlatformKey();

  if (!timestamp || !nonce || !signature) {
    return false;
  }

  return crypto.createVerify("RSA-SHA256")
    .update(`${timestamp}\n${nonce}\n${rawBody}\n`)
    .verify(platformKey, signature, "base64");
}

function decryptResource(resource) {
  const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;
  if (!apiV3Key || Buffer.byteLength(apiV3Key) !== 32) {
    throw new Error("WECHAT_PAY_API_V3_KEY 必须是 32 字节 API v3 密钥");
  }
  if (!resource || resource.algorithm !== "AEAD_AES_256_GCM") {
    throw new Error("不支持的微信支付回调加密算法");
  }

  const ciphertext = Buffer.from(resource.ciphertext, "base64");
  const authTag = ciphertext.slice(ciphertext.length - 16);
  const data = ciphertext.slice(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(resource.nonce, "utf8")
  );
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  }
  decipher.setAuthTag(authTag);
  const decoded = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(decoded);
}

/** 兼容 wx-server-sdk：update 结果可能是 stats.updated 或 updated */
function dbUpdatedCount(result) {
  if (!result) {
    return 0;
  }
  if (result.stats && result.stats.updated != null) {
    return Number(result.stats.updated) || 0;
  }
  if (result.updated != null) {
    return Number(result.updated) || 0;
  }
  return 0;
}

function normalizePayMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return mode === "wallet" ? "balance" : mode;
}

async function findOrder(outTradeNo) {
  const result = await db.collection("orders").where({ orderNo: outTradeNo }).limit(1).get();
  const row = result.data && result.data[0] ? result.data[0] : null;
  if (!row) {
    return null;
  }
  // 查询结果应含 _id；兜底用 attach 场景由调用方补
  return row;
}

function inventorySnapshot(item = {}) {
  return {
    stock: Math.max(0, Number(item.stock) || 0),
    lockedStock: Math.max(0, Number(item.lockedStock) || 0),
    soldStock: Math.max(0, Number(item.soldStock) || 0)
  };
}

function applySpecInventoryDelta(item, specLabel, deltaLocked, deltaSold) {
  const specs = Array.isArray(item.specs) ? item.specs.map((spec) => Object.assign({}, spec)) : [];
  if (!specs.length) return null;
  const label = String(specLabel || "").trim();
  let index = specs.findIndex((spec) => String(spec.label || "").trim() === label);
  if (index < 0) index = 0;
  const current = specs[index] || {};
  specs[index] = Object.assign({}, current, {
    stock: Math.max(0, Number(current.stock) || 0),
    lockedStock: Math.max(0, Math.max(0, Number(current.lockedStock) || 0) + deltaLocked),
    soldStock: Math.max(0, Math.max(0, Number(current.soldStock) || 0) + deltaSold)
  });
  return {
    specs,
    stock: specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.stock) || 0), 0),
    lockedStock: specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.lockedStock) || 0), 0),
    soldStock: specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.soldStock) || 0), 0)
  };
}

function usesSpecInventory(item, lock = {}) {
  return lock.mode === "spec"
    || (Array.isArray(item.specs)
      && item.specs.some((spec) => spec && spec.stock !== undefined && spec.stock !== null && spec.stock !== "")
      && lock.specLabel);
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
        operator: "system",
        note: "",
        createdAt: db.serverDate()
      }, entry)
    });
  } catch (error) {
    // Do not fail a paid order because operational logging failed.
  }
}

async function confirmInventory(locks, orderNo) {
  for (const lock of locks || []) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }
    const latest = await db.collection(lock.collection).doc(lock.docId).get();
    const item = latest.data || {};
    if (usesSpecInventory(item, lock)) {
      const beforeSpec = (item.specs || []).find((spec) => String(spec.label || "").trim() === String(lock.specLabel || "").trim()) || (item.specs || [])[0] || {};
      const before = {
        stock: Math.max(0, Number(beforeSpec.stock) || 0),
        lockedStock: Math.max(0, Number(beforeSpec.lockedStock) || 0),
        soldStock: Math.max(0, Number(beforeSpec.soldStock) || 0)
      };
      const next = applySpecInventoryDelta(item, lock.specLabel, -lock.quantity, lock.quantity);
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
        type: "payment_confirm",
        quantity: lock.quantity,
        beforeStock: before.stock,
        afterStock: before.stock,
        beforeLockedStock: before.lockedStock,
        afterLockedStock: Math.max(0, before.lockedStock - lock.quantity),
        beforeSoldStock: before.soldStock,
        afterSoldStock: before.soldStock + lock.quantity,
        orderNo,
        operator: "wechatPayNotify",
        note: "支付成功确认规格库存"
      });
      continue;
    }
    const before = inventorySnapshot(item);
    await db.collection(lock.collection).doc(lock.docId).update({
      data: {
        lockedStock: _.inc(-lock.quantity),
        soldStock: _.inc(lock.quantity),
        updatedAt: db.serverDate()
      }
    });
    await writeInventoryLog({
      collection: lock.collection,
      docId: lock.docId,
      itemId: lock.id || "",
      itemName: lock.name || "",
      type: "payment_confirm",
      quantity: lock.quantity,
      beforeStock: before.stock,
      afterStock: before.stock,
      beforeLockedStock: before.lockedStock,
      afterLockedStock: Math.max(0, before.lockedStock - lock.quantity),
      beforeSoldStock: before.soldStock,
      afterSoldStock: before.soldStock + lock.quantity,
      orderNo,
      operator: "wechatPayNotify",
      note: "支付成功确认库存"
    });
  }
}

/** 在线付成功后的状态：堂饮直接「已付款」；自提/邮寄走履约态 */
function getPaidStatus(order) {
  if (order.deliveryMethod === "pickup") {
    return "待自提";
  }
  if (order.deliveryMethod === "onsite") {
    return "已付款";
  }
  return "待发货";
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

async function readSettings() {
  await ensureCollection("store_settings");
  try {
    const result = await db.collection("store_settings").where({ key: "store" }).limit(1).get();
    return result.data && result.data[0] ? result.data[0] : {};
  } catch (error) {
    return {};
  }
}

function getLevelRules(settings = {}) {
  return [
    {
      tier: String(settings.levelOneName || DEFAULT_MEMBER_LEVELS[0].tier),
      minSpend: number(settings.levelOneMinSpend),
      discountRate: Number(settings.levelOneDiscountRate || DEFAULT_MEMBER_LEVELS[0].discountRate)
    },
    {
      tier: String(settings.levelTwoName || DEFAULT_MEMBER_LEVELS[1].tier),
      minSpend: number(settings.levelTwoMinSpend || DEFAULT_MEMBER_LEVELS[1].minSpend),
      discountRate: Number(settings.levelTwoDiscountRate || DEFAULT_MEMBER_LEVELS[1].discountRate)
    },
    {
      tier: String(settings.levelThreeName || DEFAULT_MEMBER_LEVELS[2].tier),
      minSpend: number(settings.levelThreeMinSpend || DEFAULT_MEMBER_LEVELS[2].minSpend),
      discountRate: Number(settings.levelThreeDiscountRate || DEFAULT_MEMBER_LEVELS[2].discountRate)
    }
  ].sort((a, b) => a.minSpend - b.minSpend);
}

function getLevelBySpend(totalSpend, levels) {
  return levels.reduce((current, level) => totalSpend >= level.minSpend ? level : current, levels[0]);
}

async function markCouponUsed(order) {
  if (!order.coupon || !order.coupon.userCouponId) {
    return;
  }
  await ensureCollection("user_coupons");
  await db.collection("user_coupons").doc(order.coupon.userCouponId).update({
    data: {
      status: "已使用",
      usedOrderId: order._id,
      usedOrderNo: order.orderNo,
      usedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });
  if (order.coupon.couponId) {
    try {
      const couponResult = await db.collection("coupons").where({ id: order.coupon.couponId }).limit(1).get();
      const coupon = couponResult.data && couponResult.data[0];
      if (coupon) {
        await db.collection("coupons").doc(coupon._id).update({
          data: {
            redeemed: _.inc(1),
            updatedAt: db.serverDate()
          }
        });
      }
    } catch (error) {
      // Coupon template statistics are non-critical after the user coupon is consumed.
    }
  }
}

async function updateMemberAfterPaid(order) {
  const openid = order._openid;
  if (!openid) {
    return { pointsEarned: 0, tier: "" };
  }

  await ensureCollection("members");
  const settings = await readSettings();
  const pointRate = Math.max(0, Number(settings.memberPointRate || 1));
  const pointsEarned = Math.floor(number(order.total) * pointRate);
  const existingResult = await db.collection("members").where({ _openid: openid }).limit(1).get();
  const existing = existingResult.data && existingResult.data[0];
  if (!existing || existing.status !== "active" || !existing.phone) {
    return { pointsEarned: 0, tier: "" };
  }
  const nextTotalSpend = number(existing && existing.totalSpend) + number(order.total);
  const nextPaidOrders = number(existing && existing.paidOrders) + 1;
  const nextPoints = number(existing && existing.points) + pointsEarned;
  const level = getLevelBySpend(nextTotalSpend, getLevelRules(settings));
  const data = {
    _openid: openid,
    name: existing.name || "禾煦会员",
    phone: existing.phone,
    cardNo: existing.cardNo || `SMH ${String(openid).slice(-6).toUpperCase()}`,
    tier: level.tier,
    discountRate: level.discountRate,
    points: nextPoints,
    totalSpend: nextTotalSpend,
    paidOrders: nextPaidOrders,
    lastPaidAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  await db.collection("members").doc(existing._id).update({ data });

  return { pointsEarned, tier: level.tier };
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

function notifyStaffPaidOrder(order = {}) {
  if (!cloud.callFunction) {
    return Promise.resolve();
  }
  const itemSummary = (order.items || [])
    .map((item) => `${item.name || "商品"}x${item.quantity || 1}`)
    .join("、")
    .slice(0, 20) || "已付款订单";
  const tableNo = String(order.tableNo || "").trim();
  const remark = tableNo
    ? `桌号 ${tableNo}`.slice(0, 20)
    : String(order.remark || "微信支付已确认").slice(0, 20);
  return cloud.callFunction({
    name: "serviceNotify",
    data: {
      action: "notifyStaff",
      kind: "orderStaffNew",
      payload: {
        orderNo: order.orderNo || "",
        total: order.total,
        status: "已支付",
        itemSummary,
        remark,
        time: ""
      }
    }
  }).catch(() => null);
}

async function findRechargeOrder(outTradeNo) {
  await ensureCollection("recharge_orders");
  const result = await db.collection("recharge_orders").where({ orderNo: outTradeNo }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function findReservation(outTradeNo) {
  await ensureCollection("reservations");
  const result = await db.collection("reservations").where({ reservationNo: outTradeNo }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function notifyReservationAdmins(reservation = {}) {
  const notice = {
    type: "reservation_paid",
    reservationId: reservation._id || "",
    reservationNo: reservation.reservationNo || "",
    storeName: String(reservation.storeName || "").slice(0, 40),
    roomId: String(reservation.roomId || "").slice(0, 40),
    day: String(reservation.day || "").slice(0, 20),
    time: String(reservation.time || "").slice(0, 12),
    endTime: String(reservation.endTime || "").slice(0, 12),
    people: Math.max(1, Number(reservation.people) || 1),
    name: String(reservation.name || "").slice(0, 40),
    phone: String(reservation.phone || "").slice(0, 30),
    note: String(reservation.note || "").slice(0, 160),
    status: "已确认",
    payStatus: "paid",
    read: false,
    createdAt: db.serverDate()
  };

  try {
    await ensureCollection("admin_notices");
    await db.collection("admin_notices").add({ data: notice });
  } catch (error) {
    // Notice board is best-effort.
  }

  try {
    await ensureCollection("notification_logs");
    await db.collection("notification_logs").add({
      data: Object.assign({}, notice, {
        channel: "admin_notice",
        target: "admin",
        message: `茶室预约 ${notice.day} ${notice.time} 已支付确认，${notice.name} ${notice.phone}，${notice.people} 位。`
      })
    });
  } catch (error) {
    // Logging is best-effort.
  }
}

async function handleReservationSuccess(transaction, reservation) {
  const paidAmount = transaction.amount && Number(transaction.amount.total);
  const expectedAmount = Math.round((Number(reservation.total) || 0) * 100);
  if (paidAmount !== expectedAmount) {
    await db.collection("reservations").doc(reservation._id).update({
      data: {
        payStatus: "amount_mismatch",
        status: "异常待处理",
        transactionId: transaction.transaction_id || "",
        paymentError: `微信支付金额 ${paidAmount} 与预约金额 ${expectedAmount} 不一致`,
        updatedAt: db.serverDate()
      }
    });
    throw new Error("预约支付金额不一致");
  }
  const reservationPayMode = normalizePayMode(reservation.payMode);
  if (reservation.payStatus === "paid" && reservationPayMode === "balance") {
    await db.collection("reservations").doc(reservation._id).update({
      data: {
        payStatus: "paid_exception",
        status: "异常待处理",
        transactionId: transaction.transaction_id || "",
        paymentError: "余额已扣款后又收到微信支付成功通知，需人工原路处理重复付款",
        paymentRaw: transaction,
        updatedAt: db.serverDate()
      }
    });
    return;
  }
  if (reservation.payStatus === "paid") {
    return;
  }

  if ((reservationPayMode && reservationPayMode !== "wechat") ||
      reservation.payStatus !== "pending" || reservation.status !== "待支付") {
    await db.collection("reservations").doc(reservation._id).update({
      data: {
        payStatus: "paid_exception",
        status: "异常待处理",
        transactionId: transaction.transaction_id || "",
        paymentRaw: transaction,
        updatedAt: db.serverDate()
      }
    });
    return;
  }

  let claim = await db.collection("reservations").where({
    _id: reservation._id,
    payStatus: "pending",
    status: "待支付",
    payMode: "wechat"
  }).update({
    data: {
      payStatus: "confirming",
      payMode: "wechat",
      updatedAt: db.serverDate()
    }
  });

  // 兼容 payMode 上线前已创建的预约；新单在下单前已经原子写入 wechat。
  if (dbUpdatedCount(claim) <= 0 && !reservationPayMode) {
    for (const payMode of [_.exists(false), "", null]) {
      claim = await db.collection("reservations").where({
        _id: reservation._id,
        payStatus: "pending",
        status: "待支付",
        payMode
      }).update({
        data: {
          payStatus: "confirming",
          payMode: "wechat",
          paymentChannelClaimedAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      if (dbUpdatedCount(claim) > 0) break;
    }
  }

  if (dbUpdatedCount(claim) <= 0) {
    const latest = await db.collection("reservations").doc(reservation._id).get();
    const latestData = latest.data || {};
    const latestPayMode = normalizePayMode(latestData.payMode);
    if ((latestData.payStatus === "paid" || latestData.payStatus === "confirming") &&
        latestPayMode === "wechat") {
      return;
    }
    if (latestPayMode === "balance") {
      await db.collection("reservations").doc(reservation._id).update({
        data: {
          payStatus: "paid_exception",
          status: "异常待处理",
          transactionId: transaction.transaction_id || "",
          paymentError: "余额支付渠道已占用但微信仍支付成功，需人工原路处理重复付款",
          paymentRaw: transaction,
          updatedAt: db.serverDate()
        }
      });
      return;
    }
    throw new Error("预约支付确认抢占失败，等待微信重试通知");
  }

  const paidReservationPatch = {
    status: "已确认",
    payStatus: "paid",
    payMode: "wechat",
    transactionId: transaction.transaction_id || "",
    tradeType: transaction.trade_type || "JSAPI",
    paidAt: transaction.success_time ? new Date(transaction.success_time) : db.serverDate(),
    paymentRaw: transaction,
    updatedAt: db.serverDate()
  };

  // 茶室预约：虚拟商品发货（logistics_type=3），支付成功即传微信
  let wxShipping = { ok: true, skipped: true };
  try {
    wxShipping = await uploadVirtualShipping(
      cloud,
      Object.assign({}, reservation, {
        transactionId: transaction.transaction_id || "",
        _openid: reservation._openid
      }),
      `茶室预约 ${reservation.day || ""} ${reservation.time || ""}`.trim() || "禾煦茶室预约"
    );
    Object.assign(paidReservationPatch, shippingResultFields(wxShipping), {
      wxShippingUploadedAt: wxShipping.ok ? db.serverDate() : null,
      wxShippingLastAttemptAt: db.serverDate()
    });
  } catch (error) {
    paidReservationPatch.wxShippingUploaded = false;
    paidReservationPatch.wxShippingError = String((error && error.message) || error).slice(0, 300);
    paidReservationPatch.wxShippingLastAttemptAt = db.serverDate();
  }

  await db.collection("reservations").doc(reservation._id).update({
    data: paidReservationPatch
  });

  await sendServiceNotice("reservationPaid", reservation._openid, {
    reservationNo: reservation.reservationNo,
    day: reservation.day,
    time: reservation.time,
    status: "已确认"
  });

  try {
    await sendWeComReservationNotification({
      reservationId: reservation._id,
      reservationNo: reservation.reservationNo,
      storeName: reservation.storeName,
      roomId: reservation.roomId,
      day: reservation.day,
      time: reservation.time,
      endTime: reservation.endTime,
      periodLabel: reservation.periodLabel,
      price: reservation.total,
      people: reservation.people,
      name: reservation.name,
      phone: reservation.phone,
      note: reservation.note,
      status: "已确认",
      payStatus: "paid"
    });
  } catch (error) {
    // best-effort staff channel
  }

  await notifyReservationAdmins(reservation);
}

async function handleRechargeSuccess(transaction, recharge) {
  const paidAmount = transaction.amount && Number(transaction.amount.total);
  const expectedAmount = Math.max(0, Math.round(Number(recharge.payAmountFen) || 0));
  if (paidAmount !== expectedAmount) {
    await db.collection("recharge_orders").doc(recharge._id).update({
      data: {
        payStatus: "amount_mismatch",
        status: "exception",
        transactionId: transaction.transaction_id || "",
        errorMessage: `微信支付金额 ${paidAmount} 与充值金额 ${expectedAmount} 不一致`,
        updatedAt: db.serverDate()
      }
    });
    throw new Error("充值支付金额不一致");
  }
  if (recharge.payStatus === "paid") {
    // 主动查单可能先完成入账；回调仍需补传虚拟发货，避免资金长期停在待结算账户。
    if (recharge.wxShippingUploaded !== true) {
      try {
        const transactionId = String(recharge.transactionId || transaction.transaction_id || "");
        const wxShipping = await uploadVirtualShipping(
          cloud,
          Object.assign({}, recharge, { transactionId, _openid: recharge._openid }),
          recharge.planTitle || "会员储值"
        );
        const wxFields = shippingResultFields(wxShipping);
        const updateResult = await db.collection("recharge_orders").doc(recharge._id).update({
          data: Object.assign({}, wxFields, {
            wxShippingUploadedAt: wxFields.wxShippingUploaded ? db.serverDate() : recharge.wxShippingUploadedAt || null,
            wxShippingLastAttemptAt: db.serverDate(),
            updatedAt: db.serverDate()
          })
        });
        if (dbUpdatedCount(updateResult) <= 0) {
          throw new Error("充值发货状态写回失败");
        }
      } catch (error) {
        await db.collection("recharge_orders").doc(recharge._id).update({
          data: {
            wxShippingUploaded: false,
            wxShippingError: String((error && error.message) || error).slice(0, 300),
            wxShippingLastAttemptAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
      }
    }
    return;
  }

  await Promise.all([ensureCollection("wallet_accounts"), ensureCollection("wallet_ledger")]);
  const walletResult = await db.collection("wallet_accounts").where({
    _openid: recharge._openid,
    status: "active"
  }).limit(1).get();
  const wallet = walletResult.data && walletResult.data[0];
  if (!wallet) {
    throw new Error("充值会员的余额账户不存在");
  }

  const transactionId = String(transaction.transaction_id || "");
  if (!transactionId) {
    throw new Error("微信支付交易号为空");
  }
  const processed = Array.isArray(wallet.processedRechargeIds) ? wallet.processedRechargeIds : [];
  const principalFen = Math.max(0, Math.round(Number(recharge.principalFen) || 0));
  const bonusFen = Math.max(0, Math.round(Number(recharge.bonusFen) || 0));
  const creditFen = principalFen + bonusFen;
  const currentBalanceFen = Math.max(0, Math.round(Number(wallet.balanceFen) || 0));

  if (!processed.includes(transactionId)) {
    const claim = await db.collection("wallet_accounts").where({
      _id: wallet._id,
      _openid: recharge._openid,
      status: "active",
      balanceFen: currentBalanceFen
    }).update({
      data: {
        balanceFen: _.inc(creditFen),
        principalBalanceFen: _.inc(principalFen),
        bonusBalanceFen: _.inc(bonusFen),
        totalRechargedFen: _.inc(principalFen),
        totalBonusFen: _.inc(bonusFen),
        processedRechargeIds: _.push(transactionId),
        updatedAt: db.serverDate()
      }
    });
    const updatedCount = claim && claim.stats && claim.stats.updated != null
      ? Number(claim.stats.updated)
      : Number(claim && claim.updated);
    if (!updatedCount) {
      throw new Error("余额账户发生并发变化，请等待微信支付重试通知");
    }
  }

  await db.collection("wallet_ledger").doc(`wx_${transactionId}`).set({
    data: {
      _openid: recharge._openid,
      walletId: wallet._id,
      memberId: recharge.memberId || "",
      rechargeOrderId: recharge._id,
      rechargeOrderNo: recharge.orderNo,
      transactionId,
      type: "wechat_recharge",
      principalFen,
      bonusFen,
      amountFen: creditFen,
      paidFen: expectedAmount,
      status: "posted",
      balanceAfterFen: processed.includes(transactionId) ? null : currentBalanceFen + creditFen,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });
  const rechargePatch = {
    status: "paid",
    payStatus: "paid",
    transactionId,
    paidAt: transaction.success_time ? new Date(transaction.success_time) : db.serverDate(),
    updatedAt: db.serverDate()
  };

  // 会员充值：虚拟商品发货（logistics_type=3）
  try {
    const wxShipping = await uploadVirtualShipping(
      cloud,
      Object.assign({}, recharge, {
        transactionId,
        _openid: recharge._openid
      }),
      recharge.planTitle || "会员储值"
    );
    Object.assign(rechargePatch, shippingResultFields(wxShipping), {
      wxShippingUploadedAt: wxShipping.ok ? db.serverDate() : null,
      wxShippingLastAttemptAt: db.serverDate()
    });
  } catch (error) {
    rechargePatch.wxShippingUploaded = false;
    rechargePatch.wxShippingError = String((error && error.message) || error).slice(0, 300);
    rechargePatch.wxShippingLastAttemptAt = db.serverDate();
  }

  await db.collection("recharge_orders").doc(recharge._id).update({
    data: rechargePatch
  });

  try {
    await sendWeComRechargeNotification({
      orderNo: recharge.orderNo,
      planTitle: recharge.planTitle,
      planId: recharge.planId,
      payAmountFen: expectedAmount,
      creditFen,
      transactionId
    });
  } catch (error) {
    // best-effort staff channel
  }
}

async function handleTransactionSuccess(transaction) {
  const recharge = await findRechargeOrder(transaction.out_trade_no);
  if (recharge) {
    await handleRechargeSuccess(transaction, recharge);
    return;
  }
  const reservation = await findReservation(transaction.out_trade_no);
  if (reservation) {
    await handleReservationSuccess(transaction, reservation);
    return;
  }
  const order = await findOrder(transaction.out_trade_no);
  if (!order) {
    throw new Error("订单不存在");
  }

  const paidAmount = transaction.amount && Number(transaction.amount.total);
  if (paidAmount !== cents(order.total)) {
    await db.collection("orders").doc(order._id).update({
      data: {
        payStatus: "amount_mismatch",
        paymentError: `微信支付金额 ${paidAmount} 与订单金额 ${cents(order.total)} 不一致`,
        transactionId: transaction.transaction_id || "",
        updatedAt: db.serverDate()
      }
    });
    throw new Error("支付金额与订单金额不一致");
  }

  if (order.payStatus === "paid") {
    return;
  }

  if (order.payStatus !== "pending" || order.status !== "待支付") {
    await db.collection("orders").doc(order._id).update({
      data: {
        payStatus: "paid_exception",
        status: "异常待处理",
        transactionId: transaction.transaction_id || "",
        paymentRaw: transaction,
        updatedAt: db.serverDate()
      }
    });
    return;
  }

  if (!order._id) {
    throw new Error("订单缺少 _id，无法确认支付");
  }

  const claim = await db.collection("orders").where({
    _id: order._id,
    payStatus: "pending",
    status: "待支付"
  }).update({
    data: {
      payStatus: "confirming",
      updatedAt: db.serverDate()
    }
  });

  // 与余额扣款同一坑：勿用 claim.updated，应用 stats.updated
  if (dbUpdatedCount(claim) <= 0) {
    // 可能并发已在处理；再读一次，已 confirming/paid 则直接返回
    const latest = await db.collection("orders").doc(order._id).get();
    const status = latest.data || {};
    if (status.payStatus === "paid" || status.payStatus === "confirming") {
      return;
    }
    throw new Error("订单支付确认抢占失败，等待微信重试通知");
  }

  await confirmInventory(order.inventoryLocks, order.orderNo);
  await markCouponUsed(order);
  const memberUpdate = await updateMemberAfterPaid(order);

  const transactionId = transaction.transaction_id || "";
  const paidPatch = {
    status: getPaidStatus(order),
    payStatus: "paid",
    pointsEarned: memberUpdate.pointsEarned,
    memberTierAfterPaid: memberUpdate.tier,
    transactionId,
    tradeType: transaction.trade_type || "JSAPI",
    paidAt: transaction.success_time ? new Date(transaction.success_time) : db.serverDate(),
    paymentRaw: transaction,
    updatedAt: db.serverDate()
  };

  // 自提 / 堂饮：支付成功即上传微信发货信息（logistics_type=4，堂饮按自提）
  // 快递：等后台 markShipped 再传 logistics_type=1
  const delivery = String(order.deliveryMethod || "");
  if (delivery === "pickup" || delivery === "onsite") {
    try {
      const wxShipping = await uploadPickupOrOnsiteShipping(
        cloud,
        Object.assign({}, order, {
          transactionId,
          _openid: order._openid
        })
      );
      Object.assign(paidPatch, shippingResultFields(wxShipping), {
        wxShippingUploadedAt: wxShipping.ok ? db.serverDate() : null,
        wxShippingLastAttemptAt: db.serverDate()
      });
    } catch (error) {
      paidPatch.wxShippingUploaded = false;
      paidPatch.wxShippingError = String((error && error.message) || error).slice(0, 300);
      paidPatch.wxShippingLastAttemptAt = db.serverDate();
    }
  }

  await db.collection("orders").doc(order._id).update({
    data: paidPatch
  });
  await sendServiceNotice("orderPaid", order._openid, {
    orderNo: order.orderNo,
    total: order.total,
    status: getPaidStatus(order),
    time: transaction.success_time || ""
  });
  // 支付成功后再提醒店员（下单时可能只推了「待付款」）
  await notifyStaffPaidOrder(order);
  // 企业微信群：店员主通道
  try {
    await sendWeComOrderNotification({
      orderNo: order.orderNo,
      total: order.total,
      status: getPaidStatus(order),
      payStatus: "paid",
      payMode: "wechat",
      event: "order_paid",
      deliveryMethod: order.deliveryMethod,
      source: order.source || "",
      tableNo: order.tableNo,
      remark: order.remark,
      items: order.items,
      consignee: order.consignee || "",
      phone: order.phone || "",
      address: order.address || "",
      transactionId: transactionId || order.transactionId || ""
    });
  } catch (error) {
    // best-effort
  }
}

function httpResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(data)
  };
}

function normalizeEventHeaders(headers = {}) {
  const normalized = {};
  Object.keys(headers || {}).forEach((key) => {
    normalized[String(key).toLowerCase()] = headers[key];
  });
  return normalized;
}

function extractRawBody(event = {}) {
  if (typeof event.body === "string") {
    return event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
  }
  if (event.body && typeof event.body === "object") {
    return JSON.stringify(event.body);
  }
  if (typeof event === "string") {
    return event;
  }
  return "";
}

async function processNotifyPayload(headers, rawBody) {
  if (!verifyNotify(headers, rawBody)) {
    return httpResponse(401, { code: "FAIL", message: "签名错误" });
  }

  let notify;
  try {
    notify = JSON.parse(rawBody);
  } catch (error) {
    return httpResponse(400, { code: "FAIL", message: "回调报文不是合法 JSON" });
  }

  if (notify.event_type !== "TRANSACTION.SUCCESS") {
    return httpResponse(200, { code: "SUCCESS", message: "忽略非支付成功通知" });
  }

  const transaction = decryptResource(notify.resource);
  if (transaction.trade_state !== "SUCCESS") {
    return httpResponse(200, { code: "SUCCESS", message: "忽略非成功交易状态" });
  }
  await handleTransactionSuccess(transaction);
  return httpResponse(200, { code: "SUCCESS", message: "成功" });
}

/**
 * CloudBase「HTTP 访问服务」走 Event 云函数：
 * event.httpMethod / event.headers / event.body
 */
exports.main = async (event = {}, context = {}) => {
  await hydrateEnv(cloud);
  try {
    const method = String(event.httpMethod || event.requestContext && event.requestContext.httpMethod || "POST").toUpperCase();
    if (method === "GET") {
      return httpResponse(200, { ok: true, name: "wechatPayNotify", mode: "event" });
    }
    if (method !== "POST") {
      return httpResponse(405, { code: "FAIL", message: "Method Not Allowed" });
    }
    const headers = normalizeEventHeaders(event.headers || {});
    const rawBody = extractRawBody(event);
    return await processNotifyPayload(headers, rawBody);
  } catch (error) {
    return httpResponse(500, { code: "FAIL", message: error && error.message ? error.message : "回调处理失败" });
  }
};

// 兼容仍以 HTTP 函数（scf_bootstrap 监听 9000）部署的环境
if (require.main === module || process.env.SCF_HTTP_SERVER === "1") {
  const server = http.createServer((req, res) => {
    if (req.method === "GET") {
      sendJson(res, 200, { ok: true, name: "wechatPayNotify", mode: "http-server" });
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { code: "FAIL", message: "Method Not Allowed" });
      return;
    }
    readBody(req)
      .then((rawBody) => processNotifyPayload(req.headers, rawBody))
      .then((result) => {
        res.writeHead(result.statusCode || 200, result.headers || { "Content-Type": "application/json" });
        res.end(result.body || "");
      })
      .catch((error) => {
        sendJson(res, 500, { code: "FAIL", message: error.message || "Server Error" });
      });
  });
  server.listen(9000);
}
