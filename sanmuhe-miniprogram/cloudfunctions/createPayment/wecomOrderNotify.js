const https = require("https");

const WECOM_WEBHOOK_HOST = "qyapi.weixin.qq.com";
const DEFAULT_TIMEOUT_MS = 3000;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseMentionedMobiles(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter((item) => /^\d{6,20}$/.test(item));
}

function moneyYuan(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "0.00";
  }
  // 兼容分：大于等于 1000 且为整数时不自动当「分」，只在显式 fen 字段使用
  return Math.max(0, num).toFixed(2);
}

function moneyFromFen(fen) {
  const num = Math.max(0, Math.round(Number(fen) || 0));
  return (num / 100).toFixed(2);
}

function deliveryText(value) {
  if (value === "shipping") {
    return "快递配送";
  }
  if (value === "onsite") {
    return "到店点单";
  }
  return "到店自提";
}

function itemSummary(items) {
  return (items || [])
    .slice(0, 20)
    .map((item) => `${cleanText(item.name, 40)}×${Math.max(1, Number(item.quantity) || 1)}`)
    .filter((item) => item.charAt(0) !== "×")
    .join("、")
    .slice(0, 360);
}

function buildWeComOrderPayload(order = {}, mentionedMobiles = []) {
  const event = cleanText(order.event || order.notifyType, 40);
  const isPaid = event === "order_paid" || order.payStatus === "paid";
  const title = isPaid ? "【禾煦订单已支付】" : "【禾煦新订单】";
  const lines = [
    title,
    `订单：${cleanText(order.orderNo, 40) || "待查看"}`,
    `金额：¥${moneyYuan(order.total)}`,
    `状态：${cleanText(order.status, 20) || (isPaid ? "已支付" : "待处理")}`,
    `方式：${deliveryText(order.deliveryMethod)}`
  ];
  if (isPaid && order.payMode) {
    lines.push(`支付：${cleanText(order.payMode, 20)}`);
  }
  const tableNo = cleanText(order.tableNo, 20);
  const summary = itemSummary(order.items);
  const remark = cleanText(order.remark, 160);
  if (tableNo) {
    lines.push(`桌号：${tableNo}`);
  }
  if (summary) {
    lines.push(`商品：${summary}`);
  }
  if (remark) {
    lines.push(`备注：${remark}`);
  }
  lines.push(isPaid ? "请安排制作/履约。" : "请及时处理。");

  const text = { content: lines.join("\n").slice(0, 1900) };
  if (mentionedMobiles.length) {
    text.mentioned_mobile_list = mentionedMobiles;
  }
  return { msgtype: "text", text };
}

function buildWeComRechargePayload(recharge = {}, mentionedMobiles = []) {
  const payYuan = recharge.payAmountFen != null
    ? moneyFromFen(recharge.payAmountFen)
    : moneyYuan(recharge.payAmount);
  const creditYuan = recharge.creditFen != null
    ? moneyFromFen(recharge.creditFen)
    : moneyYuan(recharge.creditAmount);
  const lines = [
    "【禾煦会员充值】",
    `单号：${cleanText(recharge.orderNo, 40) || "待查看"}`,
    `档位：${cleanText(recharge.planTitle || recharge.planId, 40) || "储值"}`,
    `实付：¥${payYuan}`,
    `到账：¥${creditYuan}`,
    `状态：已支付入账`
  ];
  if (recharge.transactionId) {
    lines.push(`微信单号：${cleanText(recharge.transactionId, 40)}`);
  }
  lines.push("可在经营后台查看会员储值。");

  const text = { content: lines.join("\n").slice(0, 1900) };
  if (mentionedMobiles.length) {
    text.mentioned_mobile_list = mentionedMobiles;
  }
  return { msgtype: "text", text };
}

function parseWebhook(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new Error("企业微信 Webhook 地址格式无效");
  }
  if (url.protocol !== "https:" || url.hostname !== WECOM_WEBHOOK_HOST) {
    throw new Error("企业微信 Webhook 必须使用 qyapi.weixin.qq.com 的 HTTPS 地址");
  }
  if (url.pathname !== "/cgi-bin/webhook/send" || !url.searchParams.get("key")) {
    throw new Error("企业微信 Webhook 缺少有效的消息推送 key");
  }
  return url;
}

function postJson(url, payload, options = {}) {
  const httpsModule = options.httpsModule || https;
  const timeoutMs = Math.max(500, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = httpsModule.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (raw.length < 65536) {
          raw += chunk;
        }
      });
      response.on("end", () => {
        resolve({
          statusCode: Number(response.statusCode) || 0,
          body: raw
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("企业微信提醒请求超时"));
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function sendWeComPayload(payload, options = {}) {
  const webhook = options.webhook !== undefined
    ? options.webhook
    : process.env.WECOM_ORDER_WEBHOOK;
  const url = parseWebhook(webhook);
  if (!url) {
    return { ok: true, skipped: true, reason: "missing_wecom_webhook" };
  }

  const response = await postJson(url, payload, options);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`企业微信提醒请求失败（HTTP ${response.statusCode}）`);
  }

  let result;
  try {
    result = JSON.parse(response.body || "{}");
  } catch (error) {
    throw new Error("企业微信提醒返回内容无法识别");
  }
  if (Number(result.errcode) !== 0) {
    throw new Error(`企业微信提醒发送失败（${result.errcode || "unknown"}：${result.errmsg || ""}）`);
  }
  return { ok: true, skipped: false };
}

async function sendWeComOrderNotification(order = {}, options = {}) {
  const mentionedMobiles = options.mentionedMobiles || parseMentionedMobiles(process.env.WECOM_MENTIONED_MOBILES);
  const payload = buildWeComOrderPayload(order, mentionedMobiles);
  return sendWeComPayload(payload, options);
}

async function sendWeComRechargeNotification(recharge = {}, options = {}) {
  const mentionedMobiles = options.mentionedMobiles || parseMentionedMobiles(process.env.WECOM_MENTIONED_MOBILES);
  const payload = buildWeComRechargePayload(recharge, mentionedMobiles);
  return sendWeComPayload(payload, options);
}

async function sendWeComTestNotification(options = {}) {
  const mentionedMobiles = options.mentionedMobiles || parseMentionedMobiles(process.env.WECOM_MENTIONED_MOBILES);
  const lines = [
    "【禾煦企微联调】",
    "这是一条测试消息。",
    "若你能看到，说明群机器人 Webhook 已接通。"
  ];
  const text = { content: lines.join("\n") };
  if (mentionedMobiles.length) {
    text.mentioned_mobile_list = mentionedMobiles;
  }
  return sendWeComPayload({ msgtype: "text", text }, options);
}

module.exports = {
  buildWeComOrderPayload,
  buildWeComRechargePayload,
  parseMentionedMobiles,
  parseWebhook,
  sendWeComOrderNotification,
  sendWeComRechargeNotification,
  sendWeComTestNotification
};
