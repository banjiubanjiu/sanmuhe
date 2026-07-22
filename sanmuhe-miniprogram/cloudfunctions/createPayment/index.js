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
  return {
    appid: process.env.WECHAT_PAY_APPID || process.env.WX_APPID || requiredEnv("WECHAT_PAY_APPID"),
    mchid: requiredEnv("WECHAT_PAY_MCH_ID"),
    serialNo: requiredEnv("WECHAT_PAY_CERT_SERIAL_NO"),
    privateKey: normalizePem(requiredEnv("WECHAT_PAY_PRIVATE_KEY")),
    notifyUrl: requiredEnv("WECHAT_PAY_NOTIFY_URL"),
    platformPublicKey: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY
      ? normalizePem(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY)
      : "",
    platformCertificate: process.env.WECHAT_PAY_PLATFORM_CERTIFICATE
      ? normalizePem(process.env.WECHAT_PAY_PLATFORM_CERTIFICATE)
      : ""
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
      paymentConfig,
      message: paymentConfig.ready ? "支付下单配置完整" : `支付下单缺少：${paymentConfig.missing.join("、")}`
    };
  }

  const { OPENID } = cloud.getWXContext();
  const orderId = cleanText(event.orderId || event.id, 80);
  const orderNo = cleanText(event.orderNo, 32);

  try {
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

    const config = getPayConfig();
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
    await db.collection("orders").doc(order._id).update({
      data: {
        prepayId: response.prepay_id,
        prepayCreatedAt: db.serverDate(),
        payStatus: "pending",
        updatedAt: db.serverDate()
      }
    });

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
