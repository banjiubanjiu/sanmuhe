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
  return Math.max(0, num).toFixed(2);
}

function buildWeComReservationPayload(reservation = {}, mentionedMobiles = []) {
  const status = cleanText(reservation.status, 12) || "待确认";
  const payStatus = cleanText(reservation.payStatus, 12) || "";
  const isPaid = status === "已确认" || payStatus === "paid";
  const isPendingPay = status === "待支付" || payStatus === "pending";
  const headline = isPaid ? "【禾煦茶室预约已确认】" : (isPendingPay ? "【禾煦茶室预约待支付】" : "【禾煦茶室预约】");
  const lines = [
    headline,
    `门店：${cleanText(reservation.storeName, 40) || "禾煦茶书房"}`,
    `日期：${cleanText(reservation.day, 20) || "待查看"}`,
    `时段：${cleanText(reservation.time, 12) || ""}${reservation.endTime ? `–${cleanText(reservation.endTime, 12)}` : ""}`,
    `人数：${Math.max(1, Number(reservation.people) || 1)} 位`,
    `预约人：${cleanText(reservation.name, 40) || "未填写"}`,
    `手机：${cleanText(reservation.phone, 20) || ""}`
  ];

  if (reservation.periodLabel && reservation.periodLabel !== "全天") {
    lines.push(`类型：${cleanText(reservation.periodLabel, 20)}`);
  }
  const price = Number(reservation.total) > 0 ? reservation.total : reservation.price;
  if (Number(price) > 0) {
    lines.push(`茶位：¥${moneyYuan(price)}`);
  }
  const note = cleanText(reservation.note, 160);
  if (note) {
    lines.push(`备注：${note}`);
  }
  lines.push(`状态：${status}`);
  if (isPaid) {
    lines.push("预约已支付确认，请安排茶席。");
  } else if (isPendingPay) {
    lines.push("顾客需在 15 分钟内完成支付，超时将自动释放时段。");
  } else {
    lines.push("请及时确认并联系顾客。");
  }

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

function resolveWebhook() {
  const reservationWebhook = process.env.WECOM_RESERVATION_WEBHOOK;
  if (reservationWebhook) {
    return parseWebhook(reservationWebhook);
  }
  return parseWebhook(process.env.WECOM_ORDER_WEBHOOK);
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
    : resolveWebhook();
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

async function sendWeComReservationNotification(reservation = {}, options = {}) {
  const mentionedMobiles = options.mentionedMobiles || parseMentionedMobiles(process.env.WECOM_MENTIONED_MOBILES);
  const payload = buildWeComReservationPayload(reservation, mentionedMobiles);
  return sendWeComPayload(payload, options);
}

async function sendWeComTestNotification(options = {}) {
  const mentionedMobiles = options.mentionedMobiles || parseMentionedMobiles(process.env.WECOM_MENTIONED_MOBILES);
  const lines = [
    "【禾煦茶室预约联调】",
    "这是一条茶室预约测试消息。",
    "若你能看到，说明群机器人 Webhook 已接通。"
  ];
  const text = { content: lines.join("\n") };
  if (mentionedMobiles.length) {
    text.mentioned_mobile_list = mentionedMobiles;
  }
  return sendWeComPayload({ msgtype: "text", text }, options);
}

module.exports = {
  buildWeComReservationPayload,
  parseMentionedMobiles,
  parseWebhook,
  sendWeComReservationNotification,
  sendWeComTestNotification
};
