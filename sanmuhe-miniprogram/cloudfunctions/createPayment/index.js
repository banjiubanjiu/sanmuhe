const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const https = require("https");
const { sendWeComRechargeNotification } = require("./wecomOrderNotify");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected.
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`支付环境变量 ${name} 未配置`);
  }
  return value;
}

function isRealPaymentEnabled() {
  return String(process.env.REAL_PAYMENT_ENABLED || "").toLowerCase() === "true";
}

function paymentConfigHealth() {
  const missing = [];
  if (!process.env.WECHAT_PAY_APPID && !process.env.WX_APPID) {
    missing.push("WECHAT_PAY_APPID/WX_APPID");
  }
  [
    "WECHAT_PAY_MCH_ID",
    "WECHAT_PAY_CERT_SERIAL_NO",
    "WECHAT_PAY_PRIVATE_KEY",
    "WECHAT_PAY_NOTIFY_URL"
  ].forEach((name) => {
    if (!process.env[name]) {
      missing.push(name);
    }
  });
  if (!process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY && !process.env.WECHAT_PAY_PLATFORM_CERTIFICATE) {
    missing.push("WECHAT_PAY_PLATFORM_PUBLIC_KEY/WECHAT_PAY_PLATFORM_CERTIFICATE");
  }
  return {
    ready: missing.length === 0,
    missing,
    notifyUrlConfigured: Boolean(process.env.WECHAT_PAY_NOTIFY_URL),
    platformKeyConfigured: Boolean(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY || process.env.WECHAT_PAY_PLATFORM_CERTIFICATE)
  };
}

/**
 * 规范化 PEM：兼容云函数环境变量常见损坏形式
 * - 字面量 \\n
 * - 换行被替换成空格
 * - 整段 PEM 的 base64
 * - 无头尾的 base64 密钥体（尽量还原）
 */
function normalizePem(value) {
  let text = String(value || "").trim();
  if (!text) {
    return "";
  }

  // 整段 PEM 被 base64 后写入环境变量
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

  // BEGIN ... END 被压成一行（换行变空格）
  if (text.includes("-----BEGIN") && !text.includes("\n")) {
    text = text
      .replace(/-----BEGIN ([A-Z0-9 ]+)-----/g, "-----BEGIN $1-----\n")
      .replace(/-----END ([A-Z0-9 ]+)-----/g, "\n-----END $1-----")
      .replace(/-----END ([A-Z0-9 ]+)-----\s*$/g, "-----END $1-----\n");
    const match = text.match(/-----BEGIN [A-Z0-9 ]+-----\n([\s\S]*?)\n-----END [A-Z0-9 ]+-----/);
    if (match) {
      const body = match[1].replace(/\s+/g, "");
      const wrapped = body.match(/.{1,64}/g).join("\n");
      text = text.replace(match[1], wrapped);
    }
  }

  // 已有换行但 body 中夹杂多余空格
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

function getPayConfig() {
  const platformKeyValue = process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY || process.env.WECHAT_PAY_PLATFORM_CERTIFICATE;
  if (!platformKeyValue) {
    throw new Error("支付环境变量 WECHAT_PAY_PLATFORM_PUBLIC_KEY/WECHAT_PAY_PLATFORM_CERTIFICATE 未配置");
  }
  return {
    appid: process.env.WECHAT_PAY_APPID || process.env.WX_APPID || requiredEnv("WECHAT_PAY_APPID"),
    mchid: requiredEnv("WECHAT_PAY_MCH_ID"),
    serialNo: requiredEnv("WECHAT_PAY_CERT_SERIAL_NO"),
    privateKey: normalizePem(requiredEnv("WECHAT_PAY_PRIVATE_KEY")),
    notifyUrl: requiredEnv("WECHAT_PAY_NOTIFY_URL"),
    platformPublicKey: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY ? normalizePem(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY) : "",
    platformCertificate: process.env.WECHAT_PAY_PLATFORM_CERTIFICATE ? normalizePem(process.env.WECHAT_PAY_PLATFORM_CERTIFICATE) : "",
    publicKeyId: process.env.WECHAT_PAY_PUBLIC_KEY_ID || ""
  };
}

function nonceString(size) {
  return crypto.randomBytes(size || 16).toString("hex").slice(0, 32);
}

function signWithPrivateKey(message, privateKey) {
  return crypto.createSign("RSA-SHA256").update(message).sign(privateKey, "base64");
}

function buildAuthorization(config, method, path, body, timestamp, nonce) {
  const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = signWithPrivateKey(message, config.privateKey);
  // 官方格式：schema + 空格 + 逗号分隔 token（token 内字段之间不要用空格拼接）
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`;
}

function verifyWechatPaySignature(headers, rawBody, config) {
  const key = config.platformPublicKey || config.platformCertificate;
  if (!key) {
    return { ok: true, reason: "no_key_configured" };
  }

  const timestamp = headers["wechatpay-timestamp"] || headers["Wechatpay-Timestamp"];
  const nonce = headers["wechatpay-nonce"] || headers["Wechatpay-Nonce"];
  const signature = headers["wechatpay-signature"] || headers["Wechatpay-Signature"];
  const serial = headers["wechatpay-serial"] || headers["Wechatpay-Serial"] || "";
  if (!timestamp || !nonce || !signature) {
    return { ok: false, reason: "missing_sign_headers", serial };
  }

  try {
    const ok = crypto.createVerify("RSA-SHA256")
      .update(`${timestamp}\n${nonce}\n${rawBody}\n`)
      .verify(key, signature, "base64");
    return {
      ok,
      reason: ok ? "ok" : "signature_mismatch",
      serial,
      expectedPublicKeyId: config.publicKeyId || "",
      keyKind: config.platformPublicKey ? "public_key" : "platform_certificate"
    };
  } catch (error) {
    return {
      ok: false,
      reason: `verify_error:${error && error.message ? error.message : "unknown"}`,
      serial,
      expectedPublicKeyId: config.publicKeyId || "",
      keyKind: config.platformPublicKey ? "public_key" : "platform_certificate"
    };
  }
}

function requestWechatPay(config, payload) {
  const method = "POST";
  const path = "/v3/pay/transactions/jsapi";
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = nonceString();
  const authorization = buildAuthorization(config, method, path, body, timestamp, nonce);
  const headers = {
    Authorization: authorization,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "User-Agent": "sanmuhe-createPayment"
  };
  // 商户已切换「微信支付公钥」模式时，请求带上公钥 ID，应答也用该公钥验签
  if (config.publicKeyId) {
    headers["Wechatpay-Serial"] = config.publicKeyId;
  }

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.mch.weixin.qq.com",
      method,
      path,
      headers
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (error) {
          reject(new Error("微信支付响应解析失败"));
          return;
        }

        const verifyResult = verifyWechatPaySignature(res.headers, raw, config);
        if (!verifyResult.ok) {
          reject(new Error(
            `微信支付响应验签失败(${verifyResult.reason}; serial=${verifyResult.serial || "none"}; key=${verifyResult.keyKind})`
          ));
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(data.message || data.code || "微信支付下单失败"));
          return;
        }

        resolve(data);
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** 运维诊断：不落库，仅探测密钥形态与应答验签 */
async function diagnoseVerify(config) {
  const key = config.platformPublicKey || config.platformCertificate || "";
  const privateKey = config.privateKey || "";
  let privateKeySignable = false;
  let privateKeySignError = "";
  try {
    signWithPrivateKey("ping\n", privateKey);
    privateKeySignable = true;
  } catch (error) {
    privateKeySignError = error && error.message ? error.message : "sign_failed";
  }
  const keyMeta = {
    publicKeyId: config.publicKeyId || "",
    platformKeyHasBegin: key.includes("-----BEGIN"),
    platformKeyNewlines: (key.match(/\n/g) || []).length,
    platformKeyLen: key.length,
    privateKeyHasBegin: privateKey.includes("-----BEGIN"),
    privateKeyNewlines: (privateKey.match(/\n/g) || []).length,
    privateKeyLen: privateKey.length,
    privateKeyRawEnvLen: String(process.env.WECHAT_PAY_PRIVATE_KEY || "").length,
    platformKeyRawEnvLen: String(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY || process.env.WECHAT_PAY_PLATFORM_CERTIFICATE || "").length,
    privateKeySignable,
    privateKeySignError,
    serialNoLen: String(config.serialNo || "").length,
    serialNoPrefix: String(config.serialNo || "").slice(0, 8),
    mchid: config.mchid || "",
    appid: config.appid || ""
  };

  const path = "/v3/certificates";
  const method = "GET";
  const body = "";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = nonceString();
  const authorization = buildAuthorization(config, method, path, body, timestamp, nonce);
  const headers = {
    Authorization: authorization,
    Accept: "application/json",
    "User-Agent": "sanmuhe-createPayment-diag"
  };
  if (config.publicKeyId) {
    headers["Wechatpay-Serial"] = config.publicKeyId;
  }

  const response = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.mch.weixin.qq.com",
      method,
      path,
      headers
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          raw
        });
      });
    });
    req.on("error", reject);
    req.end();
  });

  const verifyResult = verifyWechatPaySignature(response.headers, response.raw, config);
  let responseBody = {};
  try {
    responseBody = response.raw ? JSON.parse(response.raw) : {};
  } catch (error) {
    responseBody = { parseError: true };
  }

  return {
    ok: true,
    keyMeta,
    httpStatus: response.statusCode,
    responseSerial: response.headers["wechatpay-serial"] || "",
    verify: verifyResult,
    wechatMessage: responseBody.message || responseBody.code || ""
  };
}

async function findOrder(orderId, orderNo, openid) {
  if (orderId) {
    try {
      const result = await db.collection("orders").doc(orderId).get();
      if (result.data && result.data._openid === openid) {
        return result.data;
      }
    } catch (error) {
      // Fall through to orderNo lookup.
    }
  }

  const result = await db.collection("orders").where({
    _openid: openid,
    orderNo
  }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function findActiveMember(openid) {
  const result = await db.collection("members").where({ _openid: openid }).limit(1).get();
  const member = result.data && result.data[0];
  return member && member.status === "active" && member.phone ? member : null;
}

/** 门店公示储值权益（金额单位：分），支付侧不信任客户端或脏数据金额 */
const CANONICAL_MEMBERSHIP_PLANS = {
  // 联调/真机支付最小额，正式上线前可停用
  "recharge-0.01": {
    id: "recharge-0.01",
    title: "测试 0.01 元",
    description: "联调测试档位，实付 0.01 元，到账 0.01 元（无赠送）",
    principalFen: 1,
    bonusFen: 0
  },
  "recharge-500": {
    id: "recharge-500",
    title: "充 500 送 100",
    description: "充值 500 元，赠送 100 元，到账 600 元",
    principalFen: 50000,
    bonusFen: 10000
  },
  "recharge-1000": {
    id: "recharge-1000",
    title: "充 1000 送 250",
    description: "充值 1000 元，赠送 250 元，到账 1250 元",
    principalFen: 100000,
    bonusFen: 25000
  }
};

async function findRechargePlan(planId) {
  const id = cleanText(planId, 80);
  const canonical = CANONICAL_MEMBERSHIP_PLANS[id];
  if (!canonical) {
    return null;
  }
  const result = await db.collection("membership_plans").where({ id }).limit(1).get();
  const plan = result.data && result.data[0] ? result.data[0] : null;
  if (plan && plan.enabled === false) {
    return null;
  }
  // Always credit the published gift amounts, even if DB copy is stale.
  return Object.assign({}, plan || {}, canonical);
}

function createRechargeNo() {
  return `SMHR${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
}

async function createRechargePayment(event, openid, config) {
  const member = await findActiveMember(openid);
  if (!member) {
    return { ok: false, message: "请先开通会员再充值" };
  }
  const plan = await findRechargePlan(event.planId);
  if (!plan) {
    return { ok: false, message: "充值档位不存在或已停用" };
  }
  const principalFen = Math.max(0, Math.round(Number(plan.principalFen) || 0));
  const bonusFen = Math.max(0, Math.round(Number(plan.bonusFen) || 0));
  const totalFen = principalFen + bonusFen;
  if (principalFen <= 0 || totalFen <= 0) {
    return { ok: false, message: "充值档位金额无效" };
  }

  // 新环境可能尚未建表；与 wechatPayNotify 对齐，写库前确保集合存在
  await ensureCollection("recharge_orders");

  const orderNo = createRechargeNo();
  const expireAt = new Date(Date.now() + 15 * 60 * 1000);
  const recharge = await db.collection("recharge_orders").add({
    data: {
      _openid: openid,
      orderNo,
      memberId: member._id,
      planId: plan.id,
      planTitle: plan.title,
      principalFen,
      bonusFen,
      creditFen: totalFen,
      payAmountFen: principalFen,
      status: "pending",
      payStatus: "pending",
      expireAt,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  try {
    const response = await requestWechatPay(config, {
      appid: config.appid,
      mchid: config.mchid,
      description: cleanText(`禾煦会员充值 ${plan.title}`, 127),
      out_trade_no: orderNo,
      time_expire: expireAt.toISOString(),
      attach: `recharge:${recharge._id}`,
      notify_url: config.notifyUrl,
      amount: {
        total: principalFen,
        currency: "CNY"
      },
      payer: {
        openid
      }
    });
    if (!response.prepay_id) {
      throw new Error("微信支付未返回预支付单");
    }
    await db.collection("recharge_orders").doc(recharge._id).update({
      data: {
        prepayId: response.prepay_id,
        prepayCreatedAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    return {
      ok: true,
      kind: "memberRecharge",
      rechargeOrderId: recharge._id,
      orderNo,
      principalFen,
      bonusFen,
      creditFen: totalFen,
      payment: buildPaymentParams(config, response.prepay_id)
    };
  } catch (error) {
    await db.collection("recharge_orders").doc(recharge._id).update({
      data: {
        status: "failed",
        payStatus: "failed",
        errorMessage: cleanText(error.message, 200),
        updatedAt: db.serverDate()
      }
    });
    throw error;
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
    // Continue expiring the order even if the coupon state needs manual repair.
  }
}

function isExpired(order) {
  if (!order || !order.lockedUntil) {
    return false;
  }
  return new Date(order.lockedUntil).getTime() <= Date.now();
}

function buildDescription(order) {
  const names = (order.items || []).map((item) => item.name).filter(Boolean);
  return cleanText(`禾煦茶事 ${names.slice(0, 3).join("、") || order.orderNo}`, 127);
}

function buildPaymentParams(config, prepayId) {
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = nonceString();
  const packageValue = `prepay_id=${prepayId}`;
  const paySign = signWithPrivateKey(
    `${config.appid}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`,
    config.privateKey
  );

  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: "RSA",
    paySign
  };
}

function requestWechatPayGet(config, path) {
  const method = "GET";
  const body = "";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = nonceString();
  const authorization = buildAuthorization(config, method, path, body, timestamp, nonce);
  const headers = {
    Authorization: authorization,
    Accept: "application/json",
    "User-Agent": "sanmuhe-createPayment"
  };
  if (config.publicKeyId) {
    headers["Wechatpay-Serial"] = config.publicKeyId;
  }

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.mch.weixin.qq.com",
      method,
      path,
      headers
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (error) {
          reject(new Error("微信支付查单响应解析失败"));
          return;
        }
        const verifyResult = verifyWechatPaySignature(res.headers, raw, config);
        if (!verifyResult.ok) {
          reject(new Error(`微信支付查单验签失败(${verifyResult.reason})`));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(data.message || data.code || "微信支付查单失败"));
          return;
        }
        resolve(data);
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function queryWechatTransactionByOutTradeNo(config, outTradeNo) {
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(config.mchid)}`;
  return requestWechatPayGet(config, path);
}

/**
 * 与 wechatPayNotify.handleRechargeSuccess 对齐：查单成功后补入账（幂等）
 */
async function creditRechargeFromTransaction(transaction, recharge) {
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
    return { alreadyPaid: true, orderNo: recharge.orderNo, transactionId: recharge.transactionId || transaction.transaction_id || "" };
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
      throw new Error("余额账户发生并发变化，请重试补入账");
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
      source: "reconcile",
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  await db.collection("recharge_orders").doc(recharge._id).update({
    data: {
      status: "paid",
      payStatus: "paid",
      transactionId,
      paidAt: transaction.success_time ? new Date(transaction.success_time) : db.serverDate(),
      reconciledAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
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

  return {
    alreadyPaid: false,
    orderNo: recharge.orderNo,
    transactionId,
    creditFen,
    principalFen,
    bonusFen
  };
}

async function reconcileRechargeOrder(config, orderNo) {
  const no = cleanText(orderNo, 64);
  if (!no) {
    return { ok: false, message: "缺少 orderNo" };
  }
  await ensureCollection("recharge_orders");
  const result = await db.collection("recharge_orders").where({ orderNo: no }).limit(1).get();
  const recharge = result.data && result.data[0];
  if (!recharge) {
    return { ok: false, message: `本地充值单不存在: ${no}` };
  }
  if (recharge.payStatus === "paid") {
    return { ok: true, orderNo: no, alreadyPaid: true, message: "本地已入账" };
  }

  const transaction = await queryWechatTransactionByOutTradeNo(config, no);
  if (transaction.trade_state !== "SUCCESS") {
    return {
      ok: true,
      orderNo: no,
      tradeState: transaction.trade_state || "",
      message: `微信侧未支付成功: ${transaction.trade_state_desc || transaction.trade_state || "unknown"}`
    };
  }

  const credit = await creditRechargeFromTransaction(transaction, recharge);
  return {
    ok: true,
    orderNo: no,
    tradeState: "SUCCESS",
    message: credit.alreadyPaid ? "本地已入账" : "已按微信查单补入账",
    credit
  };
}

async function reconcilePendingRecharges(config, limit = 20) {
  await ensureCollection("recharge_orders");
  // 不使用 orderBy，避免缺索引导致批量补单失败
  const result = await db.collection("recharge_orders")
    .where({ payStatus: "pending" })
    .limit(Math.min(50, Math.max(1, Number(limit) || 20)))
    .get();
  const rows = result.data || [];
  const reports = [];
  for (const row of rows) {
    try {
      reports.push(await reconcileRechargeOrder(config, row.orderNo));
    } catch (error) {
      reports.push({
        ok: false,
        orderNo: row.orderNo,
        message: error && error.message ? error.message : "补入账失败"
      });
    }
  }
  return {
    ok: true,
    scanned: rows.length,
    reports
  };
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    const paymentConfig = paymentConfigHealth();
    return {
      ok: true,
      name: "createPayment",
      realPaymentEnabled: isRealPaymentEnabled(),
      paymentConfig,
      message: paymentConfig.ready ? "支付下单配置完整" : `支付下单缺少：${paymentConfig.missing.join("、")}`
    };
  }

  // 运维：确保充值相关集合存在（不涉及支付）
  if (event.action === "ensureCollections") {
    await Promise.all([
      ensureCollection("recharge_orders"),
      ensureCollection("membership_plans"),
      ensureCollection("wallet_accounts"),
      ensureCollection("wallet_ledger"),
      ensureCollection("members"),
      ensureCollection("orders")
    ]);
    return { ok: true, message: "payment collections ensured" };
  }

  if (event.action === "diagnoseVerify") {
    try {
      return await diagnoseVerify(getPayConfig());
    } catch (error) {
      return {
        ok: false,
        code: "DIAGNOSE_VERIFY_ERROR",
        message: error && error.message ? error.message : "验签诊断失败"
      };
    }
  }

  // 运维：按商户单号查微信并补入账（回调丢失时使用）
  if (event.action === "reconcileRecharge") {
    try {
      return await reconcileRechargeOrder(getPayConfig(), event.orderNo || event.outTradeNo);
    } catch (error) {
      return {
        ok: false,
        code: "RECONCILE_ERROR",
        message: error && error.message ? error.message : "补入账失败"
      };
    }
  }

  if (event.action === "reconcilePendingRecharges") {
    try {
      return await reconcilePendingRecharges(getPayConfig(), event.limit);
    } catch (error) {
      return {
        ok: false,
        code: "RECONCILE_PENDING_ERROR",
        message: error && error.message ? error.message : "批量补入账失败"
      };
    }
  }

  const { OPENID } = cloud.getWXContext();
  const orderId = cleanText(event.orderId || event.id, 80);
  const orderNo = cleanText(event.orderNo, 32);

  try {
    const rechargeRequest = event.kind === "memberRecharge" || event.action === "createRechargePayment";
    if (rechargeRequest && !isRealPaymentEnabled()) {
      return { ok: false, code: "REAL_RECHARGE_DISABLED", message: "会员真实充值尚未开放" };
    }
    const config = getPayConfig();
    if (rechargeRequest) {
      return await createRechargePayment(event, OPENID, config);
    }
    const order = await findOrder(orderId, orderNo, OPENID);
    if (!order) {
      return { ok: false, message: "订单不存在" };
    }
    if (order.payStatus === "paid") {
      return { ok: false, message: "订单已支付" };
    }
    if (order.status !== "待支付" || order.payStatus === "expired") {
      return { ok: false, message: "订单当前状态不可支付" };
    }
    if (isExpired(order)) {
      await releaseInventory(order.inventoryLocks);
      await releaseUserCoupon(order.coupon);
      await db.collection("orders").doc(order._id).update({
        data: {
          status: "已取消",
          payStatus: "expired",
          lockReleased: true,
          cancelReason: "支付超时，库存锁定已释放",
          updatedAt: db.serverDate()
        }
      });
      return { ok: false, message: "订单已超时，请重新下单" };
    }

    const totalFee = Math.round((Number(order.total) || 0) * 100);
    if (totalFee <= 0) {
      return { ok: false, message: "订单金额无效" };
    }

    const response = await requestWechatPay(config, {
      appid: config.appid,
      mchid: config.mchid,
      description: buildDescription(order),
      out_trade_no: order.orderNo,
      time_expire: new Date(order.lockedUntil).toISOString(),
      attach: order._id,
      notify_url: config.notifyUrl,
      amount: {
        total: totalFee,
        currency: "CNY"
      },
      payer: {
        openid: OPENID
      }
    });

    if (!response.prepay_id) {
      return { ok: false, message: "微信支付未返回预支付单" };
    }

    const payment = buildPaymentParams(config, response.prepay_id);
    const prepayClaim = await db.collection("orders").where({
      _id: order._id,
      _openid: OPENID,
      status: "待支付",
      payStatus: order.payStatus
    }).update({
      data: {
        prepayId: response.prepay_id,
        prepayCreatedAt: db.serverDate(),
        payStatus: "pending",
        updatedAt: db.serverDate()
      }
    });
    if (!prepayClaim.updated) {
      return { ok: false, message: "订单状态已变化，请刷新后重试" };
    }

    return {
      ok: true,
      orderId: order._id,
      orderNo: order.orderNo,
      total: order.total,
      payment
    };
  } catch (error) {
    return {
      ok: false,
      code: "CREATE_PAYMENT_ERROR",
      message: error.message || "发起支付失败"
    };
  }
};
