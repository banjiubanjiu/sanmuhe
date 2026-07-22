const http = require("http");
const crypto = require("crypto");
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const DEFAULT_MEMBER_LEVELS = [
  { tier: "雅客会员", minSpend: 0, discountRate: 0.98 },
  { tier: "臻享会员", minSpend: 1600, discountRate: 0.95 },
  { tier: "山房会员", minSpend: 5000, discountRate: 0.92 }
];

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected.
  }
}

function normalizePem(value) {
  const text = String(value || "").replace(/\\n/g, "\n").trim();
  if (text.includes("-----BEGIN")) {
    return text;
  }
  return Buffer.from(text, "base64").toString("utf8");
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
  if (!key && process.env.WECHAT_PAY_SKIP_NOTIFY_VERIFY !== "true") {
    throw new Error("未配置微信支付平台公钥或平台证书，无法验签");
  }
  return key ? normalizePem(key) : "";
}

function verifyNotify(headers, rawBody) {
  if (process.env.WECHAT_PAY_SKIP_NOTIFY_VERIFY === "true") {
    return true;
  }

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

async function findOrder(outTradeNo) {
  const result = await db.collection("orders").where({ orderNo: outTradeNo }).limit(1).get();
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
    const before = inventorySnapshot(latest.data || {});
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

function getPaidStatus(order) {
  return order.deliveryMethod === "pickup" ? "待自提" : "待发货";
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
  const nextTotalSpend = number(existing && existing.totalSpend) + number(order.total);
  const nextPaidOrders = number(existing && existing.paidOrders) + 1;
  const nextPoints = number(existing && existing.points) + pointsEarned;
  const level = getLevelBySpend(nextTotalSpend, getLevelRules(settings));
  const data = {
    _openid: openid,
    name: existing && existing.name || order.consignee || "禾煦会员",
    phone: existing && existing.phone || order.phone || "",
    cardNo: existing && existing.cardNo || `SMH ${String(openid).slice(-6).toUpperCase()}`,
    tier: level.tier,
    discountRate: level.discountRate,
    points: nextPoints,
    totalSpend: nextTotalSpend,
    paidOrders: nextPaidOrders,
    lastPaidAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  if (existing && existing._id) {
    await db.collection("members").doc(existing._id).update({ data });
  } else {
    await db.collection("members").add({
      data: Object.assign({}, data, { createdAt: db.serverDate() })
    });
  }

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

async function handleTransactionSuccess(transaction) {
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

  if (claim.updated === 0) {
    return;
  }

  await confirmInventory(order.inventoryLocks, order.orderNo);
  await markCouponUsed(order);
  const memberUpdate = await updateMemberAfterPaid(order);
  await db.collection("orders").doc(order._id).update({
    data: {
      status: getPaidStatus(order),
      payStatus: "paid",
      pointsEarned: memberUpdate.pointsEarned,
      memberTierAfterPaid: memberUpdate.tier,
      transactionId: transaction.transaction_id || "",
      tradeType: transaction.trade_type || "JSAPI",
      paidAt: transaction.success_time ? new Date(transaction.success_time) : db.serverDate(),
      paymentRaw: transaction,
      updatedAt: db.serverDate()
    }
  });
  await sendServiceNotice("orderPaid", order._openid, {
    orderNo: order.orderNo,
    total: order.total,
    status: getPaidStatus(order),
    time: transaction.success_time || ""
  });
}

async function handleNotify(req, res) {
  const rawBody = await readBody(req);
  if (!verifyNotify(req.headers, rawBody)) {
    sendJson(res, 401, { code: "FAIL", message: "签名错误" });
    return;
  }

  let notify;
  try {
    notify = JSON.parse(rawBody);
  } catch (error) {
    sendJson(res, 400, { code: "FAIL", message: "回调报文不是合法 JSON" });
    return;
  }

  if (notify.event_type !== "TRANSACTION.SUCCESS") {
    sendJson(res, 200, { code: "SUCCESS", message: "忽略非支付成功通知" });
    return;
  }

  try {
    const transaction = decryptResource(notify.resource);
    if (transaction.trade_state !== "SUCCESS") {
      sendJson(res, 200, { code: "SUCCESS", message: "忽略非成功交易状态" });
      return;
    }
    await handleTransactionSuccess(transaction);
    sendJson(res, 200, { code: "SUCCESS", message: "成功" });
  } catch (error) {
    sendJson(res, 500, { code: "FAIL", message: error.message || "回调处理失败" });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    sendJson(res, 200, { ok: true, name: "wechatPayNotify" });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { code: "FAIL", message: "Method Not Allowed" });
    return;
  }

  handleNotify(req, res).catch((error) => {
    sendJson(res, 500, { code: "FAIL", message: error.message || "Server Error" });
  });
});

server.listen(9000);
