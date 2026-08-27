const cloud = require("wx-server-sdk");
const { hydrateEnv } = require("./secrets");
const crypto = require("crypto");
const https = require("https");
const { sendWeComRechargeNotification } = require("./wecomOrderNotify");
const { uploadVirtualShipping, shippingResultFields } = require("./wechatShipping");
// createPayment 是独立部署包；预约提醒实现内联在此，避免跨云函数 require 失效。
const WECOM_WEBHOOK_HOST = "qyapi.weixin.qq.com";

function reservationNotifyText(reservation = {}) {
  const status = cleanText(reservation.status, 12) || "已确认";
  const payStatus = cleanText(reservation.payStatus, 12) || "paid";
  const lines = [
    "【禾煦茶室预约已确认】",
    `门店：${cleanText(reservation.storeName, 40) || "禾煦茶书房"}`,
    `日期：${cleanText(reservation.day, 20) || "待查看"}`,
    `时段：${cleanText(reservation.time, 12) || ""}${reservation.endTime ? `–${cleanText(reservation.endTime, 12)}` : ""}`,
    `人数：${Math.max(1, Number(reservation.people) || 1)} 位`,
    `预约人：${cleanText(reservation.name, 40) || "未填写"}`,
    `手机：${cleanText(reservation.phone, 20) || ""}`,
    `茶位：¥${Math.max(0, numberField(reservation.total || reservation.price)).toFixed(2)}`,
    `状态：${status}/${payStatus}`,
    "预约已支付确认，请安排茶席。"
  ];
  const note = cleanText(reservation.note, 160);
  if (note) lines.splice(7, 0, `备注：${note}`);
  return lines.join("\n").slice(0, 1900);
}

async function sendWeComReservationNotification(reservation = {}) {
  const rawWebhook = String(process.env.WECOM_RESERVATION_WEBHOOK || process.env.WECOM_ORDER_WEBHOOK || "").trim();
  if (!rawWebhook) return { ok: true, skipped: true, reason: "missing_wecom_webhook" };
  const url = new URL(rawWebhook);
  if (url.protocol !== "https:" || url.hostname !== WECOM_WEBHOOK_HOST || url.pathname !== "/cgi-bin/webhook/send" || !url.searchParams.get("key")) {
    throw new Error("企业微信 Webhook 地址无效");
  }
  const body = JSON.stringify({ msgtype: "text", text: { content: reservationNotifyText(reservation) } });
  await new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) }
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          const result = JSON.parse(raw || "{}");
          if (response.statusCode < 200 || response.statusCode >= 300 || Number(result.errcode) !== 0) {
            reject(new Error(`企业微信提醒发送失败（${result.errcode || response.statusCode || "unknown"}）`));
            return;
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(3000, () => request.destroy(new Error("企业微信提醒请求超时")));
    request.on("error", reject);
    request.end(body);
  });
  return { ok: true, skipped: false };
}

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

function numberField(value) {
  if (value == null) {
    return 0;
  }
  if (typeof value === "object") {
    if (value.$numberInt != null) {
      return Number(value.$numberInt) || 0;
    }
    if (value.$numberDouble != null) {
      return Number(value.$numberDouble) || 0;
    }
    if (value.$numberLong != null) {
      return Number(value.$numberLong) || 0;
    }
  }
  return Number(value) || 0;
}

function paymentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function transactionValue(result) {
  if (result && Object.prototype.hasOwnProperty.call(result, "result")) {
    return result.result;
  }
  return result;
}

function normalizePayMode(value) {
  const mode = cleanText(value, 20).toLowerCase();
  if (mode === "wallet") {
    return "balance";
  }
  return mode;
}

function isBalancePayMode(event = {}) {
  const mode = cleanText(event.payMode || event.paymentMode || event.checkoutMode, 20).toLowerCase();
  return mode === "balance" || mode === "wallet";
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

function requestWechatPayPost(config, path, payload, options = {}) {
  const method = "POST";
  const body = JSON.stringify(payload || {});
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

  const failLabel = options.failLabel || "微信支付请求失败";

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
          reject(new Error(data.message || data.code || failLabel));
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

function requestWechatPay(config, payload) {
  return requestWechatPayPost(config, "/v3/pay/transactions/jsapi", payload, {
    failLabel: "微信支付下单失败"
  });
}

function createRefundOutNo(prefix) {
  const base = cleanText(prefix, 20).replace(/[^A-Za-z0-9]/g, "") || "R";
  return `${base}RF${Date.now()}${Math.floor(Math.random() * 900 + 100)}`.slice(0, 64);
}

function resolveReservationRefundFen(event, totalFee, alreadyRefundedFen) {
  const maxRefundFen = Math.max(0, totalFee - alreadyRefundedFen);
  if (maxRefundFen <= 0) {
    return { refundFee: 0, maxRefundFen };
  }

  let refundFee = maxRefundFen;
  if (event.refundAmount != null && event.refundAmount !== "") {
    refundFee = Math.round(Number(event.refundAmount) * 100);
  } else if (event.refundAmountFen != null && event.refundAmountFen !== "") {
    refundFee = Math.round(Number(event.refundAmountFen));
  }
  if (!Number.isFinite(refundFee) || refundFee <= 0) {
    throw paymentError("INVALID_REFUND_AMOUNT", "退款金额无效");
  }
  if (refundFee > maxRefundFen) {
    throw paymentError(
      "REFUND_AMOUNT_EXCEEDED",
      `退款金额不能超过可退余额 ¥${(maxRefundFen / 100).toFixed(2)}`
    );
  }
  return { refundFee, maxRefundFen };
}

function splitWalletRefund(principalPaidFen, bonusPaidFen, alreadyRefundedFen, refundFee) {
  const principalPaid = Math.max(0, Math.round(numberField(principalPaidFen)));
  const bonusPaid = Math.max(0, Math.round(numberField(bonusPaidFen)));
  const totalPaid = principalPaid + bonusPaid;
  if (alreadyRefundedFen + refundFee > totalPaid) {
    throw paymentError("WALLET_REFUND_EXCEEDED", "余额退款超过原扣款金额，请人工核对");
  }

  const splitCumulative = (amountFen) => {
    if (amountFen <= 0 || totalPaid <= 0) {
      return { principalFen: 0, bonusFen: 0 };
    }
    let principalFen = Math.min(
      principalPaid,
      Math.round(amountFen * principalPaid / totalPaid)
    );
    let bonusFen = amountFen - principalFen;
    if (bonusFen > bonusPaid) {
      bonusFen = bonusPaid;
      principalFen = amountFen - bonusFen;
    }
    return { principalFen, bonusFen };
  };

  const before = splitCumulative(alreadyRefundedFen);
  const after = splitCumulative(alreadyRefundedFen + refundFee);
  return {
    principalFen: after.principalFen - before.principalFen,
    bonusFen: after.bonusFen - before.bonusFen
  };
}

async function loadReservationForRefund(reservationId, reservationNo) {
  if (reservationId) {
    try {
      const doc = await db.collection("reservations").doc(reservationId).get();
      if (doc.data) {
        return Object.assign({ _id: reservationId }, doc.data);
      }
    } catch (error) {
      // fall through
    }
  }
  if (reservationNo) {
    const result = await db.collection("reservations").where({ reservationNo }).limit(1).get();
    const row = result.data && result.data[0];
    if (row) {
      return Object.assign({ _id: row._id }, row);
    }
  }
  return null;
}

async function refundReservationBalance(event, row) {
  await Promise.all([ensureCollection("wallet_accounts"), ensureCollection("wallet_ledger")]);

  const result = await db.runTransaction(async (transaction) => {
    const reservationResult = await transaction.collection("reservations").doc(row._id).get();
    const current = reservationResult.data || {};
    if (normalizePayMode(current.payMode) !== "balance") {
      throw paymentError("PAYMENT_CHANNEL_CONFLICT", "该预约不是余额支付，不能退回会员余额");
    }
    if (current.payStatus !== "refunding") {
      throw paymentError("REFUND_IN_PROGRESS", "退款处理中，请勿重复操作");
    }

    const totalFee = Math.round(numberField(current.total != null ? current.total : current.price) * 100);
    const alreadyRefundedFen = Math.round(numberField(current.refundAmount) * 100);
    const { refundFee } = resolveReservationRefundFen(event, totalFee, alreadyRefundedFen);
    if (totalFee <= 0 || refundFee <= 0) {
      await transaction.collection("reservations").doc(row._id).update({
        data: {
          payStatus: "refunded",
          refundStatus: "SUCCESS",
          refundAmount: Math.max(0, totalFee) / 100,
          refundChannel: "balance",
          refundedAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      return {
        ok: true,
        alreadyRefunded: true,
        reservationId: row._id,
        reservationNo: current.reservationNo,
        refundAmount: Math.max(0, totalFee) / 100,
        zeroAmount: totalFee <= 0
      };
    }

    const paymentLedgerId = `reservation_${current.reservationNo}`;
    let paymentLedger;
    try {
      const ledgerResult = await transaction.collection("wallet_ledger").doc(paymentLedgerId).get();
      paymentLedger = ledgerResult.data;
    } catch (error) {
      paymentLedger = null;
    }
    if (!paymentLedger || paymentLedger.status !== "posted" || paymentLedger.type !== "reservation_payment") {
      throw paymentError("WALLET_LEDGER_MISSING", "未找到预约余额扣款流水，请人工核对");
    }

    const paidAmountFen = Math.abs(Math.round(numberField(paymentLedger.amountFen)));
    if (paidAmountFen !== totalFee) {
      throw paymentError("WALLET_LEDGER_MISMATCH", "预约金额与余额扣款流水不一致，请人工核对");
    }
    let principalPaidFen = Math.abs(Math.round(numberField(paymentLedger.principalFen)));
    let bonusPaidFen = Math.abs(Math.round(numberField(paymentLedger.bonusFen)));
    if (principalPaidFen + bonusPaidFen !== paidAmountFen) {
      principalPaidFen = paidAmountFen;
      bonusPaidFen = 0;
    }
    const refundSplit = splitWalletRefund(
      principalPaidFen,
      bonusPaidFen,
      alreadyRefundedFen,
      refundFee
    );

    const walletResult = await transaction.collection("wallet_accounts").doc(paymentLedger.walletId).get();
    const wallet = walletResult.data || {};
    // 退款是对既有负债的冲正：账户即使随后被停用，也必须能原路退回。
    if (!wallet._openid || wallet._openid !== current._openid) {
      throw paymentError("WALLET_ACCOUNT_MISMATCH", "余额账户归属不一致，请人工核对");
    }

    const balanceBeforeFen = Math.max(0, Math.round(numberField(wallet.balanceFen)));
    const cumulativeFen = alreadyRefundedFen + refundFee;
    const fullyRefunded = cumulativeFen >= totalFee;
    const refundLedgerId = `reservation_refund_${crypto
      .createHash("sha256")
      .update(`${current.reservationNo}:${alreadyRefundedFen}:${refundFee}`)
      .digest("hex")
      .slice(0, 24)}`;

    await transaction.collection("wallet_accounts").doc(paymentLedger.walletId).update({
      data: {
        balanceFen: _.inc(refundFee),
        principalBalanceFen: _.inc(refundSplit.principalFen),
        bonusBalanceFen: _.inc(refundSplit.bonusFen),
        totalSpentFen: _.inc(-refundFee),
        totalRefundedFen: _.inc(refundFee),
        updatedAt: db.serverDate()
      }
    });
    await transaction.collection("wallet_ledger").doc(refundLedgerId).set({
      data: {
        _openid: current._openid,
        walletId: paymentLedger.walletId,
        memberId: paymentLedger.memberId || "",
        reservationId: row._id,
        reservationNo: current.reservationNo,
        relatedLedgerId: paymentLedgerId,
        type: "reservation_refund",
        amountFen: refundFee,
        principalFen: refundSplit.principalFen,
        bonusFen: refundSplit.bonusFen,
        status: "posted",
        balanceAfterFen: balanceBeforeFen + refundFee,
        reason: cleanText(event.reason || current.cancellationReason || "预约退款", 80),
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    await transaction.collection("reservations").doc(row._id).update({
      data: {
        payStatus: fullyRefunded ? "refunded" : "partial_refunded",
        refundStatus: "SUCCESS",
        refundChannel: "balance",
        refundAmount: cumulativeFen / 100,
        lastRefundAmount: refundFee / 100,
        refundPrincipalFen: _.inc(refundSplit.principalFen),
        refundBonusFen: _.inc(refundSplit.bonusFen),
        lastWalletRefundLedgerId: refundLedgerId,
        refundedAt: fullyRefunded ? db.serverDate() : current.refundedAt || null,
        refundLastAttemptAt: db.serverDate(),
        refundError: _.remove(),
        updatedAt: db.serverDate()
      }
    });

    return {
      ok: true,
      reservationId: row._id,
      reservationNo: current.reservationNo,
      payStatus: fullyRefunded ? "refunded" : "partial_refunded",
      refundStatus: "SUCCESS",
      refundChannel: "balance",
      refundAmount: cumulativeFen / 100,
      lastRefundAmount: refundFee / 100,
      partial: !fullyRefunded,
      balanceAfterFen: balanceBeforeFen + refundFee,
      refundLedgerId
    };
  });

  return transactionValue(result);
}

/**
 * 茶室预约退款（用户取消 / 管理后台代退 / 售后部分或全额）
 * 要求 payStatus=refunding，业务状态为 已取消 / 已完成 / 异常待处理。
 * 支持 event.refundAmount（元）做部分退款；累计退款记在 refundAmount。
 */
async function refundReservation(event, openid, source) {
  const reservationId = cleanText(event.reservationId || event.id, 80);
  const reservationNo = cleanText(event.reservationNo, 40);
  const row = await loadReservationForRefund(reservationId, reservationNo);
  if (!row) {
    return { ok: false, message: "预约不存在" };
  }

  // 归属校验（S1 修复）：不再信任调用方 event 里的 source/adminRefund 标记（前端可伪造）。
  // createPayment 只存在两种入口：小程序端 callFunction（OPENID 必非空，SOURCE=wx_client/devtools）
  // 与云函数互调（OPENID 为空 + 平台注入 SOURCE=wx_cloud_callfunction，无法伪造；该函数无
  // HTTP/定时器触发）。因此「OPENID 为空 + SOURCE 匹配」即证明是受控云函数互调
  // （createReservation 用户取消 / manageOperations 后台代退，二者各有业务鉴权），视为可信代退；
  // 其余调用一律要求本人。
  const isTrustedCloudCall =
    !openid && String(source || "").indexOf("wx_cloud_callfunction") === 0;
  const adminRefund = isTrustedCloudCall;
  const isSelf = Boolean(openid && row._openid && openid === row._openid);
  if (!isSelf && !adminRefund) {
    return { ok: false, message: "无权操作该预约" };
  }

  if (row.payStatus === "refunded") {
    return {
      ok: true,
      alreadyRefunded: true,
      reservationId: row._id,
      reservationNo: row.reservationNo,
      refundId: row.refundId || "",
      status: row.status,
      refundAmount: numberField(row.refundAmount)
    };
  }

  // 已取消：用户/店员取消后退款；已完成：售后退款（状态可保持已完成）
  const refundableBiz =
    row.status === "已取消" || row.status === "已完成" || row.status === "异常待处理";
  if (!refundableBiz || row.payStatus !== "refunding") {
    return {
      ok: false,
      message: `当前状态不可退款（${row.status || "未知"}/${row.payStatus || "未知"}）`
    };
  }

  // 历史微信预约尚未写 payMode，但已有微信 transactionId；余额支付上线后始终显式写 balance。
  const payMode = normalizePayMode(row.payMode) || (row.transactionId ? "wechat" : "");
  if (payMode === "balance") {
    try {
      return await refundReservationBalance(event, row);
    } catch (error) {
      return {
        ok: false,
        code: error && error.code ? error.code : "BALANCE_REFUND_FAILED",
        message: (error && error.message) || "余额退款失败，请重试"
      };
    }
  }
  if (payMode !== "wechat") {
    return {
      ok: false,
      code: "UNKNOWN_PAYMENT_CHANNEL",
      message: "预约原支付渠道不明确，请人工核对后退款"
    };
  }

  let config;
  try {
    config = getPayConfig();
  } catch (error) {
    return { ok: false, code: "PAY_CONFIG_ERROR", message: error.message || "微信支付配置不可用" };
  }

  const totalFee = Math.round(numberField(row.total != null ? row.total : row.price) * 100);
  const alreadyRefundedFen = Math.round(numberField(row.refundAmount) * 100);
  let refundFee;
  try {
    refundFee = resolveReservationRefundFen(event, totalFee, alreadyRefundedFen).refundFee;
  } catch (error) {
    return { ok: false, code: error.code || "INVALID_REFUND_AMOUNT", message: error.message };
  }

  // 原子抢占（S2 修复）：payStatus refunding → refunding_pending 条件更新，
  // 并发第二个请求因状态已变 updated=0，杜绝累计退款超过实付的双退。
  const claim = await db.collection("reservations").where({
    _id: row._id,
    payStatus: "refunding"
  }).update({
    data: {
      payStatus: "refunding_pending",
      refundLockedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });
  if (dbUpdatedCount(claim) === 0) {
    return { ok: false, code: "REFUND_IN_PROGRESS", message: "退款处理中，请勿重复操作" };
  }

  try {

  const maxRefundFen = Math.max(0, totalFee - alreadyRefundedFen);

  if (totalFee <= 0 || maxRefundFen <= 0) {
    await db.collection("reservations").doc(row._id).update({
      data: {
        payStatus: "refunded",
        refundAmount: totalFee / 100,
        refundedAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    return {
      ok: true,
      alreadyRefunded: true,
      reservationId: row._id,
      refundAmount: totalFee / 100,
      zeroAmount: totalFee <= 0
    };
  }

  // 每次退款使用新的 out_refund_no（支持多次部分退）
  const outRefundNo = createRefundOutNo(row.reservationNo || row._id);

  const reason = cleanText(event.reason || row.cancellationReason || "用户取消预约", 80) || "用户取消预约";
  // transaction_id 与 out_trade_no 二选一即可；优先微信交易号
  // amount.total = 原支付总金额；amount.refund = 本次退款金额
  const refundPayload = {
    out_refund_no: outRefundNo,
    reason,
    amount: {
      refund: refundFee,
      total: totalFee,
      currency: "CNY"
    }
  };
  if (row.transactionId) {
    refundPayload.transaction_id = cleanText(row.transactionId, 64);
  } else {
    refundPayload.out_trade_no = cleanText(row.reservationNo, 32);
  }

  let response;
  try {
    response = await requestWechatPayPost(
      config,
      "/v3/refund/domestic/refunds",
      refundPayload,
      { failLabel: "微信退款失败" }
    );
  } catch (error) {
    const msg = (error && error.message) || "微信退款失败";
    // 幂等：重复退款单号时视为可接受
    if (/已退款|RESOURCE_ALREADY_EXISTS|已存在|FREQUENCY/i.test(msg)) {
      const cumulative = (alreadyRefundedFen + refundFee) / 100;
      const nextPay =
        alreadyRefundedFen + refundFee >= totalFee ? "refunded" : "partial_refunded";
      await db.collection("reservations").doc(row._id).update({
        data: {
          payStatus: nextPay,
          refundStatus: "EXISTING",
          refundError: msg.slice(0, 200),
          refundAmount: cumulative,
          refundedAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      return {
        ok: true,
        alreadyRefunded: true,
        reservationId: row._id,
        payStatus: nextPay,
        refundAmount: cumulative,
        message: msg
      };
    }
    await db.collection("reservations").doc(row._id).update({
      data: {
        payStatus: "refunding",
        refundError: msg.slice(0, 300),
        refundLastAttemptAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    return { ok: false, code: "REFUND_FAILED", message: msg };
  }

  const refundState = String(response.status || response.refund_status || "").toUpperCase();
  const isDone = !refundState || refundState === "SUCCESS" || refundState === "PROCESSING";
  const cumulativeFen = alreadyRefundedFen + refundFee;
  const fullyRefunded = cumulativeFen >= totalFee;
  // SUCCESS/空：落最终态；PROCESSING：仍记累计金额，payStatus 先按最终预期
  const nextPayStatus =
    refundState && refundState !== "SUCCESS" && refundState !== "PROCESSING" && refundState
      ? "refunding"
      : fullyRefunded
        ? "refunded"
        : "partial_refunded";

  await db.collection("reservations").doc(row._id).update({
    data: {
      payStatus: nextPayStatus,
      refundStatus: refundState || "PROCESSING",
      refundId: response.refund_id || row.refundId || "",
      outRefundNo,
      lastOutRefundNo: outRefundNo,
      refundAmount: cumulativeFen / 100,
      lastRefundAmount: refundFee / 100,
      refundRaw: response,
      refundedAt: fullyRefunded && (refundState === "SUCCESS" || !refundState) ? db.serverDate() : row.refundedAt || null,
      refundLastAttemptAt: db.serverDate(),
      refundError: _.remove(),
      updatedAt: db.serverDate()
    }
  });

  return {
    ok: true,
    reservationId: row._id,
    reservationNo: row.reservationNo,
    outRefundNo,
    refundId: response.refund_id || "",
    refundStatus: refundState || "PROCESSING",
    payStatus: nextPayStatus,
    refundAmount: cumulativeFen / 100,
    lastRefundAmount: refundFee / 100,
    partial: !fullyRefunded,
    accepted: isDone
  };
  } catch (error) {
    // 意外异常（如落库失败）：恢复 payStatus，避免卡死在 refunding_pending
    try {
      await db.collection("reservations").doc(row._id).update({
        data: {
          payStatus: "refunding",
          refundError: String((error && error.message) || "退款处理异常").slice(0, 300),
          refundLastAttemptAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    } catch (restoreError) {
      // 恢复失败则留待人工对账（payStatus 停在 refunding_pending）
    }
    return { ok: false, code: "REFUND_INTERNAL_ERROR", message: "退款处理异常，请重试" };
  }
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
      // doc().get() 有时不带回 _id，后续 update 必须用显式 id
      if (result.data && result.data._openid === openid) {
        return Object.assign({ _id: orderId }, result.data, { _id: orderId });
      }
    } catch (error) {
      // Fall through to orderNo lookup.
    }
  }

  if (!orderNo) {
    return null;
  }
  const result = await db.collection("orders").where({
    _openid: openid,
    orderNo
  }).limit(1).get();
  const row = result.data && result.data[0] ? result.data[0] : null;
  if (!row) {
    return null;
  }
  if (!row._id && orderId) {
    row._id = orderId;
  }
  return row;
}

async function findActiveMember(openid) {
  const result = await db.collection("members").where({ _openid: openid }).limit(1).get();
  const member = result.data && result.data[0];
  return member && member.status === "active" && member.phone ? member : null;
}

/** 门店公示储值权益（金额单位：分），支付侧不信任客户端或脏数据金额 */
const CANONICAL_MEMBERSHIP_PLANS = {
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

  // prepayPackage 与 package 同值：部分通道/序列化对 package 关键字不友好时前端可回退
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    prepayPackage: packageValue,
    signType: "RSA",
    paySign
  };
}

async function saveOrderPrepay(orderId, openid, prepayId) {
  if (!orderId || !prepayId) {
    return false;
  }
  const payload = {
    prepayId,
    prepayCreatedAt: db.serverDate(),
    payStatus: "pending",
    updatedAt: db.serverDate()
  };
  try {
    const byWhere = await db.collection("orders").where({
      _id: orderId,
      _openid: openid,
      status: "待支付"
    }).update({ data: payload });
    if (dbUpdatedCount(byWhere) > 0) {
      return true;
    }
  } catch (error) {
    // fall through
  }
  try {
    await db.collection("orders").doc(orderId).update({ data: payload });
    return true;
  } catch (error) {
    return false;
  }
}

async function findReservation(reservationId, reservationNo, openid) {
  if (reservationId) {
    try {
      const result = await db.collection("reservations").doc(reservationId).get();
      if (result.data && result.data._openid === openid) {
        return Object.assign({ _id: reservationId }, result.data, { _id: reservationId });
      }
    } catch (error) {
      // Fall through to reservationNo lookup.
    }
  }

  if (!reservationNo) {
    return null;
  }
  const result = await db.collection("reservations").where({
    _openid: openid,
    reservationNo
  }).limit(1).get();
  const row = result.data && result.data[0] ? result.data[0] : null;
  if (!row) {
    return null;
  }
  if (!row._id && reservationId) {
    row._id = reservationId;
  }
  return row;
}

async function saveReservationPrepay(reservationId, openid, prepayId) {
  if (!reservationId || !prepayId) {
    return false;
  }
  const payload = {
    prepayId,
    prepayCreatedAt: db.serverDate(),
    payStatus: "pending",
    payMode: "wechat",
    updatedAt: db.serverDate()
  };
  try {
    const byWhere = await db.collection("reservations").where({
      _id: reservationId,
      _openid: openid,
      status: "待支付",
      payStatus: _.in(["pending", "failed"]),
      payMode: "wechat"
    }).update({ data: payload });
    return dbUpdatedCount(byWhere) > 0;
  } catch (error) {
    return false;
  }
}

async function claimReservationWechatChannel(reservation, openid) {
  const currentMode = normalizePayMode(reservation.payMode);
  if (currentMode === "wechat") {
    return reservation;
  }
  if (currentMode) {
    throw paymentError("PAYMENT_CHANNEL_CONFLICT", "该预约已选择余额支付，不能再发起微信支付");
  }

  const unclaimedPredicates = [_.exists(false), "", null];
  for (const payMode of unclaimedPredicates) {
    const claim = await db.collection("reservations").where({
      _id: reservation._id,
      _openid: openid,
      status: "待支付",
      payStatus: _.in(["pending", "failed"]),
      payMode
    }).update({
      data: {
        payStatus: "pending",
        payMode: "wechat",
        paymentChannelClaimedAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    if (dbUpdatedCount(claim) > 0) {
      return Object.assign({}, reservation, { payStatus: "pending", payMode: "wechat" });
    }
  }

  const latest = await findReservation(reservation._id, "", openid);
  if (latest && normalizePayMode(latest.payMode) === "wechat" &&
      latest.status === "待支付" && ["pending", "failed"].includes(latest.payStatus)) {
    return latest;
  }
  if (latest && latest.payStatus === "paid") {
    throw paymentError("ALREADY_PAID", "预约已支付");
  }
  throw paymentError(
    "PAYMENT_CHANNEL_CONFLICT",
    latest && normalizePayMode(latest.payMode) === "balance"
      ? "该预约已选择余额支付，不能再发起微信支付"
      : "预约支付状态已变化，请刷新后重试"
  );
}

function buildReservationDescription(reservation) {
  const day = cleanText(reservation.day, 20);
  const time = cleanText(reservation.time, 12);
  return cleanText(`禾煦茶室预约 ${day} ${time}`, 127);
}

async function createReservationPayment(event, openid, config) {
  const reservationId = cleanText(event.reservationId || event.id, 80);
  const reservationNo = cleanText(event.reservationNo, 40);
  let reservation = await findReservation(reservationId, reservationNo, openid);
  if (!reservation) {
    return { ok: false, message: "预约不存在" };
  }
  if (reservation.status !== "待支付") {
    return { ok: false, message: `预约当前状态不可支付（${reservation.status || "未知"}）` };
  }
  if (reservation.payStatus === "paid") {
    return { ok: false, message: "预约已支付" };
  }
  if (reservation.payStatus && reservation.payStatus !== "pending" && reservation.payStatus !== "failed") {
    return { ok: false, message: `预约支付状态不可用（${reservation.payStatus}）` };
  }
  if (isExpired(reservation)) {
    await db.collection("reservations").doc(reservation._id).update({
      data: {
        status: "已取消",
        payStatus: "expired",
        cancellationReason: "支付超时",
        updatedAt: db.serverDate()
      }
    });
    return { ok: false, message: "预约已超时，请重新预约" };
  }

  const totalFee = Math.round(numberField(reservation.total) * 100);
  if (totalFee <= 0) {
    return { ok: false, message: "预约金额无效" };
  }

  try {
    reservation = await claimReservationWechatChannel(reservation, openid);
  } catch (error) {
    return {
      ok: false,
      code: error && error.code ? error.code : "PAYMENT_CHANNEL_CONFLICT",
      message: (error && error.message) || "预约支付状态已变化，请刷新后重试"
    };
  }

  // 已有预支付单：先查微信；SUCCESS 补标已付，NOTPAY 重签调起，CLOSED 重新下单
  if (reservation.prepayId) {
    try {
      const trade = await queryWechatTransactionByOutTradeNo(config, reservation.reservationNo);
      const state = String(trade.trade_state || "").toUpperCase();
      if (state === "SUCCESS") {
        return {
          ok: false,
          code: "ALREADY_PAID_ON_WECHAT",
          message: "微信侧已支付成功，正在同步预约状态，请稍后刷新",
          tradeState: state,
          reservationId: reservation._id,
          reservationNo: reservation.reservationNo
        };
      }
      if (state === "NOTPAY" || state === "USERPAYING") {
        const payment = buildPaymentParams(config, reservation.prepayId);
        return {
          ok: true,
          reservationId: reservation._id,
          orderNo: reservation.reservationNo,
          total: numberField(reservation.total),
          payment,
          reusedPrepay: true,
          tradeState: state
        };
      }
      await db.collection("reservations").doc(reservation._id).update({
        data: {
          prepayId: _.remove(),
          prepayCreatedAt: _.remove(),
          lastClosedTradeState: state,
          updatedAt: db.serverDate()
        }
      });
    } catch (queryError) {
      const payment = buildPaymentParams(config, reservation.prepayId);
      return {
        ok: true,
        reservationId: reservation._id,
        orderNo: reservation.reservationNo,
        total: numberField(reservation.total),
        payment,
        reusedPrepay: true,
        queryWarning: queryError && queryError.message ? queryError.message : "query_failed"
      };
    }
  }

  const expireAt = resolveExpireAt(reservation);

  let response;
  try {
    response = await requestWechatPay(config, {
      appid: config.appid,
      mchid: config.mchid,
      description: buildReservationDescription(reservation),
      out_trade_no: reservation.reservationNo,
      time_expire: expireAt.toISOString(),
      attach: `reservation:${reservation._id}`,
      notify_url: config.notifyUrl,
      amount: {
        total: totalFee,
        currency: "CNY"
      },
      payer: {
        openid
      }
    });
  } catch (prepayError) {
    const msg = (prepayError && prepayError.message) || "微信支付下单失败";
    if (/已存在|ORDER_CLOSED|out_trade_no|FREQUENCY_LIMITED|ORDERPAID/i.test(msg) || /201|已支付/.test(msg)) {
      try {
        const trade = await queryWechatTransactionByOutTradeNo(config, reservation.reservationNo);
        const state = String(trade.trade_state || "").toUpperCase();
        if (state === "SUCCESS") {
          return {
            ok: false,
            code: "ALREADY_PAID_ON_WECHAT",
            message: "该预约微信侧已支付，请刷新预约状态",
            tradeState: state
          };
        }
        if ((state === "NOTPAY" || state === "USERPAYING") && (trade.prepay_id || reservation.prepayId)) {
          const prepayId = trade.prepay_id || reservation.prepayId;
          await saveReservationPrepay(reservation._id, openid, prepayId);
          return {
            ok: true,
            reservationId: reservation._id,
            orderNo: reservation.reservationNo,
            total: numberField(reservation.total),
            payment: buildPaymentParams(config, prepayId),
            reusedPrepay: true,
            tradeState: state
          };
        }
      } catch (ignore) {
        // fall through
      }
    }
    return {
      ok: false,
      code: "CREATE_PAYMENT_ERROR",
      message: msg
    };
  }

  if (!response.prepay_id) {
    return { ok: false, message: "微信支付未返回预支付单" };
  }

  const payment = buildPaymentParams(config, response.prepay_id);
  await saveReservationPrepay(reservation._id, openid, response.prepay_id);

  return {
    ok: true,
    reservationId: reservation._id,
    orderNo: reservation.reservationNo,
    total: numberField(reservation.total),
    payment
  };
}

function splitWalletDebit(wallet, amountFen) {
  const principal = Math.max(0, Math.round(numberField(wallet.principalBalanceFen)));
  const bonus = Math.max(0, Math.round(numberField(wallet.bonusBalanceFen)));
  if (principal + bonus < amountFen) {
    throw new Error("会员余额不足，请选择微信支付");
  }
  let principalFen = Math.min(principal, Math.round(amountFen * principal / Math.max(1, principal + bonus)));
  let bonusFen = amountFen - principalFen;
  if (bonusFen > bonus) {
    bonusFen = bonus;
    principalFen = amountFen - bonusFen;
  }
  return { principalFen, bonusFen };
}

async function settleReservationBalance(openid, member, reservationId) {
  if (!member) {
    throw new Error("请先开通会员再使用余额支付");
  }
  await Promise.all([ensureCollection("wallet_accounts"), ensureCollection("wallet_ledger")]);
  const result = await db.collection("wallet_accounts").where({ _openid: openid, status: "active" }).limit(1).get();
  const walletRef = result.data && result.data[0];
  if (!walletRef || !walletRef._id) {
    throw new Error("未找到可用的会员余额账户");
  }

  const transactionResult = await db.runTransaction(async (transaction) => {
    const reservationResult = await transaction.collection("reservations").doc(reservationId).get();
    const reservation = reservationResult.data || {};
    if (reservation._openid !== openid) {
      throw paymentError("RESERVATION_FORBIDDEN", "无权支付该预约");
    }
    const payMode = normalizePayMode(reservation.payMode);
    if (reservation.payStatus === "paid") {
      if (payMode !== "balance") {
        throw paymentError("PAYMENT_CHANNEL_CONFLICT", "该预约已通过微信支付");
      }
      return {
        amountFen: Math.max(0, Math.round(numberField(reservation.total) * 100)),
        balanceAfterFen: numberField(reservation.walletPayment && reservation.walletPayment.balanceAfterFen),
        reservation,
        alreadyPaid: true
      };
    }
    if (reservation.status !== "待支付" || !["pending", "failed", "confirming"].includes(reservation.payStatus)) {
      throw paymentError(
        "RESERVATION_NOT_PAYABLE",
        `预约支付状态不可用（${reservation.status || "未知"}/${reservation.payStatus || "未知"}）`
      );
    }
    if (payMode && payMode !== "balance") {
      throw paymentError("PAYMENT_CHANNEL_CONFLICT", "该预约已选择微信支付，不能再使用余额支付");
    }
    if (isExpired(reservation)) {
      throw paymentError("RESERVATION_EXPIRED", "预约已超时，请重新预约");
    }

    const amountFen = Math.max(0, Math.round(numberField(reservation.total) * 100));
    if (amountFen <= 0) {
      throw paymentError("INVALID_RESERVATION_AMOUNT", "预约金额无效");
    }
    const ledgerId = `reservation_${reservation.reservationNo}`;
    let existingLedger;
    try {
      const existingResult = await transaction.collection("wallet_ledger").doc(ledgerId).get();
      existingLedger = existingResult.data;
    } catch (error) {
      existingLedger = null;
    }
    if (existingLedger && existingLedger.status === "posted") {
      if (existingLedger.type !== "reservation_payment" ||
          Math.abs(Math.round(numberField(existingLedger.amountFen))) !== amountFen) {
        throw paymentError("WALLET_LEDGER_MISMATCH", "余额流水与预约金额不一致，请人工核对");
      }
      await transaction.collection("reservations").doc(reservationId).update({
        data: {
          status: "已确认",
          payStatus: "paid",
          payMode: "balance",
          paidAt: reservation.paidAt || db.serverDate(),
          walletPayment: {
            amountFen,
            balanceAfterFen: numberField(existingLedger.balanceAfterFen)
          },
          updatedAt: db.serverDate()
        }
      });
      return {
        amountFen,
        balanceAfterFen: numberField(existingLedger.balanceAfterFen),
        reservation,
        idempotent: true
      };
    }

    const walletResult = await transaction.collection("wallet_accounts").doc(walletRef._id).get();
    const wallet = walletResult.data || {};
    if (wallet._openid !== openid || wallet.status !== "active") {
      throw paymentError("WALLET_ACCOUNT_UNAVAILABLE", "会员余额账户不可用");
    }
    const balanceFen = Math.max(0, Math.round(numberField(wallet.balanceFen)));
    const debit = splitWalletDebit(wallet, amountFen);

    await transaction.collection("wallet_accounts").doc(walletRef._id).update({
      data: {
        balanceFen: _.inc(-amountFen),
        principalBalanceFen: _.inc(-debit.principalFen),
        bonusBalanceFen: _.inc(-debit.bonusFen),
        totalSpentFen: _.inc(amountFen),
        processedOrderIds: _.push(reservation.reservationNo),
        updatedAt: db.serverDate()
      }
    });
    await transaction.collection("wallet_ledger").doc(ledgerId).set({
      data: {
        _openid: openid,
        walletId: walletRef._id,
        memberId: member._id || "",
        reservationId,
        reservationNo: reservation.reservationNo,
        type: "reservation_payment",
        amountFen: -amountFen,
        principalFen: -debit.principalFen,
        bonusFen: -debit.bonusFen,
        status: "posted",
        balanceAfterFen: balanceFen - amountFen,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    await transaction.collection("reservations").doc(reservationId).update({
      data: {
        status: "已确认",
        payStatus: "paid",
        payMode: "balance",
        paymentChannelClaimedAt: reservation.paymentChannelClaimedAt || db.serverDate(),
        paidAt: db.serverDate(),
        walletPayment: {
          amountFen,
          balanceAfterFen: balanceFen - amountFen
        },
        updatedAt: db.serverDate()
      }
    });

    return {
      amountFen,
      balanceAfterFen: balanceFen - amountFen,
      reservation
    };
  });

  return transactionValue(transactionResult);
}

async function notifyReservationPaid(reservation) {
  try {
    await sendWeComReservationNotification(Object.assign({}, reservation, {
      reservationId: reservation._id,
      status: "已确认",
      payStatus: "paid"
    }));
  } catch (error) {
    // 企业微信为尽力通知，不影响已完成的余额支付。
  }
}

async function createReservationBalancePayment(event, openid) {
  const reservation = await findReservation(
    cleanText(event.reservationId || event.id, 80),
    cleanText(event.reservationNo, 40),
    openid
  );
  if (!reservation) {
    return { ok: false, message: "预约不存在" };
  }
  if (reservation.payStatus === "paid") {
    if (normalizePayMode(reservation.payMode) !== "balance") {
      return { ok: false, code: "ALREADY_PAID", message: "该预约已通过微信支付" };
    }
    return {
      ok: true,
      reservationId: reservation._id,
      orderNo: reservation.reservationNo,
      total: numberField(reservation.total),
      payMode: "balance",
      payStatus: "paid",
      alreadyPaid: true,
      balanceAfterFen: numberField(reservation.walletPayment && reservation.walletPayment.balanceAfterFen)
    };
  }
  if (isExpired(reservation)) {
    return { ok: false, message: "预约已超时，请重新预约" };
  }
  const member = await findActiveMember(openid);
  if (!member) {
    return { ok: false, message: "请先开通会员再使用余额支付" };
  }

  let walletPayment;
  try {
    walletPayment = await settleReservationBalance(openid, member, reservation._id);
  } catch (error) {
    return {
      ok: false,
      code: error && error.code ? error.code : "BALANCE_PAYMENT_FAILED",
      message: (error && error.message) || "余额支付失败，请重试"
    };
  }

  if (!walletPayment.alreadyPaid) {
    await notifyReservationPaid(Object.assign({}, walletPayment.reservation || reservation, {
      status: "已确认",
      payStatus: "paid",
      payMode: "balance"
    }));
  }
  return {
    ok: true,
    reservationId: reservation._id,
    orderNo: reservation.reservationNo,
    total: numberField(reservation.total),
    payMode: "balance",
    payStatus: "paid",
    alreadyPaid: Boolean(walletPayment.alreadyPaid || walletPayment.idempotent),
    balanceAfterFen: walletPayment.balanceAfterFen
  };
}

function resolveExpireAt(order) {
  let expireAt = order && order.lockedUntil
    ? new Date(order.lockedUntil)
    : new Date(Date.now() + 15 * 60 * 1000);
  if (Number.isNaN(expireAt.getTime())) {
    expireAt = new Date(Date.now() + 15 * 60 * 1000);
  }
  // 微信要求 time_expire 至少晚于当前约 1 分钟；剩余不足 2 分钟则顺延
  const minExpire = Date.now() + 2 * 60 * 1000;
  if (expireAt.getTime() < minExpire) {
    expireAt = new Date(minExpire + 3 * 60 * 1000);
  }
  return expireAt;
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
 * 充值查单补入账也必须同步虚拟发货，否则微信交易款会一直停在待结算账户。
 * 支付回调与主动查单可能并发，因此这里保持幂等：已上传时直接跳过，失败时允许回调继续重试。
 */
async function syncRechargeVirtualShipping(recharge, transactionId) {
  const record = Object.assign({}, recharge, {
    transactionId: transactionId || recharge.transactionId || "",
    _openid: recharge._openid
  });
  let result;
  try {
    result = await uploadVirtualShipping(
      cloud,
      record,
      recharge.planTitle || "会员储值"
    );
  } catch (error) {
    result = { ok: false, errmsg: error && error.message ? error.message : String(error) };
  }

  const fields = shippingResultFields(result);
  const updateResult = await db.collection("recharge_orders").doc(recharge._id).update({
    data: Object.assign({}, fields, {
      wxShippingUploadedAt: fields.wxShippingUploaded
        ? db.serverDate()
        : (recharge.wxShippingUploadedAt || null),
      wxShippingLastAttemptAt: db.serverDate(),
      updatedAt: db.serverDate()
    })
  });
  if (dbUpdatedCount(updateResult) <= 0) {
    throw new Error("充值发货状态写回失败，请重试查单");
  }
  return result;
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
    const transactionId = recharge.transactionId || transaction.transaction_id || "";
    const shipping = recharge.wxShippingUploaded === true || !transactionId
      ? null
      : await syncRechargeVirtualShipping(recharge, transactionId);
    return {
      alreadyPaid: true,
      orderNo: recharge.orderNo,
      transactionId,
      wxShippingUploaded: shipping ? Boolean(shipping.ok) : recharge.wxShippingUploaded === true
    };
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

  const shipping = await syncRechargeVirtualShipping(
    Object.assign({}, recharge, { transactionId, payStatus: "paid" }),
    transactionId
  );

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
    bonusFen,
    wxShippingUploaded: Boolean(shipping && shipping.ok)
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
    const transactionId = recharge.transactionId || "";
    const shipping = recharge.wxShippingUploaded === true || !transactionId
      ? null
      : await syncRechargeVirtualShipping(recharge, transactionId);
    return {
      ok: true,
      orderNo: no,
      transactionId,
      alreadyPaid: true,
      wxShippingUploaded: shipping ? Boolean(shipping.ok) : recharge.wxShippingUploaded === true,
      message: shipping && shipping.ok ? "本地已入账，微信虚拟发货已补传" : "本地已入账"
    };
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
  await hydrateEnv(cloud);
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

  const { OPENID, SOURCE } = cloud.getWXContext();
  const orderId = cleanText(event.orderId || event.id, 80);
  const orderNo = cleanText(event.orderNo, 32);

  try {
    const rechargeRequest = event.kind === "memberRecharge" || event.action === "createRechargePayment";
    const reservationRequest = event.kind === "reservation" || event.action === "createReservationPayment";
    const reservationRefundRequest = event.action === "refundReservation" || event.kind === "reservationRefund";
    if (rechargeRequest && !isRealPaymentEnabled()) {
      return { ok: false, code: "REAL_RECHARGE_DISABLED", message: "会员真实充值尚未开放" };
    }
    if (rechargeRequest) {
      const config = getPayConfig();
      return await createRechargePayment(event, OPENID, config);
    }
    if (reservationRefundRequest) {
      return await refundReservation(event, OPENID, SOURCE);
    }
    if (reservationRequest) {
      if (isBalancePayMode(event)) {
        return await createReservationBalancePayment(event, OPENID);
      }
      const config = getPayConfig();
      return await createReservationPayment(event, OPENID, config);
    }
    const config = getPayConfig();
    const order = await findOrder(orderId, orderNo, OPENID);
    if (!order) {
      return { ok: false, message: "订单不存在" };
    }
    if (order.payStatus === "paid") {
      return { ok: false, message: "订单已支付" };
    }
    // 允许 pending / 空状态待支付；拒绝 manual/expired/paid
    if (order.status !== "待支付") {
      return { ok: false, message: `订单当前状态不可支付（${order.status || "未知"}）` };
    }
    if (order.payStatus && order.payStatus !== "pending" && order.payStatus !== "failed") {
      return { ok: false, message: `订单支付状态不可用（${order.payStatus}）` };
    }
    if (isExpired(order)) {
      // H1 修复：先条件更新抢占（仅 pending + 未释放过 命中），再释放库存/券。
      // 与支付回调的 pending→confirming 抢占互斥，避免已支付订单被误取消、库存双扣。
      const claim = await db.collection("orders").where({
        _id: order._id,
        payStatus: "pending",
        status: "待支付",
        lockReleased: _.neq(true)
      }).update({
        data: {
          status: "已取消",
          payStatus: "expired",
          lockReleased: true,
          cancelReason: "支付超时，库存锁定已释放",
          expiredAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      if (dbUpdatedCount(claim) === 0) {
        // 竞态：支付回调已抢占入账或库存已释放，重新读库确认
        const fresh = await findOrder(order._id, "", OPENID);
        if (fresh && fresh.payStatus === "paid") {
          return { ok: false, code: "ALREADY_PAID", message: "订单已支付，无需重新下单" };
        }
        return { ok: false, message: "订单状态已变化，请刷新后重试" };
      }
      await releaseInventory(order.inventoryLocks);
      await releaseUserCoupon(order.coupon);
      return { ok: false, message: "订单已超时，请重新下单" };
    }

    const totalFee = Math.round(numberField(order.total) * 100);
    if (totalFee <= 0) {
      return { ok: false, message: "订单金额无效" };
    }

    // 已有预支付单：先查微信；SUCCESS 补标已付，NOTPAY 重签调起，CLOSED 重新下单
    if (order.prepayId) {
      try {
        const trade = await queryWechatTransactionByOutTradeNo(config, order.orderNo);
        const state = String(trade.trade_state || "").toUpperCase();
        if (state === "SUCCESS") {
          return {
            ok: false,
            code: "ALREADY_PAID_ON_WECHAT",
            message: "微信侧已支付成功，正在同步订单状态，请稍后刷新",
            tradeState: state,
            orderId: order._id,
            orderNo: order.orderNo
          };
        }
        if (state === "NOTPAY" || state === "USERPAYING") {
          const payment = buildPaymentParams(config, order.prepayId);
          return {
            ok: true,
            orderId: order._id,
            orderNo: order.orderNo,
            total: numberField(order.total),
            payment,
            reusedPrepay: true,
            tradeState: state
          };
        }
        // CLOSED / REVOKED / PAYERROR 等：清掉本地 prepay，走新建
        await db.collection("orders").doc(order._id).update({
          data: {
            prepayId: _.remove(),
            prepayCreatedAt: _.remove(),
            lastClosedTradeState: state,
            updatedAt: db.serverDate()
          }
        });
      } catch (queryError) {
        // 查单失败时仍尝试用原 prepay 调起，兼容网络抖动
        const payment = buildPaymentParams(config, order.prepayId);
        return {
          ok: true,
          orderId: order._id,
          orderNo: order.orderNo,
          total: numberField(order.total),
          payment,
          reusedPrepay: true,
          queryWarning: queryError && queryError.message ? queryError.message : "query_failed"
        };
      }
    }

    const expireAt = resolveExpireAt(order);

    let response;
    try {
      response = await requestWechatPay(config, {
        appid: config.appid,
        mchid: config.mchid,
        description: buildDescription(order),
        out_trade_no: order.orderNo,
        time_expire: expireAt.toISOString(),
        attach: String(order._id || orderId || "").slice(0, 128),
        notify_url: config.notifyUrl,
        amount: {
          total: totalFee,
          currency: "CNY"
        },
        payer: {
          openid: OPENID
        }
      });
    } catch (prepayError) {
      const msg = (prepayError && prepayError.message) || "微信支付下单失败";
      // 商户单号已存在：尽量查单后复用
      if (/已存在|ORDER_CLOSED|out_trade_no|FREQUENCY_LIMITED|ORDERPAID/i.test(msg) || /201|已支付/.test(msg)) {
        try {
          const trade = await queryWechatTransactionByOutTradeNo(config, order.orderNo);
          const state = String(trade.trade_state || "").toUpperCase();
          if (state === "SUCCESS") {
            return {
              ok: false,
              code: "ALREADY_PAID_ON_WECHAT",
              message: "该订单微信侧已支付，请刷新订单状态",
              tradeState: state
            };
          }
          if ((state === "NOTPAY" || state === "USERPAYING") && (trade.prepay_id || order.prepayId)) {
            const prepayId = trade.prepay_id || order.prepayId;
            await saveOrderPrepay(order._id, OPENID, prepayId);
            return {
              ok: true,
              orderId: order._id,
              orderNo: order.orderNo,
              total: numberField(order.total),
              payment: buildPaymentParams(config, prepayId),
              reusedPrepay: true,
              tradeState: state
            };
          }
        } catch (ignore) {
          // fall through
        }
      }
      return {
        ok: false,
        code: "CREATE_PAYMENT_ERROR",
        message: msg
      };
    }

    if (!response.prepay_id) {
      return { ok: false, message: "微信支付未返回预支付单" };
    }

    const payment = buildPaymentParams(config, response.prepay_id);
    // 写库失败也不阻断收银台；回调按 out_trade_no 入账
    await saveOrderPrepay(order._id, OPENID, response.prepay_id);

    return {
      ok: true,
      orderId: order._id,
      orderNo: order.orderNo,
      total: numberField(order.total),
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
