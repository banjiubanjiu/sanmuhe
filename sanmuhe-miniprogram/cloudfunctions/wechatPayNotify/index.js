const http = require("http");
const crypto = require("crypto");
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

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

async function confirmInventory(locks) {
  for (const lock of locks || []) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }
    await db.collection(lock.collection).doc(lock.docId).update({
      data: {
        lockedStock: _.inc(-lock.quantity),
        soldStock: _.inc(lock.quantity),
        updatedAt: db.serverDate()
      }
    });
  }
}

function getPaidStatus(order) {
  return order.deliveryMethod === "pickup" ? "待自提" : "待发货";
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100);
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

  await confirmInventory(order.inventoryLocks);
  await db.collection("orders").doc(order._id).update({
    data: {
      status: getPaidStatus(order),
      payStatus: "paid",
      transactionId: transaction.transaction_id || "",
      tradeType: transaction.trade_type || "JSAPI",
      paidAt: transaction.success_time ? new Date(transaction.success_time) : db.serverDate(),
      paymentRaw: transaction,
      updatedAt: db.serverDate()
    }
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
