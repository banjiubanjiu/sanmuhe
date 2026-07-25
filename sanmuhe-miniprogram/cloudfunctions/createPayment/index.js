const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const https = require("https");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

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

function normalizePem(value) {
  const text = String(value || "").replace(/\\n/g, "\n").trim();
  if (text.includes("-----BEGIN")) {
    return text;
  }
  return Buffer.from(text, "base64").toString("utf8");
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
    platformCertificate: process.env.WECHAT_PAY_PLATFORM_CERTIFICATE ? normalizePem(process.env.WECHAT_PAY_PLATFORM_CERTIFICATE) : ""
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
  return [
    "WECHATPAY2-SHA256-RSA2048",
    `mchid="${config.mchid}"`,
    `nonce_str="${nonce}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${config.serialNo}"`,
    `signature="${signature}"`
  ].join(" ");
}

function verifyWechatPaySignature(headers, rawBody, config) {
  const key = config.platformPublicKey || config.platformCertificate;
  if (!key) {
    return true;
  }

  const timestamp = headers["wechatpay-timestamp"];
  const nonce = headers["wechatpay-nonce"];
  const signature = headers["wechatpay-signature"];
  if (!timestamp || !nonce || !signature) {
    return false;
  }

  return crypto.createVerify("RSA-SHA256")
    .update(`${timestamp}\n${nonce}\n${rawBody}\n`)
    .verify(key, signature, "base64");
}

function requestWechatPay(config, payload) {
  const method = "POST";
  const path = "/v3/pay/transactions/jsapi";
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = nonceString();
  const authorization = buildAuthorization(config, method, path, body, timestamp, nonce);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.mch.weixin.qq.com",
      method,
      path,
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
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

        if (!verifyWechatPaySignature(res.headers, raw, config)) {
          reject(new Error("微信支付响应验签失败"));
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
